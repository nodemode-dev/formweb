#!/usr/bin/env python3
"""./formweb run: send one engine command to the running FormWeb through the agent substrate.

  ./formweb run --list                      list engine commands
  ./formweb run node.update id=headline patch='{"text":"Hi"}'
  ./formweb run page.add '{"name":"About","slug":"/about"}'
  ./formweb run history.undo
Add --json for machine output, --revision N to require a revision.
Changes are attributed to the terminal channel and appear on the open canvas at once.
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
    body = {'command': command, 'params': params}
    if revision is not None:
        body['expectedRevision'] = revision
    state = call('/api/substrate/run', body)
    if as_json:
        print(json.dumps({'command': command, 'revision': state.get('revision'), 'canUndo': state.get('canUndo')}))
    else:
        print(f"[formweb] {command} applied; revision {state.get('revision')}. One undo step in the editor.")
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
