import json

from .assets import restore_project_assets
from .authoring_tools import AUTHORING_BY_NAME, dispatch as authoring_dispatch
from .code_components import build_component
from .content_services import export_csv, import_csv, import_library, list_libraries, review_library, save_library
from .engine import EngineError
from .service import studio


async def load_native(native):
    studio.access.authorize('edit')
    if not isinstance(native, dict) or not isinstance(native.get('site'), dict):
        raise EngineError('Native project requires a site object.')
    if native.get('format', 'com.nodemode.formweb') != 'com.nodemode.formweb' or native.get('version', 1) != 1:
        raise EngineError('Unsupported native project format or version.')
    if len(json.dumps(native).encode()) > 64 * 1024 * 1024:
        raise EngineError('Native project exceeds 64 MiB.', 413)
    if len(json.dumps(native['site']).encode()) > 8 * 1024 * 1024:
        raise EngineError('Editable site content exceeds 8 MiB.', 413)
    checkpoint = native.get('checkpoint')
    if checkpoint is not None:
        if not isinstance(checkpoint, dict) or checkpoint.get('site') != native['site'] or checkpoint.get('schemaVersion') != 1 or not isinstance(checkpoint.get('revision'), int) or isinstance(checkpoint['revision'], bool) or checkpoint['revision'] < 0:
            raise EngineError('Native checkpoint must have schemaVersion 1, a nonnegative revision and the envelope site.')
        for key in ('undo', 'redo'):
            if not isinstance(checkpoint.get(key), list) or len(checkpoint[key]) > 100:
                raise EngineError('Native checkpoint history requires arrays of at most 100 entries.')
        if len(json.dumps(checkpoint).encode()) > 32 * 1024 * 1024:
            raise EngineError('Native history exceeds 32 MiB.', 413)
        for site in checkpoint['undo'] + checkpoint['redo']:
            if not isinstance(site, dict) or site.get('id') != native['site']['id']:
                raise EngineError('Native checkpoint history must belong to this project.')
    restore_project_assets(native)
    return await studio.mutate('restore', {'checkpoint': checkpoint}) if checkpoint else await studio.mutate('load', {'site': native['site']})


def filtered_delivery(site_id=None, config=False):
    studio.access.authorize('read')
    if site_id:
        studio.access.authorize_site(site_id)
    allowed = studio.access.accessible_sites()
    result = studio.delivery.get_config(site_id) if config else studio.delivery.list_jobs(site_id)
    key = 'configurations' if config else 'jobs'
    return {key: [row for row in result[key] if allowed is None or row['siteId'] in allowed]}


async def dispatch(name, args):
    if name == 'get_checkpoint':
        studio.access.authorize('read')
        return await studio.engine.request('checkpoint')
    if name == 'load_project_file':
        return await load_native(args['native'])
    if name == 'delete_project':
        return await studio.delete_project(args['project_id'])
    if name == 'compile_preview':
        return await studio.releases.preview(args.get('page'), args.get('locale'))
    if name == 'list_releases':
        return studio.releases.list()
    if name == 'promote_release':
        return studio.releases.promote(args['slug'], args['version'])
    if name == 'rollback_release':
        return studio.releases.rollback(args['slug'], args.get('version'))
    if name == 'list_branches':
        return studio.collaboration.list_branches()
    if name == 'create_branch':
        return await studio.collaboration.create_branch(args['name'])
    if name == 'capture_branch':
        return await studio.collaboration.capture(args['id'])
    if name == 'open_branch':
        return await studio.collaboration.open_branch(args['id'])
    if name == 'review_branch':
        return await studio.collaboration.review(args['id'])
    if name == 'merge_branch':
        return await studio.collaboration.merge(args['id'], args.get('resolutions'), args.get('expectedRevision'))
    if name == 'list_comments':
        return studio.collaboration.comments()
    if name == 'add_comment':
        return await studio.collaboration.comment(args['text'], args.get('nodeId'))
    if name == 'resolve_comment':
        return studio.collaboration.resolve(args['id'], args['resolved'])
    if name == 'get_access':
        studio.access.authorize('read', args.get('projectId'))
        return studio.access.status(args.get('projectId'))
    if name == 'create_identity':
        return studio.access.create_identity(args['name'])
    if name == 'grant_access':
        return studio.access.grant(args['identityId'], args['role'], args.get('projectId'))
    if name == 'get_presence':
        return studio.access.presence()
    if name == 'update_presence':
        return studio.access.set_presence(args.get('nodeId'))
    if name == 'get_activity':
        return studio.access.activity()
    if name == 'export_submissions_csv':
        return {'csv': studio.forms.csv(args.get('siteId'))}
    if name == 'set_form_retention':
        return studio.forms.retention(args['days'], args.get('siteId'))
    if name == 'get_delivery_config':
        return filtered_delivery(args.get('siteId'), True)
    if name == 'configure_delivery':
        studio.access.authorize_site(args['siteId'], 'manage')
        result = studio.delivery.configure(args)
        studio.access.record('delivery.configure', {'siteId': args['siteId']})
        return result
    if name == 'list_deliveries':
        return filtered_delivery(args.get('siteId'))
    if name == 'retry_delivery':
        row = studio.store.db.execute('SELECT site_id FROM delivery_jobs WHERE id=?', (args['id'],)).fetchone()
        if not row:
            raise EngineError('Delivery job not found.', 404)
        studio.access.authorize_site(row['site_id'], 'manage')
        result = studio.delivery.retry(args['id'])
        studio.access.record('delivery.retry', {'id': args['id']})
        return result
    if name == 'export_cms_csv':
        return {'csv': await export_csv(studio, args['collection'])}
    if name == 'import_cms_csv':
        studio.access.authorize('edit')
        return await import_csv(studio, args['collection'], args['csv'], args.get('mode', 'upsert'))
    if name == 'list_libraries':
        studio.access.authorize('read')
        return await list_libraries(studio)
    if name == 'save_library':
        studio.access.authorize('edit')
        return await save_library(studio, args)
    if name == 'review_library':
        studio.access.authorize('read')
        return await review_library(studio, args['id'], args.get('version'))
    if name == 'import_library':
        studio.access.authorize('edit')
        return await import_library(studio, args['id'], {key: value for key, value in args.items() if key != 'id'})
    if name == 'build_code_component':
        studio.access.authorize('edit')
        result = await build_component(args)
        studio.access.record('code.build', {'language': args['language'], 'digest': result['component']['sourceDigest']})
        return result
    if name in AUTHORING_BY_NAME:
        return await authoring_dispatch(name, args)
    raise EngineError('Unknown workflow.', 404)
