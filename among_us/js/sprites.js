/* =========================================================
   SPRITES CON RECOLOREADO + ESTADOS DE ANIMACIÓN
   ========================================================= */

/*
 * Cómo se colorean las hojas de sprites (el "shader"):
 *   rojo  (255,16,16)  → color del jugador
 *   azul  (0,0,255)    → color del jugador sombreado (color × cfg.shade)
 *   verde (0,255,0)    → color del visor
 *   verde (0,126,0)    → sombra del visor (se controla con cfg.visorShadow)
 * Cada canal funciona como una máscara: los tonos intermedios (bordes suavizados, contornos
 * oscuros como (0,0,44) o (0,38,0)) se mezclan solos. Los blancos y grises se dejan como están.
 *
 * Canvas 2D no tiene shaders, así que el recoloreado se hace UNA vez por hoja y color con un
 * fragment shader de WebGL (o por CPU si no hay WebGL) y el resultado se guarda en caché.
 * Después, dibujar es un simple drawImage. OJO: el juego tiene que servirse por http(s)
 * (no con file://), porque el navegador no deja leer los píxeles de imágenes locales.
 */
const Sprites = (() => {
  /* ---------------------------------------------------------
     CONFIGURACIÓN
     --------------------------------------------------------- */
  const cfg = {
    scale: 0.22,            // unidades del mundo por píxel del sprite
    anchor: [0.455, 0.51],  // punto del fotograma (0..1) que coincide con la posición (x, y) del jugador
    nameY: -27,             // altura del nombre respecto a la posición del jugador
    visor: "#a9e6f7",       // color del visor (el verde del sprite)
    visorShadow: 0.72,      // luminosidad del tono medio del visor (su sombra): 0 = negro, 1 = igual que el visor
    shade: 0.68             // el azul del sprite = color del jugador × shade
  };

  /* ---------------------------------------------------------
     ANIMACIONES
     --------------------------------------------------------- */
  // src     ruta de la hoja de sprites
  // frames  número de fotogramas
  // cols    columnas de la hoja (por defecto, todos en una fila)
  // fps     fotogramas por segundo
  // loop    true = se repite; false = se reproduce una vez
  // next    animación a la que pasa al terminar (solo si loop es false)
  // scale / anchor / fw / fh: opcionales, para sobrescribir la configuración en esa animación
  // size    ancho del fotograma en unidades del mundo (alternativa a scale: se adapta solo al tamaño de la hoja)
  // raw     true = se dibuja tal cual, sin recolorear (rendijas, flechas, iconos...)
  // rot     giro fijo en radianes (por ejemplo Math.PI / 2 si tu flecha apunta hacia arriba en vez de a la derecha)
  const ANIMS = {
    idle:  { src: "assets/sprites/player/idle.png",  frames: 1,  fps: 1 },
    walk:  { src: "assets/sprites/player/walk.png",  frames: 13, fps: 24 },
    ghost: { src: "assets/sprites/player/ghost.png", frames: 8,  fps: 12 },
    death: { src: "assets/sprites/player/death.png", frames: 41, fps: 20, loop: false },

    vent:    { src: "assets/sprites/player/vent.png", frames: 7, fps: 20, loop: false },        // el jugador entra/sale
    ventobj: { src: "assets/sprites/vent.png",  frames: 7, fps: 9, loop: false, raw: true, size: 50, anchor: [0.5, 0.5] },  // la rendija abriéndose
    arrow:   { src: "assets/sprites/arrow.png", frames: 1, fps: 1,  raw: true, size: 26, anchor: [0.5, 0.5] }                  // flecha hacia otra rendija (debe apuntar a la derecha)
    // Ejemplo de animación de una sola pasada que vuelve a idle:
    // kill: { src: "assets/sprites/player/kill.png", frames: 8, fps: 16, loop: false, next: "idle" }
  };

  /* ---------------------------------------------------------
     CARGA DE HOJAS
     --------------------------------------------------------- */
  let uid = 0;

  function load(def) {
    if (def._img) return def;
    def.id = ++uid; def.frames ||= 1; def.cols ||= def.frames;
    const im = def._img = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      def.fw ||= im.naturalWidth / def.cols;
      def.fh ||= im.naturalHeight / Math.ceil(def.frames / def.cols);
      def.ok = true;
    };
    im.onerror = () => { def.bad = true; };
    im.src = def.src;
    return def;
  }

  /* ---------------------------------------------------------
     SHADER DE RECOLOREADO
     --------------------------------------------------------- */
  const VS = "attribute vec2 aPos; varying vec2 vUV;" +
    "void main(){ vUV = vec2(aPos.x * .5 + .5, .5 - aPos.y * .5); gl_Position = vec4(aPos, 0., 1.); }";

  const FS = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    varying vec2 vUV;
    uniform sampler2D uTex;
    uniform vec3 uMain, uShade, uVisor;
    uniform float uVS;
    const float AT = 0.494;                        // nivel del verde de "sombra" en el sprite (126/255)
    void main() {
      vec4 s = texture2D(uTex, vUV);
      float n = min(s.r, min(s.g, s.b));           // parte neutra: blancos, grises y negro
      float w = smoothstep(0.10, 0.22, n);         // 0 = solo el sangrado del color puro, 1 = neutro de verdad
      vec3 k = (s.rgb - n) / mix(1.0 - n, 1.0, w); // parte coloreada: x = rojo, y = verde, z = azul
      float g = k.y < AT ? k.y * (uVS / AT) : mix(uVS, 1.0, (k.y - AT) / (1.0 - AT));
      gl_FragColor = vec4(w * n + k.x * uMain + g * uVisor + k.z * uShade, s.a);
    }`;

  /* La misma fórmula en JavaScript (alternativa cuando WebGL no está disponible) */
  const smooth = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
  function shadePx(r, g, b, p) {
    const AT = 126 / 255, n = Math.min(r, g, b), w = smooth(.10, .22, n), d = 1 - n + n * w;
    const kr = (r - n) / d, kg = (g - n) / d, kb = (b - n) / d;
    const gk = kg < AT ? kg * (p.vs / AT) : p.vs + (1 - p.vs) * (kg - AT) / (1 - AT);
    return [0, 1, 2].map(i => Math.min(1, Math.max(0, w * n + kr * p.main[i] + gk * p.visor[i] + kb * p.shade[i])));
  }

  let GL;   // undefined = sin inicializar, null = no disponible
  function glInit() {
    const cvs = document.createElement("canvas");
    const gl = cvs.getContext("webgl", { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!gl) return null;
    const sh = (t, s) => {
      const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
      return o;
    };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "aPos");
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const u = {}; ["uTex", "uMain", "uShade", "uVisor", "uVS"].forEach(n => u[n] = gl.getUniformLocation(pr, n));
    return { cvs, gl, u };
  }

  function recolorGL(def, p) {
    if (GL === undefined) { try { GL = glInit(); } catch (e) { console.warn("Sprites: shader WebGL no disponible, uso la CPU.", e); GL = null; } }
    if (!GL) return null;
    const { cvs, gl, u } = GL, im = def._img, w = im.naturalWidth, h = im.naturalHeight;
    if (Math.max(w, h) > gl.getParameter(gl.MAX_TEXTURE_SIZE)) return null;

    if (!def._tex) {                                   // la textura se sube una sola vez por hoja
      const t = def._tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
    }
    cvs.width = w; cvs.height = h; gl.viewport(0, 0, w, h);
    gl.bindTexture(gl.TEXTURE_2D, def._tex);
    gl.uniform1i(u.uTex, 0);
    gl.uniform3fv(u.uMain, p.main); gl.uniform3fv(u.uShade, p.shade); gl.uniform3fv(u.uVisor, p.visor);
    gl.uniform1f(u.uVS, p.vs);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const out = document.createElement("canvas"); out.width = w; out.height = h;
    out.getContext("2d").drawImage(cvs, 0, 0);         // se copia ya, antes de que el navegador limpie el buffer
    return out;
  }

  function recolorCPU(def, p) {
    const im = def._img, w = im.naturalWidth, h = im.naturalHeight;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, w, h), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      if (!a[i + 3]) continue;
      const o = shadePx(a[i] / 255, a[i + 1] / 255, a[i + 2] / 255, p);
      a[i] = o[0] * 255 + .5; a[i + 1] = o[1] * 255 + .5; a[i + 2] = o[2] * 255 + .5;
    }
    x.putImageData(d, 0, 0);
    return c;
  }

  /* Paleta de un jugador a partir de su color */
  function rgb(color) {
    const c = document.createElement("canvas").getContext("2d");
    c.fillStyle = "#ff00ff"; c.fillStyle = color;
    const m = /^#(..)(..)(..)$/.exec(c.fillStyle);
    return m ? [1, 2, 3].map(i => parseInt(m[i], 16) / 255) : [1, 0, 1];
  }
  const palette = color => {
    const main = rgb(color);
    return { main, shade: main.map(v => v * cfg.shade), visor: rgb(cfg.visor), vs: cfg.visorShadow };
  };

  /* Hoja recoloreada (en caché por hoja + colores) */
  const cache = new Map();
  let warned = false;

  function tint(def, color, cpu) {
    if (!def.ok || def.bad) return null;
    if (def.raw || !color) return def._img;              // sin recolorear
    const key = [def.id, color, cfg.visor, cfg.visorShadow, cfg.shade, cpu ? "c" : "g"].join("|");
    if (cache.has(key)) return cache.get(key);
    let out = null;
    try {
      const p = palette(color);
      out = (cpu ? null : recolorGL(def, p)) || recolorCPU(def, p);
    } catch (e) {
      if (!warned) { warned = true; console.warn("Sprites: no se pudo recolorear (¿abres el juego con file://? Sírvelo por http).", e); }
      def.bad = true;
    }
    cache.set(key, out);
    return out;
  }

  /* ---------------------------------------------------------
     ESTADOS DE ANIMACIÓN
     --------------------------------------------------------- */
  // El estado de cada personaje vive en v.an. Para cambiarlo basta una llamada:
  //   Sprites.set(v, "walk")                                    cambia de animación
  //   Sprites.set(v, "walk", { fps: 20 })                       …con otra velocidad
  //   Sprites.set(v, "kill", { restart: true })                 …reiniciándola aunque ya esté sonando
  //   Sprites.set(v, { src: "x.png", frames: 6, fps: 9 })       …con una hoja definida al vuelo
  //   Sprites.fps(v, 24)                                        cambia solo la velocidad de la actual
  // Las animaciones de una sola pasada (loop: false) quedan "bloqueadas" hasta terminar: el estado
  // automático (idle/walk/ghost) no las interrumpe. Al acabar pasan a next o devuelven el control.
  const missing = {};
  function set(v, a, o = {}) {
    const raw = typeof a === "string" ? ANIMS[a] : a;
    if (!raw) {                                  // nombre sin registrar: avisa una vez y no rompe el juego
      if (!missing[a]) { missing[a] = 1; console.warn('Sprites: la animación "' + a + '" no está registrada en ANIMS.'); }
      return;
    }
    const def = load(raw);
    const name = typeof a === "string" ? a : (a.name || a.src), cur = v.an;
    if (cur && cur.name === name && !o.restart) { if (o.fps != null) cur.fps = o.fps; return; }
    const loop = o.loop ?? def.loop ?? true;
    v.an = {
      name, def, pos: 0, frame: 0, done: false, loop,
      fps: o.fps ?? def.fps ?? 10,               // fps: 0 deja la animación congelada en su primer fotograma
      next: o.next ?? def.next,
      rev: !!o.reverse,                          // reverse: true = se reproduce del último fotograma al primero
      lock: o.lock ?? !loop
    };
  }

  /* Estado automático: respeta las animaciones bloqueadas y usa idle si la hoja pedida no existe */
  function auto(v, name) {
    if (v.an && v.an.lock) return;
    const d = ANIMS[name];
    set(v, d && !d.bad ? name : "idle");
  }

  function fps(v, n) { if (v.an) v.an.fps = n; }

  function update(v, dt) {
    const a = v.an;
    if (!a) return;
    a.pos += dt * a.fps;                       // posición fraccionaria: cambiar los fps no hace saltar el fotograma
    const n = a.def.frames, f = Math.floor(a.pos);
    let k;
    if (a.loop) k = f % n;
    else if (f >= n) {
      k = n - 1; a.done = true; a.lock = false;
      if (a.next) set(v, a.next);
    } else k = f;
    a.frame = a.rev ? n - 1 - k : k;
  }

  /* ---------------------------------------------------------
     DIBUJADO
     --------------------------------------------------------- */
  // o.dir    1 = mira a la derecha, -1 = a la izquierda (la hoja debe estar dibujada mirando a la derecha)
  // o.rot    giro en radianes     o.scale  multiplicador de tamaño     o.alpha  opacidad (0..1)
  // color    null/undefined = se dibuja sin recolorear
  // Devuelve false si la hoja todavía no está lista (para poder dibujar otra cosa mientras tanto).
  function draw(g, v, x, y, color, o = {}) {
    const a = v.an;
    if (!a) return false;
    const def = a.def, sheet = tint(def, color);
    if (!sheet) return false;
    const fw = def.fw, fh = def.fh;
    const sc = (def.size ? def.size / fw : def.scale ?? cfg.scale) * (o.scale ?? 1), [ax, ay] = def.anchor ?? cfg.anchor;
    const col = a.frame % def.cols, row = Math.floor(a.frame / def.cols);

    g.save();
    g.translate(x, y);
    g.rotate((o.rot ?? 0) + (def.rot ?? 0));
    g.scale(o.dir ?? 1, 1);
    if (o.alpha != null) g.globalAlpha *= o.alpha;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(sheet, col * fw, row * fh, fw, fh, -ax * fw * sc, -ay * fh * sc, fw * sc, fh * sc);
    g.restore();
    return true;
  }

  /* Registra o redefine una animación */
  function add(name, def) { ANIMS[name] = def; load(def); }

  /* Libera la memoria de las hojas recoloreadas (por ejemplo, al volver al lobby) */
  function clear() { cache.clear(); }

  Object.values(ANIMS).forEach(load);   // empieza a cargar todas al arrancar

  return { cfg, ANIMS, add, set, auto, fps, update, draw, tint, clear };
})();