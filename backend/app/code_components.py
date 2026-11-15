import asyncio
import json
import os
import re
import shutil

from .config import ROOT
from .engine import EngineError


POSTER_PATH = re.compile(r'^/api/assets/[0-9a-f]{64}\.(png|jpg|jpeg|webp|gif|svg)$')
COMPONENT_LIMITS = {'isolated': (131072, 262144), 'page': (262144, 524288)}
EXTENDED_PROP_TYPES = ('color', 'asset')


async def build_component(request):
    if not isinstance(request, dict):
        raise EngineError('Component build requires an object.')
    mode = request.get('mode', 'isolated')
    if mode not in COMPONENT_LIMITS:
        raise EngineError('Component mode must be isolated or page.')
    poster = request.get('poster')
    if poster is not None and (not isinstance(poster, str) or not POSTER_PATH.fullmatch(poster)):
        raise EngineError('Component poster must be an owned image asset path.')
    poster_light = request.get('posterLight')
    if poster_light is not None and (not isinstance(poster_light, str) or not POSTER_PATH.fullmatch(poster_light)):
        raise EngineError('Component light poster must be an owned image asset path.')
    source_cap, javascript_cap = COMPONENT_LIMITS[mode]
    source = request.get('source')
    if isinstance(source, str) and len(source.encode('utf-8')) > source_cap:
        raise EngineError(f'Component source exceeds {source_cap // 1024} KiB.', 413)
    props = request.get('props')
    forwarded = {key: value for key, value in request.items() if key not in ('poster', 'posterLight')}
    if mode == 'page' and isinstance(props, dict):
        forwarded['props'] = {name: {**descriptor, 'type': 'string'} if isinstance(descriptor, dict) and descriptor.get('type') in EXTENDED_PROP_TYPES else descriptor for name, descriptor in props.items()}
    body = json.dumps(forwarded, ensure_ascii=False, allow_nan=False).encode('utf-8')
    if len(body) > 1048576:
        raise EngineError('Component build request exceeds 1 MiB.', 413)
    node = os.getenv('FORMWEB_NODE_BIN') or shutil.which('node')
    if not node or not (ROOT / 'frontend/node_modules/typescript/bin/tsc').is_file():
        raise EngineError('Code components require Node and the pinned frontend compiler. Run ./formweb install.', 503)
    process = await asyncio.create_subprocess_exec(node, str(ROOT / 'setup/build_component.mjs'), stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, cwd=str(ROOT))
    try:
        output, error = await asyncio.wait_for(process.communicate(body), 20)
    except asyncio.TimeoutError as failure:
        process.kill()
        await process.wait()
        raise EngineError('Component compilation exceeded its time limit.', 408) from failure
    try:
        result = json.loads(output)
    except (ValueError, UnicodeError) as failure:
        raise EngineError('Component compiler did not return a valid build result. Verify the Node installation.', 503) from failure
    if not result.get('ok'):
        raise EngineError(str(result.get('diagnostics', 'Component compilation failed.'))[:65536], 422)
    component = result.get('component', {})
    if len(str(component.get('javascript', '')).encode('utf-8')) > javascript_cap:
        raise EngineError(f'Compiled component exceeds {javascript_cap // 1024} KiB.', 413)
    component['mode'] = mode
    if mode == 'page' and isinstance(props, dict):
        component['props'] = props
    if poster is not None:
        component['poster'] = poster
    if poster_light is not None:
        component['posterLight'] = poster_light
    return result
