/* =========================================================
   LÍNEA DE VISIÓN (la usan el host y el cliente)
   ========================================================= */

const _wallCache = new WeakMap();

/*
 * Convierte cada muro con grosor en un rectángulo opaco.
 * Devuelve sus cuatro aristas para calcular las sombras.
 *
 * Cada muro se prolonga medio grosor en los extremos,
 * ayudando a cerrar las uniones entre segmentos.
 */
function wallsOf(M) {
  let W = _wallCache.get(M);
  if (W) return W;

  W = [];

  for (const w of M.walls) {
    if (!w.v) continue;

    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const len = Math.hypot(dx, dy);

    if (len < 1e-9) continue;

    const ux = dx / len;
    const uy = dy / len;
    const e = Math.max(0, w.t || 0) / 2;

    // Extensión longitudinal y perpendicular.
    const tx = ux * e;
    const ty = uy * e;
    const nx = -uy * e;
    const ny = ux * e;

    // Cuatro esquinas del rectángulo del muro.
    const p = [
      [w.x1 - tx + nx, w.y1 - ty + ny],
      [w.x2 + tx + nx, w.y2 + ty + ny],
      [w.x2 + tx - nx, w.y2 + ty - ny],
      [w.x1 - tx - nx, w.y1 - ty - ny]
    ];

    // Sus cuatro aristas son los obstáculos visuales.
    for (let i = 0; i < 4; i++) {
      const a = p[i];
      const b = p[(i + 1) % 4];
      W.push([a[0], a[1], b[0], b[1]]);
    }
  }

  _wallCache.set(M, W);
  return W;
}

/*
 * Intersección entre dos segmentos.
 * Devuelve la distancia sobre el rayo o Infinity.
 */
function raySegmentDistance(ox, oy, dx, dy, s) {
  const ex = s[2] - s[0];
  const ey = s[3] - s[1];

  const qx = s[0] - ox;
  const qy = s[1] - oy;

  const den = dx * ey - dy * ex;

  if (Math.abs(den) < 1e-10) return Infinity;

  const t = (qx * ey - qy * ex) / den;
  const u = (qx * dy - qy * dx) / den;

  if (t <= 1e-7 || u < -1e-9 || u > 1 + 1e-9) {
    return Infinity;
  }

  return t;
}

/* ¿Existe línea recta libre entre dos puntos? */
function _clear(W, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);

  if (len < 1e-9) return true;

  const ux = dx / len;
  const uy = dy / len;

  return !W.some(s =>
    raySegmentDistance(ax, ay, ux, uy, s) < len - 1e-6
  );
}

/* ¿El jugador A ve al jugador B? */
function los(M, a, b) {
  const W = wallsOf(M);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;

  const nx = -dy / len * 12;
  const ny = dx / len * 12;

  return [0, 1, -1].some(k =>
    _clear(W, a.x, a.y, b.x + nx * k, b.y + ny * k)
  );
}

/*
 * Polígono de visibilidad.
 * Dispara rayos hacia los vértices de los obstáculos,
 * ligeramente a ambos lados para cubrir las esquinas.
 */
function visPoly(ox, oy, R, W) {
  const near = W.filter(s => {
    const ex = s[2] - s[0];
    const ey = s[3] - s[1];
    const len2 = ex * ex + ey * ey;

    if (len2 < 1e-12) return false;

    const t = Math.max(0, Math.min(1,
      ((ox - s[0]) * ex + (oy - s[1]) * ey) / len2
    ));

    const px = s[0] + ex * t;
    const py = s[1] + ey * t;

    return Math.hypot(px - ox, py - oy) <= R + 1;
  });

  const angles = [];

  // Alcance circular.
  for (let i = 0; i < 128; i++) {
    angles.push(i / 128 * Math.PI * 2 - Math.PI);
  }

  // Rayos adicionales alrededor de cada vértice.
  const EPS = 1e-5;

  for (const s of near) {
    for (const i of [0, 2]) {
      const a = Math.atan2(s[i + 1] - oy, s[i] - ox);
      angles.push(a - EPS, a, a + EPS);
    }
  }

  angles.sort((a, b) => a - b);

  const P = [];

  for (const a of angles) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let t = R;

    for (const s of near) {
      const d = raySegmentDistance(ox, oy, dx, dy, s);

      if (d < t) t = d;
    }

    P.push([ox + dx * t, oy + dy * t]);
  }

  return P;
}

/*
 * Dibuja la sombra fuera del polígono y el degradado
 * dentro del alcance visible.
 */
function drawVision(ox, oy, R, hw, hh) {
  const W = wallsOf(MAP);
  const P = visPoly(ox, oy, R, W);

  const SH = 0.88;
  const B = Math.max(hw, hh) * 2 + R;

  // Oscurecer el exterior, dejando libre el polígono.
  g.beginPath();
  g.rect(ox - B, oy - B, B * 2, B * 2);

  if (P.length > 0) {
    g.moveTo(P[0][0], P[0][1]);

    for (let i = 1; i < P.length; i++) {
      g.lineTo(P[i][0], P[i][1]);
    }

    g.closePath();
  }

  g.fillStyle = `rgba(5,8,16,${SH})`;
  g.fill("evenodd");

  // Degradado dentro de la zona visible.
  if (P.length > 0) {
    g.save();

    g.beginPath();
    g.moveTo(P[0][0], P[0][1]);

    for (let i = 1; i < P.length; i++) {
      g.lineTo(P[i][0], P[i][1]);
    }

    g.closePath();
    g.clip();

    const gr = g.createRadialGradient(
      ox, oy, R * 0.45,
      ox, oy, R
    );

    gr.addColorStop(0, "rgba(68, 68, 68, 0)");
    gr.addColorStop(1, `rgba(5,8,16,${SH})`);

    g.fillStyle = gr;
    g.fillRect(ox - R, oy - R, R * 2, R * 2);

    g.restore();
  }
}