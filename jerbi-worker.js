/**
 * jerbi-worker.js — Cloudflare Worker pour Jerbi Explore
 * ──────────────────────────────────────────────────────────────────
 * Variables d'environnement (Cloudflare Dashboard > Settings > Variables) :
 *   ADMIN_SECRET     : clé secrète pour les opérations admin
 *   GITHUB_PAT       : Personal Access Token GitHub (scope: public_repo)
 *   GITHUB_OWNER     : ex. "amerbelhadj"
 *   GITHUB_REPO      : ex. "Explore"
 *   JERBI_KV         : KV Namespace binding
 *   WHATSAPP_NUMBER  : numéro admin au format international (ex: 21698765432)
 *   WHATSAPP_TOKEN   : token WhatsApp Business API (ou laisser vide pour wa.me)
 *
 * Cron : déclenché chaque nuit à 1h00 UTC (= 2h00 heure Tunis été)
 * Configurer dans wrangler.toml :
 *   [[triggers]]
 *   crons = ["0 1 * * *"]
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
  return headerSecret === env.ADMIN_SECRET;
}

/* ═══════════════════════════════════════════════════════
   COMMANDES
═══════════════════════════════════════════════════════ */

async function handleCreateOrder(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'JSON invalide' }, 400); }
  const id = 'ORD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const order = {
    id, date: new Date().toISOString(),
    items: (body.items || []).slice(0, 50),
    total: typeof body.total === 'number' ? body.total : 0,
    waMessage: (body.waMessage || '').slice(0, 1500),
    status: 'pending', notes: '', createdAt: Date.now(),
  };
  await env.JERBI_KV.put('order:' + id, JSON.stringify(order), { expirationTtl: 60 * 60 * 24 * 365 });
  return jsonResponse({ success: true, orderId: id });
}

async function handleGetOrders(request, env) {
  if (!checkSecret(request, env)) return jsonResponse({ error: 'Non autorisé' }, 401);
  const list = await env.JERBI_KV.list({ prefix: 'order:' });
  const orders = await Promise.all(list.keys.map(async k => {
    const v = await env.JERBI_KV.get(k.name);
    return v ? JSON.parse(v) : null;
  }));
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
  if (body.status && ['pending','confirmed','cancelled'].includes(body.status)) order.status = body.status;
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
    id, date: new Date().toISOString(),
    platform: (body.platform || 'unknown').slice(0, 20),
    userAgent: (body.userAgent || '').slice(0, 200),
    version: (body.version || '').slice(0, 20),
    createdAt: Date.now(),
  };
  await env.JERBI_KV.put(id, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 730 });
  return jsonResponse({ success: true });
}

async function handleGetInstalls(request, env) {
  if (!checkSecret(request, env)) return jsonResponse({ error: 'Non autorisé' }, 401);
  const list = await env.JERBI_KV.list({ prefix: 'install:' });
  const records = await Promise.all(list.keys.map(async k => {
    const v = await env.JERBI_KV.get(k.name);
    return v ? JSON.parse(v) : null;
  }));
  const sorted = records.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
  const byPlatform = sorted.reduce((acc, r) => { acc[r.platform] = (acc[r.platform] || 0) + 1; return acc; }, {});
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
      Authorization: `token ${env.GITHUB_PAT}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Jerbi-Admin-Worker/1.0',
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
    content: body.content,
    sha: body.sha,
  });
  const data = await r.json();
  return jsonResponse(data, r.status);
}

/* ═══════════════════════════════════════════════════════
   MISE À JOUR CONFIG.JS
═══════════════════════════════════════════════════════ */

async function handleConfigUpdate(request, env) {
  if (!checkSecret(request, env)) return jsonResponse({ error: 'Non autorisé' }, 401);
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'JSON invalide' }, 400); }
  const vals = body.values;
  if (!vals || typeof vals !== 'object') return jsonResponse({ error: 'Champ "values" manquant' }, 400);
  const getR = await githubFetch(env, 'GET', 'config.js');
  if (!getR.ok) return jsonResponse({ error: 'Impossible de lire config.js', status: getR.status }, 500);
  const existing = await getR.json();
  const sha = existing.sha;
  const currentContent = atob(existing.content.replace(/\n/g, ''));
  let newContent = currentContent;
  for (const [key, value] of Object.entries(vals)) {
    let newValue;
    if (typeof value === 'boolean') newValue = String(value);
    else if (typeof value === 'number') newValue = String(value);
    else if (Array.isArray(value)) newValue = JSON.stringify(value);
    else { const escaped = String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); newValue = `'${escaped}'`; }
    const pattern = new RegExp(`(\\b${key}\\s*:\\s*)([^,\\n]+)(,?)`, 'g');
    newContent = newContent.replace(pattern, (match, prefix, _oldVal, comma) => `${prefix}${newValue}${comma || ','}`);
  }
  const encoded = btoa(unescape(encodeURIComponent(newContent)));
  const putR = await githubFetch(env, 'PUT', 'config.js', {
    message: 'Update config.js via Jerbi Admin Panel',
    content: encoded, sha,
  });
  const putData = await putR.json();
  if (putR.ok) return jsonResponse({ success: true });
  return jsonResponse({ error: putData.message || 'Erreur GitHub', details: putData }, putR.status);
}

/* ═══════════════════════════════════════════════════════
   BACKUP CSV
═══════════════════════════════════════════════════════ */

async function handleGetBackup(request, env, fileKey) {
  if (!checkSecret(request, env)) return jsonResponse({ error: 'Non autorisé' }, 401);
  const raw = await env.JERBI_KV.get('backup:' + fileKey);
  if (!raw) return jsonResponse({ backups: [] });
  return jsonResponse(JSON.parse(raw));
}

async function handlePutBackup(request, env, fileKey) {
  if (!checkSecret(request, env)) return jsonResponse({ error: 'Non autorisé' }, 401);
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'JSON invalide' }, 400); }
  const backups = (body.backups || []).slice(0, 10);
  await env.JERBI_KV.put('backup:' + fileKey, JSON.stringify({ backups }));
  return jsonResponse({ success: true, count: backups.length });
}

/* ═══════════════════════════════════════════════════════
   AGENDA — Suggestions et nettoyage
═══════════════════════════════════════════════════════ */

const CSV_DELIM = ';';
const EVENEMENTS_PATH = 'data/evenements.csv';

// Parse CSV texte → tableau d'objets
function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(CSV_DELIM).map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    // Gestion des champs entre guillemets
    const fields = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuote = !inQuote; }
      else if (line[i] === CSV_DELIM && !inQuote) { fields.push(cur.trim()); cur = ''; }
      else cur += line[i];
    }
    fields.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = fields[i] || ''; });
    return obj;
  }).filter(r => Object.values(r).some(v => v));
  return { headers, rows };
}

// Sérialise tableau d'objets → texte CSV
function serializeCSV(headers, rows) {
  const escape = v => {
    const s = String(v || '');
    return s.includes(CSV_DELIM) || s.includes('"') || s.includes('\n')
      ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.join(CSV_DELIM)];
  rows.forEach(row => lines.push(headers.map(h => escape(row[h] || '')).join(CSV_DELIM)));
  return lines.join('\n');
}

// Lire evenements.csv depuis GitHub
async function readEvenementsCSV(env) {
  const r = await githubFetch(env, 'GET', EVENEMENTS_PATH);
  if (!r.ok) throw new Error('GitHub GET evenements.csv: ' + r.status);
  const data = await r.json();
  // Décodage UTF-8 correct : atob() seul retourne du latin-1 brut
  // → il faut passer par decodeURIComponent(escape()) pour les accents
  const raw = data.content.replace(/\n/g, '');
  let content;
  try {
    content = decodeURIComponent(escape(atob(raw)));
  } catch(e) {
    // Fallback si le CSV n'est pas encodé en UTF-8 (ancien fichier latin-1)
    content = atob(raw);
  }
  return { ...parseCSV(content), sha: data.sha, raw: content };
}

// Écrire evenements.csv sur GitHub
async function writeEvenementsCSV(env, headers, rows, sha, message) {
  const csvText = serializeCSV(headers, rows);
  const encoded = btoa(unescape(encodeURIComponent(csvText)));
  const r = await githubFetch(env, 'PUT', EVENEMENTS_PATH, { message, content: encoded, sha });
  if (!r.ok) {
    const d = await r.json();
    throw new Error('GitHub PUT: ' + (d.message || r.status));
  }
  return r;
}

/* ── Option A : Nettoyage des événements passés ──────────────────
   Supprime toutes les lignes dont la date est strictement antérieure
   à aujourd'hui (heure Tunis UTC+1). Retourne le rapport.
   ────────────────────────────────────────────────────────────── */
async function cleanPastEvents(env) {
  const { headers, rows, sha } = await readEvenementsCSV(env);
  const todayStr = new Date(Date.now() - 0).toISOString().slice(0, 10); // YYYY-MM-DD UTC
  // Heure Tunis = UTC+1 (UTC+2 en été) — on utilise UTC simple, marge d'1 jour max
  const dateIdx = headers.indexOf('Date');
  if (dateIdx === -1) return { removed: 0, kept: rows.length, note: 'Colonne Date introuvable' };

  const kept    = [];
  const removed = [];

  rows.forEach(row => {
    const d = (row['Date'] || '').trim();
    // Format attendu : YYYY-MM-DD. Si vide ou invalide → garder
    if (!d || d < todayStr) {
      removed.push(row['Titre'] || d);
    } else {
      kept.push(row);
    }
  });

  if (!removed.length) return { removed: 0, kept: kept.length, sha };

  await writeEvenementsCSV(env, headers, kept, sha,
    `Nettoyage automatique : ${removed.length} événement(s) passé(s) supprimé(s)`);

  return { removed: removed.length, removedTitles: removed, kept: kept.length };
}

/* ── Option C : Recherche de nouveaux événements (Brave Search) ──
   Cherche "événements Cap Bon" + villes clés sur Brave Search.
   Extrait les résultats, déduplique vs CSV existant.
   Stocke les suggestions dans KV pour validation admin.
   ────────────────────────────────────────────────────────────── */


/* ── Notification WhatsApp
/* ── Notification WhatsApp ──────────────────────────────────────
   Utilise l'API wa.me (lien direct) via une requête fetch simulée.
   Pour un vrai envoi automatique, configurer WhatsApp Business API
   (Meta) et renseigner WHATSAPP_TOKEN.
   En attendant : stocke le message dans KV pour affichage admin.
   ────────────────────────────────────────────────────────────── */
async function sendAdminNotification(env, message) {
  // Stocker la notification dans KV pour lecture dans l'admin
  const notifications = [];
  try {
    const raw = await env.JERBI_KV.get('admin:notifications');
    if (raw) notifications.push(...JSON.parse(raw));
  } catch(e) {}
  notifications.unshift({ date: new Date().toISOString(), message });
  const kept = notifications.slice(0, 20); // garder les 20 dernières
  await env.JERBI_KV.put('admin:notifications', JSON.stringify(kept),
    { expirationTtl: 60 * 60 * 24 * 30 });

  // Si WhatsApp Business API configurée → envoi réel
  if (env.WHATSAPP_TOKEN && env.WHATSAPP_NUMBER && env.WHATSAPP_PHONE_ID) {
    try {
      await fetch(`https://graph.facebook.com/v18.0/${env.WHATSAPP_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: env.WHATSAPP_NUMBER,
          type: 'text',
          text: { body: message.slice(0, 4096) },
        }),
      });
    } catch(e) { /* échec silencieux — notification KV reste */ }
  }
}

/* ── Tâche cron principale ──────────────────────────────────────
   Appelée chaque nuit à 1h UTC par le Cron Trigger Cloudflare.
   1. Nettoyage des événements passés (Option A)
   2. Recherche de nouveaux événements (Option C)
   3. Notification admin
   ────────────────────────────────────────────────────────────── */
async function runNightlyTask(env) {
  const report = { startedAt: new Date().toISOString(), steps: [] };

  // Nettoyage des événements passés
  try {
    const clean = await cleanPastEvents(env);
    report.steps.push({ step: 'cleanup', ...clean });
  } catch(e) {
    report.steps.push({ step: 'cleanup', error: e.message });
  }

  // Notification admin
  const cleanStep = report.steps.find(s => s.step === 'cleanup') || {};
  const removed   = cleanStep.removed || 0;

  const notifMsg = '🌙 Rapport nuit Jerbi Explore — ' + new Date().toLocaleDateString('fr-FR') + '\n\n'
    + (removed > 0
      ? '🗑️ ' + removed + ' événement(s) passé(s) supprimé(s) du CSV.'
      : '✅ Aucun événement passé à supprimer.');

  await sendAdminNotification(env, notifMsg);

  await env.JERBI_KV.put('agenda:last-report', JSON.stringify(report),
    { expirationTtl: 60 * 60 * 24 * 7 });

  return report;
}

/* ── Endpoints HTTP pour l'admin ────────────────────────────── */

// POST /agenda/run-cleanup → déclencher le nettoyage manuellement
async function handleManualCleanup(request, env) {
  if (!checkSecret(request, env)) return jsonResponse({ error: 'Non autorisé' }, 401);
  try {
    const result = await cleanPastEvents(env);
    return jsonResponse({ success: true, ...result });
  } catch(e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

// GET /agenda/notifications → lire les notifications admin
async function handleGetNotifications(request, env) {
  if (!checkSecret(request, env)) return jsonResponse({ error: 'Non autorisé' }, 401);
  const raw = await env.JERBI_KV.get('admin:notifications');
  return jsonResponse({ notifications: raw ? JSON.parse(raw) : [] });
}

/* ═══════════════════════════════════════════════════════
   ROUTEUR PRINCIPAL + CRON
═══════════════════════════════════════════════════════ */

export default {

  // ── Requêtes HTTP ────────────────────────────────────
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    // Commandes
    if (path === '/order'           && method === 'POST')   return handleCreateOrder(request, env);
    if (path === '/orders'          && method === 'GET')    return handleGetOrders(request, env);
    if (path.startsWith('/order/')  && method === 'PATCH')  return handleUpdateOrder(request, env, path.slice(7));

    // Installations
    if (path === '/install'         && method === 'POST')   return handleTrackInstall(request, env);
    if (path === '/installs'        && method === 'GET')    return handleGetInstalls(request, env);

    // GitHub Proxy
    if (path === '/github/file'     && method === 'GET')    return handleGitHubGet(request, env);
    if (path === '/github/file'     && method === 'PUT')    return handleGitHubPutFile(request, env);
    if (path === '/github/upload-image' && method === 'POST') return handleImageUpload(request, env);
    if (path === '/github/list-images'  && method === 'GET')  return handleListImages(request, env);
    if (path === '/github/delete-image' && method === 'DELETE') return handleDeleteImage(request, env);
    if (path === '/github/config'   && method === 'PUT')    return handleConfigUpdate(request, env);

    // Backups CSV
    if (path.startsWith('/backup/') && method === 'GET')    return handleGetBackup(request, env, path.slice(8));
    if (path.startsWith('/backup/') && method === 'PUT')    return handlePutBackup(request, env, path.slice(8));

    // Agenda
    if (path === '/agenda/run-cleanup' && method === 'POST')   return handleManualCleanup(request, env);
    if (path === '/agenda/notifications' && method === 'GET')  return handleGetNotifications(request, env);

    // Health check
    if (path === '/' && method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok', worker: 'Jerbi Explore Backend v2' }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    return new Response('Not found', { status: 404, headers: CORS });
  },

  // ── Cron Trigger : chaque nuit à 1h00 UTC ────────────
  // Configurer dans wrangler.toml :
  //   [[triggers]]
  //   crons = ["0 1 * * *"]
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runNightlyTask(env));
  },
};

/* ═══════════════════════════════════════════════════════
   GESTION IMAGES — Upload / Listage / Suppression
   via GitHub API (même mécanique que les CSV)
═══════════════════════════════════════════════════════ */

// Dossiers d'images autorisés
const IMAGE_FOLDERS = {
  'partenaires':   'data/partenaires_images',
  'experiences':   'data/Experiences/images_experiences',
  'eshop':         'data/e_shop/images_e_shop',
  'gallery':       'data/Images',
  'background':    'data/Background',
};

// Extensions autorisées
const ALLOWED_EXT = ['jpg','jpeg','png','webp','gif','avif'];

function getImageFolder(folder) {
  return IMAGE_FOLDERS[folder] || null;
}

// POST /github/upload-image
// Body JSON : { folder, filename, base64, sha? (si remplacement) }
async function handleImageUpload(request, env) {
  if (!checkSecret(request, env)) return jsonResponse({ error: 'Non autorisé' }, 401);
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'JSON invalide' }, 400); }

  const { folder, filename, base64, sha } = body;
  if (!folder || !filename || !base64) return jsonResponse({ error: 'Champs manquants: folder, filename, base64' }, 400);

  const dir = getImageFolder(folder);
  if (!dir) return jsonResponse({ error: 'Dossier inconnu: ' + folder }, 400);

  // Vérifier l'extension
  const ext = filename.split('.').pop().toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return jsonResponse({ error: 'Extension non autorisée: ' + ext }, 400);

  // Nettoyer le nom de fichier (sécurité)
  const safeName = filename.replace(/[^a-zA-Z0-9._\-]/g, '_');
  const path = dir + '/' + safeName;

  // Vérifier si le fichier existe déjà (pour récupérer le sha)
  let existingSha = sha;
  if (!existingSha) {
    try {
      const check = await githubFetch(env, 'GET', path);
      if (check.ok) {
        const existing = await check.json();
        existingSha = existing.sha;
      }
    } catch(e) { /* fichier nouveau, pas de sha */ }
  }

  const putBody = {
    message: 'Upload image ' + safeName + ' via Jerbi Admin',
    content: base64,
  };
  if (existingSha) putBody.sha = existingSha;

  const r = await githubFetch(env, 'PUT', path, putBody);
  if (!r.ok) {
    const d = await r.json();
    return jsonResponse({ error: d.message || 'Erreur GitHub', details: d }, r.status);
  }
  const d = await r.json();
  return jsonResponse({ success: true, path: path, sha: d.content?.sha });
}

// GET /github/list-images?folder=partenaires
async function handleListImages(request, env) {
  if (!checkSecret(request, env)) return jsonResponse({ error: 'Non autorisé' }, 401);
  const url = new URL(request.url);
  const folder = url.searchParams.get('folder');
  const dir = getImageFolder(folder);
  if (!dir) return jsonResponse({ error: 'Dossier inconnu: ' + folder }, 400);

  const r = await githubFetch(env, 'GET', dir);
  if (!r.ok) {
    if (r.status === 404) return jsonResponse({ files: [] });
    return jsonResponse({ error: 'Erreur GitHub ' + r.status }, r.status);
  }
  const data = await r.json();
  const files = Array.isArray(data)
    ? data
        .filter(f => f.type === 'file' && ALLOWED_EXT.includes(f.name.split('.').pop().toLowerCase()))
        .map(f => ({ name: f.name, sha: f.sha, size: f.size, path: f.path, download_url: f.download_url }))
    : [];
  return jsonResponse({ files });
}

// DELETE /github/delete-image
// Body JSON : { folder, filename, sha }
async function handleDeleteImage(request, env) {
  if (!checkSecret(request, env)) return jsonResponse({ error: 'Non autorisé' }, 401);
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'JSON invalide' }, 400); }

  const { folder, filename, sha } = body;
  if (!folder || !filename || !sha) return jsonResponse({ error: 'Champs manquants: folder, filename, sha' }, 400);

  const dir = getImageFolder(folder);
  if (!dir) return jsonResponse({ error: 'Dossier inconnu' }, 400);

  const safeName = filename.replace(/[^a-zA-Z0-9._\-]/g, '_');
  const path = dir + '/' + safeName;

  const r = await githubFetch(env, 'DELETE', path, {
    message: 'Suppression image ' + safeName + ' via Jerbi Admin',
    sha: sha,
  });
  if (!r.ok) {
    const d = await r.json();
    return jsonResponse({ error: d.message || 'Erreur GitHub' }, r.status);
  }
  return jsonResponse({ success: true });
}
