/* ââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   CONFIG.JS â Jerbi Explore Â· Cap Bon
   Fichier de configuration centralisÃ©.
   Ne modifier QUE ce fichier pour les rÃ©glages courants.
   Version : v3.0.0
ââââââââââââââââââââââââââââââââââââââââââââââââââââââ */

const APP_CONFIG = {
  // ââ Version de l'application ââââââââââââââââââââââââââ
  VERSION: '3.0.0',

  // ââ Chemins GitHub Pages ââââââââââââââââââââââââââââââ
  GITHUB_REPO_PATH: '/Explore',

  // ââ Fichiers CSV locaux âââââââââââââââââââââââââââââââ
  // PlacÃ©s dans /Explore/data/
  // Mise Ã  jour : Ã©diter directement sur GitHub (interface web)
  // ou tÃ©lÃ©verser un nouveau fichier via l'interface GitHub
  get CSV_LIEUX()       { return `${this.GITHUB_REPO_PATH}/data/lieux.csv`; },
  get CSV_PARTENAIRES() { return `${this.GITHUB_REPO_PATH}/data/partenaires.csv`; },
  get CSV_EVENEMENTS()  { return `${this.GITHUB_REPO_PATH}/data/evenements.csv`; },
  get CSV_VIDEOS()      { return `${this.GITHUB_REPO_PATH}/data/Videos/Video.csv`; },
  get CSV_FAQ()         { return `${this.GITHUB_REPO_PATH}/data/faq.csv`; },
  get CSV_PRODUCTS()    { return `${this.GITHUB_REPO_PATH}/data/e_shop/produits.csv`; },

  // ââ Chatbot IA ââââââââââââââââââââââââââââââââââââââââ
  // URL du proxy Cloudflare Worker (clÃ© Groq cÃ´tÃ© serveur)
  // Format : 'https://jerbi-proxy.TON-COMPTE.workers.dev'
  // Laisser vide '' = mode local uniquement
  CHAT_PROXY_URL: '',

  // ââ E-Shop ââââââââââââââââââââââââââââââââââââââââââââ
  // NumÃ©ro WhatsApp pour les commandes (format international sans +)
  // Exemple : '21698765432' â +216 98 765 432
  SHOP_WHATSAPP: '',

  // ââ Analytics âââââââââââââââââââââââââââââââââââââââââ
  // GoatCounter : crÃ©ez un compte gratuit sur https://www.goatcounter.com
  // Renseignez votre code de site (ex : 'jerbi-explore')
  // Laisser '' pour dÃ©sactiver le tracking GoatCounter
  GOATCOUNTER_CODE: '',

  // ââ Backend Worker (Cloudflare) ââââââââââââââââââââââ
  // URL du Worker dÃ©ployÃ© aprÃ¨s crÃ©ation sur cloudflare.com
  // Ex: 'https://jerbi-worker.VOTRE-COMPTE.workers.dev'
  WORKER_URL: '',

  // ââ Fond d'Ã©cran ââââââââââââââââââââââââââââââââââââââ
  // Images dans data/Background/
  //   bg-dark.jpg  â mode sombre
  //   bg-light.jpg â mode clair
  // Remplacer ces fichiers pour changer le fond sans toucher au code
  BG_DARK:  'bg-dark.jpg',
  BG_LIGHT: 'bg-light.jpg',

  // ââ ExpÃ©riences â Slider ââââââââââââââââââââââââââââââ
  // Nombre de cartes visibles simultanÃ©ment dans le slider
  // Valeurs possibles : 1 (mobile auto), 2, 3, 4, 5
  // Sur mobile, toujours 1 carte (override automatique)
  EXP_CARDS_COUNT: 0,
  // Chemin du CSV des expÃ©riences
  get CSV_EXPERIENCES() { return `${this.GITHUB_REPO_PATH}/data/Experiences/experiences.csv`; },

  // RafraÃ®chissement automatique des donnÃ©es (en ms)
  // CSV local = rechargement toutes les 5 min suffit
  REFRESH_INTERVAL_MS: 300000,

  // ââ Carte âââââââââââââââââââââââââââââââââââââââââââââ
  MAP_CENTER: [36.9, 11.0],
  MAP_ZOOM_DEFAULT: 10,

  // ââ SÃ©curitÃ© Admin ââââââââââââââââââââââââââââââââââââ
  // Hash SHA-256 du mot de passe admin
  // Pour calculer : https://emn178.github.io/online-tools/sha256.html
  // Mot de passe par dÃ©faut : jerbi2024
  ADMIN_HASH: 'fbb92231f37c00f33064e2a93524d9bfcffca85f69a30f6879427f888acd0d8c',
  ADMIN_SESSION_MINUTES: 30,
  ADMIN_MAX_ATTEMPTS: 5,
  ADMIN_LOCKOUT_MINUTES: 15,

  // ââ Installation PWA ââââââââââââââââââââââââââââââââââ
  INSTALL_PROMPT_DELAY_MS: 3000,
  INSTALL_SNOOZE_DAYS: 7,

  // ââ Contact & RÃ©seaux sociaux âââââââââââââââââââââââââ
  CONTACT_WHATSAPP: '+216XXXXXXXX',
  CONTACT_EMAIL: '',
  SOCIAL_INSTAGRAM: '',

  // ââ Sponsor (optionnel) âââââââââââââââââââââââââââââââ
  // Mettre l'image logo_sponsor.png dans data/
  // Laisser SPONSOR_ACTIF: true,
  SPONSOR_ACTIF:   true,
  SPONSOR_LOGO: '/Explore/data/logo_sponsor.png?v=2',
  SPONSOR_LIEN:    'https://tn.svr.com',
  SPONSOR_ALT:     'SVR Sun Secure',
};

if (typeof window !== 'undefined') window.APP_CONFIG = APP_CONFIG;
if (typeof module !== 'undefined') module.exports = APP_CONFIG;
