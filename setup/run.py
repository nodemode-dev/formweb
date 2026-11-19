#!/usr/bin/env python3
"""./formweb run: send one engine command to the running FormWeb through the agent substrate.

  ./formweb run --list                      list engine commands
  ./formweb run node.update id=headline patch='{"text":"Hi"}'
  ./formweb run page.add '{"name":"About","slug":"/about"}'
  ./formweb run history.undo
Add --json for machine output, --revision N to require a revision.
Changes go through the MCP endpoint like any outside agent: Agents must be on in the editor, the editor's
approval settings apply, and they appear on the open canvas at once.
"""
import json
import os
import sys
import urllib.error
import urllib.request

API = os.environ.get('FORMWEB_API', 'http://127.0.0.1:' + os.environ.get('FORMWEB_PORT', '8240')).rstrip('/')


def call(path, body=None):
    headers = {'X-FormWeb-Channel': 'terminal'}
    token = os.environ.get('FORMWEB_TOKEN') or os.environ.get('FORMWEB_AUTH_TOKEN')
    if token:
        headers['Authorization'] = 'Bearer ' + token
    data = None
    if body is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(body).encode()
    request = urllib.request.Request(API + path, data=data, headers=headers, method='POST' if data else 'GET')
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        try:
            detail = json.loads(error.read()).get('detail', error.reason)
        except Exception:
            detail = error.reason
        raise SystemExit(f'[formweb] {error.code}: {detail}')
    except urllib.error.URLError as error:
        raise SystemExit(f'[formweb] FormWeb is not running at {API} ({error.reason}). Start it with ./formweb boot.')


def tool(name, arguments):
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25'}
    token = os.environ.get('FORMWEB_TOKEN') or os.environ.get('FORMWEB_AUTH_TOKEN')
    if token:
        headers['Authorization'] = 'Bearer ' + token
    data = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': name, 'arguments': arguments}}).encode()
    request = urllib.request.Request(API + '/mcp', data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=150) as response:
            reply = json.loads(response.read())
    except urllib.error.HTTPError as error:
        try:
            detail = json.loads(error.read()).get('detail', error.reason)
        except Exception:
            detail = error.reason
        raise SystemExit(f'[formweb] {error.code}: {detail}')
    except urllib.error.URLError as error:
        raise SystemExit(f'[formweb] FormWeb is not running at {API} ({error.reason}). Start it with ./formweb boot.')
    if 'error' in reply:
        raise SystemExit(f"[formweb] {reply['error'].get('message', 'the call failed')}")
    result = reply.get('result') or {}
    body = result.get('structuredContent')
    if body is None:
        text = next((item.get('text', '') for item in result.get('content') or [] if item.get('type') == 'text'), '')
        try:
            body = json.loads(text)
        except ValueError:
            body = {'detail': text}
    if result.get('isError'):
        raise SystemExit(f"[formweb] {body.get('detail') or body.get('error') or body}")
    return body


def value(text):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def main(argv):
    as_json = '--json' in argv
    argv = [item for item in argv if item != '--json']
    revision = None
    if '--revision' in argv:
        index = argv.index('--revision')
        try:
            revision = int(argv[index + 1])
        except (IndexError, ValueError):
            raise SystemExit('[formweb] --revision needs a number')
        del argv[index:index + 2]
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__.strip())
        return 0
    if argv[0] == '--list':
        summary = call('/api/substrate')
        if as_json:
            print(json.dumps(summary, indent=2))
        else:
            print(f"substrate: {summary['active']} ({len(summary['commands'])} commands)")
            for item in summary['commands']:
                print('  ' + item['id'])
        return 0
    command, rest = argv[0], argv[1:]
    params = {}
    for item in rest:
        if '=' in item and not item.lstrip().startswith('{'):
            key, _, raw = item.partition('=')
            params[key] = value(raw)
        else:
            parsed = value(item)
            if not isinstance(parsed, dict):
                raise SystemExit(f'[formweb] parameters must be key=value pairs or one JSON object, not {item!r}')
            params.update(parsed)
    body = {'commands': [{'command': command, 'params': params}]}
    if revision is not None:
        body['expected_revision'] = revision
    state = tool('apply_commands', body)
    if as_json:
        print(json.dumps({'command': command, 'revision': state.get('revision'), 'canUndo': state.get('canUndo')}))
    else:
        print(f"[formweb] {command} applied; revision {state.get('revision')}. One undo step in the editor.")
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
