self.addEventListener('install', e=>{
  e.waitUntil(caches.open('hk-v2').then(c=>c.addAll([
    './','./index.html','./styles.css','./app.js','https://cdn.jsdelivr.net/npm/chart.js','./manifest.json'
  ])));
});
self.addEventListener('fetch', e=>{
  e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request)));
});