# Getting started

Install Node 22, Python 3.12 and Rust stable. Keep the extracted `formweb/` folder intact, including its `.git` folder. Installation downloads the pinned frontend and backend packages and compiles the native engine.

```bash
cd formweb
./formweb install
./formweb boot
```

On Windows use `formweb.bat install` and `formweb.bat boot`. The checked-in client configurations use the macOS/Linux launcher; Windows client settings must point to this checkout's absolute `formweb.bat` path with argument `mcp`.

| Surface | Address |
| --- | --- |
| Vite editor | http://localhost:5240 |
| Vite preview port | http://localhost:5241 |
| FastAPI service | http://127.0.0.1:8240 |
| MCP Streamable HTTP | http://127.0.0.1:8240/mcp |

Use `./formweb doctor` to inspect tool availability, installed dependencies, the core binary, the frontend build and occupied ports. `./formweb install-core` compiles only the Rust workspace. `install-backend` and `install-frontend` update their respective dependencies.

For a single production-mode process:

```bash
./formweb build
./formweb serve
```

Open http://127.0.0.1:8240. This serves the built editor alongside its API. Bindings remain loopback-only.

The backend configuration template is `backend/.env.example`. Local files such as `.env`, project databases and dependency folders are ignored by Git. Set `FORMWEB_DATA_DIR` to a durable folder if the checkout will be replaced. The default data location is `backend/data`.

Enable the editor's Agents switch before using MCP. Start the HTTP service first; `./formweb mcp` proxies that running service and does not create another engine.
