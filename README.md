# Place Trace · 地方经纬

把景点做成**可播放的家庭地史地图**。西湖 + 灵隐是首批 Demo；换景点主要换内容包。AI 负责两件事：**生成内容包**，以及页面里的**问一问**。

## 快速打开 Demo

### 1. 高德 Key

已写入 [`demo/amap-config.js`](demo/amap-config.js)。本地预览请把域名白名单加上 `127.0.0.1`、`localhost`。

### 2. （可选）大模型 Key

编辑 [`demo/ai-config.js`](demo/ai-config.js)：

```js
window.PLACE_TRACE_AI = {
  baseUrl: "https://api.deepseek.com/v1", // 或其他 OpenAI 兼容地址
  apiKey: "你的 Key",
  model: "deepseek-chat",
};
```

不填也能用「问一问」——会走**本地本站文案回答**。

### 3. 启动

```bash
cd /Users/hushunfeng/place-trace
python3 -m http.server 8765
```

打开：[http://127.0.0.1:8765/demo/](http://127.0.0.1:8765/demo/)

顶部可切换 **西湖经纬 / 灵隐经纬**。

## 发布到 GitHub Pages（github.io）

项目已是静态站，适合直接挂 Pages。

### 一次性步骤

1. 在 GitHub 新建空仓库，例如 `place-trace`（不要勾选自动加 README）
2. 本地执行：

```bash
cd /Users/hushunfeng/place-trace
git add .
git commit -m "Publish Place Trace family demo for GitHub Pages"
git branch -M main
git remote add origin https://github.com/PizhuLoveCode/place-trace.git
git push -u origin main
```

3. 打开仓库 **Settings → Pages**
   - Source：`Deploy from a branch`
   - Branch：`main` / `/ (root)`
   - Save

4. 几分钟后访问：

`https://PizhuLoveCode.github.io/place-trace/`

（根目录 `index.html` 会跳到 `demo/`）

5. **高德控制台**给 Key 加上域名白名单：

- `PizhuLoveCode.github.io`

否则线上地图可能空白，本地却正常。

### 可选：云端「问一问」

Pages 上同样改 `demo/ai-config.js` 填入大模型 Key；注意 Key 会出现在前端，建议用可限制来源的密钥或仅演示用。

## 目录

```text
place-trace/
├── data/xihu.json          # 西湖 12 站（环湖）
├── data/lingyin.json       # 灵隐 9 站（香道）← Skill 生成示例
├── demo/                   # 高德播放页 + 问一问
│   ├── packs.js            # 景点包注册表
│   ├── ai.js / ai-config.js
│   └── amap-config.js
├── skill/SKILL.md          # 可套用其他景点的 Agent Skill
└── README.md
```

## 和 AI 的关系

| 能力 | 怎么体现 |
|------|----------|
| **生成侧** | 读 `skill/SKILL.md` → 产出新的 `data/*.json` 并登记到 `packs.js` |
| **体验侧** | 每站「问一问」：云端大模型（可选）或本地依据本站资料回答 |

## 体验要点

- **一起听故事**：自动播放  
- **一起探险**：手动点站  
- **问一问**：对本站追问（不编造未写入的年份）  
- 足迹章 + 结束页实地小建议  

## 再做一个景点

```text
按 place-trace Skill，生成「黄山」家庭版 10 站 JSON，
字段对齐 data/xihu.json，并写入 demo/packs.js。
```
