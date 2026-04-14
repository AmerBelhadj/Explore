/* ══════════════════════════════════════════════════════
   CONFIG.JS — Jerbi Explore · Cap Bon
   Fichier de configuration centralisé.
   Ne modifier QUE ce fichier pour les réglages courants.
   Version : v3.0.0
══════════════════════════════════════════════════════ */

const APP_CONFIG = {
  // ── Version de l'application ──────────────────────────
  VERSION: '3.2.0',

  // ── Chemins GitHub Pages ──────────────────────────────
  GITHUB_REPO_PATH: '/Explore',

  // ── Fichiers CSV locaux ───────────────────────────────
  // Placés dans /Explore/data/
  // Mise à jour : éditer directement sur GitHub (interface web)
  // ou téléverser un nouveau fichier via l'interface GitHub
  get CSV_LIEUX()       { return `${this.GITHUB_REPO_PATH}/data/lieux.csv`; },
  get CSV_PARTENAIRES() { return `${this.GITHUB_REPO_PATH}/data/partenaires.csv`; },
  get CSV_EVENEMENTS()  { return `${this.GITHUB_REPO_PATH}/data/evenements.csv`; },
  get CSV_VIDEOS()      { return `${this.GITHUB_REPO_PATH}/data/Videos/Video.csv`; },
  get CSV_FAQ()         { return `${this.GITHUB_REPO_PATH}/data/faq.csv`; },
  get CSV_PRODUCTS()    { return `${this.GITHUB_REPO_PATH}/data/e_shop/produits.csv`; },

  // ── Chatbot IA ────────────────────────────────────────
  // URL du proxy Cloudflare Worker (clé Groq côté serveur)
  // Format : 'https://jerbi-proxy.TON-COMPTE.workers.dev'
  // Laisser vide '' = mode local uniquement
  CHAT_PROXY_URL: '',

  // ── E-Shop ────────────────────────────────────────────
  // Numéro WhatsApp pour les commandes (format international sans +)
  // Exemple : '21698765432' → +216 98 765 432
  SHOP_WHATSAPP: '+21622055055',

  // ── Analytics ─────────────────────────────────────────
  // GoatCounter : créez un compte gratuit sur https://www.goatcounter.com
  // Renseignez votre code de site (ex : 'jerbi-explore')
  // Laisser '' pour désactiver le tracking GoatCounter
  GOATCOUNTER_CODE: '',

  // ── Fond d'écran ──────────────────────────────────────
  // Images dans data/Background/
  //   bg-dark.jpg  → mode sombre
  //   bg-light.jpg → mode clair
  // Remplacer ces fichiers pour changer le fond sans toucher au code
  BG_DARK:  'bg-dark.jpg',
  BG_LIGHT: 'bg-light.jpg',

  // ── Expériences — Slider ──────────────────────────────
  // Nombre de cartes visibles simultanément dans le slider
  // Valeurs possibles : 1 (mobile auto), 2, 3, 4, 5
  // Sur mobile, toujours 1 carte (override automatique)
  EXP_CARDS_COUNT: 2,
  // Chemin du CSV des expériences
  get CSV_EXPERIENCES() { return `${this.GITHUB_REPO_PATH}/data/Experiences/experiences.csv`; },

  // Rafraîchissement automatique des données (en ms)
  // CSV local = rechargement toutes les 5 min suffit
  REFRESH_INTERVAL_MS: 300000,

  // ── Carte ─────────────────────────────────────────────
  MAP_CENTER: [36.9, 11.0],
  MAP_ZOOM_DEFAULT: 10,

  // ── Sécurité Admin ────────────────────────────────────
  // Hash SHA-256 du mot de passe admin
  // Pour calculer : https://emn178.github.io/online-tools/sha256.html
  // Mot de passe par défaut : jerbi2024
  ADMIN_HASH: 'fbb92231f37c00f33064e2a93524d9bfcffca85f69a30f6879427f888acd0d8c',
  ADMIN_SESSION_MINUTES: 30,
  ADMIN_MAX_ATTEMPTS: 5,
  ADMIN_LOCKOUT_MINUTES: 15,

  // ── Installation PWA ──────────────────────────────────
  INSTALL_PROMPT_DELAY_MS: 3000,
  INSTALL_SNOOZE_DAYS: 7,

  // ── Contact & Réseaux sociaux ─────────────────────────
  CONTACT_WHATSAPP: '+216XXXXXXXX',
  CONTACT_EMAIL: 'contact@jerbievents.tn',
  SOCIAL_INSTAGRAM: 'https://instagram.com/jerbievents',

  // ── Sponsor (optionnel) ───────────────────────────────
  // Mettre l'image logo_sponsor.png dans data/
  // Laisser SPONSOR_ACTIF: false pour désactiver sans supprimer le fichier
  SPONSOR_ACTIF:   true,
  SPONSOR_LOGO: '/Explore/data/logo_sponsor.png?v=2',
  SPONSOR_LIEN:    '',
  SPONSOR_ALT:     'SVR',
};

if (typeof window !== 'undefined') window.APP_CONFIG = APP_CONFIG;
if (typeof module !== 'undefined') module.exports = APP_CONFIG;
