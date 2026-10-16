from app.config import PORT
from app.main import app

if __name__ == '__main__':
    import sys
    if '--selfcheck' in sys.argv:
        from app.config import CORE_BIN, FRONTEND_DIST
        missing = [str(path) for path in (CORE_BIN, FRONTEND_DIST / 'index.html') if not path.is_file()]
        print('formweb-engine selfcheck', 'failed, missing: ' + ', '.join(missing) if missing else 'ok')
        sys.exit(1 if missing else 0)
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=PORT)
