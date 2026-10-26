/* =========================================================
   CLIENTE / INTERFAZ
   ========================================================= */

/* ---------------------------------------------------------
   UTILIDADES DOM
   --------------------------------------------------------- */

const $ = s => document.querySelector(s);

const esc = s =>
  String(s).replace(
    /[&<>"]/g,
    c => "&#" + c.charCodeAt(0) + ";"
  );

/* ---------------------------------------------------------
   CANVAS
   --------------------------------------------------------- */

const cv = $("#cv");
const g = cv.getContext("2d");

/* ---------------------------------------------------------
   ESTADO DEL CLIENTE
   --------------------------------------------------------- */

let ws;
let S = null;
let MAP = null;
let tok = localStorage.hb || "";
let V = {};
let keys = {};
let task = null;
let lastIn = "";
let ctx = {};
let iv;
let hideHUD = false;

/* ---------------------------------------------------------
   UTILIDADES DEL CLIENTE
   --------------------------------------------------------- */

const send = o => {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(o));
  }
};

const html = (el, h) => {
  if (el._h !== h) {
    el._h = h;
    el.innerHTML = h;
  }
};

const show = (id, v) => {
  $("#" + id).hidden = !v;
};

const err = m => {
  if (m != "") {
    $("#err").hidden = false;
  }

  $("#err").textContent = m || "";

  setTimeout(function () {
    $("#err").hidden = true;
  }, 2000);
};

const dist = (a, b) =>
  Math.hypot(
    a.x - b.x,
    a.y - b.y
  );

/* =========================================================
   PEER / CONEXIÓN
   ========================================================= */

const ID = c => "hullbreach-" + c;

const AL = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

let peer;
let conn;
let room = localStorage.hbRoom || "";
let isHost = false;
let tries = 0;
let lt = 0;

/* ---------------------------------------------------------
   MENSAJES DEL SERVIDOR
   --------------------------------------------------------- */

function onmsg(e) {
  const m = JSON.parse(e.data);

  /* Saludo inicial */

  if (m.t === "hi") {
    tok = m.tok;
    room = m.code;
    MAP = m.map;

    if (!isHost) {
      localStorage.hb = tok;
      localStorage.hbRoom = room;
    }
  }

  /* Estado de la partida */

  else if (m.t === "s") {
    if (m.same) {
      if (!S) return;

      m.ros = S.ros;
      m.set = S.set;
      m.chat = S.chat;
      m.vents = S.vents;
    }

    m.at = performance.now();
    S = m;
    ui();
  }

  /* Error */

  else if (m.t === "err") {
    err(m.m);
    $("#err2").textContent = m.m;
  }

  /* Sala inexistente */

  else if (m.t === "noroom") {
    tok = "";

    localStorage.removeItem("hb");
    localStorage.removeItem("hbRoom");
  }
}

/* =========================================================
   CREAR PARTIDA COMO HOST
   ========================================================= */

/*
 * Este navegador ejecuta también el servidor autoritativo.
 * La conexión del propio host se realiza mediante un socket
 * local simulado.
 */

function hostGame(name) {
  const code = Array.from(
    { length: 4 },
    () => AL[Math.random() * AL.length | 0]
  ).join("");

  if (peer) {
    try {
      peer.destroy();
    } catch (e) {}
  }

  peer = new Peer(ID(code), {
    config: {
      'iceServers': [
        {
          "urls": [
            "stun:stun.cloudflare.com:3478"
          ]
        },
        {
          "urls": [
            "turn:turn.cloudflare.com:3478?transport=udp",
            "turn:turn.cloudflare.com:443?transport=udp",
            "turn:turn.cloudflare.com:3478?transport=tcp",
            "turn:turn.cloudflare.com:80?transport=tcp",
            "turns:turn.cloudflare.com:5349?transport=tcp",
            "turns:turn.cloudflare.com:443?transport=tcp"
          ],
          "username": "bc91b63e2b5d759f8eb9f3b58062439e0a0e15893d76317d833265ad08d6631099ce7c7087caabb31ad3e1c386424e3e",
          "credential": "ebd71f1d3edbc2b0edae3cd5a6d82284aeb5c3b8fdaa9b8e3bf9cec683e0d45fe9f5b44e5145db3300f06c250a15b4a0"
        }
      ]
    }
  });

  peer.on("error", e => {
    if (e.type === "unavailable-id") {
      hostGame(name);
    } else {
      err(
        "Could not reach the matchmaking service (" +
        e.type +
        ")."
      );
    }
  });

  peer.on("open", () => {
    const h = {};

    isHost = true;

    ws = {
      readyState: 1,
      send: s => h.message && h.message(s)
    };

    Host.onConn({
      local: 1,
      readyState: 1,
      send: s => onmsg({ data: s }),
      close() {},
      on: (k, f) => h[k] = f
    });

    send({
      t: "create",
      name,
      code
    });
  });

  peer.on("connection", c => {
    const h = {};

    const sk = {
      readyState: 0,
      send: s => c.send(s),
      close: () => c.close(),
      on: (k, f) => h[k] = f
    };

    c.on("open", () => {
      sk.readyState = 1;
      Host.onConn(sk);
    });

    c.on("data", d => {
      h.message && h.message(d);
    });

    c.on("close", () => {
      sk.readyState = 3;

      h.close && h.close();
    });
  });
}

/* =========================================================
   UNIRSE A UNA PARTIDA
   ========================================================= */


function joinGame(code, then) {
  room = String(code).trim().toUpperCase();

  if (peer) {
    try {
      peer.destroy();
    } catch (e) {}
  }

  let finished = false;
  let connectionTimer;
  let responseTimer;

  const cleanup = () => {
    clearTimeout(connectionTimer);
    clearTimeout(responseTimer);
  };

  const fail = message => {
    if (finished) return;

    finished = true;
    cleanup();

    console.error("[JOIN] FAILED:", message);
    err(message);
  };

  peer = new Peer();

  connectionTimer = setTimeout(() => {
    fail("Connection timed out: PeerJS could not open the connection.");
  }, 15000);

  peer.on("open", id => {
    conn = peer.connect(ID(room), { reliable: true });

    conn.on("open", () => {
      if (finished) return;

      clearTimeout(connectionTimer);

      ws = {
        readyState: 1,
        send: s => conn.send(s)
      };

      tries = 0;

      // The host should respond after receiving the join message.
      responseTimer = setTimeout(() => {
        fail("Connected to host, but no response was received.");
      }, 10000);

      try {
        then();
      } catch (e) {
        console.error("[JOIN] Error sending initial message:", e);
        fail("Could not send the join message.");
      }
    });

    conn.on("data", d => {
      clearTimeout(responseTimer);

      try {
        onmsg({ data: d });
      } catch (e) {
        console.error("[JOIN] Error processing server message:", e);
        fail("Error processing the host response. Check the console.");
      }
    });

    conn.on("error", e => {
      console.error("[JOIN] Connection error:", e);
      fail("PeerJS data connection failed.");
    });

    conn.on("close", () => {
      console.warn("[JOIN] Connection closed");

      if (!finished) {
        fail("The connection to the host was closed.");
      } else {
        lost();
      }
    });
  });

  peer.on("error", e => {
    console.error("[JOIN] PeerJS error:", e.type, e);

    fail(
      e.type === "peer-unavailable"
        ? "Room not found. Check whether the host is online."
        : "PeerJS error: " + e.type
    );
  });

  peer.on("disconnected", () => {
    console.warn("[JOIN] Disconnected from the PeerJS signaling server");
  });
}

/* ---------------------------------------------------------
   CONEXIÓN PERDIDA / RECONEXIÓN
   --------------------------------------------------------- */

function lost() {
  S = null;
  ui();

  if (lt) {
    return;
  }

  if (tok && tries++ < 10) {
    lt = setTimeout(() => {
      lt = 0;

      joinGame(
        room,
        () =>
          send({
            t: "rejoin",
            tok
          })
      );
    }, 1500);
  } else {
    if (tok) {
      err("Lost connection to the host.");
    }

    tok = "";

    localStorage.removeItem("hb");
    localStorage.removeItem("hbRoom");
  }
}

const fresh = () => {
  tok = "";

  clearTimeout(lt);
  lt = 0;

  err("");
};

/* ---------------------------------------------------------
   RECONEXIÓN AUTOMÁTICA AL CARGAR
   --------------------------------------------------------- */

if (tok && room) {
  joinGame(
    room,
    () =>
      send({
        t: "rejoin",
        tok
      })
  );
}

/* =========================================================
   BOTONES DEL MENÚ
   ========================================================= */

const nm = () => $("#nm").value.trim();

/* Crear partida */

$("#bc").onclick = () => {
  if (!nm()) {
    return err("Enter a nickname");
  }

  fresh();
  hostGame(nm());
};

/* Unirse a partida */

$("#bj").onclick = () => {
  const c = $("#cd")
    .value
    .trim()
    .toUpperCase();

  if (!nm()) {
    return err("Enter a nickname");
  }

  if (c.length !== 4) {
    return err("Enter the 4-letter room code");
  }

  fresh();

  joinGame(
    c,
    () =>
      send({
        t: "join",
        name: nm(),
        code: c
      })
  );
};

/* Mostrar instrucciones */

$("#bh").onclick = () => {
  $("#how").hidden = !$("#how").hidden;
};

/* Copiar código */

$("#cp").onclick = () => {
  if (navigator.clipboard && S) {
    navigator.clipboard.writeText(S.code);
  }
};

/* Empezar */

$("#st").onclick = () => {
  $("#err2").textContent = "";

  send({
    t: "start"
  });
};

/* Salir */

$("#lv").onclick = () => {
  tok = "";

  localStorage.removeItem("hb");
  localStorage.removeItem("hbRoom");

  send({
    t: "leave"
  });

  setTimeout(
    () => location.reload(),
    150
  );
};

/* Configuración */

[
  "si",
  "sk",
  "sc",
  "sa"
].forEach(i => {
  $("#" + i).onchange = () => {
    send({
      t: "set",
      impostors: +$("#si").value,
      killCd: +$("#sk").value,
      confirm: $("#sc").checked,
      anon: $("#sa").checked
    });
  };
});

/* Jugar de nuevo */

$("#pa").onclick = () => {
  send({ t: "lobby" });
  send({ t: "start" });
};

/* Volver al lobby */

$("#rl").onclick = () =>
  send({
    t: "lobby"
  });

/* =========================================================
   VOTACIÓN
   ========================================================= */

$("#cards").onclick = e => {
  const c = e.target.closest("[data-v]");

  if (
    c &&
    S &&
    S.ph === "VOTING" &&
    S.me.alive
  ) {
    send({
      t: "vote",
      v:
        c.dataset.v === "skip"
          ? "skip"
          : +c.dataset.v
    });
  }
};

/* =========================================================
   CHAT
   ========================================================= */

const say = () => {
  const i = $("#ci");

  if (i.value.trim()) {
    send({
      t: "chat",
      x: i.value
    });
  }

  i.value = "";
};

$("#cs").onclick = say;

$("#ci").onkeydown = e => {
  if (e.key === "Enter") {
    say();
  }
};

/* =========================================================
   ACCIONES DEL JUGADOR
   ========================================================= */

$("#bu").onclick = () => act();
$("#br").onclick = () => doReport();
$("#bk").onclick = () => doKill();
$("#bv").onclick = () => doVent();
$("#tx").onclick = () => closeTask();

/* =========================================================
   CREACIÓN DE LA INTERFAZ
   ========================================================= */

function ui() {
  const ph = S ? S.ph : "";
  const G =
    ph === "STARTING" ||
    ph === "PLAYING";

  const M = [
    "DISCUSSION",
    "VOTING",
    "VOTE_RESULTS"
  ].includes(ph);

  /* Mostrar / ocultar pantallas */

  show("menu", !S);
  show("lobby", ph === "LOBBY");
  show("hud", G);
  show("meet", M);
  show("over", ph === "GAME_OVER");

  cv.style.display = G ? "block" : "none";

  inp();

  if (!S) {
    return;
  }

  if (!G && task) {
    closeTask();
  }

  const me = S.me;
  const host = S.host === me.id;

  const by = id => {
    const p = S.ros.find(p => p.id === id);
    return p ? p.name : "?";
  };

  const colOf = id =>
    (
      S.ros.find(p => p.id == id) || {}
    ).color;
  
  document.getElementById("map-img").src = me.role == "imp" ? "assets/images/map_imp.png" : "assets/images/map_crew.png"

  /* =======================================================
     LOBBY
     ======================================================= */

  if (ph === "LOBBY") {
    $("#lc").textContent = S.code;

    html(
      $("#pl"),
      S.ros
        .map(
          p =>
            `<div class="pc">
              <i style="background:${p.color}"></i>
              ${esc(p.name)}
              ${
                p.id === S.host
                  ? " <b>★ host</b>"
                  : ""
              }
              ${p.dc ? " …" : ""}
            </div>`
        )
        .join("")
    );

    const s = S.set;

    [
      ["si", s.impostors],
      ["sk", s.killCd]
    ].forEach(([i, v]) => {
      if (document.activeElement.id !== i) {
        $("#" + i).value = v;
      }
    });

    $("#sc").checked = s.confirm;
    $("#sa").checked = s.anon;

    [
      "si",
      "sk",
      "sc",
      "sa",
      "st"
    ].forEach(i => {
      $("#" + i).disabled = !host;
    });
  }

  /* =======================================================
     REUNIÓN / VOTACIÓN
     ======================================================= */

  if (M) {
    const m = S.mt;
    const r = S.res;
    const n = by(m.by).toUpperCase();

    $("#mh").textContent =
      m.reason === "body"
        ? n + " REPORTED A BODY"
        : "EMERGENCY MEETING CALLED BY " + n;

    $("#mp").textContent =
      ph === "DISCUSSION"
        ? "Discussion ends in"
        : ph === "VOTING"
          ? "Voting ends in"
          : "Back to the ship in";

    $("#rs").textContent =
      r
        ? (
            r.ej
              ? by(r.ej).toUpperCase() +
                " WAS EJECTED." +
                (
                  r.imp === null
                    ? ""
                    : r.imp
                      ? " They were an Impostor."
                      : " They were not an Impostor."
                )
              : "NO ONE WAS EJECTED."
          )
        : "";

    /* -----------------------------------------------------
       Crear tarjeta de jugador
       ----------------------------------------------------- */

    const card = (id, label, col) => {
      const sel = m.mine === id;

      const vs =
        r && r.votes
          ? Object.entries(r.votes)
              .filter(([k, v]) => v == id)
              .map(
                ([k]) =>
                  `<u style="background:${colOf(k)}"></u>`
              )
              .join("")
          : "";

      return `
        <div
          class="card${sel ? " sel" : ""}"
          data-v="${id}"
        >
          ${
            col
              ? `<i style="background:${col}"></i>`
              : ""
          }

          <span>${esc(label)}</span>

          ${
            !r &&
            id !== "skip" &&
            m.voted.includes(id)
              ? "<em>voted</em>"
              : ""
          }

          ${
            r
              ? `<b>${r.counts[id] || 0}</b>${vs}`
              : ""
          }
        </div>
      `;
    };

    html(
      $("#cards"),
      S.ros
        .map(p =>
          card(
            p.id,
            p.name,
            p.color
          ).replace(
            'class="card',
            'class="card' +
              (p.alive ? "" : " dead")
          )
        )
        .join("") +
        card("skip", "Skip vote")
    );

    /* -----------------------------------------------------
       Chat
       ----------------------------------------------------- */

    html(
      $("#log"),
      S.chat
        .map(
          c =>
            `<div class="${c.a ? "" : "gh"}">
              <b style="color:${c.c}">
                ${esc(c.n)}
              </b>:
              ${esc(c.x)}
            </div>`
        )
        .join("")
    );

    $("#log").scrollTop = 1e6;

    $("#gn").textContent =
      me.alive
        ? ""
        : "You are a ghost. Only other ghosts can read your messages.";
  }

  /* =======================================================
     FIN DE PARTIDA
     ======================================================= */

  if (ph === "GAME_OVER") {
    $("#ow").textContent =
      S.win.team === "imp"
        ? "IMPOSTORS WIN"
        : "CREWMATES WIN";

    $("#ow").className = S.win.team;
    $("#oy").textContent = S.win.why;

    html(
      $("#ot"),
      "<tr>" +
      "<th>Player" +
      "<th>Role" +
      "<th>Status" +
      "<th>Tasks" +
      "<th>Kills" +
      S.ros
        .map(
          p =>
            `<tr>
              <td>
                <b style="color:${p.color}">
                  ${esc(p.name)}
                </b>

              <td class="${p.role}">
                ${
                  p.role === "imp"
                    ? "Impostor"
                    : "Crewmate"
                }

              <td>
                ${
                  p.ej
                    ? "Ejected"
                    : p.alive
                      ? "Alive"
                      : "Dead"
                }

              <td>${p.td}/${p.ta}

              <td>${p.k}
            </tr>`
        )
        .join("")
    );

    $("#pa").disabled =
      $("#rl").disabled =
        !host;

    $("#oh").textContent =
      host
        ? ""
        : "Waiting for the host…";
  }
}

/* =========================================================
   CONTROLES DE TECLADO
   ========================================================= */

addEventListener("keydown", e => {
  if (
    e.target.tagName === "INPUT" ||
    e.target.tagName === "SELECT"
  ) {
    return;
  }

  const k = e.key.toLowerCase();

  if (
    " arrowup arrowdown arrowleft arrowright"
      .includes(k)
  ) {
    e.preventDefault();
  }

  keys[k] = 1;

  if (!e.repeat) Vents.key(k);

  if (k === "e") {
    act();
  }

  if (k === "q" || k === " ") {
    doKill();
  }

  if (k === "r") {
    doReport();
  }
  
  if (k === "v") {
    doVent();
  }

  if (k === "escape" && task) {
    closeTask();
  }

  if (k === "y") {
    hideHUD = !hideHUD;
  }

  inp();
});

addEventListener("keyup", e => {
  if (e.key != null) {
    delete keys[e.key.toLowerCase()];
  }
  inp();
});

addEventListener("blur", () => {
  keys = {};
  inp();
});

/* ---------------------------------------------------------
   ENTRADA DE MOVIMIENTO
   --------------------------------------------------------- */

function inp() {
  let dx = 0;
  let dy = 0;

  if (S && S.ph === "PLAYING" && !task) {
    dx =
      (
        keys.d ||
        keys.arrowright
          ? 1
          : 0
      ) -
      (
        keys.a ||
        keys.arrowleft
          ? 1
          : 0
      );

    dy =
      (
        keys.s ||
        keys.arrowdown
          ? 1
          : 0
      ) -
      (
        keys.w ||
        keys.arrowup
          ? 1
          : 0
      );
  }
  
  // map visibility
  const map = keys.m == 1;
  const setH = (id, v) => { const el = $("#" + id); if (el.hidden !== v) el.hidden = v; };
  setH("map-container", !map);
  ["act", "pgw", "tm"].forEach(id => setH(id, map));

  const s = dx + "," + dy;

  if (s !== lastIn) {
    lastIn = s;

    send({
      t: "in",
      dx,
      dy
    });
  }
}

/* =========================================================
   ACCIONES
   ========================================================= */

function act() {
  if (
    !S ||
    S.ph !== "PLAYING" ||
    task
  ) {
    return;
  }

  if (ctx.task) {
    openTask(ctx.task.id);
  } else if (ctx.btn) {
    send({ t: "emg" });
  }
}

function doKill() {
  if (
    S &&
    S.ph === "PLAYING" &&
    ctx.tgt &&
    S.me.kcd <= 0 &&
    !task && !S.me.vs
  ) {
    send({ t: "kill" });
  }
}

function doReport() {
  if (
    S &&
    S.ph === "PLAYING" &&
    ctx.body &&
    !task && !S.me.vs
  ) {
    send({ t: "report" });
  }
}

function doVent() {
  if (S.me.vs === 2) { send({ t: "vexit" }); return; }              // dentro de una rendija: salir
  if (S.me.vs) return;                                               // entrando o saliendo
  if (ctx.vent) { send({ t: "vent", id: ctx.vent.id }); }
}

/* ---------------------------------------------------------
   FINALIZAR TAREA
   --------------------------------------------------------- */

function fin(t) {
  const id = t.id;

  const w = Math.max(
    0,
    2100 - (Date.now() - t.t)
  );

  setTimeout(
    () =>
      send({
        t: "td",
        id
      }),
    w
  );

  setTimeout(closeTask, 800);
}

/* ---------------------------------------------------------
   CERRAR TAREA
   --------------------------------------------------------- */

function closeTask() {
  clearInterval(iv);

  task = null;

  show("task", 0);

  $("#tb").onclick = null;
  $("#tb").innerHTML = "";

  inp();
}

/* =========================================================
   BUCLE DE RENDERIZADO
   ========================================================= */

let last = performance.now();

function frame(now) {
  const dt = Math.min(
    0.1,
    (now - last) / 1000
  );

  last = now;

  if (S) {
    const left = Math.max(
      0,
      Math.ceil(
        (S.ms - (now - S.at)) / 1000
      )
    );

    $("#mt").textContent = left;

    $("#tm").textContent =
      S.ph === "PLAYING"
        ? "Room " + S.code
        : "";

    if (
      MAP &&
      (
        S.ph === "PLAYING" ||
        S.ph === "STARTING"
      )
    ) {
      draw(dt);
      hud();
    }
  }

  requestAnimationFrame(frame);
}

/* =========================================================
   HUD DEL JUEGO
   ========================================================= */

function hud() {

  const me = S.me;

  const mp = S.pos.find(
    p => p[0] === me.id
  );

  const ros = {};

  S.ros.forEach(
    p => ros[p.id] = p
  );

  const P = mp
    ? {
        x: mp[1],
        y: mp[2]
      }
    : {
        x: 0,
        y: 0
      };

  const imp = me.role === "imp";

  const rb = $("#rb");
  const hide = S.ph !== "STARTING" || keys.m == 1;
  if (rb.hidden !== hide) rb.hidden = hide;

  /* -------------------------------------------------------
     Elementos interactivos cercanos
     ------------------------------------------------------- */

  ctx = {
    task: me.tasks.filter(t => !t.done && dist(P, MAP.stations[t.id]) < 80)
      .reduce(
        (closest, t) =>
          !closest || dist(P, MAP.stations[t.id]) < dist(P, MAP.stations[closest.id])
            ? t
            : closest,
        null
      ),

    vent: imp && me.alive && !me.vs ? Vents.nearest(P) : null,

    btn:
      me.alive &&
      me.emg > 0 &&
      dist(P, MAP.button) < 105,

    body:
      me.alive &&
      S.bodies.some(
        b => dist(P, b) < 100
      ),

    tgt:
      imp &&
      me.alive &&
      S.pos.find(
        q =>
          q[3] &&
          q[0] !== me.id &&
          ros[q[0]] &&
          ros[q[0]].role !== "imp" &&
          dist(
            P,
            {
              x: q[1],
              y: q[2]
            }
          ) <= S.set.killRange
      )
  };

  if (hideHUD) {
    document.getElementById("hud").hidden = true;
    return;
  }

  /* -------------------------------------------------------
     Barra de tareas
     ------------------------------------------------------- */

  $("#pg").style.width =
    (
      S.prog[1]
        ? S.prog[0] /
          S.prog[1] *
          100
        : 0
    ) + "%";

  html(
    $("#tl"),
    `<b>
      TASKS ${
        S.prog[1]
          ? Math.round(
              S.prog[0] /
              S.prog[1] *
              100
            )
          : 0
      }%
    </b><br>` +
    me.tasks
      .map(
        t =>
          `${
            t.done
              ? "✔"
              : "•"
          }
          ${MAP.stations[t.id].n}`
      )
      .join("<br>") +
    (
      imp
        ? `
          <br>
          <i class="imp">
            You are an Impostor:
            fake tasks
          </i>
        `
        : ""
    )
  );

  /* -------------------------------------------------------
     Mensajes de interacción
     ------------------------------------------------------- */

  const pr = $("#pr");

  pr.hidden = !(ctx.task || ctx.btn || ctx.body || ctx.vent || me.vs === 2);

  pr.textContent =
    me.vs === 2
      ? "Press E to exit, or click an arrow to travel"
      : ctx.body
        ? "Body found. Press R to report"
        : ctx.vent
          ? "Press E to enter the vent"
          : ctx.task
            ? "Press E to interact"
            : "Press E to call an emergency meeting";

  /* Botones */

  const bv = $("#bv");
  const canVent = (ctx.vent || me.vs === 2);

  if (me.role == "imp") {
    bv.hidden = false
    bv.disabled = !canVent;
    bv.style.pointerEvents = !canVent ? "none" : "auto";
  } else {
    bv.hidden = true
  }

  $("#bu").disabled = !(ctx.task || ctx.btn);
  $("#bu").style.pointerEvents = !(ctx.task || ctx.btn) ? "none" : "auto";
  $("#br").disabled = !ctx.body;
  $("#br").style.pointerEvents = !ctx.body ? "none" : "auto";

  const bk = $("#bk");
  const tkcd = $("#tkcd")

  bk.hidden =
    !(imp && me.alive);

  bk.disabled =
    !ctx.tgt ||
    me.kcd > 0 || !!me.vs;

  if (me.kcd > 0) {
    tkcd.hidden = false
    tkcd.textContent = me.kcd
  } else {
    tkcd.hidden = true
  }

  /* -------------------------------------------------------
     Pantalla de inicio / rol
     ------------------------------------------------------- */

  rb.hidden =
    S.ph !== "STARTING";

  if (!rb.hidden) {
    html(
      rb,
      imp
        ? `
          <span class="imp">
            YOU ARE AN IMPOSTOR
          </span>

          <small style="font-size:22px">
            Partners:
            ${
              S.ros
                .filter(
                  p =>
                    p.role === "imp" &&
                    p.id !== me.id
                )
                .map(
                  p => esc(p.name)
                )
                .join(", ") ||
              "none"
            }
          </small>
        `
        : `
          <span class="crew">
            YOU ARE A CREWMATE
          </span>

          <small style="font-size:22px">
            Finish your tasks.
            Trust carefully.
          </small>
        `
    );
  }
}

/* =========================================================
   DIBUJAR JUGADOR
   ========================================================= */

/* Estado visual de cada cuerpo. S.bodies se recrea en cada mensaje, así que la animación
   se guarda aparte, por id del jugador muerto. */

const BV = {};

function deadBody(o, dt) {
  let v = BV[o.id];
  if (!v) {
    v = BV[o.id] = {};
    Sprites.set(v, "death");
    if (v.an) v.an.pos = (o.age || 0) / 1000 * v.an.fps;   // si lo ves tarde, ya está en el suelo
  }
  Sprites.set(v, "death");
  Sprites.update(v, dt);
  Sprites.draw(g, v, o.x, o.y, o.color);
}

/* Jugador con spritesheets: estado automático + dibujado recoloreado */
function drawPlayer(v, p, alive, mate, dt) {
  if (v.vs === 2) return;                                                  // dentro de una rendija: no se ve
  if (!v.vs) Sprites.auto(v, alive ? (v.mv ? "walk" : "idle") : "ghost");   // entrando/saliendo manda la animación "vent"
  Sprites.update(v, dt);

  g.globalAlpha = alive ? 1 : 0.45;
  const ok = Sprites.draw(g, v, v.x, v.y, p.color, { dir: v.fx >= 0 ? 1 : -1 });

  if (ok) {
    g.font = "bold 12px sans-serif"; g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.fillStyle = "#0009"; g.fillText(p.name, v.x + 1, v.y + Sprites.cfg.nameY + 1);
    g.fillStyle = mate ? "#ff5a6e" : "#fff"; g.fillText(p.name, v.x, v.y + Sprites.cfg.nameY);
  }
  g.globalAlpha = 1;
}

/* =========================================================
   RENDERIZADO DEL MAPA
   ========================================================= */

/* ---------- Helpers del mapa ---------- */

/* Imagen del mapa. Se estira a MAP.w × MAP.h; si coinciden con su tamaño, 1 px de la imagen = 1 unidad del mundo. */
const WORLD = new Image();
WORLD.src = "assets/images/the_skeld.png";   // ← ruta de tu mapa

/* Dibuja las colisiones encima para colocarlas a mano. Ponlo en false cuando termines. */
const SHOW_WALLS = false;

/* ---------- Dibujado principal ---------- */

const emBtn = new Image();
emBtn.src = "assets/sprites/emergency_button.png"
const alertIcon = new Image();
alertIcon.src = "assets/icons/alert.svg"
const playerIcon = new Image();
playerIcon.src = "assets/icons/player_icon.png"

function draw(dt) {
  /* Ajustar canvas al tamaño de la ventana */
  if (cv.width !== innerWidth || cv.height !== innerHeight) {
    cv.width = innerWidth;
    cv.height = innerHeight;
  }

  const me = S.me;
  const k = 1 - Math.pow(0.0005, dt);
  const now = performance.now();
  const ros = {};
  S.ros.forEach(p => ros[p.id] = p);

  /* Suavizar posiciones */
  S.pos.forEach(([id, x, y, a, vs]) => {
    const v = V[id] || (V[id] = { x, y, ph: 0, fx: 1 });
    if ((v.vs || 0) !== (vs || 0)) Vents.onState(v, vs || 0);

    const dx = x - v.x;
    const dy = y - v.y;

    v.mv = Math.hypot(dx, dy) > 1.5;
    v.x += dx * k;
    v.y += dy * k;
    v.ph += v.mv ? dt * 14 : 0;

    if (Math.abs(dx) > 1) v.fx = dx > 0 ? 1 : -1;
  });

  const c = V[me.id] || { x: 1580, y: 260 };

  /* Fondo */
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = "#060a15";
  g.fillRect(0, 0, cv.width, cv.height);

  /* Cámara */
  const zoom = 1.65;
  Vents.setCam(c, zoom);
  g.translate(cv.width / 2, cv.height / 2);
  g.scale(zoom, zoom);
  g.translate(-c.x, -c.y);

  /* Solo se dibuja lo que cae dentro de la pantalla */
  const hw = cv.width / 2 / zoom + 40, hh = cv.height / 2 / zoom + 40;

  /* Mapa: tu imagen */
  if (WORLD.complete && WORLD.naturalWidth) g.drawImage(WORLD, 0, 0, MAP.w, MAP.h);

  /* Colisiones visibles (rojo = bloquea la vista, azul = solo choca) */
  if (SHOW_WALLS) {
    g.lineCap = "round";
    MAP.walls.forEach(w => {
      g.strokeStyle = w.v ? "rgba(255,60,80,.6)" : "rgba(80,160,255,.6)";
      g.lineWidth = w.t;
      g.beginPath(); g.moveTo(w.x1, w.y1); g.lineTo(w.x2, w.y2); g.stroke();
    });
    g.lineCap = "butt";
  }

  Vents.drawVents(dt, c, hw, hh);

  /* Estaciones de tareas */
  MAP.stations.forEach(s => {
    const t = me.tasks.find(t => t.id === s.id);
    g.globalAlpha = 0.8
    if (t) {
      if (!t.done) {
        const taskObj = MAP.stations[t.id]
        g.drawImage(alertIcon, taskObj.x - 16, taskObj.y - 16, 32, 32)
      }
    }
    g.globalAlpha = 1
  });

  /* Botón de emergencia */
  if (ctx.btn) {
    g.drawImage(emBtn, MAP.button.x, MAP.button.y, 41.5, 34.92)
  }

  /* Cuerpos */
  if (S.ph === "STARTING") for (const k in BV) delete BV[k];   // partida nueva: las animaciones empiezan de cero
  S.bodies.forEach(b => deadBody(b, dt));

  /* Jugadores */
  let self = null;
  S.pos
    .slice()
    .sort((a, b) => V[a[0]].y - V[b[0]].y)
    .forEach(([id, , , a]) => {
      const v = V[id];
      const p = ros[id];

      if (id === me.id) self = v;

      if (p) {
        drawPlayer(v, p, !!a, p.role === "imp" && me.role === "imp", dt);
      }
    });
  
  const seen = new Set(S.pos.map(p => p[0]));
  for (const id in V) if (!seen.has(+id)) delete V[id];

  /* Visión: los muros proyectan sombra (los fantasmas ven todo) */
  if (me.alive) drawVision(c.x, c.y, me.role === "imp" ? 420 : 280, hw, hh);
  
  Vents.drawArrows(dt);

  if (!document.getElementById("map-container").hidden) {
    const mapImage = document.getElementById("map-img")
    const multX = mapImage.width / MAP.w;
    const multY = mapImage.height / MAP.h;
    const mapOverlay = document.getElementById("map-overlay")
    const tempCtx = mapOverlay.getContext("2d")

    tempCtx.clearRect(0, 0, mapOverlay.width, mapOverlay.height);
    me.tasks.forEach((t) => {
      if (!t.done) {
        const taskObj = MAP.stations[t.id]
        tempCtx.drawImage(alertIcon, (taskObj.x - 16) * multX, (taskObj.y - 16) * multY, 128 * multX, 128 * multY)
      }
    });
    if (self) tempCtx.drawImage(playerIcon, (self.x - playerIcon.width) * multX, (self.y - playerIcon.height) * multY);
  }
}

/* =========================================================
   INICIAR BUCLE DE RENDERIZADO
   ========================================================= */

requestAnimationFrame(frame);