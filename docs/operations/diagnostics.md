# Diagnostiquer une erreur Maiah

Les routes utilisant `handleRoute` ou `handleAdminRoute` produisent un `requestId`
partagé par leurs logs imbriqués et l’en-tête de réponse `x-request-id`.
L’exécution MCP génère en plus un `diagnosticId`, affiché dans l’erreur de l’outil
et transmis au gateway ServiceNow. Rechercher cette référence dans les logs
de l’application et du gateway pour suivre la même opération.

## Champs utiles

- `requestId`, `diagnosticId` : corrélation, jamais des identifiants de connexion.
- `workspaceId`, `userId`, `connectionId`, `serverId`, `toolId` : contexte sélectionné.
- `phase` : connexion MCP ou requête protocolaire.
- `remoteStatus`, `code`, `cause`, `durationMs` : cause technique et durée.
- Gateway : `instanceHost` et `toolName`, sans paramètres métier ni identifiants secrets.

Les erreurs MCP conservent leur cause serveur. Le résultat d’outil expose un message
borné avec sa référence. ServiceNow distingue notamment 401 (authentification),
403 (accès), 404 (ressource), 429 (limitation) et 5xx (service distant).
Ne pas relancer automatiquement une écriture dont le résultat est incertain.

## Volume et confidentialité

Les suivis GET rapides et réussis (conversations, transfert, compagnon, invocations)
sont en debug. Les autres appels et les suivis lents restent visibles ; les 4xx
sont en warning et les 5xx en error. `LOG_LEVEL=debug` réactive ces diagnostics
de suivi en production si nécessaire.

Le logger partagé filtre récursivement secrets, headers, cookies, corps et paramètres
SQL, borne les structures et gère les cycles. Better Auth utilise ce même logger.
Ne jamais ajouter de dump d’environnement, de contexte MCP chiffré, d’arguments
d’outil ou de réponse métier. Cette protection s’applique au logger partagé :
ne pas utiliser `console.log`/`console.error` pour de nouveaux diagnostics serveur.

## ServiceNow : 401 en Basic Auth

Vérifier l’instance sélectionnée et les identifiants de cette connexion. Si la
restriction Basic Auth est appliquée, l’administrateur ServiceNow peut autoriser
le compte selon sa politique avec `snc_basic_auth_api_access` (décision
“Maintain current login”). Un compte dédié “Web service access only” constitue
une autre option, mais ne peut plus se connecter à l’interface.
Les ACL de la Table API et des tables/champs restent requises séparément.

Référence : https://www.servicenow.com/docs/r/platform-security/authentication/basic-auth-restriction.html
