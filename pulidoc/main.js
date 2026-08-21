(function () {
  "use strict";

  var $ = function (sel, scope) { return (scope || document).querySelector(sel); };
  var $$ = function (sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); };
  function safe(fn, name) { try { fn(); } catch (e) { console.warn("[" + name + "]", e); } }

  var FONTS = ["Calibri", "Arial", "Georgia", "Times New Roman", "Garamond", "Verdana", "Cambria", "Segoe UI"];

  var MARGIN_PRESETS = {
    narrow: { top: 720, right: 720, bottom: 720, left: 720 },
    normal: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    wide: { top: 1440, right: 2160, bottom: 1440, left: 2160 }
  };

  var PRESETS = {
    profesional: { bodyFont: "Calibri", headingFont: "Cambria", accentColor: "#1f4e5f", bodySizePt: 11, lineSpacing: 276, paraSpacing: 160, margins: "normal", justify: true },
    academico: { bodyFont: "Times New Roman", headingFont: "Times New Roman", accentColor: "#222222", bodySizePt: 12, lineSpacing: 480, paraSpacing: 80, margins: "normal", justify: true },
    moderno: { bodyFont: "Verdana", headingFont: "Georgia", accentColor: "#c1440e", bodySizePt: 11, lineSpacing: 360, paraSpacing: 240, margins: "narrow", justify: false },
    minimalista: { bodyFont: "Arial", headingFont: "Arial", accentColor: "#111111", bodySizePt: 11, lineSpacing: 276, paraSpacing: 160, margins: "wide", justify: false },
    legal: { bodyFont: "Times New Roman", headingFont: "Times New Roman", accentColor: "#000000", bodySizePt: 12, lineSpacing: 360, paraSpacing: 80, margins: "wide", justify: true }
  };

  var state = { engineState: null, originalName: "documento", activePreset: "profesional" };

  function saveBlob(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  function mountFontSelects() {
    $$('select[data-opt="bodyFont"], select[data-opt="headingFont"]').forEach(function (sel) {
      sel.innerHTML = FONTS.map(function (f) { return '<option value="' + f + '">' + f + "</option>"; }).join("");
    });
  }

  function mountFaq() {
    var list = $("[data-faq-list]");
    var faqs = (window.__BRAND__ && window.__BRAND__.faqs) || [];
    if (!list || list.children.length || !faqs.length) return;
    list.innerHTML = faqs.map(function (f) {
      return '<details><summary>' + f.q + "</summary><p>" + f.a + "</p></details>";
    }).join("");
  }

  function setCardState(s) { $(".tool-card").setAttribute("data-state", s); }

  function showError(msg) {
    $("[data-error-msg]").textContent = msg;
    setCardState("error");
  }

  function applyPresetToControls(name) {
    var p = PRESETS[name];
    if (!p) return;
    $$(".preset-btn").forEach(function (b) { b.classList.toggle("is-active", b.dataset.preset === name); });
    $('select[data-opt="bodyFont"]').value = p.bodyFont;
    $('select[data-opt="headingFont"]').value = p.headingFont;
    $('input[data-opt="accentColor"]').value = p.accentColor;
    $('select[data-opt="bodySizePt"]').value = String(p.bodySizePt);
    $('select[data-opt="lineSpacing"]').value = String(p.lineSpacing);
    $('select[data-opt="paraSpacing"]').value = String(p.paraSpacing);
    $('select[data-opt="margins"]').value = p.margins;
    $('input[data-opt="justify"]').checked = p.justify;
    state.activePreset = name;
  }

  function readSettings() {
    var bodySizePt = parseInt($('select[data-opt="bodySizePt"]').value, 10);
    var marginsKey = $('select[data-opt="margins"]').value;
    return {
      bodyFont: $('select[data-opt="bodyFont"]').value,
      headingFont: $('select[data-opt="headingFont"]').value,
      accentColor: $('input[data-opt="accentColor"]').value.replace("#", "").toUpperCase(),
      bodySizePt: bodySizePt,
      titleSizePt: bodySizePt + 15,
      h1SizePt: bodySizePt + 9,
      h2SizePt: bodySizePt + 5,
      h3SizePt: bodySizePt + 2,
      lineValue: parseInt($('select[data-opt="lineSpacing"]').value, 10),
      paraSpacingAfter: parseInt($('select[data-opt="paraSpacing"]').value, 10),
      justify: $('input[data-opt="justify"]').checked,
      margins: MARGIN_PRESETS[marginsKey],
      fixPunctuation: $('input[data-opt="fixPunctuation"]').checked,
      fixBreaks: $('input[data-opt="fixBreaks"]').checked,
      autoHeadings: $('input[data-opt="autoHeadings"]').checked,
      uniformStyle: $('input[data-opt="uniformStyle"]').checked
    };
  }

  function pxFromPt(pt) { return pt; } // CSS accepts pt units directly — no conversion needed.

  function updatePreviewStyleVars(settings) {
    var page = $("[data-preview-page]");
    var lineHeightMap = { 240: 1.0, 276: 1.15, 360: 1.5, 480: 2.0 };
    page.style.setProperty("--pv-body-font", '"' + settings.bodyFont + '"');
    page.style.setProperty("--pv-heading-font", '"' + settings.headingFont + '"');
    page.style.setProperty("--pv-accent", "#" + settings.accentColor);
    page.style.setProperty("--pv-body-size", pxFromPt(settings.bodySizePt) + "pt");
    page.style.setProperty("--pv-title-size", pxFromPt(settings.titleSizePt) + "pt");
    page.style.setProperty("--pv-h1-size", pxFromPt(settings.h1SizePt) + "pt");
    page.style.setProperty("--pv-h2-size", pxFromPt(settings.h2SizePt) + "pt");
    page.style.setProperty("--pv-h3-size", pxFromPt(settings.h3SizePt) + "pt");
    page.style.setProperty("--pv-line-height", String(lineHeightMap[settings.lineValue] || 1.15));
    page.style.setProperty("--pv-para-space", (settings.paraSpacingAfter / 20) + "pt");
    page.style.setProperty("--pv-align", settings.justify ? "justify" : "left");
    var mm = settings.margins;
    page.style.setProperty("--pv-pad-top", (mm.top / 1440 * 96) + "px");
    page.style.setProperty("--pv-pad-x", (mm.left / 1440 * 96) + "px");
    page.style.setProperty("--pv-pad-bottom", (mm.bottom / 1440 * 96) + "px");
  }

  function updatePreview() {
    if (!state.engineState) return;
    var settings = readSettings();
    var processed = PulidocEngine.process(state.engineState, settings);
    state.lastProcessed = processed;
    state.lastSettings = settings;
    var html = PulidocEngine.renderPreviewHtml(processed, state.engineState);
    $("[data-preview-content]").innerHTML = html || "<p class=\"pv-empty\">(el documento parece estar vacío)</p>";
    updatePreviewStyleVars(settings);
  }

  async function handleFile(file) {
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) {
      showError("Ese archivo no parece un .docx. Si tienes un .doc antiguo, ábrelo en Word y usa \"Guardar como\" eligiendo .docx.");
      return;
    }
    if (!PulidocZip.supported()) {
      showError("Tu navegador no soporta esta función. Prueba a actualizarlo o usa una versión reciente de Chrome, Edge o Firefox.");
      return;
    }
    try {
      var buffer = await file.arrayBuffer();
      var filesMap = await PulidocZip.read(buffer);
      if (!filesMap.has("word/document.xml")) {
        throw new Error("El archivo no contiene un documento de Word válido.");
      }
      state.filesMap = filesMap;
      state.engineState = PulidocEngine.load(filesMap);
      state.originalName = file.name.replace(/\.docx$/i, "");
      $("[data-filename]").value = state.originalName + "-formateado";
      setCardState("working");
      applyPresetToControls(state.activePreset || "profesional");
      updatePreview();
    } catch (e) {
      console.warn("[handleFile]", e);
      showError("No se ha podido leer el documento. Comprueba que sea un .docx válido y no esté protegido con contraseña.");
    }
  }

  function download() {
    if (!state.lastProcessed) return;
    var newFiles = PulidocEngine.toFilesMap(state.filesMap, state.lastProcessed);
    var blob = PulidocZip.write(newFiles);
    var name = ($("[data-filename]").value || "documento-formateado").trim() || "documento-formateado";
    saveBlob(blob, name.replace(/\.docx$/i, "") + ".docx");
  }

  function initDropzone() {
    var dz = $("#dropzone");
    var input = $("#file-input");
    if (!dz || !input) return;
    input.addEventListener("change", function () { handleFile(input.files[0]); });
    ["dragover", "dragenter"].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("is-dragover"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("is-dragover"); });
    });
    dz.addEventListener("drop", function (e) {
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
    document.addEventListener("paste", function (e) {
      if ($(".tool-card").getAttribute("data-state") !== "idle") return;
      var items = (e.clipboardData && e.clipboardData.files) || [];
      if (items.length) handleFile(items[0]);
    });
  }

  function initControls() {
    $$(".preset-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyPresetToControls(btn.dataset.preset);
        updatePreview();
      });
    });
    $$('[data-opt]').forEach(function (el) {
      var ev = (el.type === "checkbox" || el.tagName === "SELECT" || el.type === "color") ? "input" : "input";
      el.addEventListener(ev, function () { updatePreview(); });
    });
    var dl = $("[data-download]");
    if (dl) dl.addEventListener("click", download);
    $$("[data-retry]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setCardState("idle");
        $("#file-input").value = "";
      });
    });
  }

  function boot() {
    safe(mountFontSelects, "mountFontSelects");
    safe(mountFaq, "mountFaq");
    safe(initDropzone, "initDropzone");
    safe(initControls, "initControls");
    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
