/**
 * jerbi-worker.js — Cloudflare Worker pour Jerbi Explore
 * ──────────────────────────────────────────────────────
 * Variables d'environnement à définir dans Cloudflare Dashboard :
 *   ADMIN_SECRET  : clé secrète pour les opérations admin (ex: "MonMotDePasse123!")
 *   GITHUB_PAT    : Personal Access Token GitHub (scope: public_repo)
 *   GITHUB_OWNER  : ex. "amerbelhadj"
 *   GITHUB_REPO   : ex. "Explore"
 *   JERBI_KV      : KV Namespace binding (créé dans Cloudflare Dashboard)
 *
 * Endpoints disponibles :
 *   POST   /order              → Créer une commande (public)
 *   GET    /orders             → Lister les commandes (admin)
 *   PATCH  /order/:id          → Changer le statut (admin)
 *   POST   /install            → Enregistrer une installation (public)
 *   GET    /installs           → Lister les installations (admin)
 *   GET    /github/file        → Lire un fichier GitHub (admin)
 *   PUT    /github/file        → Écrire un fichier GitHub (admin) - CSV
 *   PUT    /github/config      → Mettre à jour config.js (admin)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Secret',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function checkSecret(request, env) {
  const headerSecret = request.headers.get('X-Admin-Secret');
  const querySecret  = new URL(request.url).searchParams.get('secret');
  return (headerSecret || querySecret) === env.ADMIN_SECRET;
}

/* ═══════════════════════════════════════════════════════
   COMMANDES
═══════════════════════════════════════════════════════ */

async function handleCreateOrder(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'JSON invalide' }, 400); }

  const id = 'ORD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const order = {
    id,
    date:       new Date().toISOString(),
    items:      (body.items || []).slice(0, 50),
    total:      typeof body.total === 'number' ? body.total : 0,
    waMessage:  (body.waMessage || '').slice(0, 1500),
    status:     'pending',   // pending | confirmed | cancelled
    notes:      '',
    createdAt:  Date.now(),
  };

  await env.JERBI_KV.put('order:' + id, JSON.stringify(order), { expirationTtl: 60 * 60 * 24 * 365 }); // 1 an
  return jsonResponse({ success: true, orderId: id });
}

async function handleGetOrders(request, env) {
  if (!checkSecret(request, env)) return jsonResponse({ error: 'Non autorisé' }, 401);

  const list = await env.JERBI_KV.list({ prefix: 'order:' });
  const orders = await Promise.all(
    list.keys.map(async k => {
      const v = await env.JERBI_KV.get(k.name);
      return v ? JSON.parse(v) : null;
    })
  );
  const sorted = orders.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
  return jsonResponse({ orders: sorted, total: sorted.length });
}

async function handleUpdateOrder(request, env, id) {
  if (!checkSecret(request, env)) return jsonResponse({ error: 'Non autorisé' }, 401);

  const raw = await env.JERBI_KV.get('order:' + id);
  if (!raw) return jsonResponse({ error: 'Commande introuvable' }, 404);

  const order = JSON.parse(raw);
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'JSON invalide' }, 400); }

  const validStatuses = ['pending', 'confirmed', 'cancelled'];
  if (body.status && validStatuses.includes(body.status)) order.status = body.status;
  if (typeof body.notes !== 'undefined') order.notes = String(body.notes).slice(0, 500);

  await env.JERBI_KV.put('order:' + id, JSON.stringify(order));
  return jsonResponse({ success: true, order });
}

/* ═══════════════════════════════════════════════════════
   INSTALLATIONS
═══════════════════════════════════════════════════════ */

async function handleTrackInstall(request, env) {
  let body = {};
  try { body = await request.json(); } catch {}

  const id = 'install:' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const record = {
    id,
    date:      new Date().toISOString(),
    platform:  (body.platform  || 'unknown').slice(0, 20),
    userAgent: (body.userAgent || '').slice(0, 200),
    version:   (body.version   || '').slice(0, 20),
    createdAt: Date.now(),
  };

  await env.JERBI_KV.put(id, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 730 }); // 2 ans
  return jsonResponse({ success: true });
}

async function handleGetInstalls(request, env) {
  if (!checkSecret(request, env)) return jsonResponse({ error: 'Non autorisé' }, 401);

  const list = await env.JERBI_KV.list({ prefix: 'install:' });
  const records = await Promise.all(
    list.keys.map(async k => {
      const v = await env.JERBI_KV.get(k.name);
      return v ? JSON.parse(v) : null;
    })
  );
  const sorted = records.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
  const byPlatform = sorted.reduce((acc, r) => {
    acc[r.platform] = (acc[r.platform] || 0) + 1;
    return acc;
  }, {});

  return jsonResponse({ installs: sorted, total: sorted.length, byPlatform });
}

/* ═══════════════════════════════════════════════════════
   PROXY GITHUB
═══════════════════════════════════════════════════════ */

async function githubFetch(env, method, filePath, bodyObj = null) {
  const owner = env.GITHUB_OWNER || 'amerbelhadj';
  const repo  = env.GITHUB_REPO  || 'Explore';
  const url   = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const opts  = {
    method,
    headers: {
      Authorization:  `token ${env.GITHUB_PAT}`,
      Accept:         'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent':   'Jerbi-Admin-Worker/1.0',
    },
  };
  if (bodyObj) opts.body = JSON.stringify(bodyObj);
  return fetch(url, opts);
}

async function handleGitHubGet(request, env) {
  if (!checkSecret(request, env)) return jsonResponse({ error: 'Non autorisé' }, 401);
  const filePath = new URL(request.url).searchParams.get('path');
  if (!filePath) return jsonResponse({ error: 'Paramètre path manquant' }, 400);
  const r = await githubFetch(env, 'GET', filePath);
  const data = await r.json();
  return jsonResponse(data, r.status);
}

async function handleGitHubPutFile(request, env) {
  if (!checkSecret(request, env)) return jsonResponse({ error: 'Non autorisé' }, 401);
  const filePath = new URL(request.url).searchParams.get('path');
  if (!filePath) return jsonResponse({ error: 'Paramètre path manquant' }, 400);
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'JSON invalide' }, 400); }
  const r = await githubFetch(env, 'PUT', filePath, {
    message: body.message || ('Update ' + filePath + ' via Jerbi Admin'),
    content: body.content,  // base64
    sha:     body.sha,
  });
  const data = await r.json();
  return jsonResponse(data, r.status);
}

/* ═══════════════════════════════════════════════════════
   MISE À JOUR CONFIG.JS
   Reconstruit les valeurs clé par clé dans le fichier existant
═══════════════════════════════════════════════════════ */

async function handleConfigUpdate(request, env) {
  if (!checkSecret(request, env)) return jsonResponse({ error: 'Non autorisé' }, 401);
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'JSON invalide' }, 400); }
  const vals = body.values;
  if (!vals || typeof vals !== 'object') return jsonResponse({ error: 'Champ "values" manquant' }, 400);

  // 1. Récupérer config.js actuel (+ SHA pour le commit)
  const getR = await githubFetch(env, 'GET', 'config.js');
  if (!getR.ok) return jsonResponse({ error: 'Impossible de lire config.js sur GitHub', status: getR.status }, 500);
  const existing = await getR.json();
  const sha = existing.sha;

  // 2. Décoder le contenu (base64 → texte)
  // Cloudflare Workers : atob est disponible nativement
  const currentContent = atob(existing.content.replace(/\n/g, ''));

  // 3. Appliquer les modifications
  let newContent = currentContent;
  for (const [key, value] of Object.entries(vals)) {
    let newValue;
    if (typeof value === 'boolean') {
      newValue = String(value);
    } else if (typeof value === 'number') {
      newValue = String(value);
    } else if (Array.isArray(value)) {
      newValue = JSON.stringify(value);
    } else {
      // Chaîne : on échappe les apostrophes et on encadre avec ''
      const escaped = String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      newValue = `'${escaped}'`;
    }
    // Remplace la ligne : KEY: <ancienne_valeur>,
    // Le pattern gère les espaces variables et les valeurs complexes
    const pattern = new RegExp(
      `(\\b${key}\\s*:\\s*)([^,\\n]+)(,?)`,
      'g'
    );
    newContent = newContent.replace(pattern, (match, prefix, _oldVal, comma) => {
      return `${prefix}${newValue}${comma || ','}`;
    });
  }

  // 4. Ré-encoder en base64 et pousser sur GitHub
  // encodeURIComponent + unescape = polyfill pour les caractères Unicode en btoa
  const encoded = btoa(unescape(encodeURIComponent(newContent)));

  const putR = await githubFetch(env, 'PUT', 'config.js', {
    message: 'Update config.js via Jerbi Admin Panel',
    content: encoded,
    sha,
  });
  const putData = await putR.json();

  if (putR.ok) {
    return jsonResponse({ success: true });
  } else {
    return jsonResponse({ error: putData.message || 'Erreur GitHub', details: putData }, putR.status);
  }
}

/* ═══════════════════════════════════════════════════════
   ROUTEUR PRINCIPAL
═══════════════════════════════════════════════════════ */

export default {
  async fetch(request, env) {

    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    // ── Commandes ──────────────────────────────────────
    if (path === '/order'           && method === 'POST')   return handleCreateOrder(request, env);
    if (path === '/orders'          && method === 'GET')    return handleGetOrders(request, env);
    if (path.startsWith('/order/')  && method === 'PATCH')  return handleUpdateOrder(request, env, path.slice(7));

    // ── Installations ──────────────────────────────────
    if (path === '/install'         && method === 'POST')   return handleTrackInstall(request, env);
    if (path === '/installs'        && method === 'GET')    return handleGetInstalls(request, env);

    // ── GitHub Proxy ───────────────────────────────────
    if (path === '/github/file'     && method === 'GET')    return handleGitHubGet(request, env);
    if (path === '/github/file'     && method === 'PUT')    return handleGitHubPutFile(request, env);
    if (path === '/github/config'   && method === 'PUT')    return handleConfigUpdate(request, env);

    // ── Health check ───────────────────────────────────
    if (path === '/'                && method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok', worker: 'Jerbi Explore Backend' }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    return new Response('Not found', { status: 404, headers: CORS });
  },
};
