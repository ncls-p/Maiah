# Export, import et transfert de données — DEO-62

## Ce qui est livré

- Paramètres plateforme → **Export / import de l’instance**.
- Paramètres organisation → **Export / import de l’organisation**.
- Archive `.maiah` chiffrée et authentifiée : AES-256-GCM, sel/IV aléatoires, scrypt (N=32768, r=8, p=1), phrase secrète de 16 caractères minimum.
- Prévisualisation qui exécute réellement les contraintes SQL puis annule la transaction ; confirmation liée à l’archive exacte, à l’administrateur, à sa session, au panneau (instance ou organisation) et à une expiration de dix minutes. Le jeton est signé par une clé dérivée (HKDF) de `APP_ENCRYPTION_KEY`, jamais par la clé elle-même, et la saisie `IMPORT` est vérifiée par le serveur.
- Chaque tentative d’un administrateur (réussie, refusée ou en échec) est auditée avec la portée (`instance` ou `organization`), sans contenu d’archive ni phrase secrète.
- L’API reçoit un corps binaire `application/vnd.maiah.portability` (longueur sur 4 octets, champs JSON, archive brute), lu une seule fois dans un tampon unique : l’archive n’est pas recopiée par un analyseur multipart.
- Commande opérateur pour exporter, inspecter, importer et transférer directement entre les infrastructures de deux instances.

Les deux écrans sont réservés aux **administrateurs de plateforme**. Un propriétaire d’organisation n’obtient pas l’accès aux mots de passe/tokens des identités globales. Les droits et la session sont revérifiés sous verrou dans la transaction, après réception de l’archive. Une session impersonnée n’est pas autorisée.

## Couverture

Le registre `src/modules/data-portability/registry.ts` couvre les **82 tables applicatives**. Le test de couverture et le contrôle du schéma réel refusent une table/colonne inconnue ou manquante : pas d’omission silencieuse lors d’une évolution du schéma.

L’instance comprend notamment :

- utilisateurs, comptes, mots de passe hachés, tokens OAuth, sessions et challenges ;
- organisations, projets, équipes, appartenances, invitations, IAM, préférences ;
- fournisseurs, modèles, secrets Bedrock et configurations ;
- assistants, versions, spécialistes, skills et bindings ;
- conversations privées/partagées, messages, pièces jointes et livrables sandbox ;
- documents, chunks, embeddings et sources ;
- serveurs/outils MCP, clients OAuth, credentials et état de synchronisation ;
- connecteurs, connexions, secrets personnalisés, clés API et paramètres utilisateurs ;
- workflows, versions, demandes d’approbation, exécutions, tâches planifiées ;
- consommation, coûts, quotas, réservations, charges et audit ;
- marketplace, distribution, GitHub et Genesys ;
- paramètres globaux et tous les objets du bucket, dont projets de code et uploads en cours.

Les colonnes PostgreSQL `bigint`/`numeric` sont transportées sous forme de chaînes pour conserver notamment les grands quotas et les décimales de facturation.

Une organisation contient ses lignes et dépendances, ses paramètres nommés, les identités nécessaires et ses objets. Elle ne suit pas un utilisateur partagé vers ses autres projets. Seuls les **membres** (organisation ou projet) sont exportés avec leurs comptes, sessions et connexions GitHub ; une identité simplement référencée (auteur d’un avis marketplace, destinataire d’un partage, acteur de l’historique) est transportée sans mot de passe, token ni session. Une dépendance métier appartenant à une autre organisation **bloque l’export** : choisir l’export d’instance pour préserver ce graphe. Les ressources globales hébergées dans un autre projet peuvent également imposer cet export complet. Un fichier de pièce jointe ou de projet de code dont le dossier ne contient pas de `metadata.json` propriétaire (`<préfixe>/<id>/metadata.json`) bloque aussi l’export d’organisation plutôt que d’être omis silencieusement ; l’export d’instance l’inclut. Un fichier utilisateur nommé `metadata.json` à l’intérieur d’un projet reste un contenu ordinaire. Les paramètres globaux et challenges non rattachables ne sont inclus que dans l’export d’instance.

## Secrets et états restaurés

Les secrets `APP_ENCRYPTION_KEY` sont déchiffrés dans la mémoire source, protégés par l’archive, puis rechiffrés avec la clé cible. Les colonnes chiffrées par le serveur (`encrypted_*`, `*_encrypted`, secret SSO Microsoft) doivent se déchiffrer, sinon l’export échoue. Ailleurs, seule une valeur qui se déchiffre réellement avec la clé source est rechiffrée : un texte utilisateur qui ressemble à un chiffré, ou un JSON contenant la clé réservée de l’archive, est conservé tel quel et ne peut pas bloquer un export. Les tokens Microsoft chiffrés par **Better Auth** sont traités séparément avec `BETTER_AUTH_SECRET` et, le cas échéant, les versions de `BETTER_AUTH_SECRETS`. Les clés maîtresses elles-mêmes ne figurent pas dans l’archive.

Les mots de passe restent des hashes ; les clés API restent leurs hashes existants. Il n’est pas possible de retrouver leur valeur brute si Maiah ne la conserve pas. Les tokens conservés restent sensibles et peuvent encore être valides sur la source.

L’archive conserve les valeurs originales. À la restauration :

- sessions, challenges, invitations et autorisations en attente expirent ;
- fournisseurs, MCP, connecteurs, connexions, SSO Microsoft et tâches sont désactivés ;
- les workflows actifs repassent en brouillon ; les runs non terminés sont annulés ;
- les réservations actives expirent et les leases ne sont pas reprises ;
- les transferts Genesys en cours sont clôturés (`resumed`), les appels d’outils en attente d’approbation sont rejetés et ceux en cours marqués en échec ;
- les liens publics de conversation sont retirés ;
- les historiques terminés, consommations et credentials restent conservés ;
- un import d’organisation ne restaure pas le rôle administrateur de plateforme : les utilisateurs importés reçoivent le rôle standard `user`.

Ne réactivez les intégrations qu’après revue. Les refresh tokens peuvent être liés au client OAuth, à une URL de callback ou à une politique du fournisseur externe : leur transport ne garantit pas que celui-ci autorisera leur usage sur une autre instance.

## Préparation obligatoire

1. Même version de Maiah et migrations appliquées sur les deux bases.
2. Arrêter les workers, suspendre les webhooks et bloquer les écritures/utilisateurs concurrents **sur les deux instances**, en laissant l’accès administrateur nécessaire. Le drapeau ci-dessous est une attestation opérateur, pas un mécanisme qui arrête les workers à votre place.
3. Pour l’interface, activer temporairement `DATA_PORTABILITY_MAINTENANCE=true`, puis redémarrer le service web.
4. Utiliser des bases, buckets et Redis distincts. La cible d’une migration complète doit être une base fraîchement migrée, **avant démarrage de l’application/bootstrap** ; utiliser la CLI pour cette restauration initiale. Une instance démarrée contient toujours son administrateur et son organisation par défaut : une archive d’instance y est refusée explicitement (409), y compris depuis l’interface, qui sert alors à importer des archives d’organisation.
5. Pour importer une organisation, initialiser au contraire un administrateur plateforme sur la cible. Il conserve son accès ; les utilisateurs importés ne sont pas promus. Les écrans d’export/import restent accessibles avant la configuration d’un fournisseur IA (pas de redirection vers l’onboarding).
6. Utiliser les mêmes préfixes d’objets sur la cible. Les anciens projets de code encore présents sur disque doivent être migrés vers le stockage objet avant export web ; la CLI opérateur suppose ce contrôle effectué sur les hôtes concernés.
7. Configurer le reverse proxy pour accepter l’archive et la durée de la requête. Le proxy Next.js du dépôt exclut déjà `/api` de son matcher.

**Ne pas importer une archive d’origine non fiable.** Elle contient du contenu et des configurations exécutables après réactivation explicite des outils/workflows.

## Conflits et limites

Aucun utilisateur, ressource ou objet existant n’est écrasé. Les identifiants sont conservés : pas de fusion d’utilisateurs par email, pas de remplacement d’une organisation sélectionnée. L’organisation de l’archive est ajoutée avec son propre identifiant.

Deux exceptions contrôlées : lors d’un import d’organisation, les rôles système équivalents sont remappés par nom/portée **uniquement si leur définition est identique** (nom, portée, libellés, permissions ; l’utilisateur qui a créé le rôle à la volée sur chaque instance n’est pas comparé) ; sur une base d’instance ne contenant que les defaults de migration, ces defaults sont remplacés par ceux de l’archive. Des permissions différentes (versions de Maiah différentes) bloquent l’import d’organisation. Un autre conflit d’unicité indique seulement la table concernée, jamais les valeurs.

Un utilisateur de l’archive dont l’e-mail existe déjà sur la cible (sans distinction de casse) bloque l’import avec un message explicite qui nomme les comptes concernés : retirer ce compte de la cible ou utiliser une cible propre. Une archive qui désigne, sans la contenir, une donnée existante de la cible (partage vers une ressource, attribution de rôle à un utilisateur existant, identifiant dans une configuration) est refusée ; les références orphelines de l’historique source restent admises.

Conséquence à anticiper : un utilisateur membre de plusieurs organisations (y compris le créateur d’une organisation vide) est inclus dans chacune de leurs archives. Après l’import de la première, les suivantes qui le contiennent sont refusées sur la même cible. Pour déplacer plusieurs organisations qui partagent des membres, utiliser l’export d’instance vers une cible propre.

Un import répété produit un conflit, pas des doublons. La prévisualisation ne réserve pas la cible : les validations sont répétées au moment de la confirmation.

Cette version est une opération de maintenance **synchrone et bornée**, pas un système de sauvegarde illimité :

- archive ≤ 128 Mio ; ≤ 100 000 lignes et ≤ 20 000 objets ;
- garde-fous intermédiaires de 64 Mio pour les données SQL et le total des objets ;
- l’export d’organisation lit sa portée par requêtes ciblées (par organisation, projets puis identifiants collectés jusqu’à clôture) et ne liste que `knowledge/<projet>/`, `document-uploads/<projet>/` et les dossiers de pièces jointes/projets de code qui lui appartiennent : ces bornes s’appliquent à l’organisation exportée, pas à la taille de l’instance. Le chemin des objets ne contenant pas le projet, la liste des dossiers de pièces jointes/code (≤ 200 000) et leur `metadata.json` propriétaire sont toutefois lus pour toute l’instance afin de prouver l’isolation ; l’ensemble de travail de la traversée est borné à 200 000 lignes ;
- à l’import, la cible n’est pas chargée en mémoire : des requêtes ciblées vérifient administrateur, vacuité, rôles système, e-mails et références. La taille de la cible ne limite donc pas l’import ;
- empreinte de schéma compatible requise ; absence de transformation automatique entre versions ;
- rejet intégral si une borne est dépassée, jamais de troncature ;
- pas de réplication continue, de fusion bidirectionnelle ou de résolution automatique des suppressions.

Pour des volumes supérieurs, conserver une procédure opérateur de sauvegarde PostgreSQL + objets + gestion des clés ; ne pas augmenter arbitrairement les limites de mémoire de ce module.

Les variables d’environnement, secrets d’infrastructure/GitHub App, files Redis, caches et données des services externes (n8n, GitHub, fournisseur MCP, etc.) ne sont pas des tables/objets de Maiah et doivent être configurés ou sauvegardés séparément.

## CLI

Créer deux fichiers de connexion privés, hors dépôt (`chmod 600`). Exemple à adapter :

```json
{
  "databaseUrl": "postgresql://USER:PASSWORD@HOST/DATABASE",
  "databaseSsl": true,
  "encryptionKey": "REMPLACER_PAR_APP_ENCRYPTION_KEY_64_CARACTERES_HEXA",
  "encryptionKeyId": "default",
  "authSecret": "REMPLACER_PAR_BETTER_AUTH_SECRET",
  "storage": {
    "endpoint": "https://s3.example.com",
    "region": "us-east-1",
    "bucket": "maiah",
    "accessKeyId": "REMPLACER",
    "secretAccessKey": "REMPLACER",
    "forcePathStyle": true
  },
  "prefixes": {
    "attachments": "chat-attachments",
    "code": "code-workspaces"
  }
}
```

Si la rotation Better Auth est activée, ajouter `authSecrets: [{"version": 2, "value": "..."}, {"version": 1, "value": "..."}]`, version courante en premier. Utiliser `databaseSsl: false` uniquement pour une liaison locale/protégée ; sinon la vérification TLS est stricte. `databaseSslRejectUnauthorized: false` reproduit `DATABASE_SSL_REJECT_UNAUTHORIZED=false` (certificat non vérifié) ; l’interface web applique la même configuration que le pool applicatif.

```bash
# Éviter de placer la phrase secrète dans l’historique ou les arguments du processus.
read -rs -p 'Phrase secrète : ' MAIAH_ARCHIVE_PASSPHRASE; echo
export MAIAH_ARCHIVE_PASSPHRASE

# Instance entière ; ajouter --organization UUID pour une organisation.
npm run data:portability -- export --connection /private/source.json \
  --file /private/backup.maiah --maintenance

npm run data:portability -- inspect --file /private/backup.maiah

# Vérification réelle, aucune écriture persistée.
npm run data:portability -- import --connection /private/target.json \
  --file /private/backup.maiah --maintenance

# Confirmation de l’import.
npm run data:portability -- import --connection /private/target.json \
  --file /private/backup.maiah --maintenance --confirm

# Transfert direct : pas de fichier intermédiaire sur disque.
# L’opérateur a accès aux deux PostgreSQL et stockages objet.
npm run data:portability -- transfer --connection /private/source.json \
  --target /private/target.json --maintenance
npm run data:portability -- transfer --connection /private/source.json \
  --target /private/target.json --maintenance --confirm

unset MAIAH_ARCHIVE_PASSPHRASE
```

`transfer` est un transfert explicite à la demande via les infrastructures, **pas** un appairage permanent de deux applications HTTP. Le parcours fichier et le transfert direct utilisent le même format chiffré et le même moteur de validation/restauration.

## Échec et reprise

Le moteur garde les contraintes SQL actives, gère les cycles avec une seconde passe sur les FK nullables, et vérifie aussi les FK composites/différées du catalogue PostgreSQL. Les écritures relationnelles sont atomiques. Les objets sont créés conditionnellement (`If-None-Match: *`) ; les compensations suppriment seulement les objets créés par l’opération avec leur ETag.

Une panne ordinaire annule SQL et nettoie les objets nouvellement créés, y compris lorsque PostgreSQL refuse explicitement le COMMIT (code SQLSTATE reçu). Un arrêt brutal du processus peut laisser des objets orphelins. Une perte de connexion ou un arrêt du serveur pendant COMMIT (SQLSTATE `08…`/`57…` ou absence de réponse) est **ambiguë** : le moteur ne supprime pas les objets potentiellement référencés par une transaction validée.

Dans ces cas, ne pas relancer aveuglément : inspecter la présence des identifiants de l’archive en base et l’inventaire des objets. Sur une cible de migration dédiée, on peut reprovisionner intégralement cette cible jetable et recommencer. Sur une cible avec des données existantes, ne supprimer que les objets dont l’absence de références est établie. Ne jamais vider un bucket partagé pour débloquer un import.

Après succès : reconnecter les utilisateurs, vérifier les fichiers, permissions et statistiques, réactiver les intégrations voulues, retirer le drapeau maintenance et rouvrir le trafic. Révoquer les accès sur la source si elle est abandonnée.

## Vérifications locales

Tests sans infrastructure :

```bash
npx vitest run test/unit/data-portability*.test.ts
```

Tests réels, exclusivement avec ces conteneurs jetables locaux :

```bash
docker run -d --name deo62-postgres -e POSTGRES_PASSWORD=deo62-local-only \
  -p 127.0.0.1:15462:5432 pgvector/pgvector:pg16
docker run -d --name deo62-storage -e RUSTFS_ACCESS_KEY=deo62local \
  -e RUSTFS_SECRET_KEY=deo62-local-storage-only \
  -p 127.0.0.1:19462:9000 rustfs/rustfs:latest /data
RUN_DATA_PORTABILITY_E2E=1 npx vitest run test/integration/data-portability-db.test.ts
```

Les tests créent puis détruisent quatre bases/buckets uniques, avec des clés applicatives et Better Auth différentes. Ils vérifient chaque table du registre, les octets des fichiers, les secrets, la précision des quotas, l’isolation organisationnelle, les conflits, une panne de stockage injectée, le refus d’une archive forgée qui désigne un utilisateur existant de la cible et l’égalité entre l’export d’organisation ciblé et l’ancien chemin (lecture complète puis filtrage).

Le scénario Playwright `test/e2e/data-portability.spec.ts` est opt-in (`PORTABILITY_UI_E2E=1`). Il utilise deux applications de test sur 31462/31463, bases `deo62_ui_source`/`deo62_ui_target`, buckets distincts, source initialisée via `seedPortability`, compte source `migration@example.test` et administrateur cible `target-admin@example.test` (mot de passe de test `Password123!`). Leurs comptes credentials doivent contenir le hash Better Auth réel et leur onboarding être terminé. `/tmp/deo62-target.json` contient la connexion privée du seul environnement jetable pour les assertions. Ne pas pointer ce scénario sur une instance personnelle ou de production.

```bash
CI=1 PORTABILITY_UI_E2E=1 npx playwright test test/e2e/data-portability.spec.ts --workers=1 --retries=0
```
