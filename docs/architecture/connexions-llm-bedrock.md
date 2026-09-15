# Connexions LLM, modèles et diagnostic

## Amazon Bedrock

Dans **Connexions IA**, choisir Amazon Bedrock puis la région AWS. L’adresse du service est calculée automatiquement. Deux authentifications sont proposées : clé API Bedrock ou identifiants IAM (clé d’accès, secret, jeton de session facultatif). Les secrets sont chiffrés au repos et ne sont jamais renvoyés par le catalogue des connexions. Les identifiants de l’environnement serveur ne servent pas de repli pour une connexion d’organisation.

Le fournisseur officiel `@ai-sdk/amazon-bedrock` gère les appels Converse, les outils, les embeddings et les images Nova Canvas. La découverte utilise le catalogue régional AWS et les profils d’inférence actifs. L’ajout manuel reste disponible. Les permissions de catalogue `bedrock:ListFoundationModels` et `bedrock:ListInferenceProfiles` doivent être accordées, ainsi que les permissions d’inférence adaptées aux modèles utilisés. Une clé Bedrock nécessite également l’autorisation d’utiliser des jetons bearer.

Une connexion enregistrée lance la découverte ; chaque utilisateur choisit ensuite les modèles à enregistrer. Une erreur de découverte ne supprime pas la connexion. Les modèles et profils proposés par AWS peuvent nécessiter des droits ou une activation supplémentaires : la découverte ne constitue pas un appel d’inférence réussi.

Références : [AI SDK Amazon Bedrock](https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock), [clés API AWS](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html).

## Aider au choix des modèles

La configuration d’un modèle permet de modifier sa description et ses tags. Ceux-ci apparaissent avec le fournisseur dans le choix du modèle d’un assistant. Les connexions disposent également d’une description et de tags, modifiables dans leur configuration.

Les tarifs sont exprimés par million de tokens, dans la devise affichée. L’énergie est exprimée en kWh et les émissions en gCO₂e. Un champ vide signifie inconnu ; zéro est une valeur explicite. Les métadonnées tarifaires et environnementales proposées par les catalogues compatibles sont importées par la synchronisation existante. AWS ne fournit pas ces indicateurs dans les opérations de catalogue utilisées : aucune valeur n’est inventée.

Modifier un tarif ou un indicateur active la conservation des valeurs manuelles. Décocher cette option réactive leur mise à jour lors des prochaines synchronisations. Modifier uniquement le nom, la description ou les tags ne bloque pas l’import automatique.

Vercel AI Gateway importe également ses descriptions, tags et tarifs en USD ; ses prix par token sont convertis en prix par million de tokens. Les prix image variables ne sont pas interprétés comme des tarifs de tokens.

Les paramètres d’image sont regroupés dans une section dépliable. Nova Canvas utilise le SDK AWS natif ; Vercel AI Gateway utilise son protocole natif de génération d’images ; les connexions OpenAI compatibles gardent leur endpoint de génération d’images. Le modèle doit réellement prendre en charge ce mode ; cocher une capacité ne crée pas cette capacité côté fournisseur.

## Rapports d’erreur

Les notifications d’erreur et les alertes intégrées proposent un bouton de détails. Le rapport contient le message, l’heure, le chemin de la page et, lorsque disponible, la référence de requête HTTP permettant de retrouver les logs serveur. Le rapport peut être copié ; si le presse-papiers est indisponible, son texte reste sélectionnable.

Les paramètres d’URL, identifiants dans les URL et motifs usuels de secrets sont filtrés. Les rapports ne collectent pas les corps de requêtes, cookies ou piles serveur. Les erreurs serveur inattendues conservent un message générique ; les détails internes restent dans les logs et se retrouvent par la référence de requête.
