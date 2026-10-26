# Carnet de drainage

Appli web installable (PC et téléphone) : fiches clients, questionnaire de santé, suivi des séances et factures.

- Questionnaire de santé : modèle Coralys de la formatrice (page 1 sur 6) pour les nouveaux questionnaires. Les questionnaires remplis avec l'ancien modèle restent consultables, corrigeables et imprimables.
- Couleurs de l'identité visuelle : pétrole #0F3A3C, lagon #2A7570, eau claire #BFDCD8, brume #EEF5F4.

- Les fiches sont enregistrées uniquement dans le stockage de chaque appareil. Ce dépôt ne contient que le code de l'appli, aucune donnée.
- La synchronisation entre deux appareils se fait par QR code : connexion directe (WebRTC), chiffrée avec une clé à usage unique contenue dans le QR code. Le serveur public PeerJS sert seulement à relayer les messages de mise en relation, chiffrés eux aussi.
- L'appli fonctionne hors connexion une fois ouverte une première fois (service worker). La synchronisation demande internet sur les deux appareils pour la mise en relation.

Fichiers : `index.html` (l'appli), `fusion.js` (fusion des carnets), `qr.js` (QR codes), `sw.js` (hors connexion), `manifest.webmanifest` et `icons/` (installation).

Mise à jour : remplacer les fichiers par la nouvelle version, et changer la valeur `VERSION` en haut de `sw.js` pour que les appareils la récupèrent.
