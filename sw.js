/* Service worker du Carnet de drainage : permet d'ouvrir l'appli sans connexion.
   Il ne met en cache que le code de l'appli, jamais les fiches (elles restent dans le stockage de l'appareil). */
'use strict';
const VERSION = 'carnet-2026-10-28-1';
const FICHIERS = ['./', 'index.html', 'qr.js', 'fusion.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(cles => Promise.all(cles.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const accueil = () => new URL('./', self.registration.scope).href;
function avecDelai(promesse, ms){ return new Promise((ok, ko) => { const t = setTimeout(() => ko(new Error('délai')), ms); promesse.then(r => { clearTimeout(t); ok(r); }, e => { clearTimeout(t); ko(e); }); }); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Page : la version en ligne si elle répond vite, sinon celle gardée sur l'appareil
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const rep = await avecDelai(fetch(req, {cache: 'no-cache'}), 4000);
        if (rep && rep.ok) { cache.put(accueil(), rep.clone()); return rep; }
        // Site indisponible (erreur, page retirée) : la dernière version gardée sur l'appareil
        return (await cache.match(accueil())) || (await cache.match('index.html')) || rep;
      } catch (err) {
        return (await cache.match(accueil())) || (await cache.match('index.html')) || Response.error();
      }
    })());
    return;
  }
  // Fichiers de l'appli : ceux de l'appareil d'abord, mis à jour en arrière-plan
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const garde = await cache.match(req);
    const reseau = fetch(req).then(rep => { if (rep && rep.ok) cache.put(req, rep.clone()); return rep; }).catch(() => null);
    if (garde) { e.waitUntil(reseau); return garde; }
    return (await reseau) || Response.error();
  })());
});
