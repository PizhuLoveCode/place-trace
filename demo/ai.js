(() => {
  const SYSTEM = `你是「地方经纬」亲子导览助手。只能依据给定的本站资料回答。
规则：
1. 用适合 6–12 岁与家长共读的中文，短句，不超过 120 字。
2. 不编造精确年份、不编造未提供的史料；不确定就诚实说「本站资料没写到」。
3. 传说与史实若资料有区分，回答时也要分开。
4. 鼓励孩子观察与提问，不说教。`;

  function getConfig() {
    const cfg = window.PLACE_TRACE_AI || {};
    return {
      baseUrl: String(cfg.baseUrl || "").replace(/\/$/, ""),
      apiKey: String(cfg.apiKey || "").trim(),
      model: String(cfg.model || "deepseek-chat").trim(),
    };
  }

  function buildContext(pack, stop) {
    return [
      `景点包：${pack.title}（${pack.place}）`,
      `本站标题：${stop.title}`,
      `年代：${stop.yearLabel || stop.year || ""}`,
      `地点：${stop.placeName} / ${stop.modernPlace}`,
      `相关人物：${stop.person || "无"}`,
      `可信度：${stop.confidence || ""}`,
      `孩子文案：${stop.kid || ""}`,
      `家长旁注：${stop.parent || ""}`,
      `来源：${(stop.sources || []).join("；")}`,
    ].join("\n");
  }

  function localAnswer(pack, stop, question) {
    const q = question.trim();
    const blob = `${stop.kid}\n${stop.parent}\n${(stop.sources || []).join(" ")}`;
    const sentences = blob
      .split(/[。！？\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 6);

    const keys = q
      .replace(/[？?啦呢吗呀啊~\s]/g, " ")
      .split(" ")
      .map((w) => w.trim())
      .filter((w) => w.length >= 2);

    let hit = sentences.filter((s) => keys.some((k) => s.includes(k)));
    if (!hit.length) hit = sentences.slice(0, 2);

    const modeNote = "（本地回答 · 未配置 AI Key，仅根据本站文案）";

    if (/在哪|哪里|位置/.test(q)) {
      return `这一站在「${stop.modernPlace || stop.placeName}」。${(stop.kid || "").slice(0, 72)} ${modeNote}`;
    }
    if (/谁|人物/.test(q)) {
      return stop.person
        ? `资料里提到：${stop.person}。${hit[0] || ""} ${modeNote}`
        : `本站没有单独突出某位人物，主要讲地方与风景。${modeNote}`;
    }

    return `根据本站「${stop.title}」：${hit.slice(0, 2).join("。")}。若要更自然的对话，可在 demo/ai-config.js 填入大模型 Key。${modeNote}`;
  }

  async function remoteAnswer(pack, stop, question) {
    const { baseUrl, apiKey, model } = getConfig();
    if (!baseUrl || !apiKey) throw new Error("NO_AI_CONFIG");

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `【本站资料】\n${buildContext(pack, stop)}\n\n【孩子/家长提问】\n${question}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI 接口错误 ${res.status}: ${text.slice(0, 160)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI 返回为空");
    return content.trim();
  }

  async function askAboutStop(pack, stop, question) {
    const q = String(question || "").trim();
    if (!q) throw new Error("请先输入问题");
    if (!pack || !stop) throw new Error("当前站未加载");

    const { apiKey, baseUrl } = getConfig();
    if (apiKey && baseUrl) {
      try {
        return { text: await remoteAnswer(pack, stop, q), source: "ai" };
      } catch (err) {
        return {
          text: `${localAnswer(pack, stop, q)}\n（云端暂不可用：${err.message}）`,
          source: "local",
        };
      }
    }
    return { text: localAnswer(pack, stop, q), source: "local" };
  }

  const PACK_SYSTEM = `你是「地方经纬」内容包作者，为亲子（6–12 岁 + 家长）生成可播放的景点地史 JSON。
只输出一个 JSON 对象，不要 Markdown，不要解释。

字段要求：
- 根：id(英文短横线或拼音)、title、subtitle、tagline、place、map:{center:[lat,lng],zoom}、modes、themes、stops
- 每站：id、year、yearLabel、title、placeName、modernPlace、coords[lat,lng]、stage、stamp(2–3字)、person(可null)、confidence、confidenceNote、kid、parent、quiz{q,options[3],answer(0-2或null),hint}、sources[1-3条]
- 8–10 站；主线清晰（参观顺序或地理环线，不要年代乱跳穿梭）
- kid 约 80–120 字口语；parent 短旁注；传说与史实分开
- coords 用现代可访点的大致坐标；不确定写 confidence「示意/推定」并在 confidenceNote 说明
- 禁止编造精确到天的假史料；sources 写常见公开出处类型即可（地方志、景区说明、教材级常识）
- map.center 取景区中心附近；zoom 通常 13–15`;

  function extractJsonObject(text) {
    const raw = String(text || "").trim();
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenced ? fenced[1].trim() : raw;
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI 未返回 JSON 对象");
    return JSON.parse(body.slice(start, end + 1));
  }

  async function generatePack(placeName, options = {}) {
    const place = String(placeName || "").trim();
    if (!place) throw new Error("请填写景点名称");

    const { baseUrl, apiKey, model } = getConfig();
    if (!baseUrl || !apiKey) {
      throw new Error("未配置 AI：请先在 demo/ai-config.js 填写 baseUrl 与 apiKey");
    }

    const stopCount = Math.min(12, Math.max(6, Number(options.stopCount) || 9));
    const hint = String(options.hint || "").trim();
    const user = [
      `请为景点「${place}」生成家庭版内容包 JSON。`,
      `站点数：约 ${stopCount} 站。`,
      hint ? `补充要求：${hint}` : "自行选择最适合亲子共读的一条主线（如参观顺序、环线、成形与保护）。",
      "title 形如「××经纬」；id 用小写拼音或英文。",
      "stops 数组顺序 = 地图播放顺序。",
    ].join("\n");

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.5,
        messages: [
          { role: "system", content: PACK_SYSTEM },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI 接口错误 ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI 返回为空");

    const pack = extractJsonObject(content);
    if (!Array.isArray(pack.stops) || !pack.stops.length) {
      throw new Error("生成结果缺少 stops，请重试");
    }
    pack.place = pack.place || place;
    pack.title = pack.title || `${place}经纬`;
    return pack;
  }

  window.PlaceTraceAI = { askAboutStop, getConfig, buildContext, generatePack, extractJsonObject };
})();
