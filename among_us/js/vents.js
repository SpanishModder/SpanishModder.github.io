/* =========================================================
   RENDIJAS (VENTS): parte del cliente
   ========================================================= */

/*
 * Solo las ven y usan los impostores vivos: el servidor únicamente les envía S.vents.
 * Estado de rendija de cada jugador (v.vs, lo manda el servidor en S.pos y en S.me):
 *   0 = normal   1 = entrando (animación "vent")   2 = dentro (invisible)   3 = saliendo (animación "vent")
 *
 * Este archivo se carga DESPUÉS de client.js (usa cv, g, S, send y dist) y antes del primer fotograma.
 */
const Vents = (() => {
  const RANGE = 70;            // distancia para poder entrar (igual que VENT_RANGE en host.js)
  const ARROW_R = 46;          // distancia de las flechas al centro de la rendija
  const HIT = 26;              // radio de clic de una flecha
  const EXIT_REVERSE = false;  // true = al salir, la animación "vent" se reproduce al revés

  const VV = {};               // estado visual (animación) de cada rendija, por id
  const ARROW = {};            // estado de animación compartido por todas las flechas
  const mouse = { x: -1, y: -1 };
  let arrows = [];             // flechas de este fotograma: { to, x, y, a, hot }
  let cam = { x: 0, y: 0, z: 1 };

  const list = () => (S && S.vents) || [];
  const byId = id => list().find(t => t.id === id);
  const toWorld = (sx, sy) => ({ x: (sx - cv.width / 2) / cam.z + cam.x, y: (sy - cv.height / 2) / cam.z + cam.y });

  /* Cámara del fotograma actual (para convertir clics de pantalla a coordenadas del mundo) */
  function setCam(c, zoom) { cam = { x: c.x, y: c.y, z: zoom }; }

  /* Rendija más cercana dentro del alcance, o null */
  function nearest(P) {
    return list().reduce((b, t) => dist(P, t) < RANGE && (!b || dist(P, t) < dist(P, b)) ? t : b, null);
  }

  /* El servidor cambia el estado de rendija de un jugador: arranca la animación */
  function onState(v, vs) {
    v.vs = vs;
    if (vs !== 1 && vs !== 3) return;
    if (!Sprites.ANIMS.vent || Sprites.ANIMS.vent.bad) return;           // sin hoja "vent": sigue con su animación normal
    Sprites.set(v, "vent", { restart: true, reverse: vs === 3 && EXIT_REVERSE });

    const t = list().reduce((b, t) => !b || dist(v, t) < dist(v, b) ? t : b, null);   // la tapa también se abre
    if (t && dist(v, t) < 140) Sprites.set(VV[t.id] || (VV[t.id] = {}), "ventobj", { restart: true });
  }

  /* Dibuja las rendijas (debajo de cuerpos y jugadores) */
  function drawVents(dt, c, hw, hh) {
    list().forEach(t => {
      if (Math.abs(t.x - c.x) > hw + 60 || Math.abs(t.y - c.y) > hh + 60) return;
      const vt = VV[t.id] || (VV[t.id] = {});
      if (!vt.an) Sprites.set(vt, "ventobj", { fps: 0 });                          // cerrada: fotograma 0
      Sprites.update(vt, dt);
      if (vt.an && vt.an.done) Sprites.set(vt, "ventobj", { restart: true, fps: 0 }); // terminó de abrirse: se cierra
      Sprites.draw(g, vt, t.x, t.y)
    });
  }

  /* Flechas hacia las rendijas conectadas (solo mientras el jugador está dentro de una) */
  function drawArrows(dt) {
    arrows = [];
    const me = S.me, cur = me.vs === 2 ? byId(me.vent) : null;
    if (cur) {
      Sprites.set(ARROW, "arrow"); Sprites.update(ARROW, dt);
      const m = toWorld(mouse.x, mouse.y);
      cur.links.forEach(id => {
        const t = byId(id);
        if (!t) return;
        const a = Math.atan2(t.y - cur.y, t.x - cur.x);
        const x = cur.x + Math.cos(a) * ARROW_R, y = cur.y + Math.sin(a) * ARROW_R;
        const hot = Math.hypot(x - m.x, y - m.y) < HIT;
        arrows.push({ to: id, x, y, a, hot });
        
        Sprites.draw(g, ARROW, x, y, null, { rot: a, scale: hot ? 1.25 : 1, alpha: hot ? 1 : 0.85 })
      });
    }
    const want = arrows.some(a => a.hot) ? "pointer" : "";
    if (cv.style.cursor !== want) cv.style.cursor = want;
  }

  /* Teclado: W/A/S/D o flechas eligen la flecha que apunta más en esa dirección */
  function key(k) {
    const d = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] }[k];
    if (!d || !arrows.length || !S || S.me.vs !== 2) return false;
    let best = null, bd = 0.5;                                  // como máximo 60° de diferencia
    arrows.forEach(a => { const dot = Math.cos(a.a) * d[0] + Math.sin(a.a) * d[1]; if (dot > bd) { bd = dot; best = a; } });
    if (best) send({ t: "vgo", to: best.to });
    return true;
  }

  /* Ratón: clic sobre una flecha para viajar */
  cv.addEventListener("pointermove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  cv.addEventListener("pointerdown", e => {
    if (!arrows.length) return;
    const m = toWorld(e.clientX, e.clientY), a = arrows.find(a => Math.hypot(a.x - m.x, a.y - m.y) < HIT);
    if (a) send({ t: "vgo", to: a.to });
  });

  return { RANGE, setCam, nearest, onState, drawVents, drawArrows, key };
})();