# Security policy

## Supported versions

Security fixes go into the newest release. Please update before reporting, and
check whether the problem is still there.

| Version | Supported |
| --- | --- |
| 0.21.x (latest release) | Yes |
| Anything older | No |

## Reporting a vulnerability

**Do not open a public issue for a security problem.** Use GitHub's private
reporting instead: on the repository's **Security** tab, choose **Report a
vulnerability**. Include what you found, the steps to reproduce it, the version and
platform, and what an attacker could do with it.

You can expect an acknowledgement within a week. We will keep you informed while it
is fixed and credit you in the release notes, unless you would rather not be named.

## What counts

FormWeb runs on your own machine, so the things that matter most are the ways
something outside it could get in:

- **The service** listens on loopback (127.0.0.1): port 8240 in development, and in the
  desktop app port 8240 or, when that is taken, the next free port up to 8279
  (`FORMWEB_PORT` sets the first one to try). Anything that makes it
  reachable from another machine, or lets a web page on another origin drive it.
- **Publishing and preview**: the service itself hosts published versions
  (`/published/`), the active release (`/sites/`) and previews (`/preview/<token>/`),
  and the forms' endpoints. A preview or clip token that opens more than the page or
  assets it was made for, an export or publication that writes outside its folder, or
  a previewed or published page that reaches the editor or the service's API.
- **Forms and signed delivery**: stored submissions or a signing secret leaking, or a
  delivery that goes somewhere it should not.
- **Provider adapters** (deployment and commerce): credentials, which are read from
  the server's environment and never stored in a site, leaking, or an adapter
  sending to an address that is not public or not allowed.
- **Agents and the MCP server** (`/mcp`, and `./formweb mcp` over stdio): an agent
  acting while Agents is off, doing more than the project role of its identity
  allows, getting past the approvals for destructive tools and for releases, or
  switching Agents or changing the approval choices from anywhere but FormWeb's own
  window (which holds a per-launch window key).
- **The terminal and the chat pane**: anything other than FormWeb's own window
  reaching a shell or Claude Code through them.
- **Hand-offs to other Form apps**: Send to FormPublisher posting a site to anything
  but FormPublisher on this computer's loopback address, or the calls to formvis and
  formlit (loopback unless the owner sets another address) reaching anything else.
- **Files and archives**: opening a `.fweb` project, a `.fpub` file, an imported ZIP
  or HTML, or a picture in a way that writes outside where it should.

Bugs that need someone to already control your machine, or to run a modified build
of FormWeb, are ordinary bugs: please open an issue for those.

## How site pages are kept apart from the editor

A site can come from someone else (a `.fweb` or `.fpub` file, Import HTML, Import
site from zip, a starter), and its own scripts (custom code, code sections, embeds)
run when its pages are shown. Every page and file the service serves for a site,
under `/preview/<token>/`, `/published/` and `/sites/`, carries a
`Content-Security-Policy: sandbox` header that allows scripts, forms and pop-ups but
not the same origin, so the browser gives the page an opaque origin of its own
wherever it is opened: in a tab, in a window the editor opened, or in a frame. The
page cannot read the editor's storage or window key, reach into the editor's window,
or make a request the engine accepts: the engine refuses an opaque or foreign
`Origin` on its API, and only the site's own files and its form endpoint answer an
opaque origin, never with cookies or other credentials. Isolated code components get
a stricter policy of their own, uploaded pictures, video and fonts are served with a sandbox
that allows no script at all, and the page password form is the service's own page,
which allows no script and posts with the service's own origin.
