# Guide de la codebase AI Hub

Ce document indique où vit chaque responsabilité, comment une requête traverse l’application et quels invariants préserver lors d’une évolution. Le [README](../../README.md) reste la référence d’installation et d’exploitation ; ce guide est la carte de maintenance du code.

## Vue d’ensemble

AI Hub est un monolithe modulaire Next.js. Les pages et routes HTTP orchestrent les entrées, les modules portent les cas d’usage, le domaine centralise l’autorisation et l’audit, et l’infrastructure adapte PostgreSQL, le cache, le stockage, les fournisseurs IA et le worker.

```text
Navigateur / client API
        │
        ▼
src/app — pages RSC, composants clients et route handlers
        │ authentification, validation, format de réponse
        ▼
src/modules — cas d’usage par capacité métier
        │ règles, transactions, chiffrement, quotas
        ▼
src/server/domain — autorisation et audit
        │
        ▼
src/server/infrastructure — PostgreSQL, cache, stockage, IA, worker
```

Une route ne doit pas réimplémenter une règle déjà portée par un module. Une mutation sensible doit vérifier l’identité et la permission avant le cas d’usage, puis écrire l’audit prévu. Les données secrètes restent chiffrées et les réponses utilisent des projections expurgées.

## Arborescence et responsabilités

| Zone                                   | Responsabilité                                        | Règle de maintenance                                                                 |
| -------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/app/[locale]`                     | Pages localisées, layouts et états d’accès            | Garder les lectures serveur dans les pages RSC quand cela simplifie le bootstrap     |
| `src/app/api`                          | Contrats HTTP, auth, validation, statuts et streaming | Déléguer les règles métier aux modules ; ne jamais faire confiance aux IDs du client |
| `src/components`                       | UI partagée et composants de feature                  | Distinguer chargement, vide, filtre vide et erreur ; traduire toute copie visible    |
| `src/components/ui`                    | Primitives du design system                           | Préserver sémantique, focus, clavier, tailles tactiles et thèmes                     |
| `src/modules`                          | Cas d’usage et politiques applicatives                | Tester les transitions, permissions, conflits et transactions au niveau module       |
| `src/server/domain`                    | Autorisation et audit transversaux                    | Les décisions doivent rester fail-closed                                             |
| `src/server/infrastructure`            | Adaptateurs et persistance                            | Aucun secret en clair dans logs, traces ou colonnes de projection                    |
| `messages/en.json`, `messages/fr.json` | Dictionnaires UI                                      | Ajouter les deux langues dans le même changement                                     |
| `test/unit`                            | Tests de logique, routes et modules                   | Préférer des cas de bord ciblés et déterministes                                     |
| `test/e2e`                             | Parcours Playwright                                   | Couvrir au moins succès, erreur initiale et permission pour les parcours critiques   |
| `.agents/skills`                       | Procédures réutilisables par les agents du dépôt      | Valider chaque skill et conserver ses evals avec lui                                 |

## Surfaces produit

| Surface             | Pages et composants                                          | API et module propriétaire                                                                          |
| ------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Authentification    | `src/app/[locale]/auth`, `src/components/auth`               | `src/app/api/auth`, `src/modules/auth`, Better Auth                                                 |
| Setup               | `src/app/[locale]/(workspace)/setup`, `src/components/setup` | `src/app/api/onboarding`, `src/modules/onboarding`, providers et agents                             |
| Chat                | `src/app/[locale]/(workspace)/chat`, `src/components/chat`   | `src/app/api/workspace/[agentId]/chat`, `src/modules/chat`, `src/modules/agent/runtime-executor.ts` |
| Assistants          | `src/app/[locale]/(workspace)/agents`                        | `src/app/api/workspace/agents`, `src/modules/agent`                                                 |
| Orchestrateurs      | onglet orchestration de l’éditeur agent                      | routes `delegations` et `runs`, modules `delegation-use-cases`, `run-use-cases`, `runtime-executor` |
| Connaissances       | page `knowledge`                                             | routes `knowledge-bases`, `src/modules/knowledge`                                                   |
| Fournisseurs IA     | page et composants `providers`                               | routes `providers`, `src/modules/provider`                                                          |
| Outils intégrés     | hub `tools` et éditeur agent                                 | routes `tools`, `src/modules/tool`                                                                  |
| MCP                 | hub `tools`, composants `mcp`                                | routes `mcp-servers`, `src/modules/mcp`                                                             |
| Connexions d’outils | panneau MCP                                                  | routes `tool-connections`, `src/modules/tool-connections`                                           |
| Skills              | hub `tools`, composants `skills`                             | routes `skills`, `src/modules/skills`                                                               |
| Outils custom       | onglet custom du hub                                         | routes `custom-tools`, `src/modules/custom-tools`                                                   |
| Approbations        | hub `tools` et messages chat                                 | routes `tool-invocations`, `src/modules/tool/invocation-*`                                          |
| Marketplace         | page et composants `marketplace`                             | `src/app/api/marketplace`, `src/modules/marketplace`                                                |
| GitHub              | dialogue de publication du workspace de code                 | routes `workspace/github`, `src/modules/github`                                                     |
| Tâches planifiées   | page et composants `scheduled-tasks`                         | routes `scheduled-tasks`, `src/modules/scheduled-tasks`                                             |
| Clés API            | page `api-keys`                                              | routes `api-keys`, `src/modules/api-keys`                                                           |
| Usage et quota      | page `usage`                                                 | route `usage`, `src/modules/usage`                                                                  |
| Audit               | page `audit`                                                 | route `audit`, service `domain/services/audit.ts`                                                   |
| Administration      | pages et composants `admin`                                  | routes `admin`, `src/modules/admin`                                                                 |
| Navigation          | shell workspace et réglage admin                             | `src/modules/navigation`                                                                            |
| Workspace de code   | panneaux chat et page dédiée                                 | routes `code-projects`, `src/modules/code-workspace`                                                |

## Modules métier

### Agent

- `use-cases.ts` : création, visibilité, versions, bindings de capacités, conversations et usage historique.
- `runtime-policy.ts` : limites de sortie, étapes, outils et délais.
- `orchestration-policy.ts` : schéma et bornes de délégation.
- `delegation-use-cases.ts` : spécialistes épinglés, visibilité, doublons et cycles.
- `run-use-cases.ts` : runs durables, leases, traces, annulation, règlement quota et reaper.
- `runtime-executor.ts` : exécution récursive bornée, outils, permissions et synthèse.

Le type `assistant` ou `orchestrator` est immuable. Toute configuration exécutable appartient à une version. Une mise à jour part du `baseVersionId` lu par l’éditeur et échoue en conflit si une autre écriture a gagné.

### Chat

- `stream-bus.ts` maintient la diffusion et l’annulation d’un message en cours.
- `attachments.ts` valide les fichiers et produit les métadonnées publiques.
- `automation.ts` génère titres et suggestions avec la configuration admin.
- La route de chat persiste message, conversation et usage de façon cohérente ; un orchestrateur passe par l’exécuteur durable partagé.

### Outils et approbations

- `builtin-tools-catalog.ts` et `builtin-tools.ts` décrivent les outils internes.
- `use-cases.ts` résout les bindings de version.
- `approval-policy.ts` et `opa-approval-policy.ts` calculent la politique.
- `invocation-state.ts` et `invocation-approval.ts` garantissent une décision atomique.
- `safe-payload.ts` borne et expurge les entrées, sorties et erreurs persistées.

Une exécution non interactive ne doit jamais attendre une approbation humaine : elle échoue fermée. Une exécution interactive ne déclenche l’effet de bord qu’après la transition atomique vers l’état autorisé.

### Marketplace et skills

Le Marketplace publie un manifeste nettoyé, jamais les credentials du workspace source. Les helpers de draft, preview, installation et sanitization vivent dans `src/modules/marketplace`. L’installation d’un skill est liée au contenu prévisualisé par checksum ; une modification entre revue et installation invalide l’opération.

### Usage

`quota.ts` lit l’usage mensuel. `quota-reservations.ts` sérialise l’admission concurrente par workspace. Un run racine réserve son budget avant exécution ; les enfants consomment ce budget. La finalisation du run, le règlement de réservation et l’événement d’usage sont transactionnels.

## Persistance

Les tables Drizzle sont séparées dans `src/server/infrastructure/db/schema-tables` :

- `auth.ts` : utilisateurs, sessions et Better Auth ;
- `workspace.ts`, `iam.ts` : tenants, membres, rôles et bindings ;
- `agents.ts`, `agent-runs.ts` : agents versionnés, délégations, runs, étapes et réservations ;
- `conversations.ts` : conversations, messages, parties, dossiers et tâches ;
- `ai-providers.ts` : fournisseurs et modèles ;
- `knowledge.ts` : bases, documents, chunks et embeddings ;
- `mcp.ts`, `tool-connections.ts`, `custom-tools.ts` : capacités externes et secrets chiffrés ;
- `marketplace.ts` : publications, installations et ressources sources ;
- `usage.ts`, `audit.ts` : comptabilité et événements sensibles.

Les migrations SQL sont ordonnées dans `src/server/infrastructure/db/migrations`. Ne pas éditer une migration déjà déployée : ajouter une migration, son schéma Drizzle et les tests de contraintes. Valider les triggers, clés étrangères et transactions sur PostgreSQL réel.

## Flux critiques

### Requête workspace standard

1. Résoudre la session avec `resolveAuthContext`.
2. Déterminer l’acteur effectif avec `getActorUserId`.
3. Valider body, query et params avec le schéma de route.
4. Vérifier la permission au bon scope.
5. Appeler le module propriétaire.
6. Écrire l’audit si l’action est sensible.
7. Retourner un statut exploitable par l’UI, notamment `403`, `404` et `409`.

### Chat assistant

1. Vérifier agent, version, quota et conversation.
2. Persister le message utilisateur et ouvrir le message assistant en streaming.
3. Résoudre modèle, connaissances, skills et outils autorisés.
4. Diffuser les événements et persister les parties sûres.
5. Finaliser message, conversation et usage ; l’échec laisse un état explicite récupérable.

### Run orchestrateur

1. Créer ou réutiliser le run idempotent et réserver le quota racine.
2. Réclamer un lease et lancer le heartbeat.
3. Charger la version et les spécialistes épinglés.
4. Revérifier `agents.delegate`, visibilité, ancestry et budgets à chaque enfant.
5. Persister des étapes expurgées et propager annulation/deadline.
6. Finaliser statut, usage et réservation dans une transaction.

Voir [le modèle de run](orchestrator-run-model.md), [le versioning agent](agent-configuration-versioning.md), [les limites runtime](agent-runtime-bounds.md) et [le cycle d’approbation](tool-approval-lifecycle.md).

## Invariants de sécurité

- Authentification et permissions sont vérifiées côté serveur ; masquer un bouton ne constitue pas une autorisation.
- Les IDs d’un body sont recroisés avec le workspace et la ressource parent.
- Clés fournisseur, headers MCP, variables d’environnement, connexions d’outils et payloads sensibles sont chiffrés.
- Les manifests Marketplace et previews excluent les credentials.
- Les erreurs publiques et traces passent par les helpers d’expurgation.
- Les permissions de délégation et d’approbation sont revérifiées au moment de l’effet de bord.
- Les mutations versionnées utilisent compare-and-swap ; les décisions d’approbation utilisent une transition atomique.
- Les side effects ne sont jamais rejoués automatiquement après perte de lease.

Les détails se trouvent dans `docs/security`.

## Contrat UI/UX

Chaque lecture distante distingue chargement initial, succès, succès vide, filtre vide, erreur initiale et erreur de rafraîchissement. Une erreur ne devient jamais un faux état vide. Les actions restent bloquées tant que permissions ou données sources ne sont pas vérifiées. Les mutations empêchent le double envoi, conservent la saisie en cas d’échec et expliquent les conflits.

Toute copie visible, nom accessible, date, nombre et pluriel passe par `next-intl`. Les actions secondaires doivent rester accessibles au tactile et au clavier, pas uniquement au survol. Les suppressions et révocations nomment la ressource et leur conséquence.

La couverture détaillée est dans [la matrice des parcours](../ux/user-workflow-test-matrix.md). Le skill [ux-workflow-audit](../../.agents/skills/ux-workflow-audit/SKILL.md) formalise la méthode.

## Worker et services externes

`src/server/infrastructure/worker/index.ts` traite les tâches planifiées. Les adaptateurs fournisseur sont dans `infrastructure/providers`. Le cache Dragonfly et le stockage S3 sont encapsulés dans leurs répertoires respectifs. Le sandbox de code communique par socket Unix avec le runner construit par `npm run sandbox:build`.

Le démarrage développement exécute les migrations avant Next.js. Si PostgreSQL n’est pas disponible, lancer Next directement peut servir à inspecter les pages publiques, mais ne valide ni les routes authentifiées ni les migrations.

## Stratégie de test

| Gate             | Commande                                                                                               | But                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Lockfile         | `npm run lockfile:check`                                                                               | Empêcher une résolution npm non reproductible |
| Lint             | `npm run lint`                                                                                         | React, accessibilité statique et conventions  |
| Types            | `npm run typecheck`                                                                                    | Contrats TypeScript, routes et dictionnaires  |
| Unit/intégration | `npm run test:ci`                                                                                      | Modules, routes, politiques et cas de bord    |
| Build            | `npm run build`                                                                                        | Graphe RSC/client et production Next.js       |
| E2E              | `npm run test:e2e`                                                                                     | Parcours navigateur avec infrastructure       |
| Migrations       | `npm run db:migrate` sur base propre                                                                   | SQL, contraintes et triggers PostgreSQL       |
| Skills           | `uv run --with pyyaml python .agents/skills/skill-creator/scripts/quick_validate.py <skill-directory>` | Frontmatter et structure d’un skill           |

Les tests d’un changement doivent cibler le niveau où vit l’invariant. Un test de composant ne remplace pas un test de transaction ou de permission serveur. Les limites locales doivent être écrites dans la matrice de recette.

## Ajouter une capacité

1. Identifier le module propriétaire ou en créer un sous `src/modules`.
2. Ajouter schéma et migration si nécessaire, sans modifier l’historique déployé.
3. Implémenter le cas d’usage transactionnel et ses tests.
4. Ajouter une route mince avec auth, validation et permissions.
5. Construire les états UI complets et les deux dictionnaires.
6. Ajouter audit, quota, chiffrement et redaction selon le risque.
7. Mettre à jour ce guide, la documentation spécialisée et la matrice de parcours.
8. Exécuter les gates proportionnels puis le pipeline complet avant merge.

## Points d’entrée documentaires

- [README et exploitation](../../README.md)
- [Modèle de run orchestrateur](orchestrator-run-model.md)
- [Versioning des agents](agent-configuration-versioning.md)
- [Bornes runtime](agent-runtime-bounds.md)
- [Cycle d’approbation](tool-approval-lifecycle.md)
- [Credentials Marketplace](../security/marketplace-credentials.md)
- [Installation des skills](../security/skill-installation.md)
- [Stockage des payloads d’outils](../security/tool-payload-storage.md)
- [Connexions d’outils et ServiceNow MCP](../tool-connections-and-servicenow-mcp.md)
- [Plan UI/UX](../ui-ux-redesign-plan.md)
- [Matrice de recette](../ux/user-workflow-test-matrix.md)
- [Skill d’orchestration](../../.agents/skills/agent-orchestration/SKILL.md)
- [Skill d’audit UX](../../.agents/skills/ux-workflow-audit/SKILL.md)
