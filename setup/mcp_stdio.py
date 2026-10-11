#!/usr/bin/env python3
import asyncio
import logging
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))

import httpx2
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server

from app.config import AUTH_TOKEN, PORT, VERSION


async def main():
    url = os.getenv('FORMWEB_MCP_URL', f'http://127.0.0.1:{PORT}/mcp')
    parsed = urlparse(url)
    if parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost', '::1') or parsed.username or parsed.password or parsed.path != '/mcp' or parsed.query or parsed.fragment:
        raise ValueError('FORMWEB_MCP_URL must point to a loopback http://host:port/mcp endpoint.')
    headers = {'Authorization': 'Bearer ' + AUTH_TOKEN} if AUTH_TOKEN else {}
    # 130 s: an agent call can wait up to 100 s for a person's approval in Agent Connect.
    async with httpx2.AsyncClient(headers=headers, timeout=130, trust_env=False) as client:
        async with streamable_http_client(url, http_client=client) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream, read_timeout_seconds=130) as upstream:
                initialized = await upstream.initialize()
                catalogue = await upstream.list_tools()
                schemas = {item.name: item.input_schema for item in catalogue.tools}
                async def list_tools(context, params):
                    return await upstream.list_tools(params=params)
                async def call_tool(context, params):
                    return await upstream.call_tool(params.name, params.arguments or {})
                async def list_resources(context, params):
                    return await upstream.list_resources(params=params)
                async def read_resource(context, params):
                    return await upstream.read_resource(str(params.uri))
                async def list_prompts(context, params):
                    return await upstream.list_prompts(params=params)
                async def get_prompt(context, params):
                    return await upstream.get_prompt(params.name, params.arguments or {})
                # Forward the backend's instructions unchanged so stdio clients get the same guidance as HTTP ones.
                proxy = Server('FormWeb', version=VERSION, instructions=initialized.instructions, get_tool_input_schema=lambda name: schemas.get(name), on_list_tools=list_tools, on_call_tool=call_tool, on_list_resources=list_resources, on_read_resource=read_resource, on_list_prompts=list_prompts, on_get_prompt=get_prompt)
                async with stdio_server() as (stdio_read, stdio_write):
                    await proxy.run(stdio_read, stdio_write, proxy.create_initialization_options())


if __name__ == '__main__':
    logging.basicConfig(stream=sys.stderr, level=logging.WARNING)
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    except Exception as error:
        print(f'FormWeb MCP: {error}. Start ./formweb serve and enable Agents, or set FORMWEB_AGENTS=1 for backend startup.', file=sys.stderr)
        raise SystemExit(1)
