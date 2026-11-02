const $ = (id) => document.getElementById(id);
const errEl = $("err"), codeEl = $("code"), whoEl = $("who");
let bots = 3, editing = false;

const HERO = [
  { id: 1, shape: "circle", num: 7 }, { id: 2, shape: "triangle", num: 2 }, { id: 3, shape: "whot", num: 20 },
  { id: 4, shape: "star", num: 5 }, { id: 5, shape: "cross", num: 14 },
];
const SPECIALS = [
  [{ id: 11, shape: "circle", num: 1 }, "Hold On", "Play again"],
  [{ id: 12, shape: "triangle", num: 2 }, "Pick Two", "Next player picks 2"],
  [{ id: 13, shape: "square", num: 5 }, "Pick Three", "Next player picks 3"],
  [{ id: 14, shape: "star", num: 8 }, "Suspension", "Skip next player"],
  [{ id: 15, shape: "cross", num: 14 }, "General Market", "Everyone else picks 1"],
  [{ id: 16, shape: "whot", num: 20 }, "Whot", "Wild: call any shape"],
];
$("heroCards").innerHTML = HERO.map((c) => cardHTML(c, "", "md")).join("");
[...$("heroCards").children].forEach((el, i) => {
  el.style.setProperty("--r", `${(i - 2) * 12}deg`);
  el.style.animationDelay = `${i * 0.25}s`;
});
$("specials").innerHTML = SPECIALS.map(([c, name, desc]) =>
  `<div class="special">${cardHTML(c, "", "sm")}<strong>${name}</strong><span>${desc}</span></div>`).join("");
hydrateIcons();

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fail = (msg) => { errEl.textContent = msg; };

// ----- username panel -----
function renderWho() {
  const name = getName();
  if (name && !editing) {
    whoEl.innerHTML = `<div class="who-row">
      <div class="who-me"><div class="avatar-lg">${esc(name[0].toUpperCase())}</div>
        <div><small>Playing as</small><strong>${esc(name)}</strong></div></div>
      <button class="btn btn-felt btn-sm" id="changeBtn">${icon("pencil")} Change</button></div>`;
    $("changeBtn").onclick = () => { editing = true; renderWho(); $("nameIn").focus(); };
  } else {
    whoEl.innerHTML = `<form class="who-form" id="nameForm" autocomplete="off">
      <div class="field-wrap">${icon("user")}<input id="nameIn" maxlength="16" placeholder="Pick a username" autocomplete="nickname" enterkeyhint="go" value="${esc(name)}" aria-label="Your username"></div>
      <button class="btn" type="submit" id="nameGo">${name ? "Save" : "Let's go"}</button></form>`;
    const inp = $("nameIn"), go = $("nameGo");
    const sync = () => (go.disabled = inp.value.trim().length < 2);
    inp.oninput = sync; sync();
    $("nameForm").onsubmit = (e) => {
      e.preventDefault();
      const n = inp.value.trim().replace(/\s+/g, " ");
      if (n.length < 2) return;
      setName(n); editing = false; fail("");
      toast(`Welcome, ${n}!`, "big");
      renderWho();
    };
  }
}
renderWho();

function needName() {
  const n = getName();
  if (n.length >= 2) { fail(""); return n; }
  toast("Pick a username first", "bad");
  const inp = $("nameIn");
  if (inp) inp.focus();
  return null;
}

// ----- actions -----
let busy = false;
async function create(mode) {
  const name = needName();
  if (!name || busy) return;
  busy = true;
  try {
    const res = await fetch("/api/rooms/create/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid: myId(), name, mode, bots }),
    });
    const data = await res.json();
    if (!res.ok) { busy = false; return fail(data.error || "Couldn't create the room."); }
    location.href = `/room/${data.code}/`;
  } catch { busy = false; fail("No connection. Check your data and try again."); }
}

async function join(role) {
  const name = needName();
  if (!name || busy) return;
  const code = codeEl.value.trim().toUpperCase();
  if (code.length < 4) { fail("Enter the room code your host shared."); codeEl.focus(); return; }
  busy = true;
  try {
    const info = await (await fetch(`/api/rooms/${code}/`)).json();
    if (!info.exists) { busy = false; return fail(`No room "${code}". Check the code with your host.`); }
    // A match already in progress (or a full table) can only be watched.
    const target = role === "player" && (info.status !== "lobby" || info.full) ? "spectate" : role;
    if (target !== role) toast("Game already started or full: you're spectating", "alert");
    location.href = `/room/${code}/?role=${target}`;
  } catch { busy = false; fail("No connection. Check your data and try again."); }
}

$("hostBtn").onclick = () => create("online");
$("cpuBtn").onclick = () => create("cpu");
$("joinBtn").onclick = () => join("player");
$("watchBtn").onclick = () => join("spectate");
codeEl.addEventListener("input", () => (codeEl.value = codeEl.value.toUpperCase()));
codeEl.addEventListener("keydown", (e) => e.key === "Enter" && join("player"));
document.querySelectorAll("#botChips .chip").forEach((chip) => {
  chip.onclick = () => {
    bots = +chip.dataset.n;
    document.querySelectorAll("#botChips .chip").forEach((c) => {
      c.classList.toggle("on", c === chip);
      c.setAttribute("aria-checked", c === chip);
    });
  };
});