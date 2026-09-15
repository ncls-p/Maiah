# Connexions MCP et OAuth 2.0

## Configuration

Les serveurs distants acceptent Streamable HTTP et SSE. L'initialisation HTTP essaie SSE uniquement si le serveur répond 404 ou 405. Les nouveaux serveurs stdio sont refusés ; la migration désactive les anciennes définitions, qui restent consultables pour conversion ou suppression.

Dans **Outils → MCP**, déplier un serveur puis ouvrir **OAuth 2.0**. Un gestionnaire configure le client OAuth : identifiant, secret facultatif, scopes, ou enregistrement dynamique explicitement activé. Enregistrer l'URL de callback affichée chez le fournisseur. Chaque utilisateur autorise ensuite son propre compte. Une modification de cette configuration exige une nouvelle autorisation des comptes concernés.

La découverte suit le SDK MCP officiel : métadonnées de ressource protégée, serveur d'autorisation, Authorization Code et PKCE S256. L'état de retour est lié à l'utilisateur, utilisable une seule fois et expire après dix minutes. Les jetons et secrets sont chiffrés en base ; les réponses navigateur et les journaux ne les contiennent pas. Le renouvellement est sérialisé pour éviter de réutiliser simultanément un refresh token rotatif.

Déconnecter supprime immédiatement les identifiants locaux et tente la révocation chez le fournisseur. L'interface indique si cette révocation distante n'est pas disponible. Un appel d'outil ayant échoué n'est pas rejoué automatiquement.

## Synchronisation du catalogue

Le worker inspecte les échéances chaque minute, traite au plus dix serveurs par passage et deux connexions simultanées. Une synchronisation réussie programme la suivante environ quinze minutes plus tard, avec une variation de 10 % pour répartir la charge. Les échecs espacent les tentatives de trente minutes jusqu'à environ six heures.

Le bouton **Resynchroniser** déclenche une découverte immédiate. Un bail partagé en base empêche une découverte manuelle et automatique simultanée du même serveur ; il expire après deux minutes si un worker s'arrête. L'ouverture d'une page ne lance plus de découverte réseau.

Les outils existants gardent leur identifiant, leur activation et leur règle d'approbation. Les outils retirés par le serveur sont désactivés ; une panne ne détruit pas le catalogue. Un outil retiré puis réapparu reste désactivé jusqu'à réactivation explicite.

La synchronisation automatique utilise le compte du créateur de la définition MCP. Pour un serveur OAuth, ce compte doit donc être connecté. Les appels d'outils utilisent toujours le compte de l'utilisateur à l'origine de l'appel.

## Réseau et exploitation

HTTPS est requis pour les destinations publiques. Les adresses privées, locales et réservées sont bloquées à la résolution DNS utilisée par la connexion ; les redirections HTTP sont refusées. Pour un serveur interne explicitement approuvé, configurer `MCP_TRUSTED_ORIGINS` sur l'application **et** le worker, avec les origines exactes séparées par des virgules (schéma, hôte et port). Cette configuration autorise aussi HTTP pour ces seules origines.

La migration `0072_mcp_oauth.sql` ajoute les configurations, identifiants personnels chiffrés, tentatives de connexion et échéances persistantes. Le worker doit fonctionner pour la synchronisation périodique.

## Validation

Les tests locaux utilisent un serveur HTTP OAuth réel de test : découverte, PKCE, SSE authentifié, repli HTTP vers SSE, jetons rotatifs, révocation, callbacks invalides et isolation des utilisateurs. Un parcours navigateur vérifie l'autorisation, la resynchronisation manuelle, le passage du worker et la déconnexion mobile. Un fournisseur tiers réel exige sa propre configuration client et son consentement utilisateur.

Référence : [autorisation MCP, spécification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).
