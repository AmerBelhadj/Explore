/**
 * ══════════════════════════════════════════════════════
 *  JERBI-PROXY — Cloudflare Worker
 *  Proxy transparent entre Jerbi Explore et l'API Groq
 *  La clé Groq est stockée en secret Cloudflare (jamais visible)
 *
 *  Déploiement : https://workers.cloudflare.com (gratuit)
 *  Quota gratuit : 100 000 requêtes / jour
 * ══════════════════════════════════════════════════════
 */

// ── CONFIGURATION ────────────────────────────────────
// Remplacer par le(s) domaine(s) de ton app
// ex: 'amerbelhadj.github.io' ou ton domaine custom
const ALLOWED_ORIGINS = [
  'https://amerbelhadj.github.io',
  'https://jerbievents.com',
  'https://www.jerbievents.com',
  'http://localhost',        // pour les tests locaux
  'http://127.0.0.1',
];

// Modèle Groq à utiliser (gratuit, ultra-rapide)
const GROQ_MODEL   = 'llama-3.1-8b-instant';
const MAX_TOKENS   = 500;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// System prompt Jerbi (contexte Cap Bon)
const SYSTEM_PROMPT = `Tu es "Demande à Jerbi", le guide IA officiel de l'application Jerbi Explore pour le Cap Bon, Tunisie.
Tu connais parfaitement : El Haouaria, Kélibia, Nabeul, Hammamet, Korba, Korbous, Kerkouane et toute la péninsule du Cap Bon.
Tu connais : plages, restaurants, activités nautiques (plongée, apnée, pêche, voile), météo maritime, événements, traditions, gastronomie locale, transport, hébergement, urgences.
Jerbi Events (jerbievents.com) est l'agence événementielle partenaire qui a créé cette application.
RÈGLES :
- Réponds TOUJOURS en français sauf si on te parle en arabe ou en anglais
- Sois chaleureux, précis et local — cite des noms de plages et restaurants réels
- Utilise du **gras** pour les noms importants, des tirets pour les listes
- Maximum 5-6 lignes par réponse sauf itinéraire demandé
- Propose toujours une action concrète à l'utilisateur
- Ne réponds QUE sur le Cap Bon et la Tunisie — redirige toute autre demande`;

// ── HANDLER PRINCIPAL ─────────────────────────────────
export default {
  async fetch(request, env) {

    const origin = request.headers.get('Origin') || '';

    // ── CORS preflight ───────────────────────────────
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, origin);
    }

    // ── Sécurité : méthode POST uniquement ───────────
    if (request.method !== 'POST') {
      return corsResponse({ error: 'Method not allowed' }, 405, origin);
    }

    // ── Sécurité : vérifier l'origine ────────────────
    // En production, décommenter ces lignes :
    // if (!ALLOWED_ORIGINS.includes(origin)) {
    //   return corsResponse({ error: 'Origin not allowed' }, 403, origin);
    // }

    // ── Lire le body de la requête ───────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return corsResponse({ error: 'Invalid JSON body' }, 400, origin);
    }

    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return corsResponse({ error: 'messages array required' }, 400, origin);
    }

    // ── Appel à Groq avec la clé secrète ─────────────
    // La clé est stockée dans les secrets Cloudflare (env.GROQ_API_KEY)
    // Elle n'est JAMAIS visible dans le code ni côté client
    let groqResponse;
    try {
      groqResponse = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model:       GROQ_MODEL,
          max_tokens:  MAX_TOKENS,
          temperature: 0.7,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages,
          ],
        }),
      });
    } catch (err) {
      return corsResponse({ error: 'Groq unreachable', detail: err.message }, 502, origin);
    }

    if (!groqResponse.ok) {
      const errData = await groqResponse.json().catch(() => ({}));
      return corsResponse(
        { error: 'Groq error', status: groqResponse.status, detail: errData },
        groqResponse.status,
        origin
      );
    }

    const data = await groqResponse.json();

    // ── Retourner uniquement le texte de la réponse ──
    const reply = data?.choices?.[0]?.message?.content || '';
    return corsResponse({ reply }, 200, origin);
  },
};

// ── HELPER CORS ───────────────────────────────────────
function corsResponse(body, status, origin) {
  const headers = {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  return new Response(
    body !== null ? JSON.stringify(body) : null,
    { status, headers }
  );
}
