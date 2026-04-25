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

const CACHE_VERSION = 'jerbi-v3.18.5'; // fix nav sticky
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

  /* CSV et données → network-first avec timeout 5s + fallback cache
     Le ?t= cache-buster est IGNORÉ par le SW pour permettre le fallback cache offline
     Le réseau est toujours tenté en premier (network-first) mais si hors ligne,
     on retourne la version cachée → les partenaires/événements restent visibles */
  if (url.includes(BASE_PATH) && (url.includes('.csv') || url.includes('message.txt'))) {
    // Normaliser l'URL : supprimer ?t= pour la clé de cache
    // On fetch avec l'URL originale (cache-buster ok pour le réseau)
    // mais on stocke/recherche SANS le cache-buster
    event.respondWith(networkFirstTimeoutWithNormalizedCache(request, 5000));
    return;
  }

  /* Images des dossiers data/ → cache-first dynamique
     Au 1er accès en ligne : mise en cache automatique
     Hors ligne : retourner l'image depuis le cache si disponible
     Si jamais vue (pas en cache) : retourner 404 propre (pas index.html)
     → le JS côté client affiche le fallback emoji via onerror */
  if (url.includes(BASE_PATH + '/data/') && isImageUrl(url)) {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  /* App shell (HTML/JS/config) → network-first */
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

/* Stale-While-Revalidate : retourne le cache immédiatement
   ET lance une mise à jour en arrière-plan.
   Résultat : affichage instantané + données fraîches au prochain fetch. */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_STATIC);
  const cached = await cache.match(request);
  // Lancer la mise à jour réseau en arrière-plan (sans await)
  const fetchPromise = fetch(request).then(response => {
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);
  // Retourner le cache immédiatement s'il existe, sinon attendre le réseau
  return cached || fetchPromise;
}

/* Network-first avec timeout — si réseau répond dans le délai → utilise réseau + met en cache
   Si timeout ou erreur → fallback cache immédiat */
/* Network-first avec URL normalisée pour le cache :
   On fetch l'URL complète (avec ?t=...) pour toujours avoir des données fraîches,
   mais on stocke et recherche dans le cache SANS le ?t= 
   → hors ligne, le cache répond même si l'URL originale avait un cache-buster */
async function networkFirstTimeoutWithNormalizedCache(request, timeoutMs) {
  // URL normalisée = sans paramètres de cache-buster
  const normalizedUrl = request.url.replace(/[?&]t=\d+/g, '').replace(/[?&]+$/, '');
  const normalizedRequest = new Request(normalizedUrl, {
    method: request.method,
    headers: request.headers,
    mode: 'same-origin',
    credentials: request.credentials,
  });
  const cache = await caches.open(CACHE_STATIC);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // Fetch avec l'URL originale (cache-buster inclus si présent)
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response && response.ok) {
      // Stocker sous l'URL normalisée
      cache.put(normalizedRequest, response.clone());
      return response;
    }
    // Réponse non-ok → essayer le cache normalisé
    const cached = await cache.match(normalizedRequest);
    return cached || response;
  } catch {
    // Hors ligne → chercher dans le cache avec l'URL normalisée
    const cached = await cache.match(normalizedRequest);
    if (cached) return cached;
    return new Response('', { status: 503 });
  }
}

async function networkFirstTimeout(request, timeoutMs) {
  const cache = await caches.open(CACHE_STATIC);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response && response.ok) {
      cache.put(request, response.clone());
      return response;
    }
    const cached = await cache.match(request);
    return cached || response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response('', { status: 503 });
  }
}

function isImageUrl(url) {
  return /\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i.test(url);
}

/* Cache-first pour les images data/ :
   - Cache hit → retourne immédiatement (offline OK)
   - Cache miss → fetch réseau + mise en cache + retourne la réponse
   - Réseau indisponible + pas en cache → 404 propre (pas de fallback HTML)
     Le navigateur déclenche onerror sur l'<img> → fallback emoji JS */
async function cacheFirstImage(request) {
  const cache = await caches.open(CACHE_DYNAMIC);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Pas en cache + hors ligne → 404 sans corps
    // Le navigateur déclenche onerror → fallback emoji côté JS
    return new Response('', {
      status: 404,
      statusText: 'Image not cached',
      headers: { 'Content-Type': 'text/plain' }
    });
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

  /* Appelé après sauvegarde admin d'un fichier CSV ou config.js
     Invalide l'entrée de cache correspondante pour forcer un refetch réseau */
  if (event.data.type === 'CLEAR_CACHE' && event.data.url) {
    caches.open(CACHE_STATIC).then(cache => {
      cache.delete(event.data.url).then(deleted => {
        console.log('[SW] Cache invalidé :', event.data.url, deleted);
      });
    });
  }

  /* Vide toutes les entrées CSV + config.js du cache statique */
  if (event.data.type === 'CLEAR_ALL_CSV') {
    caches.open(CACHE_STATIC).then(cache => {
      cache.keys().then(keys => {
        keys.forEach(req => {
          if (req.url.includes('.csv') || req.url.includes('config.js')) {
            cache.delete(req);
            console.log('[SW] CSV/config supprimé du cache :', req.url);
          }
        });
      });
    });
  }
});
