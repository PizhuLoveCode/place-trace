(() => {
  const $ = (id) => document.getElementById(id);
  const PACKS = window.PLACE_TRACE_PACKS || [
    { id: "xihu", label: "西湖经纬", url: "../data/xihu.json", mark: "湖" },
  ];

  const ui = {
    mapBanner: $("mapBanner"),
    brandTitle: $("brandTitle"),
    brandKicker: $("brandKicker"),
    brandMark: document.querySelector(".brand-mark"),
    packSelect: $("packSelect"),
    topStats: $("topStats"),
    timeline: $("timeline"),
    stamps: $("stamps"),
    progressText: $("progressText"),
    stopYear: $("stopYear"),
    stopConfidence: $("stopConfidence"),
    stopPlace: $("stopPlace"),
    stopTitle: $("stopTitle"),
    stopPerson: $("stopPerson"),
    stopKid: $("stopKid"),
    stopParent: $("stopParent"),
    stopSources: $("stopSources"),
    quizQ: $("quizQ"),
    quizOptions: $("quizOptions"),
    quizFeedback: $("quizFeedback"),
    storyCard: $("storyCard"),
    btnPlay: $("btnPlay"),
    btnVoice: $("btnVoice"),
    btnReset: $("btnReset"),
    btnPrev: $("btnPrev"),
    btnNext: $("btnNext"),
    btnStart: $("btnStart"),
    btnReplay: $("btnReplay"),
    btnCloseEnd: $("btnCloseEnd"),
    startOverlay: $("startOverlay"),
    endOverlay: $("endOverlay"),
    endList: $("endList"),
    endNote: $("endNote"),
    overlayEyebrow: $("overlayEyebrow"),
    overlayTitle: $("overlayTitle"),
    overlayDesc: $("overlayDesc"),
    askTag: $("askTag"),
    askChips: $("askChips"),
    askInput: $("askInput"),
    btnAsk: $("btnAsk"),
    askAnswer: $("askAnswer"),
    shareCard: $("shareCard"),
  };

  const state = {
    packMeta: null,
    pack: null,
    index: 0,
    playing: false,
    speed: 1,
    mode: "listen",
    visited: new Set(),
    answered: new Set(),
    timer: null,
    speakPromise: null,
    speakTimer: null,
    speakKeepAlive: null,
    utterance: null,
    muted: localStorage.getItem("place-trace:voice-muted") === "1",
    map: null,
    markers: [],
    line: null,
    uiBound: false,
    mapReady: false,
  };

  const toAmap = ([lat, lng]) => [lng, lat];

  function getAmapConfig() {
    const cfg = window.PLACE_TRACE_AMAP || {};
    return {
      key: String(cfg.key || "").trim(),
      securityJsCode: String(cfg.securityJsCode || "").trim(),
    };
  }

  function showBanner(html, isError) {
    ui.mapBanner.innerHTML = html;
    ui.mapBanner.classList.remove("hidden");
    ui.mapBanner.classList.toggle("error", Boolean(isError));
  }

  function hideBanner() {
    ui.mapBanner.classList.add("hidden");
  }

  function ensureLoader() {
    return new Promise((resolve, reject) => {
      if (window.AMapLoader) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = "https://webapi.amap.com/loader.js";
      s.async = true;
      s.onload = () => (window.AMapLoader ? resolve() : reject(new Error("AMapLoader 未就绪")));
      s.onerror = () => reject(new Error("无法加载高德 AMapLoader"));
      document.head.appendChild(s);
    });
  }

  async function loadMapSDK() {
    const { key, securityJsCode } = getAmapConfig();
    if (!key) throw new Error("未配置高德 Key（demo/amap-config.js）");
    if (typeof window.AMap !== "undefined") return window.AMap;
    window._AMapSecurityConfig = { securityJsCode };
    await ensureLoader();
    return AMapLoader.load({
      key,
      version: "2.0",
      plugins: ["AMap.MoveAnimation"],
    });
  }

  const PREVIEW_KEY = "place-trace:preview-pack";
  const DRAFT_META = { id: "draft", label: "编辑预览", url: null, mark: "编" };

  function readPreviewPack() {
    try {
      const raw = localStorage.getItem(PREVIEW_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function allPackOptions() {
    const list = [...PACKS];
    if (readPreviewPack()) list.push(DRAFT_META);
    return list;
  }

  function currentPackId() {
    const q = new URLSearchParams(location.search).get("pack");
    if (q === "draft" && readPreviewPack()) return "draft";
    if (q && PACKS.some((p) => p.id === q)) return q;
    return PACKS[0].id;
  }

  function fillPackSelect() {
    const id = currentPackId();
    ui.packSelect.innerHTML = allPackOptions()
      .map((p) => `<option value="${p.id}" ${p.id === id ? "selected" : ""}>${escapeHtml(p.label)}</option>`)
      .join("");
  }

  async function loadPackById(id) {
    let meta;
    let pack;

    if (id === "draft") {
      pack = readPreviewPack();
      if (!pack) throw new Error("没有可预览的编辑草稿，请先在编辑器点「预览播放」");
      meta = { ...DRAFT_META, mark: (pack.title || "编").slice(0, 1) };
    } else {
      meta = PACKS.find((p) => p.id === id) || PACKS[0];
      pack = await fetch(meta.url).then((r) => {
        if (!r.ok) throw new Error(`无法加载 ${meta.url}`);
        return r.json();
      });
    }

    state.packMeta = meta;
    state.pack = pack;
    state.index = 0;
    state.visited = new Set();
    state.answered = new Set();
    stopPlayback();

    applyMeta(pack, meta);
    buildTimeline(pack);
    buildStamps(pack);
    rebuildMap(pack);
    renderStop(0, { fly: false });

    ui.startOverlay.classList.remove("hidden");
    ui.endOverlay.classList.add("hidden");

    const url = new URL(location.href);
    url.searchParams.set("pack", meta.id);
    history.replaceState(null, "", url);
    fillPackSelect();
    ui.packSelect.value = meta.id;
  }

  function applyMeta(pack, meta) {
    document.title = `${pack.title} · 家庭版`;
    ui.brandTitle.textContent = pack.title;
    if (ui.brandMark) ui.brandMark.textContent = meta.mark || pack.title.slice(0, 1);
    ui.overlayTitle.textContent = pack.title;
    ui.overlayEyebrow.textContent = pack.tagline;
    ui.overlayDesc.textContent = `${pack.subtitle}。用地图一站站走完，大约 15–25 分钟，适合家长和孩子一起。`;
    ui.topStats.innerHTML = `
      <span class="stat"><strong>${pack.stops.length}</strong> 站</span>
      <span class="stat"><strong>${escapeHtml(pack.place)}</strong></span>
      <span class="stat">高德 + AI</span>
    `;
    const endTitle = ui.shareCard && ui.shareCard.querySelector("h2");
    if (endTitle) endTitle.textContent = `${pack.place} · 家庭足迹`;
  }

  function clearMapLayers() {
    if (!state.map) return;
    if (state.line) {
      state.map.remove(state.line);
      state.line = null;
    }
    state.markers.forEach((m) => state.map.remove(m));
    state.markers = [];
  }

  function rebuildMap(pack) {
    if (!state.mapReady || typeof AMap === "undefined") return;
    if (!state.map) {
      initMap(pack);
      return;
    }
    clearMapLayers();
    state.map.setZoomAndCenter(pack.map.zoom, toAmap(pack.map.center));
    addOverlays(pack);
    state.map.setFitView(state.markers, false, [48, 48, 48, 48]);
  }

  function initMap(pack) {
    state.map = new AMap.Map("map", {
      viewMode: "2D",
      zoom: pack.map.zoom,
      center: toAmap(pack.map.center),
      mapStyle: "amap://styles/normal",
    });
    addOverlays(pack);
    state.map.on("complete", () => {
      state.map.setFitView(state.markers, false, [48, 48, 48, 48]);
    });
  }

  function addOverlays(pack) {
    state.line = new AMap.Polyline({
      path: pack.stops.map((s) => toAmap(s.coords)),
      strokeColor: "#1c4a56",
      strokeWeight: 5,
      strokeOpacity: 0.85,
      strokeStyle: "solid",
      lineJoin: "round",
      lineCap: "round",
      showDir: true,
      zIndex: 50,
    });
    state.map.add(state.line);

    state.markers = pack.stops.map((stop, i) => {
      const content = document.createElement("div");
      content.className = "marker-dot";
      content.dataset.i = String(i);
      const marker = new AMap.Marker({
        position: toAmap(stop.coords),
        content,
        offset: new AMap.Pixel(-8, -8),
        zIndex: 100 + i,
      });
      marker.on("click", () => {
        stopPlayback();
        renderStop(i, { fly: true, fromGesture: true });
      });
      state.map.add(marker);
      return marker;
    });
  }

  function buildTimeline(pack) {
    ui.timeline.innerHTML = pack.stops
      .map(
        (s, i) =>
          `<button type="button" class="tick" data-i="${i}"><span class="t-year">${escapeHtml(
            s.yearLabel
          )}</span>${escapeHtml(s.stamp)}</button>`
      )
      .join("");
  }

  function buildStamps(pack) {
    ui.stamps.innerHTML = pack.stops
      .map(
        (s, i) =>
          `<span class="stamp" data-i="${i}" title="${escapeHtml(s.stamp)}">${escapeHtml(
            s.stamp.slice(0, 1)
          )}</span>`
      )
      .join("");
  }

  function cancelSpeak() {
    if (state.speakTimer) {
      clearTimeout(state.speakTimer);
      state.speakTimer = null;
    }
    if (state.speakKeepAlive) {
      clearInterval(state.speakKeepAlive);
      state.speakKeepAlive = null;
    }
    state.utterance = null;
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    state.speakPromise = Promise.resolve();
  }

  function isChromeLike() {
    const ua = navigator.userAgent;
    return /Chrome|CriOS/.test(ua) && !/Edg|OPR/.test(ua);
  }

  function warmVoices() {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }

  function pickZhVoice() {
    if (!window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;

    const zh = voices.filter(
      (v) => /^zh(-|$)/i.test(v.lang) || /Chinese|中文|普通话|国语/i.test(v.name)
    );
    // Chrome 远程 Google 语音常无声，优先本地中文语音
    const localZh = zh.filter((v) => v.localService);
    return (
      localZh.find((v) => /zh-CN/i.test(v.lang)) ||
      localZh[0] ||
      zh.find((v) => /zh-CN/i.test(v.lang) && !/Google/i.test(v.name)) ||
      zh.find((v) => /zh-CN/i.test(v.lang)) ||
      zh[0] ||
      null
    );
  }

  function syncVoiceButton() {
    if (!ui.btnVoice) return;
    const supported = typeof window.speechSynthesis !== "undefined";
    if (!supported) {
      ui.btnVoice.disabled = true;
      ui.btnVoice.textContent = "无语音";
      ui.btnVoice.title = "当前浏览器不支持语音播报";
      return;
    }
    ui.btnVoice.disabled = false;
    ui.btnVoice.setAttribute("aria-pressed", state.muted ? "true" : "false");
    if (state.muted) {
      ui.btnVoice.textContent = "开启语音";
      ui.btnVoice.title = "点击开启孩子文案播报";
      ui.btnVoice.classList.add("voice-off");
    } else {
      ui.btnVoice.textContent = "静音";
      ui.btnVoice.title = "点击关闭语音播报";
      ui.btnVoice.classList.remove("voice-off");
    }
  }

  function setMuted(muted) {
    state.muted = Boolean(muted);
    localStorage.setItem("place-trace:voice-muted", state.muted ? "1" : "0");
    syncVoiceButton();
    if (state.muted) cancelSpeak();
    else if (state.pack) speakCurrentStop({ fromGesture: true });
  }

  function speakCurrentStop(opts) {
    const fromGesture = Boolean(opts && opts.fromGesture);

    if (state.muted || !state.pack || typeof window.speechSynthesis === "undefined") {
      cancelSpeak();
      state.speakPromise = Promise.resolve();
      return state.speakPromise;
    }
    const stop = state.pack.stops[state.index];
    if (!stop) {
      state.speakPromise = Promise.resolve();
      return state.speakPromise;
    }
    const text = [stop.title, stop.kid].filter(Boolean).join("。");
    if (!text.trim()) {
      state.speakPromise = Promise.resolve();
      return state.speakPromise;
    }

    // 分句：减轻 Chrome 长文本/15 秒卡死问题
    const parts = [];
    String(text).replace(/[^。！？；\n]+[。！？；\n]?/g, (m) => {
      const t = m.trim();
      if (t) parts.push(t);
    });
    if (!parts.length) parts.push(text.trim());

    if (state.speakTimer) {
      clearTimeout(state.speakTimer);
      state.speakTimer = null;
    }
    if (state.speakKeepAlive) {
      clearInterval(state.speakKeepAlive);
      state.speakKeepAlive = null;
    }

    const synth = window.speechSynthesis;
    const busy = synth.speaking || synth.pending;
    // Chrome：用户点击手势里必须尽快 speak；若当前正播，才 cancel 后短延迟
    // 非手势路径（自动切站）可稍等，避免 cancel 竞态
    let delay = 0;
    if (busy) {
      try {
        synth.cancel();
      } catch (_) {}
      delay = fromGesture ? 50 : isChromeLike() ? 200 : 60;
    } else if (!fromGesture && isChromeLike()) {
      delay = 80;
    }

    state.speakPromise = new Promise((resolve) => {
      let idx = 0;
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (state.speakKeepAlive) {
          clearInterval(state.speakKeepAlive);
          state.speakKeepAlive = null;
        }
        state.utterance = null;
        try {
          delete window.__placeTraceUtterance;
        } catch (_) {}
        resolve();
      };

      const speakNext = () => {
        if (state.muted || settled) {
          finish();
          return;
        }
        if (idx >= parts.length) {
          finish();
          return;
        }

        const u = new SpeechSynthesisUtterance(parts[idx++]);
        // 关键：Chrome 会回收未挂到全局的 Utterance，导致无声
        state.utterance = u;
        window.__placeTraceUtterance = u;
        u.lang = "zh-CN";
        const voice = pickZhVoice();
        // Chrome 上 Google 在线中文语音经常失败，只绑定本地语音
        if (voice && (voice.localService || !isChromeLike())) {
          u.voice = voice;
        }
        u.rate = Math.min(1.15, Math.max(0.85, 0.95 * state.speed));
        u.pitch = 1;
        u.volume = 1;

        u.onend = () => speakNext();
        u.onerror = () => speakNext();

        try {
          synth.speak(u);
          synth.resume();
        } catch (_) {
          finish();
        }
      };

      state.speakKeepAlive = setInterval(() => {
        if (!window.speechSynthesis) return;
        if (state.muted || settled) return;
        if (synth.speaking && synth.paused) synth.resume();
        if (isChromeLike() && synth.speaking) {
          synth.pause();
          synth.resume();
        }
      }, 9000);

      const start = () => {
        state.speakTimer = null;
        speakNext();
      };

      if (delay > 0) {
        state.speakTimer = setTimeout(start, delay);
      } else {
        start();
      }
    });

    return state.speakPromise;
  }

  function bindUi() {
    if (state.uiBound) return;
    state.uiBound = true;
    syncVoiceButton();

    ui.packSelect.addEventListener("change", async () => {
      try {
        showBanner("正在切换景点包…", false);
        await loadPackById(ui.packSelect.value);
        hideBanner();
      } catch (err) {
        showBanner(String(err.message || err), true);
      }
    });

    ui.btnStart.addEventListener("click", () => {
      ui.startOverlay.classList.add("hidden");
      // 必须在用户点击手势里触发 speak，否则 Chrome 会静默拦截
      if (state.mode === "listen" && state.map) startPlayback({ fromGesture: true });
      else speakCurrentStop({ fromGesture: true });
    });

    ui.btnPlay.addEventListener("click", () => {
      if (!state.map) {
        showBanner("地图尚未就绪，请检查高德 Key / 域名白名单。", true);
        return;
      }
      if (state.playing) stopPlayback();
      else startPlayback({ fromGesture: true });
    });

    if (ui.btnVoice) {
      ui.btnVoice.addEventListener("click", () => {
        setMuted(!state.muted);
      });
    }

    ui.btnReset.addEventListener("click", () => {
      stopPlayback();
      state.visited.clear();
      state.answered.clear();
      renderStop(0, { fly: true, fromGesture: true });
      ui.endOverlay.classList.add("hidden");
      if (state.map && state.markers.length) {
        state.map.setFitView(state.markers, false, [48, 48, 48, 48]);
      }
    });

    ui.btnPrev.addEventListener("click", () => {
      stopPlayback();
      renderStop(Math.max(0, state.index - 1), { fly: true, fromGesture: true });
    });

    ui.btnNext.addEventListener("click", () => {
      stopPlayback();
      goNext({ fromGesture: true });
    });

    ui.btnReplay.addEventListener("click", () => {
      ui.endOverlay.classList.add("hidden");
      state.visited.clear();
      state.answered.clear();
      renderStop(0, { fly: true, fromGesture: true });
      if (state.map) startPlayback({ fromGesture: true });
    });

    ui.btnCloseEnd.addEventListener("click", () => {
      ui.endOverlay.classList.add("hidden");
      cancelSpeak();
    });

    document.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        state.speed = Number(chip.dataset.speed);
        if (state.playing) {
          stopPlayback();
          startPlayback({ fromGesture: true });
        } else if (!state.muted) {
          speakCurrentStop({ fromGesture: true });
        }
      });
    });

    document.querySelectorAll(".mode").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".mode").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.mode = btn.dataset.mode === "explore" ? "explore" : "listen";
        if (state.mode === "explore") stopPlayback();
      });
    });

    ui.timeline.addEventListener("click", (e) => {
      const tick = e.target.closest(".tick");
      if (!tick) return;
      stopPlayback();
      renderStop(Number(tick.dataset.i), { fly: true, fromGesture: true });
    });

    ui.btnAsk.addEventListener("click", () => runAsk());
    ui.askInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runAsk();
    });
    ui.askChips.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-q]");
      if (!btn) return;
      ui.askInput.value = btn.dataset.q;
      runAsk();
    });
  }

  function suggestedQuestions(stop) {
    return [
      "这一站为什么重要？",
      stop.person ? `${stop.person}和这里有什么关系？` : "这里和这座城有什么关系？",
      "带小朋友来可以看什么？",
    ];
  }

  function renderAskChips(stop) {
    ui.askChips.innerHTML = suggestedQuestions(stop)
      .map((q) => `<button type="button" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`)
      .join("");
    ui.askAnswer.classList.add("hidden");
    ui.askAnswer.textContent = "";
    ui.askInput.value = "";

    const cfg = (window.PlaceTraceAI && window.PlaceTraceAI.getConfig && window.PlaceTraceAI.getConfig()) || {};
    if (cfg.apiKey && cfg.baseUrl) {
      ui.askTag.textContent = "AI · 云端";
      ui.askTag.classList.remove("local");
    } else {
      ui.askTag.textContent = "本地 · 本站资料";
      ui.askTag.classList.add("local");
    }
  }

  async function runAsk() {
    const stop = state.pack && state.pack.stops[state.index];
    if (!stop || !window.PlaceTraceAI) return;
    const q = ui.askInput.value.trim();
    if (!q) {
      ui.askAnswer.classList.remove("hidden");
      ui.askAnswer.textContent = "先输入一个问题，或点上面的推荐问法。";
      return;
    }

    stopPlayback();
    ui.askAnswer.classList.remove("hidden");
    ui.askAnswer.classList.add("loading");
    ui.askAnswer.textContent = "正在想…";
    ui.btnAsk.disabled = true;

    try {
      const result = await window.PlaceTraceAI.askAboutStop(state.pack, stop, q);
      ui.askAnswer.classList.remove("loading");
      ui.askAnswer.textContent = result.text;
      ui.askTag.textContent = result.source === "ai" ? "AI · 云端" : "本地 · 本站资料";
      ui.askTag.classList.toggle("local", result.source !== "ai");
    } catch (err) {
      ui.askAnswer.classList.remove("loading");
      ui.askAnswer.textContent = String(err.message || err);
    } finally {
      ui.btnAsk.disabled = false;
    }
  }

  function startPlayback(opts) {
    state.playing = true;
    ui.btnPlay.textContent = "❚❚ 暂停";
    if (!state.muted) speakCurrentStop({ fromGesture: Boolean(opts && opts.fromGesture) });
    scheduleAdvance();
  }

  function stopPlayback() {
    state.playing = false;
    ui.btnPlay.textContent = "▶ 播放";
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    cancelSpeak();
  }

  function scheduleAdvance() {
    if (!state.playing) return;
    const advance = () => {
      if (!state.playing) return;
      if (state.index >= state.pack.stops.length - 1) {
        stopPlayback();
        showEnd();
        return;
      }
      renderStop(state.index + 1, { fly: true });
      scheduleAdvance();
    };

    if (state.muted) {
      const dwell = (state.mode === "listen" ? 5200 : 3800) / state.speed;
      state.timer = setTimeout(advance, dwell);
      return;
    }

    Promise.resolve(state.speakPromise)
      .catch(() => {})
      .then(() => {
        if (!state.playing) return;
        state.timer = setTimeout(advance, 700);
      });
  }

  function goNext(opts) {
    if (state.index >= state.pack.stops.length - 1) {
      showEnd();
      return;
    }
    renderStop(state.index + 1, {
      fly: true,
      fromGesture: Boolean(opts && opts.fromGesture),
    });
  }

  function renderStop(i, flyOpt) {
    const fly = flyOpt && flyOpt.fly;
    const pack = state.pack;
    const stop = pack.stops[i];
    state.index = i;
    state.visited.add(i);

    ui.progressText.textContent = `${i + 1} / ${pack.stops.length}`;
    ui.stopYear.textContent = stop.yearLabel;
    ui.stopConfidence.textContent = stop.confidence;
    ui.stopPlace.textContent = `${stop.placeName} · ${stop.modernPlace}`;
    ui.stopTitle.textContent = stop.title;
    ui.stopKid.textContent = stop.kid;
    ui.stopParent.textContent = stop.parent;
    ui.stopSources.textContent = `来源：${stop.sources.join(" · ")}`;

    if (stop.person) {
      ui.stopPerson.hidden = false;
      ui.stopPerson.textContent = `相关人物：${stop.person}`;
    } else {
      ui.stopPerson.hidden = true;
    }

    ui.storyCard.style.animation = "none";
    void ui.storyCard.offsetWidth;
    ui.storyCard.style.animation = "";

    renderQuiz(stop, i);
    renderAskChips(stop);
    syncTimeline();
    syncStamps();
    syncMarkers(i);

    if (state.map) {
      const pos = toAmap(stop.coords);
      const zoom = Math.max(state.map.getZoom(), pack.map.zoom || 14);
      if (fly) state.map.setZoomAndCenter(zoom, pos, false, 700);
      else state.map.setZoomAndCenter(pack.map.zoom, pos);
    }

    // 开始页未关闭时不播报，避免自动播放被浏览器拦截或抢戏
    if (ui.startOverlay && !ui.startOverlay.classList.contains("hidden")) {
      cancelSpeak();
    } else {
      speakCurrentStop({ fromGesture: Boolean(flyOpt && flyOpt.fromGesture) });
    }
  }

  function renderQuiz(stop, i) {
    const quiz = stop.quiz;
    ui.quizQ.textContent = quiz.q;
    ui.quizFeedback.hidden = true;
    ui.quizOptions.innerHTML = "";
    quiz.options.forEach((opt, oi) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = opt;
      btn.addEventListener("click", () => onQuiz(i, oi, btn));
      ui.quizOptions.appendChild(btn);
    });
  }

  function onQuiz(stopIndex, optionIndex, btn) {
    const stop = state.pack.stops[stopIndex];
    const answer = stop.quiz.answer;
    const buttons = Array.prototype.slice.call(ui.quizOptions.querySelectorAll("button"));

    if (answer === null) {
      buttons.forEach((b) => b.classList.remove("correct", "wrong"));
      btn.classList.add("correct");
      ui.quizFeedback.hidden = false;
      ui.quizFeedback.textContent = "很好！和家人说说你为什么选这个。";
      state.answered.add(stopIndex);
      return;
    }

    buttons.forEach((b, bi) => {
      b.disabled = true;
      if (bi === answer) b.classList.add("correct");
    });

    if (optionIndex === answer) {
      btn.classList.add("correct");
      ui.quizFeedback.textContent = "答对了！" + (stop.quiz.hint ? " " + stop.quiz.hint : "");
    } else {
      btn.classList.add("wrong");
      ui.quizFeedback.textContent = "再想想～" + (stop.quiz.hint ? " 提示：" + stop.quiz.hint : "");
    }
    ui.quizFeedback.hidden = false;
    state.answered.add(stopIndex);
  }

  function syncTimeline() {
    Array.prototype.forEach.call(ui.timeline.querySelectorAll(".tick"), (tick, i) => {
      tick.classList.toggle("active", i === state.index);
      tick.classList.toggle("done", state.visited.has(i));
    });
  }

  function syncStamps() {
    Array.prototype.forEach.call(ui.stamps.querySelectorAll(".stamp"), (el, i) => {
      el.classList.toggle("got", state.visited.has(i));
    });
  }

  function syncMarkers(active) {
    Array.prototype.forEach.call(document.querySelectorAll(".marker-dot"), (dot) => {
      dot.classList.toggle("active", Number(dot.dataset.i) === active);
    });
  }

  function showEnd() {
    const pack = state.pack;
    ui.endList.innerHTML = pack.stops
      .map(
        (s) =>
          `<li>${escapeHtml(s.yearLabel)} · ${escapeHtml(s.title)}（${escapeHtml(s.stamp)}）</li>`
      )
      .join("");
    const tip =
      pack.id === "lingyin"
        ? "下次实地可走：入口 → 飞来峰 → 冷泉 → 天王殿。"
        : "下次实地可走：断桥 → 白堤 → 平湖秋月。";
    ui.endNote.textContent = `共点亮 ${state.visited.size} 枚足迹章。${tip}`;
    ui.endOverlay.classList.remove("hidden");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function boot() {
    warmVoices();
    fillPackSelect();
    bindUi();

    try {
      showBanner("正在加载高德地图…", false);
      await loadMapSDK();
      state.mapReady = true;
      hideBanner();
    } catch (err) {
      console.error(err);
      showBanner(String(err.message || err), true);
    }

    try {
      await loadPackById(currentPackId());
    } catch (err) {
      if (currentPackId() === "draft") {
        await loadPackById(PACKS[0].id);
        tipBannerFallback(err);
      } else {
        throw err;
      }
    }
  }

  function tipBannerFallback(err) {
    showBanner(`${err.message || err}；已切回默认内容包。`, true);
  }

  boot().catch((err) => {
    ui.stopTitle.textContent = "加载失败";
    ui.stopKid.textContent = String(err);
    console.error(err);
  });
})();
