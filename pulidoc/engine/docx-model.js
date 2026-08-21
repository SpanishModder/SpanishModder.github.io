/*!
 * PulidocEngine — parses word/document.xml + word/styles.xml, cleans up
 * common formatting mess, applies a chosen visual preset, and can render
 * both a live HTML preview and the final, re-serialized XML parts.
 *
 * Design principle: never touch anything except document.xml and
 * styles.xml. Every other part of the original .docx (images, numbering,
 * headers/footers, fonts table, theme...) passes through untouched, so
 * the file the user gets back is structurally identical to their own,
 * just cleaner and consistently styled.
 */
(function (global) {
  "use strict";

  var W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  var XML_PROLOG = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

  function els(root, name) {
    return Array.prototype.slice.call(root.getElementsByTagNameNS(W_NS, name));
  }
  function first(root, name) {
    var list = root.getElementsByTagNameNS(W_NS, name);
    return list.length ? list[0] : null;
  }
  function ce(doc, name) { return doc.createElementNS(W_NS, "w:" + name); }

  function parseXml(str) {
    var doc = new DOMParser().parseFromString(str, "application/xml");
    var perr = doc.getElementsByTagName("parsererror");
    if (perr.length) throw new Error("El documento contiene XML inválido.");
    return doc;
  }
  function serializeXml(doc) {
    return XML_PROLOG + new XMLSerializer().serializeToString(doc.documentElement);
  }

  // ---------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------
  function load(filesMap) {
    var decoder = new TextDecoder("utf-8");
    var documentXmlStr = decoder.decode(filesMap.get("word/document.xml"));
    var stylesBytes = filesMap.get("word/styles.xml");
    var stylesXmlStr = stylesBytes ? decoder.decode(stylesBytes)
      : XML_PROLOG + '<w:styles xmlns:w="' + W_NS + '"></w:styles>';

    // Collect image parts for a richer preview (best-effort, optional).
    var mediaUrls = {};
    filesMap.forEach(function (bytes, name) {
      if (/^word\/media\//.test(name)) {
        var ext = name.split(".").pop().toLowerCase();
        var mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", emf: "", wmf: "" }[ext] || "";
        if (mime) mediaUrls[name] = URL.createObjectURL(new Blob([bytes], { type: mime }));
      }
    });
    var relsBytes = filesMap.get("word/_rels/document.xml.rels");
    var relIdToMedia = {};
    if (relsBytes) {
      var relsDoc = parseXml(decoder.decode(relsBytes));
      Array.prototype.forEach.call(relsDoc.getElementsByTagName("Relationship"), function (r) {
        var target = r.getAttribute("Target");
        if (target && /^media\//.test(target)) relIdToMedia[r.getAttribute("Id")] = "word/" + target;
      });
    }

    return {
      originalDocumentXml: documentXmlStr,
      originalStylesXml: stylesXmlStr,
      hasStylesPart: !!stylesBytes,
      mediaUrls: mediaUrls,
      relIdToMedia: relIdToMedia
    };
  }

  // ---------------------------------------------------------------------
  // Cleanup: spacing & punctuation inside <w:t> text runs
  // ---------------------------------------------------------------------
  function cleanupPunctuation(docXmlDoc) {
    els(docXmlDoc, "t").forEach(function (node) {
      var text = node.textContent;
      if (!text) return;
      var out = text
        .replace(/[ \t]{2,}/g, " ")                              // collapse repeated spaces
        .replace(/[ \t]+([,.;:!?…%])/g, "$1")                    // no space BEFORE punctuation
        .replace(/([,;:])(?=[^\s\d.,;:!?'")\]”’])/g, "$1 ")      // space AFTER , ; : before a letter
        .replace(/([!?])(?=[A-ZÁÉÍÓÚÑÜa-záéíóúñü])/g, "$1 ")      // space AFTER ! ? before a letter
        .replace(/(\.)(?=[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü])/g, "$1 ")      // space after a sentence period
        .replace(/ {2,}/g, " ");
      if (out !== text) node.textContent = out;
    });
  }

  // Collapses 2+ consecutive manual <w:br/> line breaks down to one, and
  // removes runs of more than one totally empty paragraph in a row.
  function cleanupBreaks(docXmlDoc) {
    var body = first(docXmlDoc, "body");
    if (!body) return;

    // (a) consecutive manual breaks within/around a paragraph's flow
    var walker = docXmlDoc.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);
    var sinceText = 0;
    var brToRemove = [];
    var node;
    while ((node = walker.nextNode())) {
      var ln = node.localName;
      if (ln === "p") sinceText = 0;
      else if (ln === "t") { if (node.textContent && node.textContent.trim()) sinceText = 0; }
      else if (ln === "br") { sinceText++; if (sinceText > 1) brToRemove.push(node); }
    }
    brToRemove.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });

    // (b) collapse 2+ consecutive fully-empty paragraphs into a single one
    var paras = els(body, "p");
    var run = [];
    function flush() {
      if (run.length > 1) run.slice(1).forEach(function (p) { if (p.parentNode) p.parentNode.removeChild(p); });
      run = [];
    }
    paras.forEach(function (p) {
      var text = els(p, "t").map(function (t) { return t.textContent; }).join("");
      var hasMedia = els(p, "drawing").length > 0 || els(p, "tbl").length > 0;
      var isEmpty = text.trim().length === 0 && !hasMedia;
      if (isEmpty) run.push(p); else flush();
    });
    flush();
  }

  function getPStyleId(p) {
    var pPr = first(p, "pPr");
    if (!pPr) return null;
    var pStyle = pPr.getElementsByTagNameNS(W_NS, "pStyle")[0];
    return pStyle ? pStyle.getAttribute("w:val") : null;
  }
  function isHeadingStyleId(id) { return !!id && /heading|title|ttulo|t\u00edtulo/i.test(id); }
  function headingLevelFromStyleId(id) {
    if (/title/i.test(id)) return 0;
    var m = /(\d)/.exec(id);
    return m ? Math.min(3, parseInt(m[1], 10)) : 1;
  }

  // ---------------------------------------------------------------------
  // Heuristic heading detection for documents that never used real
  // Word heading styles (bold + oversized text used to fake a title).
  // ---------------------------------------------------------------------
  function detectHeadings(docXmlDoc, opts) {
    var body = first(docXmlDoc, "body");
    if (!body) return [];
    var topParas = Array.prototype.slice.call(body.childNodes).filter(function (n) {
      return n.nodeType === 1 && n.localName === "p";
    });

    function directRuns(p) {
      return Array.prototype.slice.call(p.childNodes).filter(function (n) {
        return n.nodeType === 1 && n.localName === "r";
      });
    }
    function runSize(r) {
      var rPr = first(r, "rPr");
      if (!rPr) return null;
      var sz = rPr.getElementsByTagNameNS(W_NS, "sz")[0];
      return sz ? parseInt(sz.getAttribute("w:val"), 10) : null;
    }
    function runIsBold(r) {
      var rPr = first(r, "rPr");
      return !!(rPr && rPr.getElementsByTagNameNS(W_NS, "b").length);
    }
    function paraText(p) { return els(p, "t").map(function (t) { return t.textContent; }).join(""); }

    // Find the most common explicit run size, used as the "body" baseline.
    var counts = {};
    topParas.forEach(function (p) {
      var sid = getPStyleId(p);
      if (isHeadingStyleId(sid)) return;
      directRuns(p).forEach(function (r) {
        var s = runSize(r);
        if (s) counts[s] = (counts[s] || 0) + 1;
      });
    });
    var baseline = 22, best = -1; // default 11pt in half-points
    Object.keys(counts).forEach(function (k) { if (counts[k] > best) { best = counts[k]; baseline = parseInt(k, 10); } });

    var results = [];
    topParas.forEach(function (p) {
      var sid = getPStyleId(p);
      if (isHeadingStyleId(sid)) { results.push({ p: p, level: headingLevelFromStyleId(sid), already: true }); return; }
      if (!opts.autoHeadings) return;
      if (first(p, "numPr")) return; // list items are never headings
      var text = paraText(p).trim();
      if (!text || text.length > 90) return;
      if (/[.,;:]$/.test(text)) return; // sentences ending mid-punctuation aren't titles

      var runs = directRuns(p);
      if (!runs.length) return;
      var allBold = runs.every(runIsBold);
      var maxSize = Math.max.apply(null, runs.map(runSize).filter(Boolean).concat([0]));
      var isBig = maxSize >= baseline + 6;
      if (allBold || isBig) {
        var level = maxSize >= baseline + 14 ? 1 : (maxSize >= baseline + 6 ? 1 : 2);
        results.push({ p: p, level: level, already: false });
      }
    });
    return results;
  }

  function applyDetectedHeadings(docXmlDoc, detections, uniformStyle) {
    detections.forEach(function (d) {
      var p = d.p;
      if (!d.already) {
        var pPr = first(p, "pPr");
        if (!pPr) { pPr = ce(docXmlDoc, "pPr"); p.insertBefore(pPr, p.firstChild); }
        var pStyle = first(pPr, "pStyle");
        if (!pStyle) { pStyle = ce(docXmlDoc, "pStyle"); pPr.insertBefore(pStyle, pPr.firstChild); }
        pStyle.setAttribute("w:val", "Heading" + (d.level || 1));
      }
      // Whether pre-existing or freshly detected, a heading only looks fully
      // consistent once its own manual bold/size/font overrides are gone —
      // but only when the user asked for a uniform style.
      if (uniformStyle) directRunsRemoveOverrides(p, ["b", "sz", "szCs", "rFonts", "color"]);
    });
  }

  function directRunsRemoveOverrides(p, names) {
    Array.prototype.slice.call(p.childNodes).forEach(function (n) {
      if (n.nodeType !== 1 || n.localName !== "r") return;
      var rPr = first(n, "rPr");
      if (!rPr) return;
      names.forEach(function (name) {
        var el = rPr.getElementsByTagNameNS(W_NS, name)[0];
        if (el) rPr.removeChild(el);
      });
    });
  }

  // ---------------------------------------------------------------------
  // Strip inconsistent direct formatting from ordinary body paragraphs
  // (manual font/size/color/alignment overrides), so the style definition
  // takes over and the document looks consistent.
  // ---------------------------------------------------------------------
  function stripDirectFormatting(docXmlDoc, detections) {
    var headingParas = detections.map(function (d) { return d.p; });
    var body = first(docXmlDoc, "body");
    if (!body) return;
    els(body, "p").forEach(function (p) {
      if (headingParas.indexOf(p) !== -1) return;      // headings keep their own rules
      if (first(p, "tbl")) return;
      if (isInsideTable(p)) return;                     // leave table content alone
      if (first(p, "numPr")) return;                    // keep list paragraphs' own layout

      var pPr = first(p, "pPr");
      if (pPr) {
        ["jc", "spacing", "ind"].forEach(function (name) {
          var el = pPr.getElementsByTagNameNS(W_NS, name)[0];
          if (el) pPr.removeChild(el);
        });
      }
      Array.prototype.slice.call(p.childNodes).forEach(function (n) {
        if (n.nodeType !== 1 || n.localName !== "r") return;
        if (isInsideHyperlink(n)) return;                // keep link color/underline
        var rPr = first(n, "rPr");
        if (!rPr) return;
        ["rFonts", "sz", "szCs", "color"].forEach(function (name) {
          var el = rPr.getElementsByTagNameNS(W_NS, name)[0];
          if (el) rPr.removeChild(el);
        });
      });
    });
  }
  function isInsideTable(node) {
    var n = node.parentNode;
    while (n) { if (n.nodeType === 1 && n.localName === "tbl") return true; n = n.parentNode; }
    return false;
  }
  function isInsideHyperlink(node) {
    var n = node.parentNode;
    while (n) { if (n.nodeType === 1 && n.localName === "hyperlink") return true; n = n.parentNode; }
    return false;
  }

  // ---------------------------------------------------------------------
  // Preset style application (styles.xml)
  // ---------------------------------------------------------------------
  function ensureStyle(stylesXmlDoc, styleId, name, basedOn) {
    var root = first(stylesXmlDoc, "styles") || stylesXmlDoc.documentElement;
    var found = els(root, "style").filter(function (s) { return s.getAttribute("w:styleId") === styleId; })[0];
    if (found) return found;
    var style = ce(stylesXmlDoc, "style");
    style.setAttribute("w:type", "paragraph");
    style.setAttribute("w:styleId", styleId);
    var nameEl = ce(stylesXmlDoc, "name"); nameEl.setAttribute("w:val", name); style.appendChild(nameEl);
    if (basedOn) { var b = ce(stylesXmlDoc, "basedOn"); b.setAttribute("w:val", basedOn); style.appendChild(b); }
    var next = ce(stylesXmlDoc, "next"); next.setAttribute("w:val", "Normal"); style.appendChild(next);
    var q = ce(stylesXmlDoc, "qFormat"); style.appendChild(q);
    root.appendChild(style);
    return style;
  }

  function setStylePPr(stylesXmlDoc, style, opts) {
    var old = first(style, "pPr");
    if (old) style.removeChild(old);
    var pPr = ce(stylesXmlDoc, "pPr");
    if (opts.spacingBefore != null || opts.spacingAfter != null || opts.lineRule) {
      var spacing = ce(stylesXmlDoc, "spacing");
      if (opts.spacingBefore != null) spacing.setAttribute("w:before", String(opts.spacingBefore));
      if (opts.spacingAfter != null) spacing.setAttribute("w:after", String(opts.spacingAfter));
      if (opts.lineValue) { spacing.setAttribute("w:line", String(opts.lineValue)); spacing.setAttribute("w:lineRule", "auto"); }
      pPr.appendChild(spacing);
    }
    if (opts.jc) { var jc = ce(stylesXmlDoc, "jc"); jc.setAttribute("w:val", opts.jc); pPr.appendChild(jc); }
    // insert pPr right after <w:name>/<w:basedOn>/<w:next>/<w:qFormat>, before rPr
    var rPr = first(style, "rPr");
    style.insertBefore(pPr, rPr || null);
  }

  function setStyleRPr(stylesXmlDoc, style, opts) {
    var old = first(style, "rPr");
    if (old) style.removeChild(old);
    var rPr = ce(stylesXmlDoc, "rPr");
    if (opts.font) {
      var rFonts = ce(stylesXmlDoc, "rFonts");
      rFonts.setAttribute("w:ascii", opts.font);
      rFonts.setAttribute("w:hAnsi", opts.font);
      rFonts.setAttribute("w:cs", opts.font);
      rPr.appendChild(rFonts);
    }
    if (opts.bold) rPr.appendChild(ce(stylesXmlDoc, "b"));
    if (opts.color) { var c = ce(stylesXmlDoc, "color"); c.setAttribute("w:val", opts.color); rPr.appendChild(c); }
    if (opts.sizeHalfPt) {
      var sz = ce(stylesXmlDoc, "sz"); sz.setAttribute("w:val", String(opts.sizeHalfPt)); rPr.appendChild(sz);
      var szCs = ce(stylesXmlDoc, "szCs"); szCs.setAttribute("w:val", String(opts.sizeHalfPt)); rPr.appendChild(szCs);
    }
    style.appendChild(rPr);
  }

  function applyPreset(stylesXmlDoc, settings) {
    var normal = ensureStyle(stylesXmlDoc, "Normal", "Normal", null);
    setStyleRPr(stylesXmlDoc, normal, { font: settings.bodyFont, sizeHalfPt: settings.bodySizePt * 2 });
    setStylePPr(stylesXmlDoc, normal, {
      spacingAfter: settings.paraSpacingAfter, lineValue: settings.lineValue,
      jc: settings.justify ? "both" : "left"
    });

    var levels = [
      { id: "Title", name: "Title", size: settings.titleSizePt, spBefore: 0, spAfter: 240 },
      { id: "Heading1", name: "heading 1", size: settings.h1SizePt, spBefore: 320, spAfter: 160 },
      { id: "Heading2", name: "heading 2", size: settings.h2SizePt, spBefore: 260, spAfter: 120 },
      { id: "Heading3", name: "heading 3", size: settings.h3SizePt, spBefore: 200, spAfter: 100 }
    ];
    levels.forEach(function (lv) {
      var style = ensureStyle(stylesXmlDoc, lv.id, lv.name, "Normal");
      setStyleRPr(stylesXmlDoc, style, { font: settings.headingFont, bold: true, color: settings.accentColor, sizeHalfPt: lv.size * 2 });
      setStylePPr(stylesXmlDoc, style, { spacingBefore: lv.spBefore, spacingAfter: lv.spAfter, jc: "left" });
    });
  }

  function applyMargins(docXmlDoc, margins) {
    var sectPrs = els(docXmlDoc, "sectPr");
    if (!sectPrs.length) return;
    var sectPr = sectPrs[sectPrs.length - 1];
    var pgMar = first(sectPr, "pgMar");
    if (!pgMar) { pgMar = ce(docXmlDoc, "pgMar"); sectPr.appendChild(pgMar); }
    pgMar.setAttribute("w:top", String(margins.top));
    pgMar.setAttribute("w:right", String(margins.right));
    pgMar.setAttribute("w:bottom", String(margins.bottom));
    pgMar.setAttribute("w:left", String(margins.left));
  }

  // ---------------------------------------------------------------------
  // Full pipeline: given original XML strings + settings -> processed XML
  // ---------------------------------------------------------------------
  function process(state, settings) {
    var docXmlDoc = parseXml(state.originalDocumentXml);
    var stylesXmlDoc = parseXml(state.originalStylesXml);

    if (settings.fixPunctuation) cleanupPunctuation(docXmlDoc);
    if (settings.fixBreaks) cleanupBreaks(docXmlDoc);

    var detections = detectHeadings(docXmlDoc, settings);
    applyDetectedHeadings(docXmlDoc, detections, settings.uniformStyle);
    if (settings.uniformStyle) stripDirectFormatting(docXmlDoc, detections);

    applyPreset(stylesXmlDoc, settings);
    applyMargins(docXmlDoc, settings.margins);

    return { docXmlDoc: docXmlDoc, stylesXmlDoc: stylesXmlDoc, detections: detections };
  }

  function toFilesMap(originalFilesMap, processed) {
    var out = new Map(originalFilesMap);
    out.set("word/document.xml", new TextEncoder().encode(serializeXml(processed.docXmlDoc)));
    out.set("word/styles.xml", new TextEncoder().encode(serializeXml(processed.stylesXmlDoc)));
    return out;
  }

  // ---------------------------------------------------------------------
  // HTML preview rendering (best-effort visual approximation)
  // ---------------------------------------------------------------------
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderPreviewHtml(processed, state) {
    var body = first(processed.docXmlDoc, "body");
    if (!body) return "";
    var headingParas = processed.detections.map(function (d) { return d.p; });
    var headingLevelByPara = new Map(processed.detections.map(function (d) { return [d.p, d.level]; }));
    var html = [];
    var listCounter = 0;

    Array.prototype.forEach.call(body.childNodes, function (node) {
      if (node.nodeType !== 1) return;
      if (node.localName === "tbl") { html.push(renderTable(node)); return; }
      if (node.localName !== "p") return;

      var sid = getPStyleId(node);
      var hasNumPr = !!first(node, "numPr");
      var runsHtml = renderRuns(node, state);
      if (!runsHtml.trim() && !first(node, "drawing")) { html.push('<p class="pv-empty">&nbsp;</p>'); return; }

      if (headingParas.indexOf(node) !== -1) {
        var lvl = headingLevelByPara.get(node) || 1;
        var tag = lvl === 0 ? "h1" : "h" + Math.min(4, lvl + 1);
        html.push("<" + tag + ' class="pv-heading">' + runsHtml + "</" + tag + ">");
        return;
      }
      if (hasNumPr) {
        listCounter++;
        html.push('<p class="pv-list-item">' + runsHtml + "</p>");
        return;
      }
      var drawing = first(node, "drawing");
      if (drawing) html.push(renderImage(drawing, state));
      html.push("<p class=\"pv-body\">" + runsHtml + "</p>");
    });
    return html.join("\n");
  }

  function renderRuns(p, state) {
    var out = [];
    Array.prototype.forEach.call(p.childNodes, function (n) {
      if (n.nodeType !== 1) return;
      if (n.localName === "hyperlink") { out.push('<a href="#">' + renderRunsInline(n) + "</a>"); return; }
      if (n.localName === "r") out.push(renderRun(n));
    });
    return out.join("");
  }
  function renderRunsInline(container) {
    var out = [];
    Array.prototype.forEach.call(container.childNodes, function (n) {
      if (n.nodeType === 1 && n.localName === "r") out.push(renderRun(n));
    });
    return out.join("");
  }
  function renderRun(r) {
    var rPr = first(r, "rPr");
    var text = els(r, "t").map(function (t) { return t.textContent; }).join("");
    var brCount = els(r, "br").length;
    var frag = escapeHtml(text) + (brCount ? "<br>".repeat(brCount) : "");
    if (!frag) return "";
    if (rPr && first(rPr, "b")) frag = "<strong>" + frag + "</strong>";
    if (rPr && first(rPr, "i")) frag = "<em>" + frag + "</em>";
    if (rPr && first(rPr, "u")) frag = "<u>" + frag + "</u>";
    // Any direct (manual) formatting still present on the run — e.g. because
    // "estilo uniforme" is switched off — is shown as-is, warts and all, so
    // the preview stays honest about what the exported file will contain.
    var styleParts = [];
    if (rPr) {
      var rFonts = first(rPr, "rFonts");
      var fontName = rFonts && rFonts.getAttribute("w:ascii");
      if (fontName) styleParts.push('font-family:"' + fontName + '"');
      var sz = first(rPr, "sz");
      var half = sz && parseInt(sz.getAttribute("w:val"), 10);
      if (half) styleParts.push("font-size:" + (half / 2) + "pt");
      var color = first(rPr, "color");
      var colorVal = color && color.getAttribute("w:val");
      if (colorVal && colorVal !== "auto") styleParts.push("color:#" + colorVal);
    }
    var styleAttr = styleParts.length ? ' style="' + styleParts.join(";") + '"' : "";
    return '<span class="pv-run"' + styleAttr + ">" + frag + "</span>";
  }
  function renderImage(drawing, state) {
    var blip = drawing.getElementsByTagName("a:blip")[0] || drawing.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", "blip")[0];
    if (!blip) return "";
    var rId = blip.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed") || blip.getAttribute("r:embed");
    var mediaPath = rId && state.relIdToMedia[rId];
    var url = mediaPath && state.mediaUrls[mediaPath];
    return url ? '<p class="pv-image"><img src="' + url + '" alt=""></p>' : "";
  }
  function renderTable(tbl) {
    var rows = els(tbl, "tr").map(function (tr) {
      var cells = els(tr, "tc").map(function (tc) {
        var text = els(tc, "t").map(function (t) { return escapeHtml(t.textContent); }).join(" ");
        return "<td>" + text + "</td>";
      }).join("");
      return "<tr>" + cells + "</tr>";
    }).join("");
    return '<table class="pv-table"><tbody>' + rows + "</tbody></table>";
  }

  global.PulidocEngine = {
    load: load,
    process: process,
    toFilesMap: toFilesMap,
    renderPreviewHtml: renderPreviewHtml
  };
})(typeof window !== "undefined" ? window : globalThis);
