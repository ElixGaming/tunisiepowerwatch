# Tunisie Power Watch

Tunisie Power Watch est une plateforme participative permettant à plusieurs personnes de partager leur expérience des coupures électriques et de consulter une carte commune mise à jour en direct.

## Fonctionnement participatif

- Les signalements Web peuvent être publiés avec ou sans compte et restent affichés anonymement dans le flux public.
- Chaque envoi est protégé par ALTCHA auto-hébergé, sans appel tiers, cookie de suivi ou empreinte d’appareil.
- Sans compte, un cookie signé et une limite réseau pseudonymisée temporaire imposent un signalement toutes les 20 minutes. Un compte connecté dispose d’un délai de 10 minutes et un administrateur connecté n’a aucun délai.
- Les comptes locaux utilisent une adresse email et un mot de passe ; Facebook Login a été retiré.
- Les mots de passe locaux sont protégés par scrypt avec un sel aléatoire et ne sont jamais enregistrés en clair.
- Les emails locaux sont chiffrés dans SQLite avec AES-256-GCM ; une empreinte HMAC distincte permet la connexion sans exposer l’adresse.
- Les connexions utilisent un cookie de session inaccessible au JavaScript de la page.
- Chaque signalement Web est enregistré avec l’auteur technique « Anonyme », sa zone, son statut, sa note facultative et son score de confiance ; il n’est rattaché à aucun compte réel.
- Le serveur diffuse immédiatement les nouveaux signalements à tous les navigateurs connectés.
- Les horodatages sont conservés en UTC dans SQLite puis affichés partout selon le fuseau `Africa/Tunis`, en format 24 heures.
- Les données restent présentes après un redémarrage du serveur.
- Les preuves ALTCHA ne peuvent être réutilisées ; elles protègent aussi la création des comptes contre l’automatisation.
- Chaque membre peut confirmer une coupure ou le retour du courant une fois par zone.
- Les contenus incorrects peuvent être signalés puis traités depuis l’espace administrateur.
- Le site est installable comme application, disponible en français et en arabe et propose un mode connexion lente.
- Un bot WhatsApp facultatif permet de publier un signalement par conversation guidée, sans compte.
- La carte affiche uniquement les limites réelles de 2 084 imadas tunisiennes issues de l’archive officielle HDX COD-AB / OpenStreetMap vérifiée le 26 janvier 2026, simplifiées à environ 15 m et arrondies à cinq décimales.
- Les limites sont chargées depuis `data/tn-imadas.geojson` (environ 5 Mo). Le script `npm run prepare-imadas` permet de les régénérer à partir de la source documentée.
- Un clic sur une imada propose « courant coupé » ou « courant revenu », puis préremplit le gouvernorat, l’imada et le statut sans envoyer le formulaire.
- Une coupure confirmée par le quorum sans nouvelle activité pendant 60 minutes repasse automatiquement en orange avec le statut « À confirmer ». Une nouvelle vérification collective peut la remettre en rouge ; une zone résolue reste verte.
- Le système anti-fausses-alertes n’utilise pas un seuil fixe : un score de quorum (volume récent, répartition dans plusieurs tranches de dix minutes, confiance moyenne et votes de comptes distincts) doit atteindre 70/100 avec au moins cinq signalements. La zone entre alors en vérification orange pendant 30 minutes. À la fin, davantage de signaux « retour » donne le vert, davantage de signaux « coupure » donne le rouge et une égalité maintient l’orange.
- `public.html` propose quatre écrans alimentés en temps réel par des données agrégées : grand public, journalistes avec résumé et export CSV, associations/collectivités et écran de veille plein écran.
- Les anciennes références de localités, dont les 68 références issues de GeoNames, servent uniquement à maintenir la compatibilité des anciens liens et QR codes.

## Prérequis

- Node.js 24 ou une version plus récente.
- npm, fourni avec Node.js.

## Premier démarrage

Ouvrez un terminal dans le dossier du projet, puis exécutez :

```powershell
npm install
npm start
```

Ouvrez ensuite `http://localhost:8088/`.

## Signalements anonymes et ALTCHA

Le widget ALTCHA est installé par `npm install` puis servi depuis le même domaine que le site. Le navigateur récupère un défi auprès de `GET /api/captcha/challenge`, calcule une preuve localement et l’envoie avec le formulaire. Le serveur vérifie cette preuve sans appeler Google, Cloudflare ou un autre fournisseur.

Par défaut, une clé ALTCHA stable est dérivée de la clé privée du serveur déjà conservée hors de la base SQLite. Avec plusieurs instances du serveur, définissez la même clé privée sur chacune avant le lancement :

```powershell
$env:ALTCHA_HMAC_SECRET = "remplacez-par-un-secret-aleatoire-long-et-prive"
npm start
```

Cette clé ne doit jamais être placée dans les fichiers publics. Sans compte, le délai anti-spam de 20 minutes repose sur un cookie `HttpOnly` signé et sur un identifiant HMAC temporaire dérivé de l’adresse réseau. Pour un compte connecté, la limite de 10 minutes est rattachée à une empreinte technique temporaire du compte, sans être associée au contenu publié. L’adresse réseau en clair n’est pas enregistrée dans SQLite et les empreintes expirent au plus tard après 24 heures. L’hébergeur peut conserver ses propres journaux techniques selon sa configuration.

La création de compte est ouverte à tous depuis l’interface et reste protégée par ALTCHA. Les comptes locaux reconnus administrateurs via `ADMIN_EMAILS` sont exemptés de tout délai lorsqu’ils sont connectés. ALTCHA, les règles de contribution et les autres validations restent obligatoires.

Un signalement publié par un administrateur connecté est enregistré avec une confiance de 100 %. Il constitue une décision prioritaire persistante pour la zone : toute coupure devient immédiatement rouge et tout retour du courant devient immédiatement vert. L’option « à confirmer » est masquée pour les administrateurs. Les boutons « Je confirme la coupure » et « Le courant est revenu » de la fiche de zone appliquent eux aussi cette décision prioritaire. Seule une décision administrateur ultérieure peut la remplacer ; les votes et quorums publics ne l’écrasent pas.

## Inscription et connexion locales

Les formulaires email/mot de passe fonctionnent dès le premier démarrage et ne nécessitent aucun service externe. La création d’un compte exige ALTCHA. Le nom choisi est public dans le flux ; l’email reste privé, chiffré dans SQLite et sert uniquement à la connexion. Le mot de passe doit contenir entre 12 et 128 caractères. Les phrases de passe longues sont recommandées.

Les tentatives de connexion sont limitées séparément par adresse réseau et par compte. Les messages d’échec ne révèlent pas si une adresse existe dans la base. Aucun envoi d’email n’est configuré dans cette version : la vérification d’adresse et la récupération automatique d’un mot de passe oublié nécessiteront ultérieurement un service SMTP.

Sous Windows, le serveur peut aussi être lancé avec :

```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1
```

Le lanceur détecte automatiquement le runtime Node.js fourni par Codex Desktop lorsqu’il est disponible.

## Configurer l’administration en sécurité

Ne déclarez jamais une adresse dans `ADMIN_EMAILS` avant que son compte existe : l’inscription publique d’une adresse administrateur configurée est bloquée par sécurité. Sur une base neuve, lancez d’abord le site uniquement en local, créez le compte depuis l’interface, puis arrêtez le serveur. Un administrateur se connecte ensuite avec son email et son mot de passe ; sa session expire après huit heures.

Dans CMD, configurez ensuite l’administration avant le démarrage :

```cmd
set ADMIN_EMAILS=votre-adresse@example.com
npm start
```

Pour plusieurs administrateurs, séparez les emails par une virgule. Utilisez un mot de passe long et unique pour chaque compte administrateur et conservez-le dans un gestionnaire de mots de passe.

## Configurer les notifications Web Push

Après `npm install`, générez une paire de clés VAPID :

```powershell
npm run generate-vapid
```

Conservez la clé privée comme un secret, puis configurez le serveur :

```powershell
$env:VAPID_PUBLIC_KEY = "votre-cle-publique"
$env:VAPID_PRIVATE_KEY = "votre-cle-privee"
$env:VAPID_SUBJECT = "mailto:votre-adresse@example.com"
npm start
```

Les notifications Push nécessitent HTTPS en production ; `localhost` est accepté pour les tests. Elles restent désactivées si ces variables ne sont pas définies et chaque utilisateur doit donner son accord dans le navigateur.

## QR codes de signalement par zone

La page `qr-codes.html` utilise directement `data/tn-imadas.geojson`, comme la carte. L’ancienne liste approximative de 225 localités n’est plus utilisée : les **2 084 imadas actuelles** possèdent chacune deux QR codes, **coupure confirmée** et **courant revenu**. La page permet de filtrer par gouvernorat et délégation, de rechercher une zone ou un identifiant, d’imprimer une sélection et de télécharger chaque QR au format SVG.

Le scan ne publie jamais directement un signalement. Il ouvre le formulaire avec la zone et l’un des deux statuts autorisés déjà sélectionnés ; aucun compte n’est nécessaire, mais l’utilisateur doit valider ALTCHA, accepter les règles et confirmer lui-même l’envoi. Le statut « coupure probable » n’est pas proposé dans ce parcours.

En production, définissez l’origine publique afin que les QR imprimés continuent de pointer vers le bon domaine :

```powershell
$env:PUBLIC_BASE_URL = "https://votre-domaine.tn"
npm start
```

Conservez le même domaine après impression. Un changement de domaine rendrait les anciennes planches inutilisables.

## Page d’état du site

La page publique `status.html` indique la disponibilité du site, de la base SQLite, du temps réel, de l’authentification locale et des services facultatifs (Web Push et WhatsApp). Elle s’actualise automatiquement toutes les 30 secondes et propose le français et l’arabe.

Les informations proviennent de `GET /api/health`. Cette route ne publie ni secret, ni chemin de fichier, ni adresse utilisateur, ni statistique de comptes. Une fonction facultative « non configurée » n’est pas considérée comme une panne générale.

## Conditions générales d’utilisation

La page `terms.html` décrit les règles du service participatif, les contenus interdits, la modération, les limites du service et les modalités de fermeture du compte. La version acceptée et la date d’acceptation sont enregistrées séparément de la prise de connaissance de la politique de confidentialité pour les comptes locaux et WhatsApp.

## Configurer le bot WhatsApp

Le bot utilise l’API officielle **WhatsApp Cloud API** de Meta. Il ne fonctionne pas en automatisant l’application WhatsApp personnelle : utilisez le numéro de test Meta pendant le développement, puis un numéro rattaché à votre compte WhatsApp Business pour la production.

Dans [Meta for Developers](https://developers.facebook.com/apps/), ouvrez votre application, ajoutez le produit **WhatsApp**, puis relevez le **Phone number ID**, le jeton d’accès et le secret de l’application. Dans la configuration des webhooks WhatsApp, saisissez :

```text
URL de rappel : https://votre-domaine.tn/api/whatsapp/webhook
Champ à abonner : messages
```

Choisissez vous-même une longue valeur aléatoire comme jeton de vérification. Elle doit être identique dans Meta et dans PowerShell. Avant de lancer le serveur :

```powershell
$env:WHATSAPP_VERIFY_TOKEN = "une-longue-valeur-secrete-aleatoire"
$env:WHATSAPP_APP_SECRET = "secret-de-l-application-meta"
$env:WHATSAPP_ACCESS_TOKEN = "jeton-d-acces-whatsapp"
$env:WHATSAPP_PHONE_NUMBER_ID = "identifiant-du-numero"
$env:WHATSAPP_PUBLIC_NUMBER = "216XXXXXXXX"
$env:WHATSAPP_GRAPH_VERSION = "v25.0"
$env:PUBLIC_BASE_URL = "https://votre-domaine.tn"
npm start
```

`WHATSAPP_PUBLIC_NUMBER` contient le numéro visible avec l’indicatif du pays, uniquement en chiffres. Il sert à afficher le bouton « Signaler via WhatsApp ». `PUBLIC_BASE_URL` permet au bot de renvoyer un lien vers la zone et la politique de confidentialité.

Le jeton temporaire proposé par Meta convient aux premiers tests mais expire. Pour la production, créez un jeton de longue durée adapté à votre compte Business et conservez-le uniquement dans la configuration secrète de l’hébergement. Ne placez jamais les valeurs `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN` ou `WHATSAPP_VERIFY_TOKEN` dans les fichiers HTML, JavaScript public ou GitHub.

Le webhook doit être accessible depuis Internet en **HTTPS**. Une adresse `localhost` ne peut pas recevoir les messages envoyés par Meta. Après configuration, envoyez `SIGNALER` au numéro WhatsApp et suivez la conversation : consentement, zone ou position facultative, état, puis `PUBLIER`.

Commandes disponibles :

- `SIGNALER` : commencer un signalement ;
- `AIDE` : afficher les commandes ;
- `ANNULER` : interrompre une conversation ;
- `MES DONNÉES` : consulter les signalements liés au pseudonyme WhatsApp ;
- `SUPPRIMER MES DONNÉES` : supprimer le compte pseudonyme et ses signalements.

Pour séparer la clé de pseudonymisation du secret Meta, vous pouvez aussi définir `WHATSAPP_ID_HASH_SECRET` avec une autre valeur aléatoire longue. Si elle est absente, le serveur dérive les pseudonymes avec `WHATSAPP_APP_SECRET`.

## Application installable et mode mobile

Le manifeste et le service worker permettent d’installer le site depuis le navigateur. Un premier chargement en ligne est nécessaire. Le mode connexion lente retire le fond OpenStreetMap mais conserve les zones et les données participatives. Sur téléphone, la page se déplace avec un doigt et la carte avec deux doigts.

## Utilisation sur le réseau local

Par sécurité, le serveur écoute uniquement `127.0.0.1` par défaut, ce qui convient aux tunnels lancés sur la même machine. Pour autoriser volontairement le réseau local, utilisez :

```cmd
set HOST=0.0.0.0
npm start
```

Les autres personnes connectées au même réseau peuvent alors ouvrir :

```text
http://ADRESSE-IP-DU-PC:8088/
```

Le pare-feu Windows peut demander l’autorisation d’accepter les connexions entrantes.

## Données et sauvegarde

La base est créée automatiquement ici :

```text
data/power-watch.db
```

Au premier démarrage de cette version, le serveur génère automatiquement une clé aléatoire et migre les emails déjà présents en clair. La clé par défaut est enregistrée séparément de SQLite :

```text
secrets/email-encryption.key
```

Pour sauvegarder les comptes et les signalements, sauvegardez le dossier `data` et la clé `secrets/email-encryption.key` dans deux emplacements privés et sécurisés. Ne publiez jamais ces fichiers. Une base restaurée sans sa clé conserve les signalements, mais les comptes locaux deviennent illisibles et les emails ne peuvent pas être récupérés.

La clé peut être placée ailleurs avec `EMAIL_ENCRYPTION_KEY_FILE`, ou fournie en base64url avec `EMAIL_ENCRYPTION_KEY`. En production, préférez le gestionnaire de secrets de l’hébergeur. Ne changez jamais de clé sur une base existante sans procédure de rotation et conservez une sauvegarde protégée de la clé.

Les anciennes sauvegardes créées avant cette migration peuvent encore contenir les emails en clair : protégez-les ou supprimez-les de manière sécurisée.

## Confidentialité et RGPD

Avant toute publication, ouvrez `privacy-config.json` et remplacez toutes les mentions « À compléter » et les valeurs d’exemple. Ce fichier n’est jamais envoyé au navigateur dans son intégralité :

```json
{
  "controllerName": "Nom ou raison sociale du responsable",
  "privacyEmail": "adresse-de-contact@example.com",
  "editorStatus": "non-professional",
  "editorName": "Nom et prénom, uniquement si l’édition est professionnelle",
  "editorAddress": "Adresse, uniquement si l’édition est professionnelle",
  "editorPhone": "Téléphone, uniquement si l’édition est professionnelle",
  "editorRegistration": "SIREN/RCS/RNE si applicable",
  "editorLegalForm": "Forme juridique si applicable",
  "editorCapital": "Capital social si applicable",
  "publicationDirector": "Nom du directeur de la publication",
  "hostingProvider": "Nom de l’hébergeur",
  "hostingAddress": "Adresse postale complète de l’hébergeur",
  "hostingPhone": "Téléphone de l’hébergeur",
  "hostingCountry": "Pays d’hébergement",
  "contentStorageProvider": "Prestataire distinct stockant les données, si applicable",
  "contentStorageAddress": "Adresse de ce prestataire, si applicable"
}
```

Le site fournit ensuite automatiquement une politique de confidentialité sur `/privacy.html` et des mentions légales sur `/legal.html`.

Utilisez `"editorStatus": "non-professional"` seulement si le site est réellement édité à titre non professionnel. Dans ce cas, la page publique masque l’identité de l’éditeur ; vous devez toutefois transmettre vos coordonnées réelles à l’hébergeur avant la mise en ligne. Si le site devient professionnel, utilisez `"editorStatus": "professional"` et complétez l’identité, l’adresse, le téléphone, le directeur de publication et, selon votre situation, les informations d’immatriculation, de forme juridique et de capital.

- Un compte local enregistre son email privé sous forme chiffrée AES-256-GCM, une empreinte HMAC de recherche, son nom public et une empreinte scrypt salée du mot de passe. Ni l’email ni le mot de passe ne sont conservés en clair dans SQLite.
- Sur le canal WhatsApp, le numéro est traité transitoirement pour répondre puis pseudonymisé avant toute conservation dans SQLite.
- Aucun outil publicitaire ou de mesure d’audience n’est installé.
- Le cookie de session est strictement nécessaire à l’authentification.
- Les signalements sont supprimés automatiquement après 730 jours par défaut.
- Les comptes inactifs sont supprimés automatiquement après 730 jours par défaut.
- Chaque utilisateur peut exporter ses données ou supprimer son compte depuis son espace.
- Les coordonnées GPS utilisées pour rechercher la zone la plus proche restent dans le navigateur et ne sont jamais envoyées au serveur.
- Une position volontairement envoyée au bot sert uniquement à calculer la zone la plus proche ; les coordonnées exactes et le texte du message ne sont pas enregistrés.
- Les confirmations, demandes de modération et abonnements aux notifications sont inclus dans l’export ou supprimés avec le compte.
- Les dossiers `data` et `secrets`, les sources du serveur et les fichiers de configuration ne sont jamais servis publiquement.

La durée des signalements peut être modifiée avant le démarrage :

```powershell
$env:REPORT_RETENTION_DAYS = "365"
npm start
```

Les comptes sans connexion sont supprimés après 730 jours par défaut, avec leurs signalements. Cette durée peut également être modifiée avant le démarrage :

```powershell
$env:ACCOUNT_RETENTION_DAYS = "1095"
npm start
```

Ces mesures techniques ne remplacent pas l’analyse juridique du responsable du traitement, le registre des traitements, les contrats avec l’hébergeur, la procédure de réponse aux demandes ou la procédure de gestion des violations de données.

## Publication sur Internet

La protection DDoS de l’hébergeur reste la première couche contre les attaques volumétriques. L’application ajoute des limites persistantes, des délais HTTP, une taille WebSocket réduite, une limite de connexions temps réel et des contrôles d’origine.

Pour un tunnel ou reverse proxy HTTPS qui remplace correctement `X-Forwarded-For` et `X-Forwarded-Proto`, utilisez dans CMD :

```cmd
set NODE_ENV=production
set HOST=127.0.0.1
set TRUST_PROXY=1
set PUBLIC_BASE_URL=https://votre-domaine.com
set ADMIN_EMAILS=votre-adresse@example.com
npm start
```

N’activez `TRUST_PROXY=1` que lorsque Node n’est accessible qu’à travers ce proxy ou tunnel fiable. En production, les cookies portent l’attribut `Secure`, HSTS est envoyé, les contrôles d’origine utilisent `PUBLIC_BASE_URL` et les signalements sont limités à partir de l’adresse transmise par le proxy sans la stocker en clair.

Utilisez un disque persistant, placez `EMAIL_ENCRYPTION_KEY` ou `EMAIL_ENCRYPTION_KEY_FILE` dans le gestionnaire de secrets de l’hébergeur et sauvegardez régulièrement la base et la clé dans deux emplacements protégés. Pour plusieurs instances ou une audience importante, remplacez SQLite par PostgreSQL et les limites SQLite par un stockage partagé tel que Redis.
