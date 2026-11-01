{% load static %}const CACHE = "whot-io-v1";
const SHELL = [
  "{% url 'offline' %}",
  "{% static 'css/whot.css' %}",
  "{% static 'js/common.js' %}",
  "{% static 'js/home.js' %}",
  "{% static 'js/room.js' %}",
  "{% static 'icons/icon-192.png' %}",
  "{% static 'icons/icon-512.png' %}",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  // Pages: always try the network (rooms are live), fall back to the offline page.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("{% url 'offline' %}")));
    return;
  }
  // Static files: serve from cache instantly, refresh in the background.
  if (url.pathname.startsWith("/static/")) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
