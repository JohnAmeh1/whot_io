const $ = (id) => document.getElementById(id);
const stage = $("stage");
const CODE = $("app").dataset.code;
const EMOTES = { clap: "👏", laugh: "😂", fire: "🔥", angry: "😤", wow: "😮", gg: "GG 🤝" };
const AVATARS = ["#ffc31a", "#ff7d6b", "#6ddb62", "#5cc8ff", "#c79bff", "#ff9f43", "#2dd4bf", "#f472b6", "#cbd5c0", "#fda4af"];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let ws, state = null, retry = 0, lastLog = null, gone = false, started = false, joined = false;
let hbTimer, joinTimer, openTimer, reconnectTimer;
const role = new URLSearchParams(location.search).get("role") === "spectate" ? "spectate" : "player";

// A watcher gets its own per-tab identity. Otherwise, opening "Watch" in the same browser as a
// player would reuse that player's id and the server would treat the watcher as the same person.
function spectatorId() {
  try {
    let id = sessionStorage.getItem("whot_spid");
    if (id && id.length >= 8) return id;
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    id = "w" + Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
    sessionStorage.setItem("whot_spid", id);
    return id;
  } catch {
    return "w" + Math.random().toString(16).slice(2).padEnd(15, "0");
  }
}
const getPid = () => (role === "spectate" ? spectatorId() : myId());

// ---------- connection ----------
const send = (o) => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));
const sendJoin = () => send({ t: "join", pid: getPid(), name: getName(), role });

function setConn(text) {
  const el = $("conn");
  el.textContent = text || "";
  el.hidden = !text;
}

function clearTimers() {
  clearTimeout(openTimer);
  clearInterval(joinTimer);
  clearInterval(hbTimer);
}

function connect() {
  started = true;
  clearTimeout(reconnectTimer);
  clearTimers();
  setConn(retry ? "Reconnecting…" : "Connecting…");
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const sock = new WebSocket(`${proto}://${location.host}/ws/room/${CODE}/`);
  ws = sock;
  joined = false;

  // never hang on a socket that neither opens nor fails
  openTimer = setTimeout(() => { if (sock.readyState === 0) sock.close(); }, 10000);

  sock.onopen = () => {
    clearTimeout(openTimer);
    sendJoin();
    // if the table hasn't arrived yet, ask again instead of waiting forever
    joinTimer = setInterval(() => { if (joined || sock !== ws) clearInterval(joinTimer); else sendJoin(); }, 3000);
    hbTimer = setInterval(() => send({ t: "ping" }), 25000);
  };

  sock.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === "state") {
      joined = true;
      retry = 0;
      setConn("");
      try { onState(m); } catch (err) { console.error(err); showCrash(); }
    } else if (m.t === "error") {
      Sfx.play("error");
      toast(m.msg, "bad");
    } else if (m.t === "gone") {
      gone = true;
      clearTimers();
      setConn("");
      showGone();
    }
  };

  sock.onclose = () => {
    if (sock !== ws) return;
    clearTimers();
    if (gone) return;
    setConn("Reconnecting…");
    reconnectTimer = setTimeout(connect, Math.min(800 * ++retry, 5000));
  };
}

// come back fast when the phone wakes up or the network returns
function wake() {
  if (!started || gone || document.hidden) return;
  if (!ws || ws.readyState > 1) { clearTimeout(reconnectTimer); connect(); }
}
document.addEventListener("visibilitychange", wake);
window.addEventListener("online", wake);

function showGone() {
  stage.innerHTML = `<section class="panel center"><h2 style="font-family:var(--display);font-weight:400;color:var(--primary)">Room ${esc(CODE)} isn't open</h2>
    <p class="muted">The code may be wrong, or the game ended because everyone left.</p>
    <a class="btn" href="/">Back to home</a></section>`;
}

function showCrash() {
  stage.innerHTML = `<section class="panel center"><h2>Something went wrong</h2>
    <p>The table couldn't be drawn. Reloading usually fixes it.</p>
    <button class="btn" onclick="location.reload()">Reload</button></section>`;
}

// ---------- sounds ----------
const myTurnIn = (x) => x.status === "playing" && x.me !== null && x.turn === x.me;

// Turns a change between two snapshots into the right sound (watchers hear the table too).
function soundsFor(prev, s, fresh) {
  if (!prev) return; // first snapshot after joining: stay quiet

  if (s.status === "playing" && prev.status !== "playing") { // cards are dealt
    Sfx.play("deal", Math.min(12, s.players.length * 3));
    if (myTurnIn(s)) Sfx.play("turn", null, 900);
    return;
  }
  if (s.status === "lobby" && prev.status === "lobby" && s.players.length > prev.players.length) Sfx.play("join");
  if (fresh.some((l) => l.kind === "chat")) Sfx.play("emote");

  const played = !!s.top && (!prev.top || prev.top.id !== s.top.id);
  if (played) {
    Sfx.play("card");
    const extra = { 1: "holdon", 2: "alert", 5: "alert", 8: "suspend", 14: "market", 20: "whot" }[s.top.num];
    if (extra && s.status !== "finished") Sfx.play(extra, null, 140);
  } else if (prev.status === "playing" && s.deck < prev.deck) {
    const n = prev.deck - s.deck;
    Sfx.play(n > 1 ? "pick" : "draw", n);
  }

  if (s.status === "finished" && prev.status === "playing") {
    Sfx.play(s.me === null ? "turn" : s.iWon ? "win" : "lose", null, 500);
    return;
  }
  if (s.status !== "playing") return;
  if (myTurnIn(s) && !myTurnIn(prev)) Sfx.play("turn", null, played ? 350 : 0);
  if (s.players.some((p, i) => p.count === 1 && prev.players[i] && prev.players[i].count !== 1)) Sfx.play("check", null, 250);
}

// ---------- state ----------
function onState(s) {
  const newest = s.log.length ? s.log[s.log.length - 1].id : 0;
  if (lastLog === null) lastLog = newest;
  const fresh = s.log.filter((l) => l.id > lastLog);
  if (fresh.length) {
    const l = fresh[fresh.length - 1];
    toast(l.text, l.kind);
    lastLog = newest;
  }
  const myTurnNow = s.status === "playing" && s.turn === s.me;
  const wasMyTurn = state && state.status === "playing" && state.turn === state.me;
  if (myTurnNow && !wasMyTurn && navigator.vibrate) navigator.vibrate(120);
  document.title = myTurnNow ? "▶ Your turn | " + CODE : "Room " + CODE + " | whot_io";
  const topChanged = !state || !state.top || !s.top || state.top.id !== s.top.id;
  const handScroll = stage.querySelector(".hand")?.scrollLeft || 0;
  const known = state ? new Set(state.hand.map((c) => c.id)) : null; // cards already in hand: only new ones animate in
  try { soundsFor(state, s, fresh); } catch (err) { console.error(err); }
  state = s;
  if (s.status === "lobby") lobbyView(s);
  else tableView(s, topChanged, handScroll, known);
}

// ---------- lobby ----------
function lobbyView(s) {
  const amHost = s.me !== null && s.me === s.host;
  const spectator = s.me === null;
  let slots = "";
  for (let i = 0; i < s.max; i++) {
    const p = s.players[i];
    if (!p) { slots += `<li class="slot empty"><span class="ava">?</span><span class="nm">Open seat</span></li>`; continue; }
    const tags = [i === s.host ? "host" : "", p.bot ? "cpu" : "", i === s.me ? "you" : "", p.online ? "" : "offline"]
      .filter(Boolean).map((t) => `<em class="tag-${t}">${t}</em>`).join("");
    const kick = amHost && i !== s.me ? `<button class="x" data-kick="${i}" aria-label="Remove ${esc(p.name)}">✕</button>` : "";
    slots += `<li class="slot"><span class="ava" style="background:${AVATARS[i]}">${esc(p.name[0].toUpperCase())}</span><span class="slot-main"><span class="nm" title="${esc(p.name)}">${esc(p.name.replace(/ \(CPU\)$/, ""))}</span><span class="tags">${tags}</span></span>${kick}</li>`;
  }
  const full = s.players.length >= s.max;
  let actions;
  if (amHost) {
    actions = `<button class="btn btn-maroon" id="botBtn" ${full ? "disabled" : ""}>+ Add computer</button>
      <button class="btn" id="startBtn" ${s.players.length < 2 ? "disabled" : ""}>Start game</button>`;
  } else if (spectator) {
    actions = `<button class="btn btn-lime" id="sitBtn" ${full ? "disabled" : ""}>Take a seat</button>`;
  } else {
    actions = `<p class="wait">Waiting for the host to start…</p>`;
  }
  stage.innerHTML = `<section class="lobby-card panel">
    <p class="kicker">${spectator ? "You're watching" : "Share this code to invite players"}</p>
    <button class="codebox" id="bigCode" aria-label="Copy room code">${[...CODE].map((c) => `<span>${esc(c)}</span>`).join("")}</button>
    <div class="row"><button class="btn" id="shareBtn2">Share invite</button><button class="btn btn-felt" id="copyBtn">Copy code</button></div>
    <h2 class="count">${s.players.length} of ${s.max} seats filled${s.spectators.length ? ` · ${s.spectators.length} watching` : ""}</h2>
    <ul class="slots">${slots}</ul>
    <div class="row actions">${actions}</div>
  </section>`;
  $("bigCode").onclick = $("copyBtn").onclick = copyCode;
  $("shareBtn2").onclick = share;
  if ($("botBtn")) $("botBtn").onclick = () => send({ t: "bot" });
  if ($("startBtn")) $("startBtn").onclick = () => send({ t: "start" });
  if ($("sitBtn")) $("sitBtn").onclick = () => send({ t: "sit" });
  stage.querySelectorAll("[data-kick]").forEach((b) => (b.onclick = () => send({ t: "kick", index: +b.dataset.kick })));
}

// ---------- table ----------
function tableView(s, topChanged, handScroll, known) {
  const spectator = s.me === null;
  const myTurn = s.status === "playing" && s.turn === s.me;
  const cur = s.turn !== null ? s.players[s.turn] : null;

  const seats = s.players.map((p, i) => ({ p, i })).filter(({ i }) => spectator || i !== s.me).map(({ p, i }) => {
    const turn = s.turn === i ? " turn" : "";
    const check = p.count === 1 && s.status === "playing" ? `<span class="check">CHECK UP!</span>` : "";
    return `<div class="seat${turn}${p.online ? "" : " off"}">
      <span class="ava" style="background:${AVATARS[i]}">${esc(p.name[0].toUpperCase())}</span>
      <span class="nm" title="${esc(p.name)}">${esc(p.name.replace(/ \(CPU\)$/, ""))}</span>
      <span class="cnt">${cardBackHTML("xs")}${p.count}</span>${check}</div>`;
  }).join("");

  const wants = s.top && s.top.shape === "whot"
    ? `<div class="wants">${shapeSVG(s.shape)}<span>wants ${SHAPE_NAMES[s.shape]}</span></div>` : "";

  let banner = "";
  if (s.status === "playing" && s.pending && cur) {
    banner = `<div class="pending">Pick ${s.pending}! ${myTurn ? `Defend with a ${s.pendingNum} or tap the market` : `${esc(cur.name)} must defend with a ${s.pendingNum} or pick`}</div>`;
  }

  let turnText = "";
  if (s.status === "finished") turnText = "Game over";
  else if (myTurn) turnText = "Your turn: play a matching card or tap the market";
  else if (cur) turnText = `${esc(cur.name)} is ${cur.bot ? "thinking" : "playing"}…`;

  const hand = s.hand.map((c, i) => {
    const ok = s.playable.includes(c.id);
    const isNew = known && !known.has(c.id);
    const cls = [myTurn ? (ok ? "ok" : "dim") : "", isNew ? "animate-deal" : ""].join(" ");
    return cardHTML(c, cls, "md", "button").replace("<button ", `<button style="animation-delay:${Math.min(i, 8) * 0.05}s" `);
  }).join("");

  stage.innerHTML = `<section class="table">
    <div class="seats">${seats}</div>
    <div class="center">
      ${banner}
      <div class="piles">
        <button class="pile draw ${myTurn ? "can" : ""}" id="drawBtn" aria-label="Market, ${s.deck} cards left">
          ${cardBackHTML("lg")}<b class="badge">${s.deck}</b><small>Market</small></button>
        <div class="pile top">${s.top ? cardHTML(s.top, topChanged ? "animate-pop" : "", "lg") : ""}<small>Played</small></div>
      </div>
      ${wants}
    </div>
    <div class="dock">
      <div class="turnbar${myTurn ? " mine" : ""}">${spectator ? "👀 Watching · " : ""}${turnText}</div>
      ${spectator ? "" : `<div class="hand" id="hand">${hand}</div>`}
      <div class="emotes">${Object.entries(EMOTES).map(([k, e]) => `<button data-emote="${k}" aria-label="Send ${e}">${e}</button>`).join("")}</div>
    </div>
  </section>${s.status === "finished" ? finishHTML(s) : ""}`;

  const h = $("hand");
  if (h) {
    h.scrollLeft = handScroll;
    h.querySelectorAll(".wc").forEach((el) => (el.onclick = () => tapCard(+el.dataset.id)));
  }
  $("drawBtn").onclick = () => {
    if (s.status !== "playing") return;
    if (spectator) return toast("You're spectating");
    if (!myTurn) { Sfx.play("error"); return toast("Wait for your turn"); }
    send({ t: "draw" });
  };
  stage.querySelectorAll("[data-emote]").forEach((b) => (b.onclick = () => send({ t: "emote", key: b.dataset.emote })));
  if (s.status === "finished") bindFinish(s);
}

function tapCard(id) {
  const s = state;
  if (s.status !== "playing") return;
  if (s.turn !== s.me) { Sfx.play("error"); return toast("Wait for your turn"); }
  if (!s.playable.includes(id)) {
    Sfx.play("error");
    return toast(s.pending ? `Defend with a ${s.pendingNum} or tap the market` : "That card doesn't match", "bad");
  }
  const card = s.hand.find((c) => c.id === id);
  if (card.shape === "whot") return pickShape(id);
  send({ t: "play", card: id });
}

function pickShape(id) {
  const opts = Object.keys(SHAPE_NAMES).map((sh) =>
    `<button class="shape-btn" data-shape="${sh}">${shapeSVG(sh)}<span>${SHAPE_NAMES[sh]}</span></button>`).join("");
  openModal(`<h2>Choose a shape</h2><div class="shapes">${opts}</div><button class="btn btn-felt" id="mCancel">Cancel</button>`);
  $("modalBox").querySelectorAll("[data-shape]").forEach((b) => (b.onclick = () => {
    Sfx.play("click");
    closeModal();
    send({ t: "play", card: id, shape: b.dataset.shape });
  }));
  $("mCancel").onclick = closeModal;
}

// ---------- game over ----------
function finishHTML(s) {
  const spectator = s.me === null;
  const title = s.iWon ? "You won! 🎉" : `${esc(s.winner || "Nobody")} wins`;
  const ranks = s.players.map((p) => `<li><span>${esc(p.name)}</span><b>${p.count} card${p.count === 1 ? "" : "s"}</b></li>`).join("");
  const again = s.me === s.host && !spectator
    ? `<button class="btn" id="againBtn">Play again</button>` : `<p class="wait">Waiting for the host to deal again…</p>`;
  return `<div class="finish"><div class="finish-box">
    <div class="trophy">🏆</div><h2>${title}</h2>
    <ul class="ranks">${ranks}</ul>
    <div class="row">${again}<a class="btn btn-felt" href="/">Home</a></div></div>
    ${s.iWon ? confetti() : ""}</div>`;
}
function bindFinish() { if ($("againBtn")) $("againBtn").onclick = () => send({ t: "rematch" }); }
function confetti() {
  const cols = ["#a51d2b", "#ffc31a", "#6ddb62", "#fdf6e6", "#ff7d6b"];
  return `<div class="confetti" aria-hidden="true">${Array.from({ length: 36 }, (_, i) =>
    `<i style="left:${(i * 29) % 100}%;background:${cols[i % 5]};animation-delay:${(i % 9) * 0.18}s"></i>`).join("")}</div>`;
}

// ---------- helpers ----------
function openModal(html) { $("modalBox").innerHTML = html; $("modal").hidden = false; }
function closeModal() { $("modal").hidden = true; }
$("modal").addEventListener("click", (e) => e.target === $("modal") && closeModal());

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const t = document.createElement("textarea");
    t.value = text; document.body.appendChild(t); t.select();
    const ok = document.execCommand("copy"); t.remove(); return ok;
  }
}
async function copyCode() { toast((await copyText(CODE)) ? `Code ${CODE} copied` : `Room code: ${CODE}`); }
async function share() {
  const url = `${location.origin}/room/${CODE}/`;
  const text = `Join my Whot game on whot_io! Room code: ${CODE}`;
  if (navigator.share) {
    try { await navigator.share({ title: "whot_io", text, url }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  toast((await copyText(`${text}\n${url}`)) ? "Invite link copied" : url);
}
$("codeBtn").onclick = copyCode;
$("shareBtn").onclick = share;

const muteBtn = $("muteBtn");
function paintMute() {
  muteBtn.innerHTML = icon(Sfx.muted ? "mute" : "volume");
  muteBtn.setAttribute("aria-pressed", String(!Sfx.muted));
  muteBtn.setAttribute("aria-label", Sfx.muted ? "Turn sound on" : "Turn sound off");
}
muteBtn.onclick = () => { Sfx.toggle(); paintMute(); Sfx.play("click"); };
paintMute();

$("exitBtn").onclick = () => {
  openModal(`<h2>Leave this room?</h2><p>${state && state.status === "playing" && state.me !== null ? "The computer won't take your place, and your cards go back to the market." : "You can rejoin with the room code."}</p>
    <div class="row"><button class="btn btn-felt" id="mStay">Stay</button><button class="btn btn-maroon" id="mLeave">Leave</button></div>`);
  $("mStay").onclick = closeModal;
  $("mLeave").onclick = () => { send({ t: "leave" }); location.href = "/"; };
};

// ---------- start ----------
function askName() {
  openModal(`<h2>Pick a username</h2><p>This is the name other players will see.</p>
    <input id="nameIn" class="code-input name-in" maxlength="16" placeholder="e.g. Emeka" autocomplete="nickname">
    <button class="btn btn-block" id="nameGo">${role === "spectate" ? "Watch the game" : "Join the game"}</button>`);
  const go = () => {
    const n = $("nameIn").value.trim().replace(/\s+/g, " ");
    if (n.length < 2) return toast("Use at least 2 letters", "bad");
    setName(n); closeModal(); connect();
  };
  $("nameGo").onclick = go;
  $("nameIn").addEventListener("keydown", (e) => e.key === "Enter" && go());
  $("nameIn").focus();
}
getName() ? connect() : askName();