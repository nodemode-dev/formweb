import asyncio
import json
import logging
from typing import Any

from .config import CORE_BIN

LOG = logging.getLogger('formweb.core')


class EngineError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


class RustEngine:
    def __init__(self):
        self.lock = asyncio.Lock()
        self.process: asyncio.subprocess.Process | None = None
        self.stderr_task: asyncio.Task | None = None
        self.request_id = 0
        self.cached_state: dict[str, Any] | None = None
        self.commands: list[str] = []

    async def start(self):
        async with self.lock:
            await self._start()
            info = await self._exchange('hello', {})
            self.commands = info.get('commands', [])
            self.cached_state = await self._exchange('state', {})

    async def _start(self):
        if not CORE_BIN.is_file():
            raise EngineError(f'Rust engine missing: {CORE_BIN}. Run ./formweb build.', 503)
        self.process = await asyncio.create_subprocess_exec(str(CORE_BIN), stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, limit=32 * 1024 * 1024)
        self.stderr_task = asyncio.create_task(self._drain_stderr())

    async def _drain_stderr(self):
        process = self.process
        if process and process.stderr:
            while line := await process.stderr.readline():
                LOG.warning('%s', line.decode(errors='replace').rstrip())

    async def _exchange(self, method: str, params: dict[str, Any]):
        process = self.process
        if not process or process.returncode is not None or not process.stdin or not process.stdout:
            raise EngineError('Rust engine is unavailable.', 503)
        self.request_id += 1
        request_id = self.request_id
        request = json.dumps({'id': request_id, 'method': method, 'params': params}, separators=(',', ':'))
        try:
            process.stdin.write(request.encode() + b'\n')
            await process.stdin.drain()
            line = await asyncio.wait_for(process.stdout.readline(), timeout=30)
            if not line:
                raise EngineError('Rust engine stopped before acknowledging the request.', 503)
            reply = json.loads(line)
            if reply.get('id') != request_id:
                raise EngineError('Rust engine protocol response mismatch.', 503)
        except (OSError, asyncio.TimeoutError, json.JSONDecodeError) as error:
            await self._stop()
            raise EngineError('Rust engine transport interrupted; the last acknowledged document will be recovered.', 503) from error
        if not reply.get('ok'):
            message = str(reply.get('error', 'Engine operation failed.'))
            raise EngineError(message, 409 if 'revision conflict' in message.lower() else 400)
        return reply.get('result')

    async def request(self, method: str, params: dict[str, Any] | None = None):
        async with self.lock:
            if not self.process or self.process.returncode is not None:
                last = self.cached_state
                await self._stop()
                await self._start()
                if last:
                    await self._exchange('load', {'site': last['site'], 'restoreRevision': last['revision']})
            result = await self._exchange(method, params or {})
            if isinstance(result, dict) and 'site' in result and 'revision' in result:
                self.cached_state = result
            return result

    async def _stop(self):
        if self.process and self.process.returncode is None:
            self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), 3)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()
        if self.stderr_task:
            self.stderr_task.cancel()
        self.process = None

    async def close(self):
        async with self.lock:
            await self._stop()
