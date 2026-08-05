#!/usr/bin/env python3
"""Publish a local markdown report to a Feishu (Lark) docx document.

Requirements:
  - A Feishu custom app with "docx:document" (cloud doc) permission.
  - Environment variables:
      FEISHU_APP_ID, FEISHU_APP_SECRET
      FEISHU_FOLDER_TOKEN (optional; without it the doc is created in "My Space")
      REPORT_PATH (default: docs/analysis/ai-limit-quota-report.md)

Usage:
  FEISHU_APP_ID=xxx FEISHU_APP_SECRET=yyy \
  FEISHU_FOLDER_TOKEN=zzz python3 tools/feishu_report_publish.py
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from typing import List, Optional

BASE = "https://open.feishu.cn/open-apis"


def api(path: str, method: str, token: Optional[str], body: Optional[dict] = None) -> dict:
    url = BASE + path
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        payload = json.loads(e.read().decode("utf-8") or "{}")
        raise RuntimeError(
            f"Feishu API error {e.code} on {method} {path}: {payload.get('msg', payload)}"
        )
    if payload.get("code") not in (0, None):
        raise RuntimeError(
            f"Feishu API code={payload.get('code')} msg={payload.get('msg')} on {method} {path}"
        )
    return payload


def tenant_token(app_id: str, app_secret: str) -> str:
    payload = api(
        "/auth/v3/tenant_access_token/internal",
        "POST",
        None,
        {"app_id": app_id, "app_secret": app_secret},
    )
    return payload["tenant_access_token"]


def create_document(token: str, title: str, folder_token: Optional[str]) -> str:
    body: dict = {"title": title}
    if folder_token:
        body["folder_token"] = folder_token
    payload = api("/docx/v1/documents", "POST", token, body)
    return payload["document"]["document_id"]


def text_block(content: str) -> dict:
    return {"text_run": {"content": content}}


def inline_text(content: str) -> str:
    # Keep the report readable: drop markdown markers that Feishu text runs do not render.
    content = re.sub(r"`([^`]+)`", r"\1", content)
    content = re.sub(r"\*\*([^*]+)\*\*", r"\1", content)
    content = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", content)
    return content


BLOCK_FIELDS = {
    2: "text", 3: "heading1", 4: "heading2", 5: "heading3", 6: "heading4",
    12: "bullet", 13: "ordered", 14: "code", 15: "quote",
}


def make_block(block_type: int, content: str) -> dict:
    field = BLOCK_FIELDS[block_type]
    block: dict = {"block_type": block_type}
    if block_type == 14:
        block[field] = {
            "elements": [{"text_run": {"content": content}}],
            "style": {"language": 1},  # 1 = plain text
        }
    else:
        block[field] = {"elements": [{"text_run": {"content": content}}]}
    return block


def parse_markdown(md: str) -> List[dict]:
    blocks: List[dict] = []
    lines = md.splitlines()
    i = 0
    pending_paragraph: list[str] = []

    def flush_paragraph() -> None:
        nonlocal pending_paragraph
        if pending_paragraph:
            text = inline_text(" ".join(pending_paragraph).strip())
            if text:
                blocks.append(make_block(2, text))
            pending_paragraph = []

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            flush_paragraph()
            i += 1
            continue

        if stripped == "---":
            flush_paragraph()
            i += 1
            continue

        heading = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if heading:
            flush_paragraph()
            level = len(heading.group(1))
            block_type = {1: 3, 2: 4, 3: 5, 4: 6}[level]
            blocks.append(make_block(block_type, inline_text(heading.group(2).strip())))
            i += 1
            continue

        if stripped.startswith("```"):
            flush_paragraph()
            i += 1
            code_lines: list[str] = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1  # closing fence
            code = "\n".join(code_lines).strip()
            if code:
                blocks.append(make_block(14, code))
            continue

        if stripped.startswith("|"):
            flush_paragraph()
            # Render a table as compact bullet rows; keeps alignment readable in Feishu.
            row = stripped.strip("|")
            cells = [inline_text(c.strip()) for c in row.split("|")]
            if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                blocks.append(make_block(12, " │ ".join(cells)))
            i += 1
            continue

        if stripped.startswith("> "):
            flush_paragraph()
            blocks.append(make_block(15, inline_text(stripped[2:].strip())))
            i += 1
            continue

        bullet = re.match(r"^[-*]\s+(.*)$", stripped)
        if bullet:
            flush_paragraph()
            blocks.append(make_block(12, inline_text(bullet.group(1).strip())))
            i += 1
            continue

        ordered = re.match(r"^\d+[.)]\s+(.*)$", stripped)
        if ordered:
            flush_paragraph()
            blocks.append(make_block(13, inline_text(ordered.group(1).strip())))
            i += 1
            continue

        pending_paragraph.append(stripped)
        i += 1

    flush_paragraph()
    return blocks


def append_blocks(token: str, document_id: str, blocks: List[dict], chunk_size: int = 40) -> None:
    # Feishu accepts up to 50 child blocks per request; keep batches conservative.
    for start in range(0, len(blocks), chunk_size):
        chunk = blocks[start : start + chunk_size]
        api(
            f"/docx/v1/documents/{document_id}/blocks/{document_id}/children",
            "POST",
            token,
            {"children": chunk, "index": -1},
        )


def main() -> int:
    app_id = os.environ.get("FEISHU_APP_ID", "").strip()
    app_secret = os.environ.get("FEISHU_APP_SECRET", "").strip()
    if not app_id or not app_secret:
        print("缺少 FEISHU_APP_ID / FEISHU_APP_SECRET", file=sys.stderr)
        return 2

    report_path = os.environ.get(
        "REPORT_PATH", "docs/analysis/ai-limit-quota-report.md"
    )
    if not os.path.exists(report_path):
        print(f"报告文件不存在: {report_path}", file=sys.stderr)
        return 2

    title = os.environ.get("REPORT_TITLE", "AI 接口限制现状与免费/订阅配额方案")
    folder_token = os.environ.get("FEISHU_FOLDER_TOKEN", "").strip() or None

    token = tenant_token(app_id, app_secret)
    document_id = create_document(token, title, folder_token)
    blocks = parse_markdown(open(report_path, encoding="utf-8").read())
    append_blocks(token, document_id, blocks)

    print(f"已发布飞书文档: https://feishu.cn/docx/{document_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
