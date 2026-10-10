import asyncio
import json
import os
import shutil

from .config import ROOT
from .engine import EngineError


async def build_component(request):
    if not isinstance(request, dict):
        raise EngineError('Component build requires an object.')
    body = json.dumps(request, ensure_ascii=False, allow_nan=False).encode('utf-8')
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
    return result
