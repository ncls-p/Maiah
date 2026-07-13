# Matrice de recette des parcours utilisateurs

## But

Cette matrice est le contrat de recette fonctionnelle et UX de Maiah. Un état vide ne peut être validé qu’après une réponse serveur réussie ; une panne de lecture ne doit jamais autoriser une mutation fondée sur des données vides ou obsolètes.

Le skill projet `.agents/skills/ux-workflow-audit` décrit la méthode d’audit et le contrat d’état réutilisables.

## Légende

- **Automatisé** : couvert par Vitest, tests de route, tests de domaine ou Playwright.
- **Navigateur** : vérifié dans un navigateur réel avec DOM, dimensions ou interaction.
- **PostgreSQL** : vérifié avec le moteur PostgreSQL et les migrations réelles.
- **Manuel** : recette visuelle ou intégration externe à exécuter avant release.

## Contrat transversal

Chaque ressource distante doit distinguer :

1. chargement initial ;
2. succès avec données ;
3. succès vide ;
4. filtre sans résultat ;
5. erreur initiale avec relance ;
6. erreur de rafraîchissement conservant la dernière donnée valide ;
7. interdit ou lecture seule ;
8. validation locale et rejet API ;
9. conflit de version ;
10. mutation en cours, réussite et échec ;
11. annulation et reprise ;
12. mobile, clavier, lecteur d’écran, réduction des animations et traduction longue.

## Authentification

| Scénario               | Attendu                                                      | Couverture                             |
| ---------------------- | ------------------------------------------------------------ | -------------------------------------- |
| Connexion valide       | Destination workspace prévisible, session créée              | Tests auth existants + CI PostgreSQL   |
| Identifiants invalides | Erreur localisée, valeurs conservées, premier champ focalisé | Code + navigateur à compléter avec DB  |
| Inscription ouverte    | Nom, e-mail et mot de passe avec `autocomplete` correct      | Navigateur FR, desktop et 390px        |
| Inscription fermée     | Formulaire bloqué avec explication                           | Tests de configuration + navigateur CI |
| Premier compte         | Création autorisée et bootstrap admin                        | Tests use case + CI PostgreSQL         |
| Compte suspendu        | Connexion refusée sans fuite d’information                   | Tests auth + CI PostgreSQL             |
| Mobile                 | Aucun débordement horizontal, contrôles de 40px              | Navigateur                             |
| FR/EN                  | Aucun libellé auth codé en dur                               | Typecheck des dictionnaires + revue    |

## Onboarding et setup

| Scénario                         | Attendu                                                                  | Couverture                   |
| -------------------------------- | ------------------------------------------------------------------------ | ---------------------------- |
| Aucun fournisseur                | Une action primaire « connecter l’IA »                                   | Code + navigateur CI         |
| Fournisseurs existants           | Passage direct au choix du modèle                                        | Code                         |
| Erreur GET fournisseurs          | Erreur relançable, aucune fausse proposition de création                 | Code                         |
| Erreur GET modèles               | Erreur relançable, aucun faux état « aucun modèle »                      | Code                         |
| Découverte vide                  | Information non bloquante, ajout manuel disponible                       | Code + tests fournisseurs    |
| Échec du test de connexion       | Message localisé, saisie conservée                                       | Code                         |
| Création concurrente             | Bouton occupé, double envoi désactivé                                    | Code + tests API             |
| Finalisation assistant           | Version configurée puis ouverture du chat                                | Tests agents + CI PostgreSQL |
| Premier assistant via setup      | Calcul, heure, aléatoire, UUID, dates et recherche web, sans approbation | Tests route/use case         |
| Marqueur onboarding indisponible | Assistant utilisable, avertissement distinct                             | Code                         |

## Chat et conversations

| Scénario                         | Attendu                                                                                       | Couverture                                |
| -------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Aucun assistant                  | État guidé selon permissions                                                                  | Code + tests de permissions               |
| Assistant incomplet              | CTA de configuration, envoi désactivé                                                         | Code                                      |
| Conversation vide                | Prompts et message d’entrée utiles                                                            | Code                                      |
| Streaming                        | Statut localisé, arrêt visible, suivi du scroll maîtrisé                                      | 82 tests ciblés + code                    |
| Message pendant streaming        | Mise en file modifiable et annulable                                                          | Tests chat + code                         |
| Pièces jointes pendant streaming | Refus explicite sans perte de fichier                                                         | Code                                      |
| Limite de huit fichiers          | Refus localisé avant upload                                                                   | Tests attachments + code                  |
| ZIP et fichiers directs mélangés | Refus explicite                                                                               | Tests attachments + code                  |
| Upload ou extraction en échec    | Erreur localisée, conversation conservée                                                      | Code + tests route                        |
| Édition/suppression/régénération | Actions tactiles et clavier, échec non silencieux                                             | Tests chat + navigateur CI                |
| Copie message/lien               | Succès uniquement après presse-papiers, échec visible                                         | Code                                      |
| Liens externes                   | Confirmation avant sortie, URL visible                                                        | Code                                      |
| Dossiers, épinglage et ordre     | Actions clavier/tactile, rollback après échec                                                 | Code + tests à étendre                    |
| Publication GitHub               | Connexion, synchronisation, permissions, PR/push direct, confirmation                         | Tests GitHub + code                       |
| Artefacts HTML/sandbox           | Preview différée, plein écran, copie et téléchargement                                        | Tests artifacts + code                    |
| Choix Chat/Coding                | Le choix manuel reste prioritaire pendant les mises à jour et nouveaux messages               | Tests d’état + navigateur                 |
| Disposition Coding               | Chat redimensionnable ; fichiers, code et aperçu masquables ; largeurs persistées et clavier  | Tests layout + navigateur desktop/mobile  |
| Actions des sous-agents          | Visibles en direct/rechargement; seule la réponse finale entre dans le contexte orchestrateur | Tests runtime/historique/transport + code |

## Assistants

| Scénario                  | Attendu                                                          | Couverture                       |
| ------------------------- | ---------------------------------------------------------------- | -------------------------------- |
| Liste en chargement       | Progression stable                                               | Code                             |
| Erreur de liste           | Erreur relançable, jamais « aucun assistant »                    | Code                             |
| Liste vide                | Un CTA de création                                               | Code                             |
| Recherche vide            | Message de filtre, collection intacte                            | Code                             |
| Création assistant        | Type, modèle et instructions simples                             | Tests routes + code              |
| Création orchestrateur    | Type explicite, privé en V1, accès à l’onglet orchestration      | Playwright + tests routes        |
| Lecture seule             | Explication organisation, clone possible, mutations masquées     | Tests permissions + code         |
| Chargement partiel config | Éditeur bloqué avec relance                                      | Code                             |
| Sauvegarde concurrente    | `baseVersionId`, erreur 409 exploitable                          | Tests versioning                 |
| Sauvegarde dans l'éditeur | Version et droits actualisés sans masquer l'écran ni les onglets | Test d'état éditeur + code       |
| Capacités                 | Une version atomique pour outils, connaissances et skills        | Tests versioning + CI PostgreSQL |
| Configuration terminée    | Checklist masquée, test chat prioritaire                         | Code                             |
| Suppression               | Confirmation d’impact et état occupé                             | Code + tests API                 |

## Orchestrateurs

| Scénario                                                           | Attendu                                                  | Couverture                        |
| ------------------------------------------------------------------ | -------------------------------------------------------- | --------------------------------- |
| Sélection de spécialistes                                          | Uniquement agents visibles, version active épinglée      | Tests délégations                 |
| Doublon ou auto-délégation                                         | Rejet serveur                                            | Tests délégations                 |
| Cycle indirect                                                     | Rejet avant activation                                   | Tests délégations + CI PostgreSQL |
| Permissions                                                        | `agents.delegate` revérifié à chaque enfant              | Tests runtime                     |
| Dry-run                                                            | Exécution bornée sans ambiguïté avec un run durable      | Tests runtime + UI                |
| Historique                                                         | Statut, aperçu sûr, tokens et date                       | Code + tests runtime              |
| Annulation                                                         | Demande propagée, état terminal convergent               | Tests runtime                     |
| Deadline/lease perdue                                              | Échec terminal sans replay automatique                   | Tests runtime                     |
| Budget profondeur/délégations/parallèle/étapes/tokens/temps/sortie | Limites UI et runtime cohérentes                         | Tests runtime policy              |
| Approbation non interactive                                        | Échec fermé et audité                                    | Tests runtime                     |
| Idempotence                                                        | Résultat terminé réutilisé, run actif en conflit         | Tests runtime                     |
| Quota concurrent                                                   | Réservation sérialisée et règlement arbre complet        | Tests use case + CI PostgreSQL    |
| Secrets et traces                                                  | Entrées/sorties chiffrées, projections expurgées         | Tests redaction/crypto            |
| Marketplace                                                        | Publication orchestrateur refusée en V1 avec explication | Tests marketplace                 |

## Connaissances

| Scénario                   | Attendu                                                  | Couverture              |
| -------------------------- | -------------------------------------------------------- | ----------------------- |
| Erreur initiale            | Erreur relançable, aucune base factice                   | Code                    |
| Base vide                  | CTA de création selon permission                         | Code                    |
| Documents en erreur        | Erreur limitée à la base sélectionnée, relance           | Code                    |
| Aucun document             | État vide explicite                                      | Code                    |
| Ingestion                  | Bouton désactivé sans titre/contenu, statut d’indexation | Code + tests API        |
| Attachement assistant      | GET bindings obligatoire avant PUT                       | Tests versioning + code |
| Liste assistants en erreur | Erreur distincte de « aucun assistant »                  | Code                    |
| Portée organisation/privée | Libellés localisés, permission fail-closed               | Code + tests IAM        |

## Outils, MCP, skills et approbations

| Scénario                       | Attendu                                                                    | Couverture                |
| ------------------------------ | -------------------------------------------------------------------------- | ------------------------- |
| Vérification des permissions   | Aucun onglet affiché avant réponse réussie                                 | Code + tests sidebar      |
| URL d’onglet invalide/interdit | Repli vers un onglet autorisé et URL corrigée                              | Code                      |
| Route `/custom-tools`          | Redirection vers `/tools?tab=custom`                                       | Playwright navigation     |
| Connexions MCP                 | En-tête dépliable sémantique, actions séparées                             | Test accessibilité + code |
| Catalogue serveurs MCP         | Erreur relançable si serveurs ou outils échouent, aucune fausse liste vide | Code + tests MCP          |
| Erreur connexions              | Erreur relançable, jamais faux vide                                        | Code                      |
| Secrets                        | Écriture seule, libellés et conséquences localisés                         | Tests sécurité + code     |
| Preview skill modifiée         | Checksum invalide l’installation                                           | Tests skill installation  |
| Approbation atomique           | Une transition vers exécution, un effet de bord                            | Tests approbations        |
| Liste approbations en erreur   | Décisions bloquées jusqu’à relance réussie                                 | Code                      |
| Aucune approbation             | État calme, pas de statistiques décoratives                                | Code                      |

## Fournisseurs, tâches, clés API et Marketplace

| Surface           | Scénarios critiques                                                                                      | Couverture                     |
| ----------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Fournisseurs      | erreur initiale, modèles périmés après changement, découverte, test, archive                             | Code + tests providers         |
| Tâches planifiées | erreur assistants, erreur tâches, création bloquée si état inconnu, run orchestrateur                    | Code + tests scheduler/runtime |
| Clés API          | erreur liste, clé affichée une fois, copie en échec, confirmation d’impact avant révocation, permissions | Code + tests API keys          |
| Marketplace       | erreur initiale, fiche indisponible sans redirection, preflight credentials, installation et partage     | Code + tests marketplace       |
| Usage             | erreur initiale/refresh, filtres date locale, quota concurrent                                           | Code + tests quota             |
| Audit             | erreur initiale/refresh, dates locales, export, filtres                                                  | Code + tests audit             |

## Paramètres et administration

| Scénario                 | Attendu                                                      | Couverture              |
| ------------------------ | ------------------------------------------------------------ | ----------------------- |
| Utilisateur non admin    | État interdit explicite                                      | Code + tests IAM        |
| Panne d’un panneau admin | Erreur relançable au lieu d’un skeleton infini               | Code                    |
| Inscription              | Premier compte protégé, ouverture/fermeture atomique         | Tests admin             |
| Navigation               | Ordre, visibilité, reset, routes autorisées                  | Tests sidebar           |
| Gouvernance assistants   | ordre, défaut, agents non prêts                              | Code + tests agents     |
| Automatisation chat      | disabled/incomplet/prêt, test connexion                      | Code + tests automation |
| Builder outils           | secrets, fournisseur/modèle/MCP requis, activation           | Code + tests builder    |
| Utilisateurs             | champs autocomplete, double envoi, auto-suspension interdite | Code + tests admin      |
| Santé système            | sain/inconnu/dégradé sans faux succès                        | Code                    |

## Gates de release

Avant merge :

1. `npm run lockfile:check` ;
2. `npm run lint` ;
3. `npm run typecheck` ;
4. `npm run test:ci` ;
5. `npm run build` ;
6. migrations PostgreSQL, contraintes et triggers sur une base propre ;
7. Playwright auth + setup + chat + agents + orchestrateur + outils + connaissances + tâches + Marketplace ;
8. recette mobile 320/390px et clavier ;
9. vérification des dictionnaires FR/EN ;
10. scan des secrets et revue des traces/audits.

## Preuves de validation du 9 juillet 2026

- PostgreSQL 16/pgvector et Dragonfly ont été démarrés avec Docker ; la migration `0028`, ses tables, contraintes et triggers ont été validés sur le moteur réel.
- 92 fichiers de tests et 923 tests unitaires/intégration passent. La couverture atteint 95,09 % des statements/lignes, 80,08 % des branches et 96,93 % des fonctions, au-dessus des seuils configurés.
- Les 104 scénarios Playwright Chromium passent sans retry sur le build de production. Ils couvrent notamment l’authentification, le setup, le chat, les assistants, la création/suppression d’un orchestrateur, les connaissances, les outils, les clés API, les paramètres, les langues, le thème, l’usage et l’audit.
- Le build Next.js génère avec succès les 84 pages et routes. Le lockfile reproductible, Prettier, ESLint et TypeScript passent également.
- Huit routes principales ont été contrôlées à 320, 375, 768 et 1440 px sans overflow horizontal. Axe ne remonte aucune violation critique ou sérieuse sur leur état stabilisé.
- Les intégrations nécessitant des comptes tiers réels (fournisseurs IA, GitHub, MCP distant) restent validées par contrats, mocks et tests d’intégration ; leur smoke avec identifiants de production relève de la recette de déploiement.
