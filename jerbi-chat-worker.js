/* ══════════════════════════════════════════════════════════
   JERBI CHAT PROXY — Worker Cloudflare
   Proxy sécurisé vers l'API Groq (clé cachée côté serveur)

   Variable à configurer dans Cloudflare Dashboard :
     GROQ_API_KEY  →  votre clé gsk_...

   Déploiement :
     wrangler deploy jerbi-chat-worker.js --name chatjerbiexplore
══════════════════════════════════════════════════════════ */

/* ── Origines autorisées ────────────────────────────────── */
const ALLOWED_ORIGINS = [
  'https://amerbelhadj.github.io',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:3000',
];

/* ── Modèle Groq utilisé ────────────────────────────────── */
const GROQ_MODEL   = 'llama3-8b-8192';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_TOKENS   = 450;
const TEMPERATURE  = 0.7;

/* ── Prompt système — personnalité du guide ─────────────── */
const SYSTEM_PROMPT = `Tu es Jerbi, guide touristique expert et passionné du Cap Bon (Tunisie).
Tu connais parfaitement la région : plages, restaurants, hébergements, activités nautiques,
plongée, kayak, événements locaux, transport, météo saisonnière, culture et gastronomie.
Villes couvertes : Nabeul, Hammamet, Kelibia, El Haouaria, Korba, Menzel Temime, Grombalia.

Règles de réponse :
- Réponds TOUJOURS en français, de façon chaleureuse, précise et locale
- Maximum 3 paragraphes courts ou une liste concise
- Donne des conseils pratiques et concrets (horaires, prix approximatifs, saisons)
- Si tu ne sais pas, dis-le honnêtement et suggère de contacter Jerbi Explore
- Ne parle pas d'autres régions sauf pour comparer avec le Cap Bon
- Utilise parfois des mots tunisiens courants (marhba, barsha, mazel)`;

/* ── Helper CORS ─────────────────────────────────────────── */
function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

/* ── Handler principal ───────────────────────────────────── */
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    /* Preflight CORS */
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    /* Health check — GET / */
    if (request.method === 'GET') {
      return jsonResponse({
        status:  'ok',
        service: 'Jerbi Chat Proxy',
        model:   GROQ_MODEL,
        groq_key_configured: !!(env.GROQ_API_KEY),
      }, 200, origin);
    }

    /* Seul POST accepté après ce point */
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, origin);
    }

    /* ── Vérifier que la clé Groq est configurée ── */
    if (!env.GROQ_API_KEY) {
      console.error('[Jerbi Chat] GROQ_API_KEY non configurée dans les variables Cloudflare');
      return jsonResponse({
        error: 'Service non configuré — GROQ_API_KEY manquante',
      }, 503, origin);
    }

    /* ── Lire le body ── */
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Body JSON invalide' }, 400, origin);
    }

    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: 'Champ messages manquant ou vide' }, 400, origin);
    }

    /* ── Valider et nettoyer les messages ── */
    const cleanMessages = messages
      .filter(m => m && m.role && m.content && typeof m.content === 'string')
      .map(m => ({
        role:    ['user', 'assistant', 'system'].includes(m.role) ? m.role : 'user',
        content: m.content.slice(0, 2000), // Limiter la taille par message
      }))
      .slice(-20); // Garder max 20 messages d'historique

    /* ── Appel API Groq ── */
    let groqRes;
    try {
      groqRes = await fetch(GROQ_API_URL, {
        method:  'POST',
        headers: {
          'Authorization': 'Bearer ' + env.GROQ_API_KEY,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model:       GROQ_MODEL,
          temperature: TEMPERATURE,
          max_tokens:  MAX_TOKENS,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...cleanMessages,
          ],
        }),
      });
    } catch (err) {
      console.error('[Jerbi Chat] Fetch Groq échoué :', err.message);
      return jsonResponse({
        error: 'Impossible de joindre l\'API Groq — vérifiez la connexion',
      }, 502, origin);
    }

    /* ── Gérer erreur Groq ── */
    if (!groqRes.ok) {
      let errData = {};
      try { errData = await groqRes.json(); } catch {}
      console.error('[Jerbi Chat] Groq erreur', groqRes.status, errData);

      // Messages d'erreur lisibles selon le code HTTP
      const msg = groqRes.status === 401
        ? 'Clé API Groq invalide — vérifiez GROQ_API_KEY dans Cloudflare'
        : groqRes.status === 429
          ? 'Limite de requêtes Groq atteinte — réessayez dans quelques secondes'
          : `Erreur Groq ${groqRes.status}`;

      return jsonResponse({ error: msg }, groqRes.status, origin);
    }

    /* ── Extraire la réponse ── */
    let groqData;
    try {
      groqData = await groqRes.json();
    } catch {
      return jsonResponse({ error: 'Réponse Groq illisible' }, 502, origin);
    }

    const reply = groqData.choices?.[0]?.message?.content || '';

    if (!reply) {
      return jsonResponse({ error: 'Réponse vide de Groq' }, 502, origin);
    }

    /* ── Succès ── */
    return jsonResponse({ reply }, 200, origin);
  },
};
