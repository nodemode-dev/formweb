import logging
import os
import sys
from pathlib import Path

if sys.stdin is None:
    sys.stdin = open(os.devnull, encoding='utf-8')
if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w', encoding='utf-8')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w', encoding='utf-8')


def watch_shell(data) -> None:
    from app import runtime, startup

    shell = startup.shell_pid()
    if not shell and getattr(sys, 'frozen', False):
        shell = os.getppid()
    if shell <= 1:
        return

    def leave() -> None:
        logging.getLogger('formweb').info('the app that started this engine is gone (process %s), stopping', shell)
        runtime.release(data)
        os._exit(0)

    startup.watch(shell, leave)


def serve() -> int:
    try:
        from app import runtime, startup
        from app.config import DATA_DIR, PORT

        DATA_DIR.mkdir(parents=True, exist_ok=True)
        logs = runtime.start_logging(DATA_DIR).parent
    except OSError as error:
        print(f'formweb cannot use its data folder: {error}', file=sys.stderr)
        return 5
    startup.keep_errors(logs)
    log = logging.getLogger('formweb')
    if startup.alone():
        beside = startup.app_beside(Path(sys.executable))
        if beside is not None and startup.open_app(beside):
            log.info('started without its app, so it opened %s and stopped', beside)
            return 0
        log.error('started without its app, and no app program was found near %s', sys.executable)
        print('formweb-engine is a part of FormWeb and serves nothing on its own. Open FormWeb instead.', file=sys.stderr)
        return 4
    try:
        runtime.claim(DATA_DIR)
    except runtime.AlreadyRunning as error:
        log.error('%s', error)
        print(error, file=sys.stderr)
        return 2
    watch_shell(DATA_DIR)
    import signal

    import uvicorn

    from app import window_key
    from app.main import app

    def leave(_signum, _frame) -> None:
        runtime.release(DATA_DIR)
        os._exit(0)

    signal.signal(signal.SIGTERM, leave)
    if window_key.stdout_mode():
        print(window_key.LINE + window_key.KEY, flush=True)
    server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=PORT, timeout_graceful_shutdown=2))
    runtime.start_logging(DATA_DIR)
    try:
        server.run()
    finally:
        runtime.release(DATA_DIR)
    return 0 if server.started else 3


def main() -> int:
    try:
        return serve()
    except Exception:
        logging.getLogger('formweb').exception('the engine stopped on an error')
        raise


if __name__ == '__main__':
    if '--selfcheck' in sys.argv:
        import app.main
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
    sys.exit(main())
