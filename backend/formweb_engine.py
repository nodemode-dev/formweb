import os
import sys

if sys.stdin is None:
    sys.stdin = open(os.devnull, encoding='utf-8')
if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w', encoding='utf-8')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w', encoding='utf-8')

from app.config import PORT
from app.main import app

if __name__ == '__main__':
    import sys
    if '--selfcheck' in sys.argv:
        from app.config import CORE_BIN, FRONTEND_DIST
        missing = [str(path) for path in (CORE_BIN, FRONTEND_DIST / 'index.html') if not path.is_file()]
        if not missing:
            import subprocess
            try:
                core = subprocess.run([str(CORE_BIN), '--selfcheck'], capture_output=True, timeout=30)
                if core.returncode != 0:
                    missing = [f'{CORE_BIN} --selfcheck exited {core.returncode}: {core.stderr.decode(errors="replace").strip()[:200]}']
            except (OSError, subprocess.SubprocessError) as error:
                missing = [f'{CORE_BIN} could not be started: {error}']
        print('formweb-engine selfcheck', 'failed, missing: ' + ', '.join(missing) if missing else 'ok')
        sys.exit(1 if missing else 0)
    import uvicorn
    from app import window_key
    if window_key.stdout_mode():
        print(window_key.LINE + window_key.KEY, flush=True)
    uvicorn.run(app, host='127.0.0.1', port=PORT, timeout_graceful_shutdown=2)
