const $ = (id) => document.getElementById(id);
const stage = $("stage");
const CODE = $("app").dataset.code;
const EMOTES = { clap: "👏", laugh: "😂", fire: "🔥", angry: "😤", wow: "😮", gg: "GG 🤝" };
const AVATARS = ["#e8283a", "#f08a00", "#ffc83d", "#2ee66f", "#14b8a6", "#4da3ff", "#8b5cf6", "#ec4899", "#94a3b8", "#fb7185"];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let ws, state = null, retry = 0, lastLog = null, gone = false;
let role = new URLSearchParams(location.search).get("role") === "spectate" ? "spectate" : "player";

// ---------- connection ----------
const send = (o) => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws/room/${CODE}/`);
  ws.onopen = () => {
    retry = 0;
    $("conn").hidden = true;
    send({ t: "join", pid: myId(), name: getName(), role });
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === "state") onState(m);
    else if (m.t === "error") toast(m.msg, "bad");
    else if (m.t === "gone") { gone = true; showGone(); }
  };
  ws.onclose = () => {
    if (gone) return;
    $("conn").hidden = false;
    setTimeout(connect, Math.min(800 * ++retry, 5000));
  };
}

function showGone() {
  stage.innerHTML = `<section class="panel center"><h2>Room ${esc(CODE)} isn't open</h2>
    <p>The code may be wrong, or the game ended because everyone left.</p>
    <a class="btn btn-green" href="/">Back to home</a></section>`;
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
  state = s;
  if (s.status === "lobby") lobbyView(s);
  else tableView(s, topChanged, handScroll);
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
    slots += `<li class="slot"><span class="ava" style="background:${AVATARS[i]}">${esc(p.name[0].toUpperCase())}</span><span class="nm">${esc(p.name)}</span>${tags}${kick}</li>`;
  }
  const full = s.players.length >= s.max;
  let actions;
  if (amHost) {
    actions = `<button class="btn btn-gold" id="botBtn" ${full ? "disabled" : ""}>+ Add computer</button>
      <button class="btn btn-green" id="startBtn" ${s.players.length < 2 ? "disabled" : ""}>Start game</button>`;
  } else if (spectator) {
    actions = `<button class="btn btn-green" id="sitBtn" ${full ? "disabled" : ""}>Take a seat</button>`;
  } else {
    actions = `<p class="wait">Waiting for the host to start…</p>`;
  }
  stage.innerHTML = `<section class="lobby-card">
    <p class="kicker">${spectator ? "You're watching" : "Share this code to invite players"}</p>
    <button class="codebox" id="bigCode" aria-label="Copy room code">${[...CODE].map((c) => `<span>${esc(c)}</span>`).join("")}</button>
    <div class="row"><button class="btn btn-blue" id="shareBtn2">Share invite</button><button class="btn btn-ghost" id="copyBtn">Copy code</button></div>
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
function tableView(s, topChanged, handScroll) {
  const spectator = s.me === null;
  const myTurn = s.status === "playing" && s.turn === s.me;
  const cur = s.turn !== null ? s.players[s.turn] : null;

  const seats = s.players.map((p, i) => ({ p, i })).filter(({ i }) => spectator || i !== s.me).map(({ p, i }) => {
    const turn = s.turn === i ? " turn" : "";
    const check = p.count === 1 && s.status === "playing" ? `<span class="check">CHECK UP!</span>` : "";
    return `<div class="seat${turn}${p.online ? "" : " off"}">
      <span class="ava" style="background:${AVATARS[i]}">${esc(p.name[0].toUpperCase())}</span>
      <span class="nm">${esc(p.name)}</span>
      <span class="cnt"><i class="mini"></i>${p.count}</span>${check}</div>`;
  }).join("");

  const wants = s.top && s.top.shape === "whot"
    ? `<div class="wants" style="--c:${SHAPE_COLORS[s.shape]}">${shapeSVG(s.shape)}<span>wants ${SHAPE_NAMES[s.shape]}</span></div>` : "";

  let banner = "";
  if (s.status === "playing" && s.pending) {
    banner = `<div class="pending">Pick ${s.pending}! ${myTurn ? `Defend with a ${s.pendingNum} or tap the market` : `${esc(cur.name)} must defend with a ${s.pendingNum} or pick`}</div>`;
  }

  let turnText;
  if (s.status === "finished") turnText = "Game over";
  else if (myTurn) turnText = "Your turn: play a matching card or tap the market";
  else if (cur) turnText = `${esc(cur.name)} is ${cur.bot ? "thinking" : "playing"}…`;

  const hand = s.hand.map((c) => {
    const ok = s.playable.includes(c.id);
    return cardHTML(c, myTurn ? (ok ? "ok" : "dim") : "");
  }).join("");

  stage.innerHTML = `<section class="table">
    <div class="seats">${seats}</div>
    <div class="felt">
      ${banner}
      <div class="piles">
        <button class="pile draw ${myTurn ? "can" : ""}" id="drawBtn" aria-label="Market, ${s.deck} cards left">
          <div class="card back"><span>WHOT</span></div><b class="badge">${s.deck}</b><small>Market</small></button>
        <div class="pile top">${s.top ? cardHTML(s.top, topChanged ? "pop" : "") : ""}<small>Played</small></div>
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
    h.querySelectorAll(".card").forEach((el) => (el.onclick = () => tapCard(+el.dataset.id)));
  }
  $("drawBtn").onclick = () => {
    if (s.status !== "playing") return;
    if (spectator) return toast("You're spectating");
    if (!myTurn) return toast("Wait for your turn");
    send({ t: "draw" });
  };
  stage.querySelectorAll("[data-emote]").forEach((b) => (b.onclick = () => send({ t: "emote", key: b.dataset.emote })));
  if (s.status === "finished") bindFinish(s);
}

function tapCard(id) {
  const s = state;
  if (s.status !== "playing") return;
  if (s.turn !== s.me) return toast("Wait for your turn");
  if (!s.playable.includes(id)) {
    return toast(s.pending ? `Defend with a ${s.pendingNum} or tap the market` : "That card doesn't match", "bad");
  }
  const card = s.hand.find((c) => c.id === id);
  if (card.shape === "whot") return pickShape(id);
  send({ t: "play", card: id });
}

function pickShape(id) {
  const opts = Object.keys(SHAPE_NAMES).map((sh) =>
    `<button class="shape-btn" data-shape="${sh}" style="--c:${SHAPE_COLORS[sh]}">${shapeSVG(sh)}<span>${SHAPE_NAMES[sh]}</span></button>`).join("");
  openModal(`<h2>Choose a shape</h2><div class="shapes">${opts}</div><button class="btn btn-ghost" id="mCancel">Cancel</button>`);
  $("modalBox").querySelectorAll("[data-shape]").forEach((b) => (b.onclick = () => {
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
    ? `<button class="btn btn-green" id="againBtn">Play again</button>` : `<p class="wait">Waiting for the host to deal again…</p>`;
  return `<div class="finish"><div class="finish-box">
    <div class="trophy">🏆</div><h2>${title}</h2>
    <ul class="ranks">${ranks}</ul>
    <div class="row">${again}<a class="btn btn-ghost" href="/">Home</a></div></div>
    ${s.iWon ? confetti() : ""}</div>`;
}
function bindFinish() { if ($("againBtn")) $("againBtn").onclick = () => send({ t: "rematch" }); }
function confetti() {
  const cols = ["#e8283a", "#ffc83d", "#2ee66f", "#4da3ff", "#c77dff"];
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
$("exitBtn").onclick = () => {
  openModal(`<h2>Leave this room?</h2><p>${state && state.status === "playing" && state.me !== null ? "The computer won't take your place, and your cards go back to the market." : "You can rejoin with the room code."}</p>
    <div class="row"><button class="btn btn-ghost" id="mStay">Stay</button><button class="btn btn-gold" id="mLeave">Leave</button></div>`);
  $("mStay").onclick = closeModal;
  $("mLeave").onclick = () => { send({ t: "leave" }); location.href = "/"; };
};

// ---------- start ----------
function askName() {
  openModal(`<h2>Pick a username</h2><p>This is the name other players will see.</p>
    <input id="nameIn" class="code-input name-in" maxlength="16" placeholder="e.g. Emeka" autocomplete="nickname">
    <button class="btn btn-green" id="nameGo">Join the game</button>`);
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
