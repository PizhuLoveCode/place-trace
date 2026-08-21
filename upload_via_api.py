#!/usr/bin/env python3
"""Upload place-trace to GitHub via api.github.com (works when github.com times out)."""
from __future__ import annotations

import base64
import json
import mimetypes
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OWNER = "PizhuLoveCode"
REPO = "place-trace"
BRANCH = "main"
API = "https://api.github.com"

SKIP_DIRS = {".git", "__pycache__", "node_modules", ".DS_Store"}
SKIP_NAMES = {".DS_Store"}
SKIP_SUFFIX = {".command"}  # helper scripts, optional


def ask_token() -> str:
    env = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if env:
        return env.strip()
    print("=== 通过 API 推送到 GitHub（不走 github.com git 协议）===\n")
    print("1) 浏览器打开（打不开就开代理/VPN）：")
    print("   https://github.com/settings/tokens/new")
    print("2) Note: place-trace")
    print("3) Expiration: 按需")
    print("4) 勾选: repo")
    print("5) Generate token，复制 ghp_... 粘贴到下面\n")
    token = input("Token: ").strip()
    if not token:
        sys.exit("未输入 Token")
    return token


def req(method: str, url: str, token: str, data=None, expect=(200, 201, 204)):
    body = None
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "place-trace-uploader",
    }
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(request, context=ctx, timeout=60) as resp:
            raw = resp.read()
            if not raw:
                return {}
            return json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        if e.code not in expect:
            raise SystemExit(f"HTTP {e.code} {method} {url}\n{err}") from e
        return json.loads(err) if err else {}


def list_files() -> list[Path]:
    files = []
    for p in ROOT.rglob("*"):
        if not p.is_file():
            continue
        rel_parts = p.relative_to(ROOT).parts
        if any(part in SKIP_DIRS for part in rel_parts):
            continue
        if p.name in SKIP_NAMES:
            continue
        if p.suffix in SKIP_SUFFIX:
            continue
        files.append(p)
    return sorted(files)


def ensure_repo(token: str):
    # check
    try:
        req("GET", f"{API}/repos/{OWNER}/{REPO}", token, expect=(200,))
        print(f"仓库已存在: https://github.com/{OWNER}/{REPO}")
        return
    except SystemExit as e:
        if "404" not in str(e):
            # try create anyway on 404-ish
            pass
    print("创建仓库…")
    req(
        "POST",
        f"{API}/user/repos",
        token,
        {
            "name": REPO,
            "description": "地方经纬 · 家庭景点地图 Demo",
            "private": False,
            "auto_init": False,
            "has_issues": True,
            "has_projects": False,
            "has_wiki": False,
        },
        expect=(201, 200),
    )


def create_blob(token: str, content: bytes) -> str:
    # Prefer utf-8 text; fallback base64 for binary
    try:
        text = content.decode("utf-8")
        # GitHub rejects huge? fine for this repo
        data = {"content": text, "encoding": "utf-8"}
    except UnicodeDecodeError:
        data = {
            "content": base64.b64encode(content).decode("ascii"),
            "encoding": "base64",
        }
    out = req("POST", f"{API}/repos/{OWNER}/{REPO}/git/blobs", token, data)
    return out["sha"]


def get_ref_sha(token: str):
    try:
        out = req(
            "GET",
            f"{API}/repos/{OWNER}/{REPO}/git/ref/heads/{BRANCH}",
            token,
            expect=(200,),
        )
        return out["object"]["sha"]
    except SystemExit:
        return None


def upload(token: str):
    ensure_repo(token)
    files = list_files()
    print(f"准备上传 {len(files)} 个文件…")

    tree_items = []
    for i, path in enumerate(files, 1):
        rel = path.relative_to(ROOT).as_posix()
        sha = create_blob(token, path.read_bytes())
        tree_items.append(
            {
                "path": rel,
                "mode": "100755" if os.access(path, os.X_OK) else "100644",
                "type": "blob",
                "sha": sha,
            }
        )
        print(f"  [{i}/{len(files)}] {rel}")

    parent = get_ref_sha(token)
    tree_payload = {"tree": tree_items}
    if parent:
        # get base tree from parent commit for safety? For full replace use tree only.
        pass
    tree = req("POST", f"{API}/repos/{OWNER}/{REPO}/git/trees", token, tree_payload)
    tree_sha = tree["sha"]

    commit_payload = {
        "message": "Publish Place Trace demo via API upload",
        "tree": tree_sha,
    }
    if parent:
        commit_payload["parents"] = [parent]
    commit = req("POST", f"{API}/repos/{OWNER}/{REPO}/git/commits", token, commit_payload)
    commit_sha = commit["sha"]

    if parent:
        req(
            "PATCH",
            f"{API}/repos/{OWNER}/{REPO}/git/refs/heads/{BRANCH}",
            token,
            {"sha": commit_sha, "force": True},
        )
    else:
        req(
            "POST",
            f"{API}/repos/{OWNER}/{REPO}/git/refs",
            token,
            {"ref": f"refs/heads/{BRANCH}", "sha": commit_sha},
            expect=(201, 200),
        )
    print(f"已推送到 {BRANCH}: {commit_sha[:7]}")


def enable_pages(token: str):
    print("开启 GitHub Pages…")
    # PUT create/update
    url = f"{API}/repos/{OWNER}/{REPO}/pages"
    payload = {"build_type": "legacy", "source": {"branch": BRANCH, "path": "/"}}
    try:
        req("POST", url, token, payload, expect=(201, 204, 409))
    except SystemExit:
        pass
    try:
        req("PUT", url, token, payload, expect=(204, 201, 200, 409))
    except SystemExit as e:
        print(f"Pages API 提示: {e}")
        print("请到网页 Settings → Pages 手动选 main / (root)")
        return
    print("Pages 已请求开启")


def main():
    token = ask_token()
    # verify token
    me = req("GET", f"{API}/user", token)
    print(f"登录身份: {me.get('login')}")
    if me.get("login") and me["login"].lower() != OWNER.lower():
        print(f"注意：Token 账号是 {me['login']}，将推到该账号下的 {REPO}")
        global OWNER
        OWNER = me["login"]
    upload(token)
    enable_pages(token)
    print("\n完成。几分钟后打开：")
    print(f"  https://{OWNER.lower()}.github.io/{REPO}/")
    print(f"高德白名单加：{OWNER.lower()}.github.io")


if __name__ == "__main__":
    # allow OWNER override after login
    main()
