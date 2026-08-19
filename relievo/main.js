(function () {
  "use strict";

  /* ============================== Helpers ============================== */
  const $ = (sel, scope) => (scope || document).querySelector(sel);
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));
  const escHTML = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function safe(fn, name) { try { fn(); } catch (e) { console.warn("[" + name + "]", e); } }
  function debounce(fn, ms) {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }
  const data = window.__BRAND__ || {};

  /* ======================= Web Mercator projection ======================= */
  const TILE = 256;
  function lon2x(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
  function lat2y(lat, z) {
    const rad = clamp(lat, -85.05112878, 85.05112878) * Math.PI / 180;
    return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, z);
  }
  function x2lon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
  function y2lat(y, z) {
    const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }
  function clampLat(lat) { return clamp(lat, -85, 85); }

  /* ============================== Map state ============================== */
  const MAP = {
    el: null, layerEl: null, selEl: null,
    lat: 40.05, lon: -3.7, zoom: 6,
    minZoom: 2, maxZoom: 18,
    mode: "pan",          // "pan" | "select"
    panning: false, panStart: null,
    drawing: false, drawStart: null, drawCurrent: null,
    selection: null,      // { north, south, east, west } in degrees
    pinch: null
  };

  function screenSize() {
    const r = MAP.el.getBoundingClientRect();
    return { w: r.width, h: r.height, rect: r };
  }
  function centerPx(lat, lon, z) {
    return { x: lon2x(lon, z) * TILE, y: lat2y(lat, z) * TILE };
  }
  function screenToLonLat(px, py) {
    const { w, h } = screenSize();
    const c = centerPx(MAP.lat, MAP.lon, MAP.zoom);
    const worldX = c.x + (px - w / 2);
    const worldY = c.y + (py - h / 2);
    return { lon: x2lon(worldX / TILE, MAP.zoom), lat: y2lat(worldY / TILE, MAP.zoom) };
  }
  function lonLatToScreen(lon, lat) {
    const { w, h } = screenSize();
    const c = centerPx(MAP.lat, MAP.lon, MAP.zoom);
    const px = lon2x(lon, MAP.zoom) * TILE - c.x + w / 2;
    const py = lat2y(lat, MAP.zoom) * TILE - c.y + h / 2;
    return { x: px, y: py };
  }

  function renderMap() {
    if (!MAP.el) return;
    const { w, h } = screenSize();
    if (w === 0 || h === 0) return;
    const z = MAP.zoom;
    const c = centerPx(MAP.lat, MAP.lon, z);
    const minTx = Math.floor((c.x - w / 2) / TILE) - 1;
    const maxTx = Math.floor((c.x + w / 2) / TILE) + 1;
    const minTy = Math.floor((c.y - h / 2) / TILE) - 1;
    const maxTy = Math.floor((c.y + h / 2) / TILE) + 1;
    const maxIndex = Math.pow(2, z);
    const frag = document.createDocumentFragment();
    for (let ty = minTy; ty <= maxTy; ty++) {
      if (ty < 0 || ty >= maxIndex) continue;
      for (let tx = minTx; tx <= maxTx; tx++) {
        const wrapped = ((tx % maxIndex) + maxIndex) % maxIndex;
        const img = document.createElement("img");
        img.className = "map-tile";
        img.alt = "";
        img.draggable = false;
        img.loading = "eager";
        img.decoding = "async";
        img.src = "https://tile.openstreetmap.org/" + z + "/" + wrapped + "/" + ty + ".png";
        img.style.left = (tx * TILE - c.x + w / 2) + "px";
        img.style.top = (ty * TILE - c.y + h / 2) + "px";
        frag.appendChild(img);
      }
    }
    MAP.layerEl.innerHTML = "";
    MAP.layerEl.appendChild(frag);
    drawSelectionOverlay();
    updateScaleBar();
  }

  function drawSelectionOverlay() {
    if (!MAP.selection) { MAP.selEl.hidden = true; return; }
    const nw = lonLatToScreen(MAP.selection.west, MAP.selection.north);
    const se = lonLatToScreen(MAP.selection.east, MAP.selection.south);
    const x = Math.min(nw.x, se.x), y = Math.min(nw.y, se.y);
    const w = Math.abs(se.x - nw.x), h = Math.abs(se.y - nw.y);
    MAP.selEl.hidden = false;
    MAP.selEl.style.left = x + "px";
    MAP.selEl.style.top = y + "px";
    MAP.selEl.style.width = w + "px";
    MAP.selEl.style.height = h + "px";
  }

  function updateDrawOverlay() {
    if (!MAP.drawStart || !MAP.drawCurrent) return;
    const x0 = MAP.drawStart.x, y0 = MAP.drawStart.y;
    const x1 = MAP.drawCurrent.x, y1 = MAP.drawCurrent.y;
    const x = Math.min(x0, x1), y = Math.min(y0, y1);
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    MAP.selEl.hidden = false;
    MAP.selEl.style.left = x + "px";
    MAP.selEl.style.top = y + "px";
    MAP.selEl.style.width = w + "px";
    MAP.selEl.style.height = h + "px";
  }

  function setZoom(z, anchorScreen) {
    z = clamp(Math.round(z), MAP.minZoom, MAP.maxZoom);
    if (z === MAP.zoom) return;
    if (anchorScreen) {
      const before = screenToLonLat(anchorScreen.x, anchorScreen.y);
      MAP.zoom = z;
      const after = lonLatToScreen(before.lon, before.lat);
      const { w, h } = screenSize();
      const dx = after.x - w / 2, dy = after.y - h / 2;
      const c = centerPx(MAP.lat, MAP.lon, z);
      MAP.lon = x2lon((c.x + dx) / TILE, z);
      MAP.lat = clampLat(y2lat((c.y + dy) / TILE, z));
    } else {
      MAP.zoom = z;
    }
    renderMap();
  }

  function setView(lat, lon, zoom) {
    MAP.lat = clampLat(lat);
    MAP.lon = lon;
    if (zoom != null) MAP.zoom = clamp(Math.round(zoom), MAP.minZoom, MAP.maxZoom);
    renderMap();
  }

  function zoomForBounds(west, south, east, north) {
    const { w, h } = screenSize();
    const pad = 0.86;
    for (let z = MAP.maxZoom; z >= MAP.minZoom; z--) {
      const dx = (lon2x(east, z) - lon2x(west, z)) * TILE;
      const dy = (lat2y(north, z) - lat2y(south, z)) * TILE;
      if (Math.abs(dx) <= w * pad && Math.abs(dy) <= h * pad) return z;
    }
    return MAP.minZoom;
  }

  function updateScaleBar() {
    const el = $("#scaleBar");
    if (!el) return;
    const metersPerPx = 156543.03392 * Math.cos(MAP.lat * Math.PI / 180) / Math.pow(2, MAP.zoom);
    const targets = [5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000, 250000, 500000];
    let best = targets[0];
    for (const t of targets) { if (t / metersPerPx <= 140) best = t; }
    const px = Math.round(best / metersPerPx);
    el.style.width = px + "px";
    el.textContent = best >= 1000 ? (best / 1000) + " km" : best + " m";
  }

  /* ============================ Map interaction ============================ */
  function initMap() {
    MAP.el = $("#map");
    MAP.layerEl = $("#mapTiles");
    MAP.selEl = $("#mapSelection");
    if (!MAP.el) return;

    MAP.el.addEventListener("pointerdown", onPointerDown);
    MAP.el.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    MAP.el.addEventListener("wheel", onWheel, { passive: false });
    MAP.el.addEventListener("dblclick", (e) => {
      e.preventDefault();
      const rect = MAP.el.getBoundingClientRect();
      setZoom(MAP.zoom + 1, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    });
    MAP.el.addEventListener("touchstart", onTouchStart, { passive: false });
    MAP.el.addEventListener("touchmove", onTouchMove, { passive: false });
    MAP.el.addEventListener("touchend", onTouchEnd, { passive: false });

    $("#zoomIn").addEventListener("click", () => setZoom(MAP.zoom + 1));
    $("#zoomOut").addEventListener("click", () => setZoom(MAP.zoom - 1));

    const selectBtn = $("#selectModeBtn");
    selectBtn.addEventListener("click", () => {
      MAP.mode = MAP.mode === "select" ? "pan" : "select";
      selectBtn.setAttribute("aria-pressed", MAP.mode === "select" ? "true" : "false");
      MAP.el.classList.toggle("is-select-mode", MAP.mode === "select");
      $("#mapHint").hidden = MAP.mode !== "select";
    });

    $("#clearSelectionBtn").addEventListener("click", () => {
      MAP.selection = null;
      CURRENT_GRID = null;
      renderMap();
      setToolState("idle");
    });

    const ro = new ResizeObserver(debounce(() => renderMap(), 80));
    ro.observe(MAP.el);

    const geoBtn = $("#geoLocateBtn");
    if (geoBtn && navigator.geolocation) {
      geoBtn.addEventListener("click", () => {
        geoBtn.disabled = true;
        navigator.geolocation.getCurrentPosition(
          (pos) => { setView(pos.coords.latitude, pos.coords.longitude, 12); geoBtn.disabled = false; },
          () => { geoBtn.disabled = false; },
          { timeout: 8000 }
        );
      });
    } else if (geoBtn) {
      geoBtn.hidden = true;
    }

    renderMap();
  }

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    MAP.el.setPointerCapture(e.pointerId);
    const rect = MAP.el.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (MAP.mode === "select") {
      MAP.drawing = true;
      MAP.drawStart = { x, y };
      MAP.drawCurrent = { x, y };
    } else {
      MAP.panning = true;
      MAP.panStart = { x: e.clientX, y: e.clientY, lat: MAP.lat, lon: MAP.lon, zoom: MAP.zoom };
    }
  }
  function onPointerMove(e) {
    if (MAP.drawing) {
      const rect = MAP.el.getBoundingClientRect();
      MAP.drawCurrent = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      updateDrawOverlay();
    } else if (MAP.panning) {
      const dx = e.clientX - MAP.panStart.x, dy = e.clientY - MAP.panStart.y;
      const z = MAP.panStart.zoom;
      const c = centerPx(MAP.panStart.lat, MAP.panStart.lon, z);
      MAP.lon = x2lon((c.x - dx) / TILE, z);
      MAP.lat = clampLat(y2lat((c.y - dy) / TILE, z));
      renderMap();
    }
  }
  function onPointerUp() {
    if (MAP.drawing) {
      MAP.drawing = false;
      finalizeSelection();
    }
    MAP.panning = false;
  }
  function onWheel(e) {
    e.preventDefault();
    const rect = MAP.el.getBoundingClientRect();
    const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setZoom(MAP.zoom + (e.deltaY < 0 ? 1 : -1), anchor);
  }

  function touchDist(t0, t1) { return Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY); }
  function onTouchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      MAP.panning = false; MAP.drawing = false;
      MAP.pinch = { dist: touchDist(e.touches[0], e.touches[1]), zoom: MAP.zoom };
    } else if (e.touches.length === 1) {
      const rect = MAP.el.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left, y = e.touches[0].clientY - rect.top;
      if (MAP.mode === "select") {
        MAP.drawing = true; MAP.drawStart = { x, y }; MAP.drawCurrent = { x, y };
      } else {
        MAP.panning = true;
        MAP.panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, lat: MAP.lat, lon: MAP.lon, zoom: MAP.zoom };
      }
    }
  }
  function onTouchMove(e) {
    if (e.touches.length === 2 && MAP.pinch) {
      e.preventDefault();
      const d = touchDist(e.touches[0], e.touches[1]);
      const scale = d / MAP.pinch.dist;
      MAP.layerEl.style.transform = "scale(" + scale + ")";
    } else if (e.touches.length === 1 && MAP.drawing) {
      e.preventDefault();
      const rect = MAP.el.getBoundingClientRect();
      MAP.drawCurrent = { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
      updateDrawOverlay();
    } else if (e.touches.length === 1 && MAP.panning) {
      e.preventDefault();
      const dx = e.touches[0].clientX - MAP.panStart.x, dy = e.touches[0].clientY - MAP.panStart.y;
      const z = MAP.panStart.zoom;
      const c = centerPx(MAP.panStart.lat, MAP.panStart.lon, z);
      MAP.lon = x2lon((c.x - dx) / TILE, z);
      MAP.lat = clampLat(y2lat((c.y - dy) / TILE, z));
      renderMap();
    }
  }
  function onTouchEnd(e) {
    if (MAP.pinch) {
      const scale = parseFloat((MAP.layerEl.style.transform.match(/scale\(([\d.]+)\)/) || [0, 1])[1]);
      MAP.layerEl.style.transform = "";
      const delta = Math.round(Math.log2(scale || 1));
      MAP.pinch = null;
      if (delta !== 0) setZoom(MAP.zoom + delta);
    }
    if (MAP.drawing && e.touches.length === 0) {
      MAP.drawing = false;
      finalizeSelection();
    }
    if (e.touches.length === 0) MAP.panning = false;
  }

  function finalizeSelection() {
    if (!MAP.drawStart || !MAP.drawCurrent) return;
    const dx = Math.abs(MAP.drawCurrent.x - MAP.drawStart.x);
    const dy = Math.abs(MAP.drawCurrent.y - MAP.drawStart.y);
    if (dx < 16 || dy < 16) { renderMap(); return; } // too small, ignore (treat as tap)
    const p0 = screenToLonLat(MAP.drawStart.x, MAP.drawStart.y);
    const p1 = screenToLonLat(MAP.drawCurrent.x, MAP.drawCurrent.y);
    MAP.selection = {
      north: Math.max(p0.lat, p1.lat),
      south: Math.min(p0.lat, p1.lat),
      east: Math.max(p0.lon, p1.lon),
      west: Math.min(p0.lon, p1.lon)
    };
    MAP.mode = "pan";
    $("#selectModeBtn").setAttribute("aria-pressed", "false");
    MAP.el.classList.remove("is-select-mode");
    $("#mapHint").hidden = true;
    renderMap();
    processSelection();
  }

  /* ============================== Search (Nominatim) ============================== */
  function initSearch() {
    const input = $("#searchInput");
    const list = $("#searchResults");
    const form = $("#searchForm");
    if (!input) return;
    let lastQuery = "";

    const runSearch = debounce(async () => {
      const q = input.value.trim();
      if (q.length < 3 || q === lastQuery) return;
      lastQuery = q;
      try {
        const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=" + encodeURIComponent(q);
        const res = await fetch(url, { headers: { "Accept-Language": "es" } });
        const results = await res.json();
        renderResults(results);
      } catch (_) { /* silent — search is a nicety, not core */ }
    }, 450);

    input.addEventListener("input", runSearch);
    form.addEventListener("submit", (e) => { e.preventDefault(); lastQuery = ""; runSearch(); });
    document.addEventListener("click", (e) => {
      if (!list.contains(e.target) && e.target !== input) list.hidden = true;
    });

    function renderResults(results) {
      if (!results || !results.length) { list.hidden = true; list.innerHTML = ""; return; }
      list.innerHTML = results.map((r, i) => (
        '<li><button type="button" class="search-result" data-i="' + i + '">' +
        '<span class="search-result-name">' + escHTML(r.display_name.split(",")[0]) + "</span>" +
        '<span class="search-result-full">' + escHTML(r.display_name) + "</span>" +
        "</button></li>"
      )).join("");
      list.hidden = false;
      $$(".search-result", list).forEach((btn) => {
        btn.addEventListener("click", () => {
          const r = results[parseInt(btn.dataset.i, 10)];
          const bbox = r.boundingbox ? r.boundingbox.map(Number) : null; // [south, north, west, east]
          if (bbox) {
            const z = zoomForBounds(bbox[2], bbox[0], bbox[3], bbox[1]);
            setView((bbox[0] + bbox[1]) / 2, (bbox[2] + bbox[3]) / 2, z);
          } else {
            setView(parseFloat(r.lat), parseFloat(r.lon), 13);
          }
          input.value = r.display_name.split(",")[0];
          list.hidden = true;
        });
      });
    }
  }

  /* ============================== Elevation engine ============================== */
  const ELEV_BASE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
  const MAX_TILES = 64;
  let CURRENT_GRID = null;
  let CURRENT_BOUNDS = null;

  function pickElevationZoom(b) {
    for (let z = 15; z >= 1; z--) {
      const x1 = Math.floor(lon2x(b.west, z)), x2 = Math.floor(lon2x(b.east, z));
      const y1 = Math.floor(lat2y(b.north, z)), y2 = Math.floor(lat2y(b.south, z));
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      if (count <= MAX_TILES) return z;
    }
    return 1;
  }

  function loadTileImage(url, timeoutMs) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, timeoutMs);
      img.onload = () => { if (!done) { done = true; clearTimeout(timer); resolve(img); } };
      img.onerror = () => { if (!done) { done = true; clearTimeout(timer); resolve(null); } };
      img.src = url;
    });
  }

  async function buildElevationGrid(bounds, onProgress) {
    const z = pickElevationZoom(bounds);
    const x1 = Math.floor(lon2x(bounds.west, z)), x2 = Math.floor(lon2x(bounds.east, z));
    const y1 = Math.floor(lat2y(bounds.north, z)), y2 = Math.floor(lat2y(bounds.south, z));
    const tilesX = x2 - x1 + 1, tilesY = y2 - y1 + 1;
    const W = tilesX * 256, H = tilesY * 256;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const total = tilesX * tilesY;
    let loaded = 0, failed = 0;
    const maxIndex = Math.pow(2, z);
    const jobs = [];
    for (let ty = y1; ty <= y2; ty++) {
      for (let tx = x1; tx <= x2; tx++) {
        const wrapped = ((tx % maxIndex) + maxIndex) % maxIndex;
        const url = ELEV_BASE + "/" + z + "/" + wrapped + "/" + ty + ".png";
        const ox = (tx - x1) * 256, oy = (ty - y1) * 256;
        jobs.push(
          loadTileImage(url, 12000).then((img) => {
            if (img) ctx.drawImage(img, ox, oy); else failed++;
            loaded++;
            if (onProgress) onProgress(loaded, total);
          })
        );
      }
    }
    await Promise.all(jobs);
    const imgData = ctx.getImageData(0, 0, W, H).data;
    const elev = new Float32Array(W * H);
    for (let i = 0, p = 0; i < imgData.length; i += 4, p++) {
      elev[p] = imgData[i] * 256 + imgData[i + 1] + imgData[i + 2] / 256 - 32768;
    }
    return { elev, W, H, x1, y1, zoom: z, tilesX, tilesY, failed, total };
  }

  function sampleElev(grid, px, py) {
    const { elev, W, H } = grid;
    const x = clamp(px, 0, W - 1.001), y = clamp(py, 0, H - 1.001);
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
    const fx = x - x0, fy = y - y0;
    const v00 = elev[y0 * W + x0], v10 = elev[y0 * W + x1];
    const v01 = elev[y1 * W + x0], v11 = elev[y1 * W + x1];
    return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
  }

  function probeMinMax(grid, bounds) {
    const N = 96;
    let mn = Infinity, mx = -Infinity;
    const z = grid.zoom;
    for (let j = 0; j < N; j++) {
      const lat = bounds.north - (j + 0.5) / N * (bounds.north - bounds.south);
      const ty = lat2y(lat, z);
      for (let i = 0; i < N; i++) {
        const lon = bounds.west + (i + 0.5) / N * (bounds.east - bounds.west);
        const tx = lon2x(lon, z);
        const v = sampleElev(grid, (tx - grid.x1) * 256, (ty - grid.y1) * 256);
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    return { min: mn, max: mx };
  }

  function computeOutputSize(bounds, longEdge) {
    const avgLat = (bounds.north + bounds.south) / 2;
    const dLon = bounds.east - bounds.west, dLat = bounds.north - bounds.south;
    const wMeters = Math.abs(dLon) * 111320 * Math.cos(avgLat * Math.PI / 180);
    const hMeters = Math.abs(dLat) * 111320;
    const aspect = wMeters / (hMeters || 1);
    let w, h;
    if (aspect >= 1) { w = longEdge; h = Math.max(16, Math.round(longEdge / aspect)); }
    else { h = longEdge; w = Math.max(16, Math.round(longEdge * aspect)); }
    return { w, h };
  }

  function renderHeightmap(grid, bounds, outW, outH, normMin, normMax, invert) {
    const canvas = $("#previewCanvas");
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.createImageData(outW, outH);
    const z = grid.zoom;
    const range = (normMax - normMin) || 1;
    for (let j = 0; j < outH; j++) {
      const lat = bounds.north - (j + 0.5) / outH * (bounds.north - bounds.south);
      const ty = lat2y(lat, z);
      const rowOff = j * outW;
      for (let i = 0; i < outW; i++) {
        const lon = bounds.west + (i + 0.5) / outW * (bounds.east - bounds.west);
        const tx = lon2x(lon, z);
        const v = sampleElev(grid, (tx - grid.x1) * 256, (ty - grid.y1) * 256);
        let t = clamp((v - normMin) / range, 0, 1);
        let gray = Math.round(t * 255);
        if (invert) gray = 255 - gray;
        const idx = (rowOff + i) * 4;
        imgData.data[idx] = gray; imgData.data[idx + 1] = gray; imgData.data[idx + 2] = gray; imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  /* ============================== Tool UI / states ============================== */
  function setToolState(state) {
    $("#toolCard").dataset.state = state;
    $("#downloadBtn").disabled = state !== "done";
  }
  function setProgress(loaded, total, label) {
    const pct = total ? Math.round((loaded / total) * 100) : 0;
    $("#progressFill").style.width = pct + "%";
    $("#progressLabel").textContent = label + " (" + pct + "%)";
  }
  function showWarning(msg) {
    const el = $("#dataWarning");
    el.textContent = "⚠ " + msg;
    el.hidden = false;
  }
  function hideWarning() { $("#dataWarning").hidden = true; }

  function updateStats({ w, h, realMin, realMax, tiles, zoom }) {
    $("#statResolution").textContent = w + " × " + h + " px";
    $("#statRealRange").textContent = Math.round(realMin) + " m – " + Math.round(realMax) + " m";
    $("#statSource").textContent = tiles + " teselas · zoom de datos " + zoom;
    const coarse = zoom <= 8;
    $("#coarseHint").hidden = !coarse;
  }

  async function processSelection() {
    const bounds = MAP.selection;
    if (!bounds) return;
    setToolState("loading");
    hideWarning();
    setProgress(0, 1, "Preparando descarga de datos de elevación");
    try {
      const grid = await buildElevationGrid(bounds, (loaded, total) => {
        setProgress(loaded, total, "Descargando datos de elevación");
      });
      if (grid.failed === grid.total) throw new Error("no-data");
      CURRENT_GRID = grid;
      CURRENT_BOUNDS = bounds;
      recomputePreview();
      setToolState("done");
      if (grid.failed > 0) {
        showWarning(grid.failed + " de " + grid.total + " teselas no se pudieron cargar (probablemente océano o zona sin datos). El resultado puede tener huecos planos.");
      }
    } catch (err) {
      console.warn("[processSelection]", err);
      setToolState("error");
    }
  }

  function recomputePreview() {
    if (!CURRENT_GRID || !CURRENT_BOUNDS) return;
    const longEdge = parseInt($("#resolution").value, 10) || 512;
    const { w, h } = computeOutputSize(CURRENT_BOUNDS, longEdge);
    const probe = probeMinMax(CURRENT_GRID, CURRENT_BOUNDS);
    const auto = $("#autoRange").checked;
    let normMin, normMax;
    if (auto) {
      normMin = Math.floor(probe.min);
      normMax = Math.ceil(probe.max);
      if (normMax - normMin < 1) normMax = normMin + 1;
      $("#minAlt").value = normMin;
      $("#maxAlt").value = normMax;
    } else {
      normMin = parseFloat($("#minAlt").value);
      normMax = parseFloat($("#maxAlt").value);
      if (isNaN(normMin)) normMin = Math.floor(probe.min);
      if (isNaN(normMax) || normMax <= normMin) normMax = normMin + 1;
    }
    const invert = $("#invert").checked;
    renderHeightmap(CURRENT_GRID, CURRENT_BOUNDS, w, h, normMin, normMax, invert);
    updateStats({ w, h, realMin: probe.min, realMax: probe.max, tiles: CURRENT_GRID.total, zoom: CURRENT_GRID.zoom });
  }

  function downloadPNG() {
    const canvas = $("#previewCanvas");
    if (!canvas.width) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "heightmap-" + canvas.width + "x" + canvas.height + ".png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, "image/png");
  }

  function initControls() {
    $("#resolution").addEventListener("change", () => recomputePreview());
    $("#invert").addEventListener("change", () => recomputePreview());
    $("#autoRange").addEventListener("change", (e) => {
      const manual = !e.target.checked;
      $("#minAlt").disabled = !manual;
      $("#maxAlt").disabled = !manual;
      recomputePreview();
    });
    const onManualChange = debounce(() => { if (!$("#autoRange").checked) recomputePreview(); }, 350);
    $("#minAlt").addEventListener("input", onManualChange);
    $("#maxAlt").addEventListener("input", onManualChange);
    $("#downloadBtn").addEventListener("click", downloadPNG);
    $("#retryBtn").addEventListener("click", () => processSelection());
  }

  function initFAQ() {
    const target = $("[data-faq]");
    if (!target || target.children.length > 0 || !data.faqs) return;
    target.innerHTML = data.faqs.map((f) => (
      "<details><summary>" + escHTML(f.q) + "</summary><p>" + escHTML(f.a) + "</p></details>"
    )).join("");
  }

  function initYear() {
    const el = $("#year");
    if (el) el.textContent = new Date().getFullYear();
  }

  /* ============================== Boot ============================== */
  function boot() {
    safe(initFAQ, "initFAQ");
    safe(initYear, "initYear");
    safe(initMap, "initMap");
    safe(initSearch, "initSearch");
    safe(initControls, "initControls");
    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
