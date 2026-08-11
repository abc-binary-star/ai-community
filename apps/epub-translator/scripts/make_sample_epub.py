#!/usr/bin/env python3
"""生成一个最小测试 EPUB 文件，用于前后端联调。"""
import zipfile
import os

OUT = os.path.join(os.path.dirname(__file__), "sample-book.epub")

MIMETYPE = "application/epub+zip"

CONTAINER = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"""

OPF = """<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:test-0001-0000-0000-000000000001</dc:identifier>
    <dc:title>The Silent Algorithm</dc:title>
    <dc:creator>J. R. Test</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml"/>
    <item id="colophon" href="colophon.xhtml" media-type="application/xhtml+xml"/>
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml"/>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="cover"/>
    <itemref idref="titlepage"/>
    <itemref idref="colophon"/>
    <itemref idref="toc"/>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
  <guide>
    <reference type="cover" title="Cover" href="cover.xhtml"/>
    <reference type="title-page" title="Title Page" href="titlepage.xhtml"/>
    <reference type="copyright-page" title="Copyright" href="colophon.xhtml"/>
    <reference type="toc" title="Table of Contents" href="toc.xhtml"/>
    <reference type="text" title="Chapter 1" href="chapter1.xhtml"/>
    <reference type="text" title="Chapter 2" href="chapter2.xhtml"/>
  </guide>
</package>"""

COVER = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>The Silent Algorithm</title></head>
<body>
<h1>The Silent Algorithm</h1>
<p>by J. R. Test</p>
</body>
</html>"""

TITLEPAGE = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Title Page</title></head>
<body>
<h1>The Silent Algorithm</h1>
<p>A Novel</p>
<p>J. R. Test</p>
</body>
</html>"""

COLOPHON = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Copyright</title></head>
<body>
<h1>Copyright</h1>
<p>Copyright &copy; 2089 by J. R. Test</p>
<p>All rights reserved.</p>
</body>
</html>"""

TOC = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Table of Contents</title></head>
<body>
<h1>Table of Contents</h1>
<ul>
<li><a href="chapter1.xhtml">Chapter 1: The Awakening</a></li>
<li><a href="chapter2.xhtml">Chapter 2: The Journey</a></li>
</ul>
</body>
</html>"""

CH1 = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1: The Awakening</title></head>
<body>
<h1>The Awakening</h1>
<p>It was a cold morning when Ada first opened her eyes inside the machine.</p>
<p>The year is 2089. Humanity has long since abandoned the old cities.</p>
<p>She whispered to herself, <em>"I will find the truth."</em></p>
</body>
</html>"""

CH2 = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 2: The Journey</title></head>
<body>
<h1>The Journey</h1>
<p>Ada walked through the silent corridors, her footsteps echoing.</p>
<p>A door opened, revealing a vast library of forgotten knowledge.</p>
<p>She smiled. The algorithm was not a prison. It was a map.</p>
</body>
</html>"""

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("mimetype", MIMETYPE, compress_type=zipfile.ZIP_STORED)
    z.writestr("META-INF/container.xml", CONTAINER)
    z.writestr("OEBPS/content.opf", OPF)
    z.writestr("OEBPS/cover.xhtml", COVER)
    z.writestr("OEBPS/titlepage.xhtml", TITLEPAGE)
    z.writestr("OEBPS/colophon.xhtml", COLOPHON)
    z.writestr("OEBPS/toc.xhtml", TOC)
    z.writestr("OEBPS/chapter1.xhtml", CH1)
    z.writestr("OEBPS/chapter2.xhtml", CH2)

print(f"已生成测试 EPUB（含前置页）: {OUT} ({os.path.getsize(OUT)} bytes)")
