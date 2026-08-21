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
    amapLink: $("amapLink"),
    quizQ: $("quizQ"),
    quizOptions: $("quizOptions"),
    quizFeedback: $("quizFeedback"),
    storyCard: $("storyCard"),
    btnPlay: $("btnPlay"),
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

  function currentPackId() {
    const q = new URLSearchParams(location.search).get("pack");
    if (q && PACKS.some((p) => p.id === q)) return q;
    return PACKS[0].id;
  }

  function fillPackSelect() {
    const id = currentPackId();
    ui.packSelect.innerHTML = PACKS.map(
      (p) => `<option value="${p.id}" ${p.id === id ? "selected" : ""}>${escapeHtml(p.label)}</option>`
    ).join("");
  }

  async function loadPackById(id) {
    const meta = PACKS.find((p) => p.id === id) || PACKS[0];
    state.packMeta = meta;
    const pack = await fetch(meta.url).then((r) => {
      if (!r.ok) throw new Error(`无法加载 ${meta.url}`);
      return r.json();
    });

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
        renderStop(i, { fly: true });
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

  function bindUi() {
    if (state.uiBound) return;
    state.uiBound = true;

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
      if (state.mode === "listen" && state.map) startPlayback();
    });

    ui.btnPlay.addEventListener("click", () => {
      if (!state.map) {
        showBanner("地图尚未就绪，请检查高德 Key / 域名白名单。", true);
        return;
      }
      if (state.playing) stopPlayback();
      else startPlayback();
    });

    ui.btnReset.addEventListener("click", () => {
      stopPlayback();
      state.visited.clear();
      state.answered.clear();
      renderStop(0, { fly: true });
      ui.endOverlay.classList.add("hidden");
      if (state.map && state.markers.length) {
        state.map.setFitView(state.markers, false, [48, 48, 48, 48]);
      }
    });

    ui.btnPrev.addEventListener("click", () => {
      stopPlayback();
      renderStop(Math.max(0, state.index - 1), { fly: true });
    });

    ui.btnNext.addEventListener("click", () => {
      stopPlayback();
      goNext();
    });

    ui.btnReplay.addEventListener("click", () => {
      ui.endOverlay.classList.add("hidden");
      state.visited.clear();
      state.answered.clear();
      renderStop(0, { fly: true });
      if (state.map) startPlayback();
    });

    ui.btnCloseEnd.addEventListener("click", () => {
      ui.endOverlay.classList.add("hidden");
    });

    document.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        state.speed = Number(chip.dataset.speed);
        if (state.playing) {
          stopPlayback();
          startPlayback();
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
      renderStop(Number(tick.dataset.i), { fly: true });
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

  function startPlayback() {
    state.playing = true;
    ui.btnPlay.textContent = "❚❚ 暂停";
    scheduleAdvance();
  }

  function stopPlayback() {
    state.playing = false;
    ui.btnPlay.textContent = "▶ 播放";
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  function scheduleAdvance() {
    if (!state.playing) return;
    const dwell = (state.mode === "listen" ? 5200 : 3800) / state.speed;
    state.timer = setTimeout(() => {
      if (state.index >= state.pack.stops.length - 1) {
        stopPlayback();
        showEnd();
        return;
      }
      renderStop(state.index + 1, { fly: true });
      scheduleAdvance();
    }, dwell);
  }

  function goNext() {
    if (state.index >= state.pack.stops.length - 1) {
      showEnd();
      return;
    }
    renderStop(state.index + 1, { fly: true });
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

    const lnglat = toAmap(stop.coords);
    const lng = lnglat[0];
    const lat = lnglat[1];
    ui.amapLink.href =
      "https://uri.amap.com/marker?position=" +
      lng +
      "," +
      lat +
      "&name=" +
      encodeURIComponent(stop.modernPlace || stop.placeName) +
      "&coordinate=gaode&callnative=0";

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

    await loadPackById(currentPackId());
  }

  boot().catch((err) => {
    ui.stopTitle.textContent = "加载失败";
    ui.stopKid.textContent = String(err);
    console.error(err);
  });
})();
