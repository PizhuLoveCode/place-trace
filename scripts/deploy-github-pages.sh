#!/usr/bin/env bash
# 一键：登录 GitHub → 创建仓库 → 推送 → 开启 Pages
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

REPO="place-trace"
OWNER="PizhuLoveCode"
PAGES_URL="https://${OWNER}.github.io/${REPO}/"

if ! command -v gh >/dev/null; then
  echo "正在安装 gh…"
  brew install gh
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "请在浏览器完成 GitHub 登录…"
  gh auth login --hostname github.com --git-protocol https --web
fi

# 确保登录账号是目标用户
ACTIVE="$(gh api user -q .login)"
echo "当前登录：$ACTIVE"
if [[ "$ACTIVE" != "$OWNER" ]]; then
  echo "警告：当前账号不是 $OWNER。将创建到 $ACTIVE 下，或先切换账号。"
  OWNER="$ACTIVE"
  PAGES_URL="https://${OWNER}.github.io/${REPO}/"
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  if gh repo view "${OWNER}/${REPO}" >/dev/null 2>&1; then
    git remote add origin "https://github.com/${OWNER}/${REPO}.git"
  else
    gh repo create "${OWNER}/${REPO}" --public --source=. --remote=origin --description "地方经纬 · 家庭景点地图 Demo"
  fi
fi

git push -u origin main

# 开启 GitHub Pages（legacy / root）
gh api -X PUT "repos/${OWNER}/${REPO}/pages" \
  -H "Accept: application/vnd.github+json" \
  -f build_type=legacy \
  -f source='{"branch":"main","path":"/"}' \
  2>/dev/null || \
gh api -X POST "repos/${OWNER}/${REPO}/pages" \
  -H "Accept: application/vnd.github+json" \
  -f build_type=legacy \
  -f source='{"branch":"main","path":"/"}' \
  2>/dev/null || \
echo "若 Pages API 失败，请到仓库 Settings → Pages 手动选 main / root。"

echo ""
echo "推送完成。稍后打开："
echo "  $PAGES_URL"
echo "高德控制台请添加域名白名单：${OWNER}.github.io"
