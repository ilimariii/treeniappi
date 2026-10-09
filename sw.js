/* Treeniäppi – service worker (v0.5.0)
   Verkko ensin: aina kun verkko toimii, käytetään uusinta versiota (päivitykset tulevat heti).
   Jos verkko ei vastaa (offline tai yli 4 s), näytetään viimeksi tallennettu versio välimuistista.
   Tiedot (treenit, ruoka, paino) ovat localStoragessa – service worker ei koske niihin. */
const VERSION = '0.5.0';
const CACHE = 'treeniappi-' + VERSION;
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png', './icons/favicon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(CORE.map(u => c.add(new Request(u, {cache:'reload'})).catch(() => {}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('treeniappi-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function timeout(ms){ return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if(req.method !== 'GET' || url.origin !== self.location.origin) return; /* ruokahaku, viivakoodikirjasto ym. suoraan verkosta */
  const nav = req.mode === 'navigate';
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = nav ? './index.html' : req;
    try{
      const res = await Promise.race([fetch(nav ? new Request(url.pathname, {cache:'no-cache', credentials:'same-origin'}) : req, nav ? undefined : {cache:'no-cache'}), timeout(4000)]);
      if(res && res.ok && res.type === 'basic') cache.put(key, res.clone()).catch(() => {});
      return res;
    } catch(err){
      const hit = await cache.match(key, {ignoreSearch:true}) || (nav ? await cache.match('./', {ignoreSearch:true}) : null);
      if(hit) return hit;
      if(nav) return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Treeniäppi</title><body style="font-family:system-ui;padding:24px"><h1>Ei verkkoyhteyttä</h1><p>Treeniäppiä ei ole vielä tallennettu tälle laitteelle offline-käyttöä varten. Avaa sovellus kerran verkkoyhteyden ollessa päällä.</p></body>', {status:503, headers:{'Content-Type':'text/html; charset=utf-8'}});
      throw err;
    }
  })());
});
