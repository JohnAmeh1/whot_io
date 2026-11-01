// Synthesized game sounds (Web Audio API): no audio files to download, works offline.
// Browsers only allow audio after a tap/click, so sounds start after the first interaction.
const Sfx = (() => {
  const KEY = "whot_muted";
  const LEVEL = 0.8;
  let ctx = null, master = null, noiseBuf = null, muted = false;
  try { muted = localStorage.getItem(KEY) === "1"; } catch { /* storage blocked */ }

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : LEVEL;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function unlock() {
    const c = init();
    if (c && c.state !== "running") c.resume().catch(() => {});
  }
  ["pointerdown", "touchend", "keydown", "click"].forEach((ev) =>
    window.addEventListener(ev, unlock, { passive: true }));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  });

  const ready = () => ctx && !muted && ctx.state === "running";

  // A pitched note with a quick attack and exponential decay.
  function tone({ f, to = null, t = 0, d = 0.15, type = "sine", v = 0.25, a = 0.006 }) {
    if (!ready()) return;
    const t0 = ctx.currentTime + t;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + d);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + d + 0.05);
  }

  // Filtered noise: the "paper" part of card sounds.
  function hiss({ freq, to = null, t = 0, d = 0.08, v = 0.3, q = 1, type = "bandpass" }) {
    if (!ready()) return;
    const t0 = ctx.currentTime + t;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const fl = ctx.createBiquadFilter();
    fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(freq, t0);
    if (to) fl.frequency.exponentialRampToValueAtTime(to, t0 + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    s.connect(fl); fl.connect(g); g.connect(master);
    s.start(t0, Math.random() * 0.3); s.stop(t0 + d + 0.02);
  }

  const flick = (t = 0) => {
    hiss({ freq: 2500, to: 7000, t, d: 0.09, v: 0.22, q: 0.8 });
    hiss({ freq: 6000, t: t + 0.01, d: 0.04, v: 0.1, q: 2, type: "highpass" });
  };

  const SOUNDS = {
    click: () => tone({ f: 700, to: 500, d: 0.05, v: 0.12, type: "triangle" }),
    // a card slapped onto the pile
    card: () => {
      hiss({ freq: 2200, to: 500, d: 0.1, v: 0.45, q: 0.9 });
      tone({ f: 170, to: 60, d: 0.13, v: 0.35 });
    },
    // cards flicked from the market
    draw: (n = 1) => { for (let i = 0; i < Math.min(n, 3); i++) flick(i * 0.11); },
    deal: (n = 8) => {
      const k = Math.min(n, 12);
      for (let i = 0; i < k; i++) flick(i * 0.08);
      tone({ f: 300, to: 500, t: k * 0.08, d: 0.12, v: 0.1, type: "triangle" });
    },
    pick: (n = 2) => {
      for (let i = 0; i < Math.min(n, 6); i++) flick(i * 0.1);
      tone({ f: 330, to: 165, d: 0.3, v: 0.15, type: "sawtooth" });
    },
    alert: () => {
      tone({ f: 520, to: 380, d: 0.16, v: 0.18, type: "sawtooth" });
      tone({ f: 520, to: 380, t: 0.17, d: 0.2, v: 0.18, type: "sawtooth" });
    },
    suspend: () => {
      tone({ f: 420, to: 110, d: 0.4, v: 0.2, type: "square" });
      hiss({ freq: 900, to: 200, d: 0.3, v: 0.2 });
    },
    holdon: () => {
      tone({ f: 660, d: 0.09, v: 0.18, type: "triangle" });
      tone({ f: 880, t: 0.1, d: 0.14, v: 0.18, type: "triangle" });
    },
    market: () => {
      for (let i = 0; i < 5; i++) flick(i * 0.07);
      [392, 494, 587].forEach((f) => tone({ f, t: 0.35, d: 0.35, v: 0.12, type: "triangle" }));
    },
    whot: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, t: i * 0.07, d: 0.3, v: 0.16, type: "triangle" })),
    turn: () => {
      tone({ f: 880, d: 0.28, v: 0.2 });
      tone({ f: 1320, t: 0.09, d: 0.34, v: 0.12 });
    },
    check: () => [988, 740, 988, 740].forEach((f, i) => tone({ f, t: i * 0.12, d: 0.1, v: 0.12, type: "square" })),
    win: () => {
      [523, 659, 784, 1047].forEach((f, i) => tone({ f, t: i * 0.14, d: 0.3, v: 0.2, type: "triangle" }));
      [523, 659, 784, 1047].forEach((f) => tone({ f, t: 0.6, d: 0.9, v: 0.12, type: "triangle" }));
    },
    lose: () => [392, 349, 311, 262].forEach((f, i) => tone({ f, t: i * 0.2, d: 0.35, v: 0.15, type: "sawtooth" })),
    emote: () => tone({ f: 480, to: 960, d: 0.12, v: 0.18 }),
    join: () => {
      tone({ f: 660, d: 0.09, v: 0.15 });
      tone({ f: 990, t: 0.09, d: 0.14, v: 0.15 });
    },
    error: () => tone({ f: 180, to: 110, d: 0.18, v: 0.18, type: "square" }),
  };

  function play(name, arg, delay = 0) {
    const fn = SOUNDS[name];
    if (!fn) return;
    if (delay) { setTimeout(() => play(name, arg), delay); return; }
    try { fn(arg); } catch { /* never let audio break the game */ }
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch { /* ignore */ }
    if (master) master.gain.value = muted ? 0 : LEVEL;
  }

  return {
    play,
    setMuted,
    toggle() { setMuted(!muted); return muted; },
    get muted() { return muted; },
  };
})();