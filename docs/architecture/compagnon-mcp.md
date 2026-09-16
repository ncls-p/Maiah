# Compagnon global et MCP Maiah

Tickets : DEO-22 et DEO-23, une seule PR.

## Configuration et usage

Dans **Paramètres de l’application → Personnalisation par organisation → Compagnon Maiah**, un administrateur application active le compagnon pour la plateforme. Un administrateur de l’organisation choisit ensuite un assistant configuré, avec un modèle permettant les outils. Choisir « Aucun compagnon » le désactive pour cette organisation.

Le bouton flottant apparaît sur toutes les pages authentifiées du projet actif. Il ouvre un chat déplaçable à la souris ou avec les flèches du clavier. Le panneau conserve sa conversation pendant les navigations ; son historique est enregistré comme les autres chats. Une nouvelle conversation et un lien vers le chat complet sont disponibles. La position est conservée dans ce navigateur. Le choix de l’assistant accorde son utilisation aux membres autorisés à discuter dans le projet ; il n’accorde aucun droit d’administration supplémentaire.

Le compagnon réutilise `useChatStream`, `ChatMessageList`, les conversations, les budgets et le moteur de génération existants. Ses outils supplémentaires utilisent le serveur MCP commun et un canal d’interaction avec la page. L’accès aux opérations est celui de l’utilisateur, jamais un compte administrateur de service.

## Connexion MCP externe

Dans **Avancé → Tokens API**, créer un token avec les scopes nécessaires. La page affiche l’URL MCP de l’instance :

- Transport : Streamable HTTP, réponses JSON, sans session MCP persistante.
- URL : `https://<instance>/api/mcp`.
- En-tête : `Authorization: Bearer <token API Maiah>`.
- Le SDK MCP installé assure la négociation des versions de protocole qu’il prend en charge.
- Les cookies seuls ne permettent pas d’utiliser cet endpoint externe. Les tokens expirés/révoqués et comptes bannis sont refusés. Une origine navigateur différente de celle de l’instance est refusée.

Trois outils : `maiah_search_actions` (recherche et pagination), `maiah_describe_action` (contrat OpenAPI et schémas référencés), `maiah_execute_action` (paramètres de chemin, query et corps JSON).

Le catalogue est construit depuis l’inventaire des routes. Il expose les actions JSON compatibles avec le mode d’authentification ; les routes d’authentification, webhooks, pont du compagnon, générations de chat récursives, flux et transferts multipart sont exclus. Les transferts de fichiers restent possibles dans l’interface et via leurs API spécialisées. La visibilité d’une action dans le catalogue ne garantit pas l’autorisation : sa route vérifie de nouveau les droits, le projet du token et ses scopes lors de l’exécution. Un contrat générique ne doit pas être interprété comme une autorisation d’inventer des champs.

Les appels internes ont une origine fixe, refusent les redirections, limitent la taille du corps et de la réponse et expirent après 30 secondes. Les logs d’opération contiennent l’identifiant de l’action, l’utilisateur, le projet, le statut et la référence de requête, sans cookie, token ou corps métier. Les erreurs techniques sont expurgées avant d’être retournées.

## Contexte et actions dans la page

Le partage peut être désactivé dans le panneau. Il fournit le chemin courant sans paramètres d’URL, le titre, le texte et les titres visibles, les contrôles visibles et leurs valeurs non sensibles, le focus et le curseur. Les mots de passe, fichiers, champs cachés, identifiants sensibles et éléments marqués `data-companion-private` sont exclus. Le panneau lui-même n’est pas capturé. Les pages affichant un secret dans un bloc personnalisé doivent marquer ce bloc `data-companion-private`.

Le contexte est borné et chiffré dans le cache, isolé par utilisateur, projet et onglet, avec expiration de 20 secondes. Les extraits lus par le modèle font partie de l’historique normal de cette conversation. Le contenu de page et les résultats d’outils sont explicitement traités comme données non fiables dans les instructions du compagnon.

`maiah_ui_action` permet de remplir un champ, cliquer un contrôle, naviguer dans Maiah et rafraîchir la page après une mutation API. Le navigateur vérifie de nouveau le chemin, la présence du contrôle, sa visibilité et son caractère non sensible. Une commande est réclamée une seule fois et acquittée après exécution. Les mutations sans confirmation ne sont pas rejouées automatiquement. Fermer le panneau ou désactiver le partage suspend les interactions de page ; la réponse textuelle peut continuer. Arrêter une génération retire les commandes encore en attente, sans annuler une mutation déjà effectuée.

La configuration et les droits sont relus à chaque appel d’outil. Une erreur de rafraîchissement conserve la dernière conversation, bloque les nouveaux envois et propose une nouvelle tentative. Changer de projet ou d’assistant sépare les conversations locales.

## Validation

- Tests unitaires : catalogue, frontières de chemin et de taille, protocole MCP réel en mémoire, droits et configuration, arrêt des commandes, isolation utilisateur/projet/onglet, acquittement unique.
- Client MCP officiel contre le serveur local : initialisation, découverte, appel autorisé, scope insuffisant, projet étranger, révocation.
- Navigateur avec fournisseur LLM local déterministe : lecture du contexte, absence des champs secrets, modification visible, mutation API réelle, navigation en cours de réponse, persistance, clavier, mobile et droits membre/admin.
- Suite générale de couverture, lint, TypeScript, inventaires OpenAPI/permissions, build production et suite Playwright.
