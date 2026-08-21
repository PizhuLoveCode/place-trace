# 景点内容包 Schema

根对象：

```json
{
  "id": "xihu",
  "title": "西湖经纬",
  "subtitle": "家庭版 · 一座湖的千年故事",
  "tagline": "今晚我们当一回小小湖史官",
  "place": "杭州西湖",
  "map": { "center": [30.242, 120.143], "zoom": 13 },
  "stops": [ /* Stop */ ]
}
```

## Stop

```json
{
  "id": "su",
  "year": "1089",
  "yearLabel": "北宋 · 元祐四年",
  "title": "苏轼筑苏堤",
  "placeName": "苏堤",
  "modernPlace": "苏堤春晓",
  "coords": [30.2415, 120.1355],
  "stage": "宋人治湖",
  "stamp": "苏堤",
  "person": "苏轼",
  "confidence": "史料明确",
  "confidenceNote": "说明坐标取舍",
  "kid": "孩子版故事",
  "parent": "家长旁注",
  "quiz": {
    "q": "问题",
    "options": ["A", "B", "C"],
    "answer": 1,
    "hint": "提示"
  },
  "sources": ["来源1", "来源2"]
}
```

- `coords`：`[latitude, longitude]`（内容包统一 lat,lng；Demo 内转为高德 `[lng, lat]`）
- `person`：可 `null`
- `quiz.answer`：选项下标；开放题用 `null`
- `stamp`：短章名（2–3 字为佳）

## 换景点检查表

1. 新 `id` / `title` / `place` / `map.center`
2. 8–12 站沿该地独特主线（不要照搬西湖治湖史）
3. 每站现代可导航点
4. 家庭文案与 1 题
5. Demo 指向新 JSON
