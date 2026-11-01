const $ = (id) => document.getElementById(id);
const nameEl = $("name"), errEl = $("err"), codeEl = $("code");
let bots = 1;
nameEl.value = getName();

function fail(msg) { errEl.textContent = msg; }
function needName() {
  const n = nameEl.value.trim().replace(/\s+/g, " ");
  if (n.length < 2) { fail("Pick a username first (at least 2 letters)."); nameEl.focus(); return null; }
  fail("");
  setName(n);
  return n;
}

async function create(mode) {
  const name = needName();
  if (!name) return;
  try {
    const res = await fetch("/api/rooms/create/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid: myId(), name, mode, bots }),
    });
    const data = await res.json();
    if (!res.ok) return fail(data.error || "Couldn't create the room.");
    location.href = `/room/${data.code}/`;
  } catch { fail("No connection. Check your data and try again."); }
}

async function join(role) {
  const name = needName();
  if (!name) return;
  const code = codeEl.value.trim().toUpperCase();
  if (code.length < 4) { fail("Enter the room code your host shared."); codeEl.focus(); return; }
  try {
    const info = await (await fetch(`/api/rooms/${code}/`)).json();
    if (!info.exists) return fail(`No room "${code}". Check the code with your host.`);
    location.href = `/room/${code}/?role=${role}`;
  } catch { fail("No connection. Check your data and try again."); }
}

$("hostBtn").onclick = () => create("online");
$("cpuBtn").onclick = () => create("cpu");
$("joinBtn").onclick = () => join("player");
$("watchBtn").onclick = () => join("spectate");
codeEl.addEventListener("keydown", (e) => e.key === "Enter" && join("player"));
nameEl.addEventListener("keydown", (e) => e.key === "Enter" && create("online"));
document.querySelectorAll("#botChips .chip").forEach((chip) => {
  chip.onclick = () => {
    bots = +chip.dataset.n;
    document.querySelectorAll("#botChips .chip").forEach((c) => {
      c.classList.toggle("on", c === chip);
      c.setAttribute("aria-checked", c === chip);
    });
  };
});
