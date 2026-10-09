/* Treeniäppi – service worker (v0.5.1)
   Välimuisti ensin: äppi aukeaa heti myös heikolla verkolla tai ilman verkkoa. Uusi versio haetaan taustalla
   ja otetaan käyttöön seuraavalla avauksella (sivulle ilmoitetaan "Uusi versio saatavilla – Päivitä").
   Viivakoodinlukija (ZXing) tallennetaan laitteelle, joten skannaus toimii myös ilman verkkoa.
   Tiedot (treenit, ruoka, paino) ovat localStoragessa – service worker ei koske niihin. */
const VERSION = '0.5.1';
const CACHE = 'treeniappi-' + VERSION, EXT = 'treeniappi-ext';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png', './icons/favicon.svg'];
const ZXING = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/umd/zxing-browser.min.js';
const SCOPE = new URL(self.registration.scope).pathname;

self.addEventListener('install', e => {
  e.waitUntil(Promise.all([
    caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(new Request(u, {cache:'reload'})).catch(() => {})))),
    caches.open(EXT).then(c => c.match(ZXING).then(hit => hit || c.add(new Request(ZXING, {mode:'cors', credentials:'omit'})))).catch(() => {})
  ]).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('treeniappi-') && k !== CACHE && k !== EXT).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function timeout(ms){ return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }
async function notifyUpdate(){
  const list = await self.clients.matchAll({type:'window', includeUncontrolled:true});
  list.forEach(c => c.postMessage({type:'update-ready'}));
}
const OFFLINE_PAGE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Treeniäppi</title><body style="font-family:system-ui;padding:24px"><h1>Ei verkkoyhteyttä</h1><p>Treeniäppiä ei ole vielä tallennettu tälle laitteelle offline-käyttöä varten. Avaa sovellus kerran verkkoyhteyden ollessa päällä.</p></body>';

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if(req.method !== 'GET') return;
  /* Viivakoodinlukija: välimuisti ensin */
  if(req.url === ZXING){
    e.respondWith(caches.open(EXT).then(async c => {
      const hit = await c.match(ZXING); if(hit) return hit;
      const res = await fetch(req); if(res.ok) c.put(ZXING, res.clone()).catch(() => {}); return res;
    }));
    return;
  }
  if(url.origin !== self.location.origin) return; /* ruokahaku ym. suoraan verkosta */
  const nav = req.mode === 'navigate';
  const shell = nav && (url.pathname === SCOPE || url.pathname === SCOPE + 'index.html');
  if(nav && !shell) return; /* muut sivut (esim. kuvat suoraan avattuna) eivät saa korvata tallennettua äppiä */
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = shell ? './index.html' : req;
    const cached = await cache.match(key, {ignoreSearch:true}) || (shell ? await cache.match('./', {ignoreSearch:true}) : null);
    const oldText = shell && cached ? cached.clone().text() : null;
    const fresh = fetch(shell ? new Request(url.pathname, {cache:'no-cache', credentials:'same-origin'}) : req, shell ? undefined : {cache:'no-cache'})
      .then(async res => {
        if(res && res.ok && res.type === 'basic'){
          if(shell){
            const txt = await res.clone().text(), old = oldText ? await oldText : null;
            await cache.put(key, res.clone());
            if(old != null && old !== txt) notifyUpdate();
          } else cache.put(key, res.clone()).catch(() => {});
        }
        return res;
      });
    if(cached){ e.waitUntil(fresh.catch(() => {})); return cached; }
    try{ return await Promise.race([fresh, timeout(8000)]); }
    catch(err){
      if(shell) return new Response(OFFLINE_PAGE, {status:503, headers:{'Content-Type':'text/html; charset=utf-8'}});
      throw err;
    }
  })());
});
