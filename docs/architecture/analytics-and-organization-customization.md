# Organisation, consommation et activité

## Parcours et droits

| Personne | Périmètres disponibles | Actions |
| --- | --- | --- |
| Admin application | Instance déployée entière, organisations, projets | Analyse, regroupements, export |
| Admin organisation | Son organisation et ses projets | Personnalisation, analyse, export selon `audit.export` |
| Délégation projet | Projets avec `usage.view` / `audit.view` | Analyse dans le périmètre accordé |
| Membre / lecteur standard | Aucun écran d’analyse administrative | Pas de consommation ou d’activité des collègues |

Les API `/api/analytics/scopes`, `/usage`, `/audit` recalculent les autorisations. Un identifiant d’organisation fourni dans un filtre n’élargit jamais le périmètre autorisé. Les clés API de projet ne peuvent pas accéder aux rapports transverses. L’impersonation utilise les droits de la personne impersonnée. La vue application désigne l’instance Maiah déployée et sa base de données, pas plusieurs installations externes.

## Interface

Le périmètre et la période UTC restent visibles. Trente jours par défaut ; les filtres détaillés sont repliables et s’appliquent explicitement. Personnes, équipes, projets, organisations, providers, modèles et assistants acceptent plusieurs sélections. Les filtres entre dimensions se combinent par intersection, les choix d’une dimension par union. Les identifiants courts distinguent les homonymes ; la recherche de personnes inclut leur email. Les actions, opérations et statuts sont proposés en autocomplétion depuis le périmètre autorisé.

Les regroupements provider, modèle, organisation, projet, personne, assistant et opération proposent une comparaison ou une addition des séries sélectionnées. Jour, semaine (lundi) et mois utilisent UTC. Les intervalles sans usage sont affichés à zéro et l’axe respecte le temps écoulé. Les huit premières séries sont proposées initialement ; la sélection peut inclure toutes les séries. Le tableau du graphique fournit les valeurs exactes, accessibles au clavier. Les tableaux de détail restent disponibles avec pagination.

Les données affichées sont liées à la requête appliquée. Changer de périmètre masque les anciens résultats ; une réponse réseau tardive est abandonnée. Un échec montre une erreur et un bouton de reprise, jamais un faux total zéro. Les totaux portent sur tous les événements filtrés, pas uniquement la page affichée.

Les exports CSV reprennent tous les événements filtrés et exigent `audit.export` pour l’historique. Maximum explicite de 10 000 événements : au-delà, l’export est refusé et demande d’affiner les filtres, sans troncature silencieuse. Les cellules sont protégées contre les formules de tableur.

## Interprétation des mesures

- Les exécutions d’agents (chat, API, planification, délégation) enregistrent le prix de leur propre modèle dans la transaction terminale, avec les tokens locaux du run. Le budget total de l’arbre ne sert jamais au calcul de ce prix. Les anciens événements non tarifés ne sont pas recalculés avec des tarifs actuels.
- Le coût provient du coût/devise enregistrés dans les métadonnées, ou du coût USD historique. Aucun taux de change implicite n’est appliqué. Chaque devise conserve son total et sa courbe.
- Un prix absent/invalide ou sans devise est comptabilisé comme non tarifé, jamais comme une consommation gratuite. Les montants n’établissent pas une facture fournisseur ; ils reflètent les tarifs connus lors de l’exécution.
- Les événements peuvent être des appels modèle, des images ou des opérations agent : ils ne désignent pas tous une conversation unique. L’opération permet de les isoler.
- Les équipes reflètent les appartenances actuelles, pas une reconstitution historique. Un `EXISTS` évite de multiplier les événements d’une personne appartenant à plusieurs équipes choisies.
- La consommation est attribuée au projet de facturation qui utilise la ressource, y compris pour un assistant partagé par une autre organisation. Cet identifiant est conservé dans l’événement pour survivre à la suppression de la conversation. Elle suit ce projet dans son organisation actuelle après transfert. L’historique conserve son organisation explicite ; les anciens événements sans organisation sont rattachés au projet. Les événements sans projet sont accessibles à l’admin application et, s’ils portent un ID organisation, à cette organisation pour l’audit.
- Le quota mensuel du projet reste affiché au niveau projet, indépendamment des filtres du rapport.

## Personnalisation

Nom d’organisation, logo, palettes clair/sombre, textes d’accueil, génération des titres/suggestions et navigation : Personnalisation de l’organisation. `organization.update` autorise les admins orga sans leur accorder les réglages globaux d’inscription, de santé ou de tarification des providers.

Les réglages sont stockés dans `organizations` et dans des clés `app_settings` suffixées par l’ID organisation. Les changements s’appliquent aux projets frères ; les modèles d’automatisation doivent appartenir à l’organisation ou être explicitement partagés. Un thème reste résolu même si l’organisation n’a pas encore de projet. Les sélecteurs distinguent les organisations homonymes sans les fusionner.

## Vérification et déploiement

Tests PostgreSQL : agrégats sur plusieurs pages, deux organisations, projets frères, devises, prix invalides/scientifiques, équipes multiples, regroupements, bornes temporelles, autorisations. Tests navigateur : admin application et admin orga, export, comparaison/addition, pagination, mobile, erreur/reprise, personnalisation et refus inter-organisation. Les tests existants maintiennent le refus pour lecteurs/éditeurs.

Migration 0064 : index temporels de consommation et d’audit. Migration 0065 : projet de facturation persistant et reprise des conversations existantes ; les événements sans contexte de facturation conservent leur projet historique. Aucun rôle ni contenu de conversation n’est modifié. Le démarrage de l’application applique les migrations ; aucune configuration manuelle nouvelle n’est nécessaire.
