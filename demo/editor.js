(() => {
  const DRAFT_KEY = "place-trace:draft-pack";
  const PREVIEW_KEY = "place-trace:preview-pack";
  const $ = (id) => document.getElementById(id);
  const PACKS = window.PLACE_TRACE_PACKS || [];

  const state = {
    pack: null,
    selected: -1,
    syncing: false,
  };

  function emptyPack() {
    return {
      id: "new-place",
      title: "新景点经纬",
      subtitle: "家庭版 · 请填写副标题",
      tagline: "今晚我们一起认识这个地方",
      place: "请填写地点",
      map: { center: [30.25, 120.15], zoom: 14 },
      modes: ["一起听故事", "一起探险"],
      themes: ["家庭共读"],
      stops: [],
    };
  }

  function emptyStop(n) {
    return {
      id: `stop-${n}`,
      year: "",
      yearLabel: `第 ${n} 站`,
      title: "新站点标题",
      placeName: "",
      modernPlace: "",
      coords: [30.25, 120.15],
      stage: "",
      stamp: "新站",
      person: null,
      confidence: "待核实",
      confidenceNote: "",
      kid: "",
      parent: "",
      quiz: {
        q: "问一个小问题？",
        options: ["选项甲", "选项乙", "选项丙"],
        answer: 0,
        hint: "",
      },
      sources: [],
    };
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function tip(msg, type) {
    const el = $("statusTip");
    el.textContent = msg;
    el.classList.remove("ok", "err");
    if (type) el.classList.add(type);
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function normalizePack(raw) {
    const p = { ...emptyPack(), ...(raw || {}) };
    p.map = {
      center: Array.isArray(raw?.map?.center) ? raw.map.center : [30.25, 120.15],
      zoom: raw?.map?.zoom ?? 14,
    };
    const stops = Array.isArray(raw?.stops) ? raw.stops : [];
    p.stops = stops.map((s, i) => {
      const base = emptyStop(i + 1);
      const stop = { ...base, ...s };
      stop.coords = Array.isArray(s?.coords) ? s.coords : base.coords;
      stop.quiz = {
        ...base.quiz,
        ...(s?.quiz || {}),
        options: Array.isArray(s?.quiz?.options) ? s.quiz.options : base.quiz.options,
      };
      stop.sources = Array.isArray(s?.sources) ? s.sources : [];
      return stop;
    });
    return p;
  }

  function setPack(pack, selected = 0) {
    state.pack = normalizePack(pack);
    state.selected = state.pack.stops.length
      ? Math.min(Math.max(selected, 0), state.pack.stops.length - 1)
      : -1;
    writePackForm();
    writeStopForm();
    renderStopList();
  }

  function writePackForm() {
    const p = state.pack;
    state.syncing = true;
    $("packId").value = p.id || "";
    $("packTitle").value = p.title || "";
    $("packSubtitle").value = p.subtitle || "";
    $("packTagline").value = p.tagline || "";
    $("packPlace").value = p.place || "";
    $("mapLat").value = p.map.center[0] ?? "";
    $("mapLng").value = p.map.center[1] ?? "";
    $("mapZoom").value = p.map.zoom ?? 14;
    state.syncing = false;
  }

  function readPackForm() {
    const p = state.pack;
    p.id = $("packId").value.trim() || "new-place";
    p.title = $("packTitle").value.trim() || p.id;
    p.subtitle = $("packSubtitle").value.trim();
    p.tagline = $("packTagline").value.trim();
    p.place = $("packPlace").value.trim();
    p.map = {
      center: [Number($("mapLat").value) || 0, Number($("mapLng").value) || 0],
      zoom: Number($("mapZoom").value) || 14,
    };
  }

  function writeStopForm() {
    const fields = $("stopFields");
    const empty = $("emptyHint");
    if (state.selected < 0 || !state.pack.stops[state.selected]) {
      fields.classList.add("hidden");
      empty.classList.remove("hidden");
      return;
    }
    const s = state.pack.stops[state.selected];
    fields.classList.remove("hidden");
    empty.classList.add("hidden");
    state.syncing = true;
    $("stopId").value = s.id || "";
    $("stopStamp").value = s.stamp || "";
    $("stopYear").value = s.year || "";
    $("stopYearLabel").value = s.yearLabel || "";
    $("stopTitle").value = s.title || "";
    $("stopPlaceName").value = s.placeName || "";
    $("stopModernPlace").value = s.modernPlace || "";
    $("stopLat").value = s.coords?.[0] ?? "";
    $("stopLng").value = s.coords?.[1] ?? "";
    $("stopStage").value = s.stage || "";
    $("stopPerson").value = s.person || "";
    $("stopConfidence").value = s.confidence || "";
    $("stopConfidenceNote").value = s.confidenceNote || "";
    $("stopKid").value = s.kid || "";
    $("stopParent").value = s.parent || "";
    $("quizQ").value = s.quiz?.q || "";
    $("quizOptions").value = (s.quiz?.options || []).join("\n");
    $("quizAnswer").value =
      s.quiz?.answer === null || s.quiz?.answer === undefined ? "" : String(s.quiz.answer);
    $("quizHint").value = s.quiz?.hint || "";
    $("stopSources").value = (s.sources || []).join("\n");
    state.syncing = false;
  }

  function readStopForm() {
    if (state.selected < 0) return;
    const s = state.pack.stops[state.selected];
    if (!s) return;
    s.id = $("stopId").value.trim() || `stop-${state.selected + 1}`;
    s.stamp = $("stopStamp").value.trim() || "站";
    s.year = $("stopYear").value.trim();
    s.yearLabel = $("stopYearLabel").value.trim();
    s.title = $("stopTitle").value.trim();
    s.placeName = $("stopPlaceName").value.trim();
    s.modernPlace = $("stopModernPlace").value.trim();
    s.coords = [Number($("stopLat").value) || 0, Number($("stopLng").value) || 0];
    s.stage = $("stopStage").value.trim();
    const person = $("stopPerson").value.trim();
    s.person = person || null;
    s.confidence = $("stopConfidence").value.trim();
    s.confidenceNote = $("stopConfidenceNote").value.trim();
    s.kid = $("stopKid").value;
    s.parent = $("stopParent").value;
    const options = $("quizOptions")
      .value.split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    const ansRaw = $("quizAnswer").value.trim();
    let answer = null;
    if (ansRaw !== "") {
      const n = Number(ansRaw);
      answer = Number.isFinite(n) ? n : null;
    }
    s.quiz = {
      q: $("quizQ").value.trim(),
      options: options.length ? options : ["选项甲", "选项乙", "选项丙"],
      answer,
      hint: $("quizHint").value.trim(),
    };
    s.sources = $("stopSources")
      .value.split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function syncFromForms() {
    if (state.syncing || !state.pack) return;
    readPackForm();
    readStopForm();
    renderStopList();
  }

  function renderStopList() {
    $("stopList").innerHTML = state.pack.stops
      .map((s, i) => {
        const active = i === state.selected ? "active" : "";
        return `<li>
          <button type="button" class="pick ${active}" data-i="${i}">
            <strong>${i + 1}. ${escapeHtml(s.title || s.id || "未命名")}</strong>
            <span>${escapeHtml(s.yearLabel || "")} · ${escapeHtml(s.stamp || "")}</span>
          </button>
          <div class="move">
            <button type="button" data-up="${i}" title="上移">↑</button>
            <button type="button" data-down="${i}" title="下移">↓</button>
          </div>
        </li>`;
      })
      .join("");
  }

  function selectStop(i) {
    syncFromForms();
    state.selected = i;
    writeStopForm();
    renderStopList();
  }

  function fillLoadSelect() {
    $("loadSelect").innerHTML =
      `<option value="">选择已有包…</option>` +
      PACKS.map((p) => `<option value="${p.url}">${p.label}</option>`).join("") +
      `<option value="__draft__">浏览器草稿</option>`;
  }

  async function loadFromUrl(url) {
    const pack = await fetch(url).then((r) => {
      if (!r.ok) throw new Error(`无法加载 ${url}`);
      return r.json();
    });
    setPack(pack, 0);
    tip(`已载入：${pack.title}（${pack.stops.length} 站）`, "ok");
  }

  function loadDraft() {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) throw new Error("还没有浏览器草稿");
    setPack(JSON.parse(raw), 0);
    tip("已载入浏览器草稿", "ok");
  }

  function saveDraft() {
    syncFromForms();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state.pack, null, 2));
    tip("草稿已保存到本浏览器", "ok");
  }

  function exportJson() {
    syncFromForms();
    if (!state.pack.stops.length) {
      tip("至少加一站再导出", "err");
      return;
    }
    const name = `${state.pack.id || "place-pack"}.json`;
    const blob = new Blob([JSON.stringify(state.pack, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    tip(`已下载 ${name}。放到 data/ 并在 packs.js 登记即可上线。`, "ok");
  }

  function previewPlay() {
    syncFromForms();
    if (!state.pack.stops.length) {
      tip("至少加一站再预览", "err");
      return;
    }
    const preview = clone(state.pack);
    preview.id = "draft";
    localStorage.setItem(PREVIEW_KEY, JSON.stringify(preview));
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state.pack, null, 2));
    tip("正在打开播放页预览…", "ok");
    location.href = "./?pack=draft";
  }

  function openAiModal() {
    const cfg = window.PlaceTraceAI?.getConfig?.() || {};
    const note = $("aiModalNote");
    if (cfg.apiKey && cfg.baseUrl) {
      note.textContent = `将调用 ${cfg.model || "模型"} 生成草稿（约需 20–60 秒）。坐标多为示意，生成后请核对。`;
    } else {
      note.textContent = "尚未配置 AI：请在 demo/ai-config.js 填写 baseUrl 与 apiKey。";
    }
    $("aiModal").classList.remove("hidden");
    $("aiPlace").focus();
  }

  function closeAiModal() {
    $("aiModal").classList.add("hidden");
  }

  async function runAiGenerate() {
    const place = $("aiPlace").value.trim();
    if (!place) {
      tip("请填写景点名称", "err");
      return;
    }
    if (!window.PlaceTraceAI?.generatePack) {
      tip("AI 模块未加载", "err");
      return;
    }

    const btn = $("btnAiRun");
    const cancel = $("btnAiCancel");
    btn.disabled = true;
    cancel.disabled = true;
    tip(`正在为「${place}」生成内容包，请稍候…`, "ok");

    try {
      const pack = await window.PlaceTraceAI.generatePack(place, {
        hint: $("aiHint").value.trim(),
        stopCount: Number($("aiStopCount").value) || 9,
      });
      setPack(pack, 0);
      localStorage.setItem(DRAFT_KEY, JSON.stringify(state.pack, null, 2));
      closeAiModal();
      tip(
        `已生成「${pack.title}」共 ${pack.stops.length} 站。请核对坐标与史实后，再预览或导出。`,
        "ok"
      );
    } catch (err) {
      tip(String(err.message || err), "err");
    } finally {
      btn.disabled = false;
      cancel.disabled = false;
    }
  }

  function bind() {
    fillLoadSelect();

    $("loadSelect").addEventListener("change", async () => {
      const v = $("loadSelect").value;
      if (!v) return;
      try {
        if (v === "__draft__") loadDraft();
        else await loadFromUrl(v);
      } catch (err) {
        tip(String(err.message || err), "err");
      }
      $("loadSelect").value = "";
    });

    $("btnAiNew").addEventListener("click", openAiModal);
    $("btnAiCancel").addEventListener("click", closeAiModal);
    $("btnAiRun").addEventListener("click", () => {
      runAiGenerate();
    });
    $("aiModal").addEventListener("click", (e) => {
      if (e.target === $("aiModal") && !$("btnAiRun").disabled) closeAiModal();
    });
    $("aiPlace").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        runAiGenerate();
      }
    });

    $("btnNew").addEventListener("click", () => {
      setPack(emptyPack(), -1);
      tip("已新建空白内容包", "ok");
    });

    $("btnImport").addEventListener("click", () => $("fileInput").click());
    $("fileInput").addEventListener("change", async () => {
      const file = $("fileInput").files?.[0];
      if (!file) return;
      try {
        setPack(JSON.parse(await file.text()), 0);
        tip(`已导入 ${file.name}`, "ok");
      } catch (err) {
        tip("JSON 解析失败：" + err.message, "err");
      }
      $("fileInput").value = "";
    });

    $("btnSaveDraft").addEventListener("click", saveDraft);
    $("btnExport").addEventListener("click", exportJson);
    $("btnPreview").addEventListener("click", previewPlay);

    [
      "packId",
      "packTitle",
      "packSubtitle",
      "packTagline",
      "packPlace",
      "mapLat",
      "mapLng",
      "mapZoom",
      "stopId",
      "stopStamp",
      "stopYear",
      "stopYearLabel",
      "stopTitle",
      "stopPlaceName",
      "stopModernPlace",
      "stopLat",
      "stopLng",
      "stopStage",
      "stopPerson",
      "stopConfidence",
      "stopConfidenceNote",
      "stopKid",
      "stopParent",
      "quizQ",
      "quizOptions",
      "quizAnswer",
      "quizHint",
      "stopSources",
    ].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("input", () => syncFromForms());
    });

    $("btnAddStop").addEventListener("click", () => {
      syncFromForms();
      state.pack.stops.push(emptyStop(state.pack.stops.length + 1));
      selectStop(state.pack.stops.length - 1);
      tip("已新增一站", "ok");
    });

    $("btnDupStop").addEventListener("click", () => {
      if (state.selected < 0) return;
      syncFromForms();
      const copy = clone(state.pack.stops[state.selected]);
      copy.id = `${copy.id}-copy`;
      copy.title = `${copy.title}（副本）`;
      state.pack.stops.splice(state.selected + 1, 0, copy);
      selectStop(state.selected + 1);
    });

    $("btnDelStop").addEventListener("click", () => {
      if (state.selected < 0) return;
      if (!confirm("确定删除这一站？")) return;
      state.pack.stops.splice(state.selected, 1);
      if (!state.pack.stops.length) state.selected = -1;
      else state.selected = Math.min(state.selected, state.pack.stops.length - 1);
      writeStopForm();
      renderStopList();
    });

    $("stopList").addEventListener("click", (e) => {
      const pick = e.target.closest("button.pick");
      if (pick) {
        selectStop(Number(pick.dataset.i));
        return;
      }
      const up = e.target.closest("button[data-up]");
      const down = e.target.closest("button[data-down]");
      if (!up && !down) return;
      syncFromForms();
      const i = Number(up ? up.dataset.up : down.dataset.down);
      const j = up ? i - 1 : i + 1;
      if (j < 0 || j >= state.pack.stops.length) return;
      const arr = state.pack.stops;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      state.selected = j;
      writeStopForm();
      renderStopList();
    });
  }

  async function boot() {
    bind();
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        setPack(JSON.parse(draft), 0);
        tip("已恢复浏览器草稿。也可从上方载入已有包。", "ok");
        return;
      } catch (_) {}
    }
    if (PACKS[0]) {
      try {
        await loadFromUrl(PACKS[0].url);
      } catch (_) {
        setPack(emptyPack(), -1);
        tip("可新建内容包，或导入 JSON。", "ok");
      }
    } else {
      setPack(emptyPack(), -1);
    }
  }

  boot();
})();
