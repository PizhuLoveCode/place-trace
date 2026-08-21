---
name: place-trace
description: >-
  Build a family-friendly, playable place-history map (地方经纬) for any scenic
  spot or heritage site. Use when the user wants a West Lake / temple / mountain
  / old-town timeline on a map, a reusable scenic content pack, or to generate
  kid/parent narrations with quizzes from structured place history data.
---

# Place Trace · 地方经纬

把**景点/遗产地**做成可播放的时空叙事：时间轴 + 地图节点 + 家庭共读文案。  
与人物版 LifeTrace 同源思路：**Skill 是做法，景点包是内容。**

## 何时使用

- 用户要做西湖、黄山、故宫、丽江等「地方史地图」
- 家庭教育 / 亲子共读 / 轻量文旅导览 Demo
- 已有人物经纬，想复用到景点

## 输出物

1. `data/<place-id>.json` — 景点内容包（主交付）
2. `demo/` — 可打开的播放页（可复用本仓库 demo，只换 JSON）
3. 在 `demo/packs.js` 注册新包，页面顶部即可切换
4. 也可用 `demo/editor.html` 可视化编辑内容包（存草稿、预览播放、下载 JSON）
4. 可选：实地小路线建议（3–5 点）

## AI 两层能力

### A. 生成侧（Skill）

Agent 按本 Skill 生成/扩写 `data/*.json`，例如：

```text
按 place-trace Skill，做「灵隐寺」家庭版 8–10 站，
环线按参观顺序，字段对齐 data/xihu.json，
并在 demo/packs.js 登记。
```

本仓库已有示例：`data/xihu.json`（西湖环线）、`data/lingyin.json`（灵隐香道）。

### B. 体验侧（问一问）

Demo 每站有「问一问」：把本站 kid/parent/sources 作为唯一依据回答。

- 未配置 Key：本地根据本站文案回答（可演示）
- 配置 `demo/ai-config.js` 的 OpenAI 兼容接口后：走云端大模型

禁止让模型编造未写入内容包的精确年份。

## 工作流程

复制此清单并跟踪：

```text
Place Trace 进度：
- [ ] 明确景点与受众（家庭 / 公众）
- [ ] 收成 8–12 站主线（拒绝「所有事件」一次塞满）
- [ ] 每站补齐字段（见 schema）
- [ ] 坐标用现代可访地点；不确定则写 confidence
- [ ] 孩子文案 + 家长旁注 + 1 题
- [ ] 写入 data/*.json 并本地预览 demo
- [ ] 给出「换景点」最小改法
```

### 1. 收主线，不收百科

主线原则：

- **成形 / 治理 / 命名 / 人物纪念 / 公共化 / 保护 / 今日** 七段里选站
- 家庭一次 **≤ 12 站**，时长目标 **15–25 分钟**
- 次要事件进「主题滤镜」或附录，不进首播

### 2. 写内容包

严格按 [references/schema.md](references/schema.md) 与示例 [../data/xihu.json](../data/xihu.json)。

每站必须有：

| 字段 | 说明 |
|------|------|
| year / yearLabel | 年代与展示标签 |
| title / placeName / modernPlace | 叙事标题与古今地名 |
| coords | `[lat, lng]`，现代可对应点 |
| kid / parent | 孩子版口语；家长旁注 |
| quiz | 1 题；最后一站可为开放题 `answer: null` |
| confidence / sources | 史料层级与来源 |

### 3. 生成或替换 Demo

- 已有本仓库：只需新增 `data/<id>.json`，改 `demo/app.js` 里 `DATA_URL`
- 地图为高德 JS API 2.0，需配置 `demo/amap-config.js` 的 Key
- 或复制 `demo/`，保持 Leaflet 播放逻辑，只换数据包

### 4. 对用户说明套用方式

告诉用户一句话即可生成下一景点：

```text
按 place-trace Skill，做「黄山」家庭版 10 站内容包，
字段对齐 data/xihu.json，并指出要改 demo 的 DATA_URL。
```

## 文案规则（家庭版）

- 孩子版：画面感、少文言、每站约 80–120 字
- 家长旁注：补充史实分寸、价值观点到为止
- 地理诚实：用「示意 / 推定 / 史料明确」，不假装毫米级精确
- 传说与史实分开写（如断桥白蛇 vs 世界遗产）

## 禁止

- 一次塞入「全部历史人物事件」
- 无来源编造精确年份坐标
- 把 AI 临场发挥当成史料写入 sources

## 示例召唤

```text
用 place-trace 给西湖做家庭版（已有可跳过）。
再用同一 Skill 生成「灵隐寺」8 站包。
```
