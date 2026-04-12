# Jerbi Events – Guide Cap Bon 🌊
### v2.1.0 · Progressive Web App

**Guide touristique & événementiel pour la région Cap Bon, Tunisie.**  
Accessible sur : **https://amerbelhadj.github.io/jerbi-guide/**

---

## 📱 Fonctionnalités

| Module | Description |
|--------|-------------|
| 🗺️ Guide terrain | Carte satellite + liste avec filtre catégorie **et filtre ville** |
| 🛍️ Bonnes Adresses | Grille partenaires avec promo, WhatsApp, Instagram |
| 📅 Agenda | Événements chronologiques, filtre mois/ville, badge nouveauté |
| ❤️ Favoris | Lieux, adresses et événements sauvegardés en local |
| 🔍 Recherche | Recherche globale temps-réel dans tous les items |
| 📸 Galerie | Photos collaboratives avec modération admin |
| 📲 Installation PWA | Bannière d'installation Android + guide iOS |
| 🆕 Mise à jour | Notification automatique de nouvelle version |

---

## 🚀 Déploiement sur GitHub Pages

### Structure de fichiers requise

```
jerbi_guide/
├── index.html          ← Application principale
├── manifest.json       ← Configuration PWA
├── sw.js               ← Service Worker
├── config.js           ← Configuration centralisée (modifier ici)
├── _headers            ← Headers de sécurité (Netlify/Cloudflare)
├── icon-192.png        ← Icône PWA 192×192
└── icon-512.png        ← Icône PWA 512×512
```

### Activer GitHub Pages

1. Aller dans **Settings → Pages**
2. Source : branche `main`, dossier `/ (root)` ou `/docs`
3. Sauvegarder → l'URL sera `https://amerbelhadj.github.io/jerbi-guide/`

---

## ⚙️ Configuration

### 1. Fichier Google Drive Excel

> Ne jamais modifier `index.html` pour changer l'URL du Drive.  
> **Tout se configure dans `config.js`.**

```javascript
// config.js
GOOGLE_DRIVE_FILE_ID: 'VOTRE_ID_GOOGLE_SHEETS',
```

**Comment obtenir l'ID :**
1. Ouvrir le fichier dans Google Sheets
2. URL : `https://docs.google.com/spreadsheets/d/**XXXXXXXXXXXXXX**/edit`
3. Copier la partie en gras → coller dans `config.js`
4. Partager le fichier : `Tout le monde avec le lien peut voir`

### 2. Structure Excel attendue

**Onglet "Bonnes Adresses Cap Bon"** (Guide + données principales) :

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | Nombre | Identifiant unique |
| `nom` | Texte | Nom du lieu |
| `categorie` | Texte | `restaurant` / `plage` / `hebergement` / `activite` / `randonnee` |
| `ville` | Texte | Ville (Nabeul, Hammamet, Kelibia, El Haouaria…) |
| `description` | Texte | Description courte |
| `coup_de_coeur` | `OUI` / `NON` | Badge ⭐ Haykel |
| `citation_haykel` | Texte | Citation personnelle de Haykel |
| `gps_lat` | Décimal | Latitude (ex: 36.872) |
| `gps_lng` | Décimal | Longitude (ex: 11.105) |
| `photo_url` | URL https:// | Photo du lieu |
| `tel` | Texte | Téléphone (+216…) |
| `horaires` | Texte | Horaires d'ouverture |
| `prix` | Texte | Prix ou "Gratuit" |
| `tags` | Texte | Mots-clés séparés par virgules |
| `actif` | `OUI` / `NON` | Masquer sans supprimer |

**Onglet "Partenaires"** (optionnel — section Bonnes Adresses) :

| Colonne | Description |
|---------|-------------|
| `Nom` | Nom du partenaire |
| `Categorie` | Catégorie libre (ex: Restaurants & Cafés) |
| `SousCategorie` | Sous-catégorie |
| `Ville` | Ville |
| `Description` | Description |
| `Photo_URL` | URL https:// de la photo |
| `Promo` | Texte de la promo (badge PROMO 🔥 si renseigné) |
| `Prix_Promo` | Prix promotionnel |
| `WhatsApp` | Numéro WhatsApp (chiffres uniquement) |
| `Instagram` | Compte Instagram (@handle ou URL) |
| `Statut` | `actif` pour afficher |

**Onglet "Evenements"** (optionnel — Agenda) :

| Colonne | Description |
|---------|-------------|
| `Titre` | Titre de l'événement |
| `Date` | Format YYYY-MM-DD |
| `Heure` | Ex: 18h00 |
| `Lieu` | Nom du lieu |
| `Ville` | Ville |
| `Description` | Description |
| `Photo_URL` | URL de l'image |
| `Lien_Billetterie` | URL de réservation |
| `Organisateur` | Nom de l'organisateur |
| `Statut` | `actif` pour afficher |
| `prix` | `Gratuit` ou `Payant` |

### 3. Mot de passe Admin

```javascript
// config.js
ADMIN_HASH: 'votre_hash_sha256_ici',
```

**Pour changer le mot de passe :**
1. Aller sur https://emn178.github.io/online-tools/sha256.html
2. Saisir votre nouveau mot de passe
3. Copier le hash → coller dans `config.js`

> ⚠️ Ne jamais mettre le mot de passe en clair dans le code.

---

## 🔄 Workflow de mise à jour

### Mise à jour des données (contenu)
```
1. Ouvrir le fichier Google Drive Excel
2. Modifier les données
3. Sauvegarder → les changements sont visibles en 60 secondes
   (rafraîchissement automatique configuré dans REFRESH_INTERVAL_MS)
```

### Mise à jour de la configuration
```
1. Modifier config.js uniquement
2. git add config.js && git commit -m "config: mise à jour"
3. git push → GitHub Pages se met à jour automatiquement
```

### Nouvelle version de l'app (code)
```
1. Modifier index.html et/ou sw.js
2. Incrémenter VERSION dans config.js (ex: '2.1.0' → '2.2.0')
3. Mettre à jour CACHE_VERSION dans sw.js (ex: 'jerbi-v2.2.0')
4. git add . && git commit -m "feat: description des changements"
5. git push
6. Les utilisateurs reçoivent automatiquement une notification de mise à jour
```

---

## 🔒 Sécurité

- **XSS** : Toutes les données Drive passent par `escHtml()` avant injection
- **URL photos** : Seules `http://` et `https://` sont acceptées
- **Source Drive** : Whitelist stricte (`docs.google.com`, `drive.google.com`)
- **Admin** : Hash SHA-256 uniquement, rate-limiting 5 tentatives / 15 min
- **Session admin** : Expiration automatique après 30 min d'inactivité
- **Liens externes** : `rel="noopener noreferrer"` systématique

---

## 📲 Installation PWA

### Android (Chrome)
- Une bannière apparaît automatiquement après 3 secondes
- Ou cliquer sur "Installer l'app 📲" sur la page d'accueil

### iOS (Safari)
- Ouvrir Safari → icône Partager → "Sur l'écran d'accueil"
- Un message d'aide s'affiche dans la bannière d'installation

---

## 🛠️ Développement local

```bash
# Cloner le repo
git clone https://github.com/amerbelhadj/jerbi-guide.git
cd jerbi_guide

# Serveur local (nécessaire pour le SW)
npx serve . -l 3000
# ou
python3 -m http.server 3000

# Ouvrir : http://localhost:3000/jerbi-guide/
```

> ⚠️ Le Service Worker nécessite HTTPS ou localhost.

---

## 📞 Contact

- WhatsApp : +216 24 055 055
- Instagram : [@jerbievents](https://instagram.com/jerbievents)
- Email : contact@jerbievents.tn
