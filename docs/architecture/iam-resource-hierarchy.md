# Hiérarchie IAM des organisations et projets

## Objectif

Le modèle d’accès reprend l’idée centrale des IAM de cloud sans exposer leur complexité : un droit est attribué à un membre ou une équipe, via un rôle, sur une organisation ou un projet. Les attributions d’organisation sont héritées par tous ses projets ; les attributions de projet restent locales.

Le terme produit **projet** correspond à la table et au scope technique historiques `workspaces`. Cette compatibilité évite de renommer toutes les clés étrangères et routes existantes.

## Modèle

```text
Organisation
├── membres
├── équipes
│   └── membres d’équipe
├── rôles d’organisation
└── projets
    ├── rôles de projet
    └── ressources Maiah
```

Une attribution relie :

- un principal `user` ou `group` — `group` représente une équipe ;
- un rôle intégré ou personnalisé ;
- une ressource `organization` ou `workspace`.

Les rôles intégrés couvrent les parcours courants :

- propriétaire, administrateur et membre d’organisation ;
- administrateur, éditeur et lecteur de projet.

Les rôles personnalisés d’organisation appartiennent à l’organisation. Les rôles personnalisés de projet restent dans leur projet, ce qui évite qu’un administrateur local modifie les accès d’un autre projet.

## Résolution d’un accès

Pour un utilisateur et un projet :

1. vérifier une adhésion active au projet ou à son organisation ;
2. charger les équipes de l’utilisateur dans cette organisation ;
3. collecter les attributions directes de l’utilisateur ;
4. collecter les attributions de ses équipes ;
5. fusionner les attributions du projet et celles de l’organisation parente ;
6. dédupliquer les permissions et appliquer les règles `view`, `manage` et `*` ;
7. refuser par défaut si aucune permission ne correspond.

Une suppression de membre ou une modification d’équipe invalide le cache de l’organisation et de chacun de ses projets. Le délai du cache reste une protection de performance, jamais la source de vérité.

## Projet actif

Le projet choisi est une préférence de compte stockée dans `user_workspace_preferences`, et non un état propre au navigateur. Une nouvelle session, y compris en navigation privée, retrouve donc le même projet actif. Le stockage local historique reste uniquement un repli de migration lorsqu’aucune préférence serveur n’existe encore.

La préférence référence l’ID immuable du projet : renommer une organisation, un projet ou leur slug ne change pas la sélection. `PATCH /api/workspaces` accepte uniquement un projet auquel l’utilisateur de la session a encore accès ; une clé API ne peut pas modifier cette préférence de compte.

## Invariants

- Un membre d’équipe doit d’abord être membre actif de l’organisation.
- Un rôle personnalisé ne peut être attribué hors de son organisation propriétaire.
- Un rôle personnalisé de projet ne peut être attribué qu’à son projet propriétaire.
- Un rôle d’organisation ne peut être lié qu’à une organisation ; un rôle de projet qu’à un projet.
- Le dernier propriétaire direct d’une organisation ne peut pas être retiré.
- Les IDs fournis par le client sont toujours recroisés avec l’organisation du projet actif.
- Les contrôles UI ne remplacent jamais `authorization.checkPermission`.
- Les clés API restent limitées à un seul projet et à leurs scopes explicites.

## Migration

La migration `0038_hierarchical_iam` :

- crée les membres d’organisation, équipes et membres d’équipe ;
- déduit les adhésions d’organisation des adhésions projet existantes ;
- attribue le rôle propriétaire au créateur du premier projet de chaque organisation existante ;
- ajoute les rôles intégrés propriétaire d’organisation et lecteur de projet ;
- déduplique puis protège les attributions par une contrainte unique.

Cette migration est additive. Les adhésions et attributions projet existantes restent valides.
