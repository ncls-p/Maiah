# Plan qualité — branches ≥ 95 % + tous les fichiers ≤ 300 lignes

> **Changement de cap (2026-08-31)** — décidé après audit :
>
> 1. **Le gate « ≤ 300 lignes par fichier » est remplacé** par
>    `scripts/check-code-size.mjs` (+ ratchet `scripts/file-size-ratchet.json`) :
>    ratchet anti-régression par fichier (les fichiers ratchetés peuvent
>    rétrécir, pas grossir ; nouveaux fichiers ≤ 300 lignes) + complexité
>    cyclomatique par fonction ≤ 30 + longueur de fonction ≤ 200 lignes,
>    mesurées via l'API TypeScript. Scripts npm : `quality:size` /
>    `quality:size:update`. L'ancien `scripts/check-file-length.mjs` (table
>    LEGACY_LINE_LIMITS) est supprimé.
> 2. **Consolidation des splits mécaniques** (`part-a/b/c`) : toutes les
>    familles `part-*` de `src/` sont refondues en fichiers uniques
>    (hooks use-chat-stream ×4, runtime-executor.execute-resolved-agent,
>    routes chat ×4, conversations/route.get). Les splits `section-N` /
>    `branch-N` / `suite-N` restent en place pour l'instant ; la suite du
>    travail cible les chaînes les plus mécaniques de `src/` (pas `test/`).
> 3. **L'objectif couverture branches ≥ 95 % est inchangé** et reste la
>    priorité restante (seuil vitest `branches` : 79 → 95 une fois réels
>    ≥ 95 %).

## Objectifs d'origine (fixés par l'utilisateur)
1. Couverture de **branches ≥ 95 %** (baseline mesurée : **83,98 %** = 5125/6103) + seuil vitest relevé à 95.
2. **Tous les fichiers ≤ 300 lignes** (après Prettier) — éliminer les 98 fichiers en dépassement et la table de ratchets legacy de `scripts/check-file-length.mjs`.
3. **Zéro erreur, zéro warning** sur tous les gates (lockfile, lint, typecheck, test:ci, coverage, file-length, jscpd, build).

Contraintes : **aucun commit, aucun push** pendant tout le travail. Validation systématique après chaque étape. Données de travail dans `.work/` (supprimées à la fin).

## Phase 0 — Ligne de base

- [x] 0.1 Lire `scripts/check-file-length.mjs` (MAX 300 + ratchets legacy 305→606) et `vitest.config.mts` (include lib/modules/domain ; seuils 95/79/90/95)
- [x] 0.2 Baseline typecheck (0 erreur) + lint (0 erreur) + tests (pass, couverture statements 95,3 % / fonctions 97,2 % / branches 84,0 %)
- [x] 0.3 Lister les 98 fichiers > 300 lignes (`.work/` + ce plan)
- [x] 0.4 Analyse branches par fichier (`.work/branch-targets.json`) : 978 branches manquantes ; 673 à couvrir pour 95 % ; plan : ~745 branches ciblées (≈ 96,2 %)

## Phase 1 — Réduction des fichiers à ≤ 300 lignes

Règle commune : refactorisation pure (déplacement de code), comportement inchangé, importeurs non modifiés (barrels de re-export), Prettier appliqué, nouveaux fichiers ≤ 300 lignes (cible ≤ 280).

### Vague 1 (lancée en parallèle)

- [x] 1.1 **W1** — test/unit A (7) : resource-access-scope.test.ts (604→217+289+238+fixture 68 ✅ 31/31 tests), resource-direct-sharing.test.ts (519→262+283+254 ✅), agent-runtime-executor.suite-6.test.ts (481 — cas spécial en attente), openai-compatible-adapter.suite-4.test.ts (427→229+248 ✅ 9/9), knowledge-use-cases.test.module-2.ts (384→221+179 + barrel câblé ✅ 47/47), marketplace-use-cases-extra.suite-3.test.ts (366 — en attente), marketplace-use-cases-extra.suite-4.test.ts (344 — en attente)
- [ ] 1.2 **W3** — test/e2e + integration (5) : chat-sharing-retention-and-preview.spec.ts (462), chat.suite-3.spec.ts (407), tools.spec.module-1.ts (314), iam-use-cases-db.scenario-1.ts (375), iam-use-cases-db.scenario-9.ts (343)
- [ ] 1.3 **W4** — chat routes (7) : route.prepare-conversation.ts (575), route.standard.ts (511), route.post.ts (432), route.orchestrator.ts (344), route-support.build-bound-tools.ts (382), route-history.load-conversation-history.ts (318), route.standard-completion.ts (311)
- [ ] 1.4 **W6** — chat components (9) : chat-tools-menu.chat-tools-menu.tsx (605), chat-message-rendering.tool-part-card.tsx (532), chat-sidebar.chat-sidebar.tsx (472), git-hub-publish-dialog section-1 (365), chat-message-list.view.tsx (368), chat-composer.chat-composer.tsx (359), user-message-rail.tsx (349), message-content.tsx (305), conversation-share-dialog.tsx (304)
- [ ] 1.5 **W9** — modules (13) + couverture branches de 5 fichiers (56 branches) : execute-resolved-agent (534), expand-transfer-graph (436), update-agent-unlocked (435), resource-direct-sharing (425), list-documents (422), apply-transaction (422), access-scope (387), publish-code-workspace-to-git-hub (355), custom-tool-builder-tools (319), stream-bus.create-chat-uimessage-stream-response (314), build-delegation-tools (315), get-visible-agent-by-id (314), themes (306)
- [ ] 1.6 **W10** — autres composants + infra (17) : mcp-server-manager (473), provider-manager (435), use-agentic-editor (429), workflow-agentic-panel (458), assistant-governance-settings (414), workflow-builder (391), tool-connections-panel (387), skill-editor-dialog (366), resource-share-dialog (343), normalize-responses-reasoning-sse-line (380), conversations.ts schema (348), worker/index.ts (322), sidebar-navigation-settings (322), orbit-product-navigation (316), workflow-builder.view (315), chat-automation-settings (312), global-components.pcss (313)
- [ ] 1.7 **C1** — couverture branches chat/agent/workflows/lib/domain (~18 fichiers, ~210 branches)

### Vague 2 (après validation de la vague 1)

- [x] 1.8 **W2** — test/unit B (10) ✅ 100/100 tests : conversation-sharing (343→206+245), chat-message-metrics (341→186+156), conversation-branches (338→183+233), stream-bus.test.module-2 (327→221+115 + module-4 câblé barrel), rag-config-runtime (327→199+207), chat-route-history (326→146+249, beforeEach restauré dans les 2 parties), marketplace-use-cases-extra (315→259+229→suite-5 ; suite-3 366→220+240+269 ; suite-4 344→252+252+213), workflow-agentic-route.suite-4 (306→232 + fixture defaults 97), custom-tools-use-cases.suite-5 (305→235+233), tool-builtin (304→165+159)
- [ ] 1.9 **W5** — chat hooks (4) : use-chat-stream.use-chat-stream.ts (489), use-chat-stream.resume.ts (451), use-chat-stream.submit.ts (425), use-chat-stream-events.apply-stream-event.ts (320)
- [ ] 1.10 **W7** — pages (14) : knowledge page (576), chat-page (531), use-chat-session (482), agents-page.view.section-2 (441), agent-configure-page (417), capabilities-tab (394), agents-page (389), use-agent-configuration-data (370), use-chat-directory (368), essential-tab.view (333), chat-page.view (326), marketplace-page (349), items/[itemId]/page (311), knowledge view branch-1…branch-1 (301)
- [ ] 1.11 **W8** — IAM + resource components (11) : resource-access-panel.view.section-1 (465), access-console (451), workspace-api-keys (446), use-workspace-history (433), access-console s1.s1.s2 (424), resource-access-dialog (418), access-console s1.s3.branch-4 (385), resource-access-panel (375), access-console s1.s3.branch-2 (350), resource-access-panel.view.section-2 (334), scope-migration-dialog s1 (306)
- [ ] 1.12 **C2** — couverture branches tool/marketplace/document/code-workspace/openai/skills (~21 fichiers, ~224 branches)
- [ ] 1.13 **C3** — couverture branches queue (miss 6-9, ~25 fichiers, ~155 branches)
- [ ] 1.14 **C4** — couverture branches queue (miss 4-5, ~21 fichiers, ~100 branches)
- [ ] 1.15 Suppression de la table LEGACY_LINE_LIMITS de `scripts/check-file-length.mjs` (tous les fichiers ≤ 300)
- [ ] 1.16 Validation : `node scripts/check-file-length.mjs` → 0 violation, exit 0

## Phase 2 — Seuils de couverture

- [ ] 2.1 Relever `thresholds.branches` de 79 à 95 dans `vitest.config.mts`
- [ ] 2.2 `npm run test:coverage` → branches ≥ 95 % réelles (cible ≥ 95,5 % pour marge)

## Phase 3 — Validation finale (zéro erreur / zéro warning)

- [ ] 3.1 `npm run lockfile:check`
- [ ] 3.2 `npm run lint` (0 erreur, 0 warning)
- [ ] 3.3 `npm run typecheck` (0 erreur)
- [ ] 3.4 `npm run test:ci` (100 % pass)
- [ ] 3.5 `npm run test:coverage` (seuil 95 branches OK, réels ≥ 95 %)
- [ ] 3.6 `node scripts/check-file-length.mjs` (0 violation)
- [ ] 3.7 `npm run quality:duplicates` (sous le seuil 0.45)
- [ ] 3.8 `npm run build` (0 erreur, 0 warning)
- [ ] 3.9 Nettoyage `.work/`, récap final dans ce plan

## Journal de validation

_(rempli au fur et à mesure — chaque entrée horodatée avec la commande exacte et le résultat)_

- T1 (ras 604→3 parties+fixture, direct-sharing 519→3 parties, openai suite-4 427→2, knowledge module-2 384→2+barrel) : tsc OK, eslint 0 warning, vitest 31+23+47+9 = 110 tests verts. Leçons : (1) les fichiers `module-N` sont importés par barrel — câbler les nouvelles parties ; (2) dupliquer le préambule complet (helpers + beforeEach) et ajuster les imports par tsc+eslint ; (3) `eslint --fix` ne retire pas les imports inutilisés → élagage manuel.
- T2 (12 fichiers test/unit : conversation-sharing, chat-message-metrics, conversation-branches, stream-bus module-2→+module-4, rag-config-runtime, chat-route-history, marketplace extra base/suite-3/suite-4→suites 5-9, custom-tools suite-5→+suite-6, tool-builtin→+suite-2, workflow suite-4→beforeEach déplacé dans fixture `workflow-agentic-route.suite-4.defaults.ts`) : tsc 0 erreur, eslint 0 warning, vitest 24 fichiers / 100 tests verts. Leçons : (a) bug du trim script (regex échappée) a supprimé des imports entiers → corrigé + 3 imports restaurés depuis git HEAD ; (b) chat-route-history avait perdu son `beforeEach` top-level (offset dLine erroné) → restauré dans les 2 parties, tests verts ; (c) vérifier `git diff HEAD` de chaque original après split pour détecter les préambules perdus.
