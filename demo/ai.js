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

  window.PlaceTraceAI = { askAboutStop, getConfig, buildContext };
})();
