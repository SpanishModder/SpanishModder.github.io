/*!
 * PulidocZip — minimal ZIP reader/writer for .docx files.
 * No external dependencies. Uses native CompressionStream/DecompressionStream
 * ("deflate-raw") to read entries, and writes everything back using STORE
 * (no compression) for maximum structural safety and simplicity.
 */
(function (global) {
  "use strict";

  // ---------- CRC32 (standard table-based implementation) ----------
  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ---------- little helpers to read little-endian numbers ----------
  function u16(view, off) { return view.getUint16(off, true); }
  function u32(view, off) { return view.getUint32(off, true); }

  async function inflateRaw(bytes) {
    var ds = new DecompressionStream("deflate-raw");
    var writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    var out = [];
    var reader = ds.readable.getReader();
    while (true) {
      var res = await reader.read();
      if (res.done) break;
      out.push(res.value);
    }
    var total = out.reduce(function (a, b) { return a + b.length; }, 0);
    var merged = new Uint8Array(total);
    var pos = 0;
    for (var i = 0; i < out.length; i++) { merged.set(out[i], pos); pos += out[i].length; }
    return merged;
  }

  function supported() {
    return typeof DecompressionStream !== "undefined" && typeof CompressionStream !== "undefined";
  }

  /**
   * Reads a .docx (ZIP) ArrayBuffer and returns a Map<path, Uint8Array>
   * of every entry, fully decompressed.
   */
  async function read(arrayBuffer) {
    var bytes = new Uint8Array(arrayBuffer);
    var view = new DataView(arrayBuffer);

    // Locate End Of Central Directory (EOCD) by scanning from the end.
    var eocdSig = 0x06054b50;
    var eocdOffset = -1;
    var maxBack = Math.min(bytes.length, 66000); // EOCD + max comment length
    for (var i = bytes.length - 22; i >= bytes.length - maxBack && i >= 0; i--) {
      if (u32(view, i) === eocdSig) { eocdOffset = i; break; }
    }
    if (eocdOffset === -1) throw new Error("ZIP inválido: no se encontró el índice del documento.");

    var totalEntries = u16(view, eocdOffset + 10);
    var cdOffset = u32(view, eocdOffset + 16);

    var files = new Map();
    var pos = cdOffset;
    var decoder = new TextDecoder("utf-8");

    for (var e = 0; e < totalEntries; e++) {
      var sig = u32(view, pos);
      if (sig !== 0x02014b50) throw new Error("ZIP inválido: directorio central corrupto.");
      var method = u16(view, pos + 10);
      var compSize = u32(view, pos + 20);
      var uncompSize = u32(view, pos + 24);
      var nameLen = u16(view, pos + 28);
      var extraLen = u16(view, pos + 30);
      var commentLen = u16(view, pos + 32);
      var localHeaderOffset = u32(view, pos + 42);
      var nameBytes = bytes.subarray(pos + 46, pos + 46 + nameLen);
      var name = decoder.decode(nameBytes);

      // Read the local header to find where the actual file data starts
      // (local header field lengths can differ slightly from the central one).
      var lsig = u32(view, localHeaderOffset);
      if (lsig !== 0x04034b50) throw new Error("ZIP inválido: cabecera local corrupta en " + name);
      var lNameLen = u16(view, localHeaderOffset + 26);
      var lExtraLen = u16(view, localHeaderOffset + 28);
      var dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
      var compBytes = bytes.subarray(dataStart, dataStart + compSize);

      var fileBytes;
      if (!name.endsWith("/")) { // skip directory entries
        if (method === 0) {
          fileBytes = compBytes.slice();
        } else if (method === 8) {
          fileBytes = await inflateRaw(compBytes);
        } else {
          throw new Error("Método de compresión no soportado en " + name);
        }
        if (fileBytes.length !== uncompSize) {
          // Not fatal — some encoders report sizes oddly — trust actual bytes.
        }
        files.set(name, fileBytes);
      }

      pos += 46 + nameLen + extraLen + commentLen;
    }

    return files;
  }

  // ---------- writer ----------
  function dosDateTime() {
    // Fixed, valid DOS date/time — the exact value doesn't matter to Word.
    var time = (12 << 11) | (0 << 5) | 0; // 12:00:00
    var date = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01
    return { time: time, date: date };
  }

  /**
   * Builds a .docx (ZIP, STORE method) Blob from a Map<path, Uint8Array>.
   */
  function write(filesMap) {
    var dt = dosDateTime();
    var encoder = new TextEncoder();
    var localChunks = [];
    var centralChunks = [];
    var offset = 0;
    var entries = Array.from(filesMap.entries());

    entries.forEach(function (entry) {
      var name = entry[0];
      var data = entry[1];
      var nameBytes = encoder.encode(name);
      var crc = crc32(data);
      var size = data.length;

      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);         // version needed
      local.setUint16(6, 0x0800, true);     // general flag: UTF-8 names
      local.setUint16(8, 0, true);          // method: store
      local.setUint16(10, dt.time, true);
      local.setUint16(12, dt.date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, size, true);      // compressed size
      local.setUint32(22, size, true);      // uncompressed size
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);         // extra length

      localChunks.push(new Uint8Array(local.buffer), nameBytes, data);

      var central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);        // version made by
      central.setUint16(6, 20, true);        // version needed
      central.setUint16(8, 0x0800, true);    // general flag
      central.setUint16(10, 0, true);        // method: store
      central.setUint16(12, dt.time, true);
      central.setUint16(14, dt.date, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, size, true);
      central.setUint32(24, size, true);
      central.setUint16(28, nameBytes.length, true);
      central.setUint16(30, 0, true);        // extra length
      central.setUint16(32, 0, true);        // comment length
      central.setUint16(34, 0, true);        // disk number start
      central.setUint16(36, 0, true);        // internal attrs
      central.setUint32(38, 0, true);        // external attrs
      central.setUint32(42, offset, true);   // offset of local header

      centralChunks.push(new Uint8Array(central.buffer), nameBytes);

      offset += 30 + nameBytes.length + size;
    });

    var centralStart = offset;
    var centralSize = 0;
    centralChunks.forEach(function (c) { centralSize += c.length; });

    var eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(4, 0, true);
    eocd.setUint16(6, 0, true);
    eocd.setUint16(8, entries.length, true);
    eocd.setUint16(10, entries.length, true);
    eocd.setUint32(12, centralSize, true);
    eocd.setUint32(16, centralStart, true);
    eocd.setUint16(20, 0, true);

    var allChunks = localChunks.concat(centralChunks, [new Uint8Array(eocd.buffer)]);
    return new Blob(allChunks, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  global.PulidocZip = { read: read, write: write, supported: supported, crc32: crc32 };
})(typeof window !== "undefined" ? window : globalThis);
