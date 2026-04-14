/* ══════════════════════════════════════════════════════
   SW.JS — Service Worker · Jerbi Explore Cap Bon
   v3.1.0 — Corrections robustesse chargement

   Stratégies :
   - App shell (HTML/JS/CSS/icons) : network-first + cache fallback
   - CSV données : network-first + cache fallback
   - CDN (Leaflet, PapaParse, Fonts) : cache-first
   - Images galerie : cache-first lazy (PAS précachées)
   - Tuiles carte : cache-first dynamique
══════════════════════════════════════════════════════ */

const CACHE_VERSION = 'jerbi-v3.8.1';
const CACHE_STATIC  = `${CACHE_VERSION}-static`;
const CACHE_DYNAMIC = `${CACHE_VERSION}-dynamic`;

const BASE_PATH = '/Explore';

/* Assets précachés à l'installation — UNIQUEMENT l'essentiel
   Les images galerie sont exclues (peuvent être 404 si pas encore uploadées) */
const STATIC_ASSETS = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/manifest.json`,
  /* config.js est optionnel — le code tombe sur les valeurs par défaut si absent */
  /* Icônes PWA */
  `${BASE_PATH}/logo.png`,
  `${BASE_PATH}/icon-192.png`,
  `${BASE_PATH}/icon-512.png`,
  /* Données CSV */
  `${BASE_PATH}/data/lieux.csv`,
  `${BASE_PATH}/data/partenaires.csv`,
  `${BASE_PATH}/data/evenements.csv`,
  `${BASE_PATH}/data/Videos/Video.csv`,
  `${BASE_PATH}/data/faq.csv`,
  `${BASE_PATH}/data/e_shop/produits.csv`,
  `${BASE_PATH}/data/Experiences/experiences.csv`,
  `${BASE_PATH}/data/Background/bg-dark.jpg`,
  `${BASE_PATH}/data/Background/bg-light.jpg`,
  /* Chat IA hybride */
  `${BASE_PATH}/jerbi-chat.js`,
  /* Libs CDN */
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
];

const CDN_DOMAINS = [
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'server.arcgisonline.com',
  'basemaps.cartocdn.com',
];

function isCdnUrl(url) {
  return CDN_DOMAINS.some(d => url.includes(d));
}

/* ── INSTALL ────────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache =>
      Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Précache ignoré :', url, err.message)
          )
        )
      )
    )
    /* Pas de skipWaiting — le banner update le déclenchera */
  );
});

/* ── ACTIVATE : purge des anciens caches ────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_DYNAMIC)
          .map(k => {
            console.log('[SW] Suppression ancien cache :', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH ──────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  if (request.method !== 'GET') return;
  if (url.startsWith('chrome-extension://')) return;

  /* CDN → cache-first */
  if (isCdnUrl(url)) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  /* App shell + données locales → network-first */
  if (url.includes(BASE_PATH)) {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  /* Tuiles carte → cache-first dynamique */
  if (url.includes('tile') || url.includes('arcgis') || url.includes('carto')) {
    event.respondWith(cacheFirst(request, CACHE_DYNAMIC));
    return;
  }
});

/* ── Stratégies ─────────────────────────────────────── */
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(request, response.clone());
      return response;
    }
    /* Réponse réseau non-ok (404, 500…) → essayer le cache avant de retourner l'erreur */
    const cached = await caches.match(request);
    if (cached) return cached;
    return response; /* retourner l'erreur HTTP si rien en cache */
  } catch {
    /* Réseau indisponible → chercher dans le cache */
    const cached = await caches.match(request);
    if (cached) return cached;

    /* Fallback final : index.html pour toutes les routes SPA */
    const indexFallback =
      await caches.match(`${BASE_PATH}/index.html`) ||
      await caches.match(`${BASE_PATH}/`);

    if (indexFallback) return indexFallback;

    /* Dernier recours : réponse vide mais valide (évite page blanche totale) */
    return new Response(
      '<!DOCTYPE html><html><body><p style="font-family:sans-serif;text-align:center;padding:40px">Jerbi Explore — hors connexion. <a href="/">Réessayer</a></p></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503, statusText: 'Service Unavailable' });
  }
}

/* ── MESSAGES ───────────────────────────────────────── */
self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING → activation immédiate');
    self.skipWaiting();
  }

  if (event.data.type === 'PING') {
    event.ports[0]?.postMessage({ type: 'PONG', version: CACHE_VERSION });
  }
});
