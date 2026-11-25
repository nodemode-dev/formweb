import io
import struct
import threading
import zipfile
import zlib


def zip_of(entries, compression=zipfile.ZIP_DEFLATED):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression) as archive:
        for name, data in entries.items():
            archive.writestr(name, data.encode("utf-8") if isinstance(data, str) else data)
    return buffer.getvalue()


def zip_with_symlink(target="../../etc/passwd", name="link.html"):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("index.html", "<html><body><p>ok</p></body></html>")
        info = zipfile.ZipInfo(name)
        info.create_system = 3
        info.external_attr = (0o120777 << 16)
        archive.writestr(info, target)
    return buffer.getvalue()


def zip_declaring_smaller_sizes(name, data, declared):
    raw = bytearray(zip_of({name: data}))
    local = raw.find(b"PK\x03\x04")
    struct.pack_into("<I", raw, local + 22, declared)
    central = raw.find(b"PK\x01\x02")
    struct.pack_into("<I", raw, central + 24, declared)
    return bytes(raw)


def png_bytes(width=2, height=2):
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    rows = b"".join(b"\x00" + b"\xff\x00\x00" * width for _ in range(height))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#0a0"/></svg>'


def page(title, body, head="", description=None):
    meta = f'<meta name="description" content="{description}">' if description else ""
    return f"<!doctype html><html><head><title>{title}</title>{meta}{head}</head><body>{body}</body></html>"


def five_page_site(marker="first"):
    css_link = '<link rel="stylesheet" href="{0}css/site.css">'
    script = '<script src="{0}js/app.js"></script>'
    return {
        "mill/index.html": page("Mill Lane", f'<h1>Home {marker}</h1><img src="img/logo.png" alt="logo"><a href="about.html">About</a><a href="contact/">Contact</a><a href="blog/index.html">Blog</a><a href="blog/first-post.html#comments">First</a><a href="https://example.org/elsewhere?q=1">Out</a><a href="mailto:hi@example.org">Mail</a>', css_link.format("") + script.format(""), "The home page"),
        "mill/about.html": page("About us", f'<h2>About {marker}</h2><a href="index.html">Home</a><img src="img/photo.svg" alt="photo">', css_link.format(""), "Who we are"),
        "mill/contact/index.html": page("Contact", f'<h2>Contact {marker}</h2><a href="../about.html">About</a>', css_link.format("../"), "Write to us"),
        "mill/blog/index.html": page("Journal", f'<h2>Journal {marker}</h2><a href="first-post.html">First post</a>', css_link.format("../"), "News"),
        "mill/blog/first-post.html": page("First post", f'<h2>First post {marker}</h2><a href="../index.html">Home</a><a href="./">Journal</a><p id="comments">c</p>', css_link.format("../"), "The first post"),
        "mill/css/site.css": '@import "base.css";\nbody{background:url(../img/logo.png)}\n@font-face{font-family:Mill;src:url(../fonts/mill.woff2) format("woff2")}\n',
        "mill/css/base.css": "h1{color:#123456}\n",
        "mill/js/app.js": "document.documentElement.dataset.ready = '1';\n",
        "mill/img/logo.png": png_bytes(),
        "mill/img/photo.svg": SVG,
        "mill/fonts/mill.woff2": b"wOF2" + b"\x00\x01\x00\x00" + bytes(64),
        "mill/notes.txt": "not part of the site",
    }


def answered_within(seconds, call):
    box = {}

    def run():
        try:
            box["value"] = call()
        except BaseException as error:
            box["error"] = error

    worker = threading.Thread(target=run, daemon=True)
    worker.start()
    worker.join(seconds)
    assert not worker.is_alive(), f"no answer within {seconds} s"
    if "error" in box:
        raise box["error"]
    return box["value"]
