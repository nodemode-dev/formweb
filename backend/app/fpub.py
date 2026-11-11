import hashlib
import json
import os
import re
import tempfile
import zipfile
import zlib
from pathlib import Path

from .assets import ASSET_REF, SIZE_LIMITS, check_declared_file
from .config import DATA_DIR, MAX_IMAGE_BYTES, MAX_PROJECT_ARCHIVE_BYTES
from .engine import EngineError
from .service import safe_export_path

FPUB_FORMAT = 'formpublisher-package'
FPUB_ENTRIES = ['fpub.json', 'publish.json', 'site.zip']
SIGNATURE_ENTRY = 'site.zip.sig'
SITE_MODEL = 'site.formweb.json'
MAX_PACKAGE_ENTRIES = 20000
MAX_MODEL_BYTES = 8 * 1024 * 1024
MAX_META_BYTES = 8 * 1024 * 1024
HEX64 = re.compile(r'^[0-9a-f]{64}$')
BUNDLED_REF = re.compile(r'(?<![A-Za-z0-9_./-])assets/([0-9a-f]{64}\.(?:png|jpg|gif|webp|svg|mp4|webm|woff2))')
NOT_FORMWEB = 'This .fpub was not made from a FormWeb site, so FormWeb cannot open it as a project; open it in FormPublisher instead.'


def is_fpub(path: Path) -> bool:
    """True when the zip at `path` starts with an fpub.json entry, which no .fweb archive does."""
    try:
        with zipfile.ZipFile(path) as archive:
            infos = archive.infolist()
            return bool(infos) and infos[0].filename == 'fpub.json'
    except (zipfile.BadZipFile, OSError):
        return False


def _json_entry(archive: zipfile.ZipFile, info: zipfile.ZipInfo, label: str):
    if info.file_size > MAX_META_BYTES:
        raise EngineError(f'The .fpub {label} is too large.', 413)
    try:
        value = json.loads(archive.read(info).decode('utf-8'))
    except (ValueError, UnicodeDecodeError) as error:
        raise EngineError(f'The .fpub {label} is not valid JSON.') from error
    if not isinstance(value, dict):
        raise EngineError(f'The .fpub {label} is not a JSON object.')
    return value


def _stage_package(archive: zipfile.ZipFile, info: zipfile.ZipInfo, size: int, sha256: str, staged: dict):
    """Copy site.zip out of the .fpub to a temporary file while counting its bytes and digest."""
    folder = DATA_DIR / 'tmp'
    folder.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix='fpub-', suffix='.zip', dir=folder)
    target = Path(temporary)
    staged['__package__'] = target
    digest, counted = hashlib.sha256(), 0
    with archive.open(info) as stream, os.fdopen(handle, 'wb') as out:
        while chunk := stream.read(1024 * 1024):
            counted += len(chunk)
            if counted > size or counted > MAX_PROJECT_ARCHIVE_BYTES:
                break
            digest.update(chunk)
            out.write(chunk)
    if counted != size or digest.hexdigest() != sha256:
        raise EngineError('The .fpub site.zip does not match the size and sha256 recorded in the package.')
    return target


def read_fpub(path: Path, staged: dict) -> dict:
    """Validate a .fpub on disk and return a version 2 native project object ({format, version, site, assets}).
    Each asset is copied to a temporary file in the asset folder (id -> path in `staged`) after the upload checks;
    nothing is stored until the caller restores them. The caller removes whatever is left in `staged`."""
    try:
        with zipfile.ZipFile(path) as outer:
            infos = outer.infolist()
            names = [info.filename for info in infos]
            signed_names = FPUB_ENTRIES + [SIGNATURE_ENTRY]
            if names != FPUB_ENTRIES and names != signed_names:
                raise EngineError('The .fpub must hold exactly fpub.json, publish.json, site.zip and, when signed, site.zip.sig, in that order.')
            meta = _json_entry(outer, infos[0], 'fpub.json')
            if meta.get('format') != FPUB_FORMAT or meta.get('version') != 1 or isinstance(meta.get('version'), bool):
                raise EngineError('This file is not a FormPublisher package of format version 1.')
            publish = _json_entry(outer, infos[1], 'publish.json')
            package = meta.get('package')
            listed = publish.get('package')
            if not isinstance(package, dict) or package.get('file') != 'site.zip' or not isinstance(package.get('sha256'), str) or not HEX64.fullmatch(package['sha256']) or not isinstance(package.get('size'), int) or isinstance(package['size'], bool) or package['size'] < 0:
                raise EngineError('The .fpub package record is invalid.')
            if not isinstance(listed, dict) or listed.get('sha256') != package['sha256'] or listed.get('size') != package['size']:
                raise EngineError('The .fpub publish.json does not match the package record in fpub.json.')
            signature = meta.get('signature')
            if (signature is None) != (len(names) == 3) or (signature is not None and (not isinstance(signature, dict) or signature.get('file') != SIGNATURE_ENTRY)):
                raise EngineError('The .fpub signature record does not match its entries.')
            if infos[2].file_size != package['size'] or package['size'] > MAX_PROJECT_ARCHIVE_BYTES:
                raise EngineError('The .fpub site.zip does not match the size and sha256 recorded in the package.')
            site_zip = _stage_package(outer, infos[2], package['size'], package['sha256'], staged)
    except (zipfile.BadZipFile, zlib.error, EOFError, NotImplementedError, RuntimeError, OSError) as error:
        raise EngineError('The .fpub is not a valid, readable zip file.') from error
    return _read_site_zip(site_zip, staged)


def _read_site_zip(path: Path, staged: dict) -> dict:
    try:
        with zipfile.ZipFile(path) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_PACKAGE_ENTRIES:
                raise EngineError('The .fpub site.zip holds too many files.', 413)
            by_name = {}
            for info in infos:
                if info.is_dir():
                    continue
                safe_export_path(info.filename)
                if info.filename in by_name:
                    raise EngineError('The .fpub site.zip contains duplicate entries.')
                by_name[info.filename] = info
            model = by_name.get(SITE_MODEL)
            if model is None:
                raise EngineError(NOT_FORMWEB)
            if model.file_size > MAX_MODEL_BYTES:
                raise EngineError('Editable site content exceeds 8 MiB.', 413)
            try:
                site = json.loads(BUNDLED_REF.sub(r'/api/assets/\1', archive.read(model).decode('utf-8')))
            except (ValueError, UnicodeDecodeError) as error:
                raise EngineError('The site.formweb.json in the .fpub is not valid JSON.') from error
            if not isinstance(site, dict) or not isinstance(site.get('id'), str) or not isinstance(site.get('pages'), list):
                raise EngineError(NOT_FORMWEB)
            wanted = sorted(set(ASSET_REF.findall(json.dumps(site))))
            if len(wanted) > 500:
                raise EngineError('A native project holds at most 500 assets.', 413)
            listing = []
            folder = DATA_DIR / 'assets'
            folder.mkdir(parents=True, exist_ok=True)
            for name in wanted:
                info = by_name.get('assets/' + name)
                if info is None:
                    raise EngineError('The .fpub site.zip is missing the asset ' + name + ' that the site uses.')
                limit = SIZE_LIMITS.get(name.rsplit('.', 1)[1], MAX_IMAGE_BYTES)
                if info.file_size > limit:
                    raise EngineError('Embedded asset is too large: ' + name + '.', 413)
                digest, counted = hashlib.sha256(), 0
                handle, temporary = tempfile.mkstemp(prefix='.stage-', suffix='.part', dir=folder)
                staged[name] = Path(temporary)
                with archive.open(info) as stream, os.fdopen(handle, 'wb') as out:
                    while chunk := stream.read(1024 * 1024):
                        counted += len(chunk)
                        if counted > limit:
                            raise EngineError('Embedded asset is too large: ' + name + '.', 413)
                        digest.update(chunk)
                        out.write(chunk)
                mime = check_declared_file(name, staged[name], counted, digest.hexdigest())
                listing.append({'id': name, 'mime': mime, 'name': name})
    except (zipfile.BadZipFile, zlib.error, EOFError, NotImplementedError, RuntimeError, OSError) as error:
        raise EngineError('The site.zip inside the .fpub is not a valid, readable zip file.') from error
    return {'format': 'com.nodemode.formweb', 'version': 2, 'site': site, 'assets': listing}
