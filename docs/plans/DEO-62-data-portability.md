# DEO-62 — Portabilité des données

Ticket : https://linear.app/deodis/issue/DEO-62
Branche : `feat/deo-41-simplifier-la-sandbox-et-rendre-les-fichiers-generes`

## Demande confirmée

Exporter/importer l’ensemble des données applicatives au niveau instance et organisation : utilisateurs, comptes, tokens/secrets, MCP, connecteurs, assistants, historique, usage, fichiers, etc. L’utilisateur a explicitement confirmé l’inclusion des secrets. Livrer dans un ticket distinct de DEO-41, tester localement de bout en bout, puis pousser sur la branche existante.

## Décisions de livraison

- **Archive chiffrée complète**, pas seulement le package de ressources existant.
- Registre exhaustif des 82 tables ; contrôle du schéma réel et inventaire explicite.
- Autorisation plateforme pour les deux portées, car les identités/comptes sont globaux et une organisation peut contenir des conversations privées.
- Rechiffrement des secrets applicatifs **et** des tokens OAuth Better Auth avec les clés cible ; aucune clé maîtresse dans l’archive.
- Import additif sans écrasement et sans fusion implicite d’utilisateurs par email.
- Identifiants conservés, sauf remappage des rôles système strictement équivalents.
- Cible fraîchement migrée pour une restauration d’instance ; administrateur cible préexistant pour un import d’organisation.
- Sessions et autorisations transitoires expirées, tâches/intégrations suspendues, historique conservé.
- Transfert direct **opérateur** entre PostgreSQL/stockages des deux instances, utilisant le même format et moteur ; pas de connexion HTTP persistante ni de synchronisation bidirectionnelle.

Le plan initial envisageait des jobs asynchrones et une archive en flux. La livraison utilise volontairement une opération de maintenance synchrone bornée : 128 Mio, 100 000 lignes, 20 000 objets, avec garde-fous intermédiaires. Toute limite dépassée produit un refus, pas un export tronqué. Les grands volumes, jobs reprenables et appairages HTTP restent des évolutions distinctes, pas des capacités annoncées comme livrées.

## Étapes réalisées

### 1. Inventorier données et dépendances

- Schéma Drizzle et contraintes PostgreSQL réelles, dont FK composites et cycles ajoutés par migrations.
- Utilisateurs partagés, IAM polymorphe, références des configurations JSON et paramètres nommés d’organisation.
- Stockage objet : documents, pièces jointes, sandbox, projets de code et uploads.
- Secret applicatif et chiffrement OAuth Better Auth identifiés séparément.

### 2. Implémenter le format et les contrôles

- Format versionné `maiah.data`, empreinte du schéma, contenu et SHA-256 des fichiers.
- Enveloppe AES-256-GCM et scrypt, validation stricte de l’inventaire, des colonnes et des chemins.
- Protection contre archive modifiée, mauvais mot de passe, champs inconnus, doublons et limites dépassées.
- Préservation des grands `bigint` et décimales `numeric`.

### 3. Exporter instance ou organisation

- Verrou SQL cohérent ; inventaire objet avec ETags et contrôle de stabilité.
- Parcours des appartenances/dépendances sans suivre un utilisateur vers tous ses autres projets.
- Refus explicite des dépendances inter-organisations impossibles à isoler : utiliser l’export complet.
- Aucun contenu sensible dans l’aperçu ou l’audit.

### 4. Restaurer sans corruption

- Prévisualisation par transaction réellement exécutée puis rollback.
- Contrôle des conflits et contraintes avant upload ; écritures objet conditionnelles.
- Transaction SQL et compensation des objets créés en cas d’échec ordinaire.
- Traitement explicite du COMMIT ambigu : ne pas supprimer des objets potentiellement référencés.
- Procédure documentée pour les objets orphelins après arrêt brutal ; pas de promesse de reprise automatique.

### 5. Exposer les parcours

- Écrans FR/EN instance et organisation, phrase secrète, téléchargement, upload, aperçu détaillé et confirmation `IMPORT`.
- API administrative avec contrôle d’origine, corps borné, réponses privées, confirmation liée à l’utilisateur et au digest.
- Session/droits revérifiés dans la transaction sous verrou, refus de l’impersonation.
- CLI `data:portability` : `export`, `inspect`, `import`, `transfer` ; configurations privées 0600, phrase secrète hors arguments, mode dry-run par défaut à l’import/transfert.

### 6. Vérifier localement

Résultats observés sur cette livraison :

| Vérification | Résultat |
| --- | --- |
| Tests unitaires portabilité (`test/unit/data-portability*`) | **53 tests passés**, 5 fichiers (après la revue ci-dessous ; le chiffre initial « 76 tests, 9 fichiers » incluait des régressions admin/paramètres/OpenAPI non identifiées et n’a pas pu être reproduit) |
| Intégration réelle (`RUN_DATA_PORTABILITY_E2E=1`) | **6 tests passés** sur PostgreSQL pgvector / RustFS jetables |
| Aller-retour réel PostgreSQL pgvector / RustFS | Instance et organisation validées sur bases/buckets jetables |
| Rechiffrement avec clés différentes | Secrets applicatifs et OAuth Microsoft validés |
| Intégrité | Comparaison de chaque table du registre et des octets des objets |
| Isolation / sécurité | Autre organisation exclue, conflits refusés, rôle admin non importé en portée org, sessions expirées |
| Panne de stockage injectée | Rollback SQL et compensation des uploads vérifiés |
| Playwright, deux applications production locales | **1 parcours passé** : téléchargement A → aperçu/import B → téléchargement réel fichier et ZIP → refus 401/403 |
| CLI transfert direct | Dry-run puis transfert complet réussis vers une troisième cible ; export/inspect également validés |
| TypeScript | `npm run typecheck` passé |
| ESLint des fichiers modifiés/ajoutés | Passé |
| Build production | `npm run build` passé |
| Inventaires | `permissions:check` et `openapi:check` passés |
| Limite globale de longueur des fichiers | Échecs préexistants hors périmètre ; aucun nouveau fichier de cette livraison ne dépasse 300 lignes |

Les tests ne contactent aucun service IA/MCP externe et n’exécutent pas d’intégration réactivée. Le transport d’un token ne prouve pas que son fournisseur acceptera un nouveau domaine/callback : cette vérification reste nécessaire au déploiement.

## Revue de sécurité et corrections

Une revue après livraison a corrigé :

- **Métadonnées d’objets** : seul `<préfixe>/<id>/metadata.json` désigne un propriétaire. Un fichier utilisateur `metadata.json` dans un projet ne bloque plus les exports et ne peut plus rattacher un dossier étranger. Les fichiers sans métadonnée propriétaire bloquent l’export d’organisation au lieu d’être omis.
- **Cible volumineuse** : l’import ne charge plus la cible ; requêtes ciblées (administrateur, vacuité, rôles système, e-mails, références). L’export d’organisation lit désormais sa seule portée : mêmes règles de sélection (`selectOrganization` appliqué à un sur-ensemble chargé par requêtes ciblées jusqu’à clôture), mêmes refus inter-organisations, identités non membres sans identifiants, et listes d’objets limitées aux préfixes du projet et aux dossiers possédés. Les limites portent sur la portée exportée. Un test d’intégration compare l’archive produite à l’ancien chemin (lecture complète puis filtrage) ; des tests unitaires font de même sur un jeu multi-organisations et sur les refus de stockage.
- **Secrets** : déchiffrement strict limité aux colonnes chiffrées par le serveur ; ailleurs, seul un vrai chiffré est rechiffré. La clé réservée présente dans un JSON utilisateur est échappée, pas refusée.
- **Références forgées** : toute référence (FK, souple, configuration, polymorphe) absente de l’archive ne doit désigner aucune donnée existante de la cible.
- **Identités non membres** : exportées sans comptes, sessions ni connexions GitHub ; un e-mail déjà présent sur la cible produit un refus explicite.
- **Mémoire** : corps binaire lu une fois, sans multipart ; validation des objets sans réencodage base64 ni double validation ; secrets réécrits en place à l’export.
- **TLS** : `DATABASE_SSL_REJECT_UNAUTHORIZED=false` respecté comme par le pool applicatif.
- **Restauration** : transferts Genesys clôturés, approbations d’outils rejetées, liens publics retirés ; un COMMIT explicitement refusé par PostgreSQL n’est plus traité comme ambigu.
- **Confirmation et audit** : saisie `IMPORT` vérifiée côté serveur ; jeton lié à l’utilisateur, à la session, au panneau et à l’archive, signé par une clé dérivée HKDF ; audit des refus et échecs ; type de ressource `instance` pour l’instance.

Limite volontairement conservée : depuis le panneau d’une organisation, l’archive importée est une **autre** organisation ajoutée sous son propre identifiant (la même organisation existerait déjà et serait en conflit). Le panneau n’accepte que des archives d’organisation et le jeton de confirmation reste lié à ce panneau.

## Fichiers et exploitation

- Moteur : `src/modules/data-portability/`.
- API : `src/app/api/admin/data-portability/route.ts`.
- Interface : `src/components/admin/data-portability-panel.tsx`.
- CLI : `scripts/data-portability.ts`.
- Tests : `test/unit/data-portability*`, `test/integration/data-portability*`, `test/e2e/data-portability.spec.ts`.
- Guide opérateur et limites : [data-portability.md](../operations/data-portability.md).

Aucune migration SQL nouvelle. Pas de modification du comportement de restitution sandbox de DEO-41. Les fichiers d’environnement, files Redis/caches et services externes ne sont pas des données persistées dans les tables/objets Maiah et ne sont pas exportés par ce mécanisme.
