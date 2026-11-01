// Shared helpers: identity, toast, card drawing, PWA install + service worker.
const SHAPE_COLORS = { circle: "#e8283a", triangle: "#0e9f6e", cross: "#2563eb", square: "#f08a00", star: "#9333ea" };
const SHAPE_NAMES = { circle: "Circle", triangle: "Triangle", cross: "Cross", square: "Square", star: "Star" };
const TAGS = { 1: "HOLD ON", 2: "PICK 2", 5: "PICK 3", 8: "SUSPEND", 14: "MARKET" };
const PATHS = {
  circle: '<circle cx="12" cy="12" r="9.5"/>',
  triangle: '<polygon points="12,2.5 22.5,21 1.5,21"/>',
  cross: '<path d="M9 1.5h6v7.5h7.5v6H15v7.5H9V15H1.5V9H9z"/>',
  square: '<rect x="3" y="3" width="18" height="18" rx="2.5"/>',
  star: '<polygon points="12,1.5 15,8.4 22.5,9.1 16.8,14 18.6,21.5 12,17.6 5.4,21.5 7.2,14 1.5,9.1 9,8.4"/>',
};

function shapeSVG(shape) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${PATHS[shape]}</svg>`;
}

function cardHTML(c, extra = "") {
  if (c.shape === "whot") {
    return `<div class="card whot ${extra}" data-id="${c.id}" aria-label="Whot 20"><div class="w-num">20</div><div class="w-word">WHOT</div></div>`;
  }
  const tag = TAGS[c.num] ? `<div class="tag">${TAGS[c.num]}</div>` : "";
  return `<div class="card s-${c.shape} ${extra}" data-id="${c.id}" style="--c:${SHAPE_COLORS[c.shape]}" aria-label="${SHAPE_NAMES[c.shape]} ${c.num}">
    <div class="corner tl"><b>${c.num}</b>${shapeSVG(c.shape)}</div>
    <div class="big">${shapeSVG(c.shape)}</div>${tag}
    <div class="corner br"><b>${c.num}</b>${shapeSVG(c.shape)}</div></div>`;
}

function myId() {
  let id = localStorage.getItem("whot_pid");
  if (!id || id.length < 8) {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    id = Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("whot_pid", id);
  }
  return id;
}
const getName = () => localStorage.getItem("whot_name") || "";
const setName = (n) => localStorage.setItem("whot_name", n);

let toastTimer;
function toast(msg, kind = "") {
  const t = document.getElementById("toast");
  t.className = "show " + kind;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ""), 2600);
}

// ----- PWA -----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {}));
}
let deferredInstall;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstall = e;
  const b = document.getElementById("installBtn");
  if (b) b.hidden = false;
});
window.addEventListener("appinstalled", () => {
  const b = document.getElementById("installBtn");
  if (b) b.hidden = true;
});
document.addEventListener("DOMContentLoaded", () => {
  const b = document.getElementById("installBtn");
  if (b) b.addEventListener("click", async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    b.hidden = true;
  });
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const tip = document.getElementById("iosTip");
  if (tip && ios && !standalone) tip.hidden = false;
  document.querySelectorAll("[data-demo]").forEach((el) => {
    const [shape, num] = el.dataset.demo.split(",");
    const tmp = document.createElement("div");
    tmp.innerHTML = cardHTML({ id: 0, shape, num: +num });
    el.innerHTML = tmp.firstElementChild.innerHTML;
    el.style.setProperty("--c", SHAPE_COLORS[shape]);
  });
});
