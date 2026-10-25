/* =========================================================
   MINIJUEGOS DE TAREAS
   ========================================================= */

function openTask(id) {
  task = Object.assign({}, MAP.stations[id]);
  task.t = Date.now();

  send({
    t: "ts",
    id
  });

  inp();
  show("task", 1);
  $("#tt").textContent = task.n;

  const b = $("#tb");
  const F = () => task && fin(task);
  const H = t => {
    const m = $("#m");
    if (m) m.textContent = t;
  };
  const P = p => {
    const f = $("#f");
    if (f) f.style.width = p * 100 + "%";
  };

  const BAR =
    '<div class="bar"><i class="fill" id="f"></i></div>';

  const shuf = n =>
    Array.from(
      { length: n },
      (_, i) => i + 1
    ).sort(() => Math.random() - 0.5);

  const W = (h, x) => {
    clearInterval(iv);
    b.onclick = null;
    b.innerHTML =
      `<div class="tm"><p>${h}</p>${x}<p id="m"></p></div>`;
  };

  const run = (ms, end) => {
    let t = 0;

    clearInterval(iv);

    iv = setInterval(() => {
      t += 50;
      P(t / ms);

      if (t >= ms) {
        clearInterval(iv);
        end();
      }
    }, 50);
  };

  const hold = (ms, l) => {
    W(
      "Press and hold the button until the bar is full. If you let go, it resets.",
      BAR + `<button class="hold" id="h">${l}</button>`
    );

    const h = $("#h");

    const stop = () => {
      clearInterval(iv);
      P(0);
    };

    h.onpointerdown = () => run(ms, F);
    h.onpointerup =
      h.onpointerleave =
      h.onpointercancel =
        stop;
  };

  const timed = (l, hint) => {
    W(
      hint ||
        "Press the button, then wait for the bar to fill.",
      BAR + `<button id="g">${l}</button>`
    );

    $("#g").onclick = () => {
      $("#g").disabled = true;
      run(3000, F);
    };
  };

  const seq = (n, hint, c) => {
    let k = 1;

    W(
      hint,
      `<div class="seq" style="--c:${c}">${
        shuf(n)
          .map(
            i =>
              `<button data-n="${i}">${i}</button>`
          )
          .join("")
      }</div>`
    );

    H("Next: 1");

    b.onclick = e => {
      const q =
        e.target.closest("button");

      if (!q) return;

      if (+q.dataset.n == k) {
        q.disabled = true;
        H(++k > n ? "" : "Next: " + k);

        if (k > n) {
          F();
        }
      } else {
        k = 1;

        b.querySelectorAll("button")
          .forEach(x => x.disabled = false);

        H("Wrong! Start again from 1.");

        q.classList.add("bad");

        setTimeout(
          () => q.classList.remove("bad"),
          300
        );
      }
    };
  };

  const clr = (hint, cls, wrap, items) => {
    let n = 0;

    W(
      hint,
      `<div class="${wrap}">${
        items
          .map(
            x =>
              `<button class="${cls}">${x}</button>`
          )
          .join("")
      }</div>`
    );

    H("0/" + items.length);

    b.onclick = e => {
      const q =
        e.target.closest("." + cls);

      if (!q || q.disabled) return;

      q.disabled = true;
      q.style.visibility = "hidden";

      H(++n + "/" + items.length);

      if (n == items.length) {
        F();
      }
    };
  };

  const align = (start, hint, btn) => {
    W(
      hint,
      `<div class="target">
        <input id="r" class="range" type="range" min="0" max="100" value="${start}">
      </div>
      <button id="ok">${btn}</button>`
    );

    $("#ok").onclick = () =>
      Math.abs(+$("#r").value - 50) <= 5
        ? F()
        : H("Not yet. Put the slider inside the red zone.");
  };

  const T = {
    "Fix Wiring": () => {
      const c = [
        "red",
        "blue",
        "yellow",
        "green"
      ];

      const sym = [
        "●",
        "▲",
        "■",
        "◆"
      ];

      const r =
        shuf(4).map(i => i - 1);

      let s = null;
      let d = 0;

      W(
        "Click a wire on the left, then the wire of the same color on the right.",
        `<div class="wires">${
          c
            .map(
              (x, i) =>
                `<button class="wire ${x}" data-c="${i}" data-s="l">${sym[i]}</button>` +
                `<button class="wire ${c[r[i]]}" data-c="${r[i]}" data-s="r">${sym[r[i]]}</button>`
            )
            .join("")
        }</div>`
      );

      b.onclick = e => {
        const q =
          e.target.closest(".wire");

        if (
          !q ||
          q.classList.contains("done")
        ) {
          return;
        }

        if (q.dataset.s == "l") {
          s && s.classList.remove("sel");
          s = q;
          q.classList.add("sel");
          return;
        }

        if (
          s &&
          s.dataset.c == q.dataset.c
        ) {
          s.classList.replace(
            "sel",
            "done"
          );

          q.classList.add("done");
          s = null;

          H(++d + "/4 connected");

          if (d == 4) {
            F();
          }
        } else {
          s && s.classList.remove("sel");
          s = null;

          H(
            "Pick a wire on the left first, then its matching color."
          );
        }
      };
    },

    "Download Data": () =>
      timed(
        "DOWNLOAD",
        "Press DOWNLOAD and wait for the bar to fill."
      ),

    "Upload Data": () =>
      timed(
        "UPLOAD",
        "Press UPLOAD and wait for the bar to fill."
      ),

    "Empty Garbage": () =>
      hold(
        2800,
        "HOLD TO EMPTY"
      ),

    "Empty Chute": () =>
      hold(
        2500,
        "HOLD TO EMPTY"
      ),

    "Fuel Engines": () =>
      hold(
        3500,
        "HOLD TO FUEL"
      ),

    "Align Engine Output": () =>
      align(
        18,
        "Drag the slider into the red zone, then press ALIGN.",
        "ALIGN"
      ),

    "Stabilize Steering": () => {
      let hits = 0;
      let x = 0;
      let d = 1;

      W(
        "Press STOP when the moving bar is inside the red zone. Hit it 3 times in a row.",
        `<div class="target">
          <div class="needle" id="n"></div>
        </div>
        <button id="ok">STOP</button>`
      );

      H("0/3");

      iv = setInterval(() => {
        x += d * (1.2 + hits * 0.5);

        if (x > 100 || x < 0) {
          d = -d;
          x = Math.max(
            0,
            Math.min(100, x)
          );
        }

        const n = $("#n");

        if (n) {
          n.style.left = x + "%";
        }
      }, 16);

      $("#ok").onclick = () => {
        if (Math.abs(x - 50) <= 5) {
          H(++hits + "/3");

          if (hits >= 3) {
            F();
          }
        } else {
          hits = 0;
          H("Missed! Back to 0/3.");
        }
      };
    },

    "Accept Diverted Power": () => {
      let on = 0;

      W(
        "Flip the switch to accept the power.",
        `<button class="switch" id="sw">OFF</button>`
      );

      $("#sw").onclick = () => {
        if (on) return;

        on = 1;

        $("#sw").classList.add("on");
        $("#sw").textContent = "ON";

        setTimeout(F, 300);
      };
    },

    "Divert Power": () => {
      W(
        "Drag the slider all the way to the right, then press DIVERT.",
        `<input id="r" class="range" type="range" min="0" max="100" value="0">
        <button id="ok">DIVERT</button>`
      );

      H("Power: 0%");

      $("#r").oninput = () =>
        H("Power: " + $("#r").value + "%");

      $("#ok").onclick = () =>
        +$("#r").value >= 95
          ? F()
          : H(
              "Not enough power. Push the slider to the end."
            );
    },

    "Unlock Manifolds": () =>
      seq(
        10,
        "Click the buttons in order, from 1 to 10.",
        5
      ),

    "Chart Course": () =>
      seq(
        4,
        "Click the waypoints in order, from 1 to 4.",
        4
      ),

    "Start Reactor": () => {
      const me = task;

      const c = [
        "red",
        "blue",
        "yellow",
        "green"
      ];

      const pat = Array.from(
        { length: 5 },
        () => Math.random() * 4 | 0
      );

      const wait = ms =>
        new Promise(ok =>
          setTimeout(ok, ms)
        );

      let u = [];
      let r = 0;
      let lock = 1;

      W(
        "Watch the pads light up, then repeat the pattern.",
        `<div class="pads">${
          c
            .map(
              (x, i) =>
                `<button class="pad ${x}" data-i="${i}">${i + 1}</button>`
            )
            .join("")
        }</div>`
      );

      const pads = [
        ...b.querySelectorAll(".pad")
      ];

      const flash = async () => {
        lock = 1;
        u = [];

        H(
          `Round ${r + 1}/5: watch…`
        );

        await wait(500);

        for (
          const i of pat.slice(0, r + 1)
        ) {
          if (task !== me) return;

          pads[i].classList.add("lit");

          await wait(350);

          pads[i].classList.remove("lit");

          await wait(180);
        }

        if (task !== me) return;

        lock = 0;

        H(
          `Round ${r + 1}/5: your turn`
        );
      };

      b.onclick = e => {
        const q =
          e.target.closest(".pad");

        if (!q || lock) return;

        const i = +q.dataset.i;

        u.push(i);

        q.classList.add("lit");

        setTimeout(
          () => q.classList.remove("lit"),
          150
        );

        if (i !== pat[u.length - 1]) {
          r = 0;
          flash();

          setTimeout(
            () => H("Wrong! Watch again."),
            0
          );

          return;
        }

        if (u.length == r + 1) {
          if (++r >= 5) {
            F();
          } else {
            flash();
          }
        }
      };

      flash();
    },

    "Submit Scan": () => {
      W(
        "Press START and stay still while the scan completes.",
        `<div class="scan" id="scn">◉</div>` +
        BAR +
        `<button id="g">START SCAN</button>`
      );

      $("#g").onclick = () => {
        $("#g").disabled = true;
        $("#scn").classList.add("on");
        run(2000, F);
      };
    },

    "Inspect Sample": () => {
      const bad = Math.random() * 4 | 0;

      W(
        "Press ANALYZE and wait. Then click the sample that turned a different color.",
        BAR +
        `<button id="g">ANALYZE</button>
        <div id="s"></div>`
      );

      $("#g").onclick = () => {
        $("#g").disabled = true;

        run(3000, () => {
          $("#s").innerHTML =
            `<div class="samples">${
              [0, 1, 2, 3]
                .map(
                  x =>
                    `<button class="sample${
                      x == bad ? " odd" : ""
                    }" data-i="${x}"></button>`
                )
                .join("")
            }</div>`;

          H(
            "Which sample is different?"
          );
        });
      };

      b.onclick = e => {
        const q =
          e.target.closest(".sample");

        if (!q) return;

        +q.dataset.i == bad
          ? F()
          : H(
              "That one is normal. Find the odd one."
            );
      };
    },

    "Calibrate Distributor": () => {
      const a = [0, 1, 2].map(
        () => 15 + Math.random() * 70
      );

      let d = 0;

      W(
        "Move each slider into its red zone, then press LOCK.",
        `<div class="cal">${
          a
            .map(
              (x, i) =>
                `<div class="calrow">
                  <b>${i + 1}</b>
                  <div class="trk" style="--z:${x}%">
                    <input id="c${i}" class="range" type="range" min="0" max="100" value="50">
                  </div>
                  <button data-i="${i}">LOCK</button>
                </div>`
            )
            .join("")
        }</div>`
      );

      b.onclick = e => {
        const q =
          e.target.closest("button");

        if (!q || q.disabled) return;

        const i = +q.dataset.i;

        if (
          Math.abs(
            +$("#c" + i).value - a[i]
          ) <= 6
        ) {
          q.disabled = true;
          q.textContent = "✔";

          $("#c" + i).disabled = true;

          if (++d == 3) {
            F();
          } else {
            H(d + "/3 locked");
          }
        } else {
          H(
            "Slider " +
            (i + 1) +
            " is outside the red zone."
          );
        }
      };
    },

    "Swipe Card": () => {
      W(
        "Drag the card across the reader at a steady pace: not too fast, not too slow.",
        `<div class="rail">
          <div class="idcard" id="c">ID CARD</div>
        </div>`
      );

      const c = $("#c");

      const w = () =>
        c.parentNode.clientWidth -
        c.offsetWidth -
        12;

      let x0;
      let t0 = 0;

      c.onpointerdown = e => {
        c.setPointerCapture(
          e.pointerId
        );

        x0 = e.clientX;
        t0 = Date.now();
        c.style.transition = "none";
      };

      c.onpointermove = e => {
        if (t0) {
          c.style.transform =
            `translateX(${
              Math.max(
                0,
                Math.min(
                  w(),
                  e.clientX - x0
                )
              )
            }px)`;
        }
      };

      c.onpointerup =
        c.onpointercancel =
          e => {
            if (!t0) return;

            const d = e.clientX - x0;
            const t = Date.now() - t0;

            t0 = 0;

            c.style.transition = "";
            c.style.transform = "";

            if (d < w() * 0.9) {
              H(
                "Swipe all the way across the reader."
              );
            } else if (t < 350) {
              H(
                "Too fast. Slow down a little."
              );
            } else if (t > 1100) {
              H(
                "Too slow. Try again."
              );
            } else {
              F();
            }
          };
    },

    "Clear Asteroids": () =>
      clr(
        "Click all the asteroids to destroy them.",
        "aster",
        "asteroids",
        Array(12).fill("✦")
      ),

    "Clean O2 Filter": () =>
      clr(
        "Click every piece of debris to clear the filter.",
        "debris",
        "trash",
        [
          "▲",
          "●",
          "◆",
          "✦",
          "■",
          "▲",
          "●",
          "◆"
        ]
      ),

    "Prime Shields": () => {
      let n = 0;

      W(
        "Click all 6 shield panels to prime them.",
        `<div class="shields">${
          Array.from(
            { length: 6 },
            () =>
              `<button class="shield">◈</button>`
          ).join("")
        }</div>`
      );

      H("0/6");

      b.onclick = e => {
        const q =
          e.target.closest(".shield");

        if (
          !q ||
          q.classList.contains("on")
        ) {
          return;
        }

        q.classList.add("on");

        H(++n + "/6");

        if (n == 6) {
          F();
        }
      };
    }
  };

  (T[task.n] || (() => timed("START")))();
}