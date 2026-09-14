# Workflows, outils et ServiceNow

## Assistant de création

Dans les réglages de l’organisation, le choix « Assistant de création de workflows » s’applique aux projets de cette organisation. Il peut être changé ou remis en sélection automatique. Les anciens choix par projet sont migrés vers l’organisation (le choix le plus récent est retenu).

Le mode de création utilise les instructions de l’assistant sélectionné, ses outils configurés, ses connaissances RAG et ses compétences, auxquels s’ajoutent les outils d’édition du workflow ouvert. Les règles d’accès et d’approbation restent applicables. Les outils nécessitant une approbation conversationnelle ne s’exécutent pas silencieusement dans l’éditeur ou en arrière-plan.

Tous les assistants disposent des outils `workflow_catalog`, `workflow_list`, `workflow_get`, `workflow_create`, `workflow_update`, `workflow_publish`, `workflow_run` et `workflow_run_status`, sans rattachement manuel par assistant. Les permissions de l’utilisateur et les politiques d’outils de l’organisation restent appliquées. `workflow_catalog` expose les types d’étapes, les assistants accessibles et les outils disponibles avec leurs schémas.

## Appels directs et variables

L’étape **Appeler un outil** appelle un outil intégré, MCP ou personnalisé, sans modèle. Le choix de l’outil génère les champs depuis son JSON Schema. Chaque champ peut contenir une valeur fixe ou une variable ; les objets complexes restent éditables en JSON. Le sélecteur suggère les champs de départ et les sorties des étapes précédentes connues. Un chemin peut être complété manuellement pour un résultat dont le schéma est dynamique.

Exemple de paramètres d’une étape `tool.call` :

```json
{
  "source": "mcp",
  "toolId": "<UUID découvert dans le catalogue>",
  "connectionId": "<UUID d’une connexion accessible, optionnel>",
  "arguments": { "quantity": "{{quantity}}", "variables": "{{formVariables}}" },
  "outputPath": "order"
}
```

Une variable qui occupe toute la valeur conserve son type JSON (nombre, objet, liste, booléen). Une variable insérée dans du texte est convertie en texte. Les chemins ne peuvent pas accéder aux prototypes JavaScript. Le résultat est ajouté au champ choisi (`toolResult` par défaut), en conservant l’entrée de l’étape.

Les appels MCP utilisent les connexions de l’utilisateur initiateur. Une connexion explicite est revérifiée au moment de l’appel : même projet, bon connecteur, active et accessible. Une sélection invalide échoue sans basculer silencieusement vers une autre connexion. Les identifiants restent chiffrés et ne sont pas stockés dans les paramètres du workflow.

Les appels directs désactivent les retries automatiques, et une nouvelle livraison du même run ne rejoue pas ces étapes. Après une interruption avec un résultat externe incertain, vérifier l’état distant avant de créer une nouvelle exécution. Une erreur MCP ou un refus de permission fait échouer l’étape ; il ne devient pas un résultat réussi.

## Déclenchement API et automatisations

L’API existante accepte `POST /api/workspace/workflows/{workflowId}/runs` avec `workspaceId`, `input` et `idempotencyKey`. Elle renvoie un run en file d’attente ; consulter `GET /api/workspace/workflow-runs/{runId}?workspaceId=...` pour son résultat. Les clés API doivent disposer des permissions correspondantes (`workflows.execute`, `workflows.view`). Le déclenchement utilise la version publiée.

Dans **Automatisations**, choisir la cible **Workflow**, un workflow publié, les données JSON, puis l’horaire quotidien ou l’intervalle. Aucun assistant n’est requis. Chaque occurrence conserve l’identité du propriétaire, vérifie son accès au workflow et utilise une clé d’idempotence propre à cette occurrence. Le statut affiché suit le run du workflow ; une mise en file d’attente n’est pas présentée comme une réussite.

Les automatisations existantes avec assistant continuent à fonctionner. Les automatisations clonées sont désactivées et leurs cibles sont remappées vers le projet cloné.

## ServiceNow

La connexion propose seulement les champs du mode choisi : identifiant/mot de passe, OAuth 2.0 ou clé API. Le package d’outils est placé dans les options avancées. Un changement de mode nécessite les nouveaux identifiants ; la rotation exige tous les champs actifs et préserve les espaces d’un mot de passe.

Le gateway conserve les outils upstream (dont les incidents) et ajoute :

- Catalogues : `search_catalogs`, `search_catalog_items`, `search_catalog_forms`, `get_catalog_form`, `prepare_catalog_form`, `order_catalog_item`, `submit_catalog_form`.
- Panier : `add_catalog_item_to_cart`, `get_catalog_cart`, `checkout_catalog_cart`.
- Formulaires de tables : `search_record_forms`, `get_record_form`, `prepare_record_form`, `submit_record_form`, `search_form_records`.
- Comptes : `create_user`, `update_user`, `get_user`, `list_users` (packages `full` et `service_desk`). `update_user` permet notamment la désactivation (`active: false`). Les champs personnalisés de `sys_user` passent par les outils de formulaires génériques ; les ACL ServiceNow restent applicables.
- Requests : `search_service_requests`, `get_service_request` (REQ et RITM associés).

Parcours recommandé : chercher les articles, lire le formulaire, résoudre les références et choix, préparer les valeurs, puis commander. Pour un incident ou une table personnalisée : chercher la table, lire ses champs hérités et surcharges, préparer les valeurs, puis créer ou modifier l’enregistrement. Une Request de catalogue est créée via la commande ou le checkout, afin de conserver le processus de fulfillment.

Les vérifications locales sont statiques : champs obligatoires, choix déclarés, champs inconnus ou en lecture seule. Les politiques serveur ServiceNow restent autoritaires. Les scripts de navigateur, UI Actions, règles conditionnelles JavaScript et Order Guides ne sont pas émulés. L’accès aux métadonnées dépend des rôles ServiceNow. Il ne faut donc pas présenter ce support comme une exécution universelle de toute interface ServiceNow.

Les packages `full`, `service_desk` et `catalog_builder` incluent les nouveaux outils. Après déploiement du gateway, relancer la découverte des outils MCP dans Maiah. Les tests exécutent le vrai package upstream épinglé et remplacent uniquement les réponses HTTP : ils ne passent aucune commande sur une instance ServiceNow réelle.

## Inspection

La page des outils affiche leur description complète, leurs schémas déclarés et la règle d’approbation. Les entrées et sorties d’appels, dans les conversations et dans les étapes de workflow, s’ouvrent en plein écran avec coloration JSON et copie. La fenêtre conserve les protections d’affichage existantes ; elle ne donne pas accès aux secrets de connexion.
