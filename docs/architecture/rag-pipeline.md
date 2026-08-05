# Pipeline RAG et configuration des Data Sources

## Principes

Le parcours nominal reste volontairement court : nommer une Data Source, la
créer, puis déposer des documents. Tous les réglages techniques héritent de la
configuration administrateur. Le panneau avancé copie cette configuration et
ne crée une surcharge que si l'utilisateur choisit explicitement de
personnaliser la Data Source.

La hiérarchie de résolution est :

1. valeurs plateforme administrateur ;
2. surcharge persistée sur la Data Source ;
3. paramètres bornés de l'appel outil, uniquement pour le nombre de résultats
   demandé par l'agent.

Les réglages de chunking, candidats, résultats, score minimum et activation du
reranking relèvent de `knowledgeBases.manage`. Le changement de fournisseur,
modèle ou dimensions exige en plus `models.manage`. Cette séparation est
appliquée côté serveur ; l'interface seule n'est pas une frontière de sécurité.

## Flux cible

```mermaid
flowchart TD
  U["Utilisateur"] --> DS["Créer une Data Source"]
  DS --> CFG{"Personnaliser ?"}
  CFG -- "Non" --> DEF["Hériter des valeurs administrateur"]
  CFG -- "Oui" --> ADV["Chunking · retrieval · modèles si autorisé"]
  DEF --> UP["Upload multiple · dossier · ZIP"]
  ADV --> UP
  UP --> RAW["Stockage source durable"]
  RAW --> Q["Job persistant par document"]
  Q --> ANY["AnyDoc · texte, structure et tableaux"]
  ANY --> VIS{"Régions visuelles utiles ?"}
  VIS -- "Non ou OCR désactivé" --> CH["Chunking versionné"]
  VIS -- "Oui" --> CROP["Pages / assets ciblés uniquement"]
  CROP --> OCR["OCR / VLM configurable · coordonnées 0..1000"]
  OCR --> REBUILD["Fusion Markdown + provenance visuelle"]
  REBUILD --> CH
  CH --> EMB["Embeddings configurables"]
  EMB --> IDX["Index vectoriel via adaptateur"]

  A["Agent"] --> CAT["Catalogue nom + description des Data Sources liées"]
  CAT --> SEL["L'agent choisit une ou plusieurs sources"]
  SEL --> SEARCH["search_knowledge"]
  SEARCH --> QE["Embedding de la requête"]
  QE --> IDX
  IDX --> RR["Reranking optionnel"]
  RR --> HIT["IDs document + chunk + score"]
  HIT --> READ["read_knowledge_context précédent / suivant"]
  READ --> A
```

Le stockage source et l'index vectoriel sont deux responsabilités distinctes.
Les PDF, DOCX, CSV et archives restent dans le stockage objet pour permettre une
réextraction. PGVector est l'adaptateur initial ; Qdrant ou Chroma pourront être
ajoutés derrière le même port sans changer le contrat des outils agent.

## Extraction documentaire partagée

L'extraction n'appartient pas au seul module RAG. Le service partagé est aussi
utilisé par les pièces jointes documentaires du chat et constitue le point
d'entrée pour les futurs imports de la plateforme.

1. AnyDoc produit d'abord le Markdown déterministe pour les formats Office,
   OpenDocument, PDF, CSV, RTF et EPUB. Sa structure, en particulier ses
   tableaux et cellules fusionnées, reste la source de vérité.
2. Si l'OCR est désactivé, le traitement s'arrête là : aucun modèle visuel
   n'est appelé.
3. S'il est activé, les PDF sont filtrés par densité de texte et présence
   d'images. Seules les pages candidates sont rendues. Pour les documents
   Office, seuls les assets images exposés par AnyDoc sont envoyés au VLM.
4. Le VLM renvoie des régions typées avec leur texte, leur description et une
   boîte normalisée sur un plan `0..1000`. Pour un PDF, la provenance conserve
   aussi le numéro de page ; pour un asset Office, les coordonnées restent
   relatives à l'image et la partie d'origine AnyDoc est conservée.

L'OCR ne doit donc jamais reconstruire un tableau lisible qu'AnyDoc a déjà
extrait. Il sert uniquement au texte pixelisé et à la compréhension des
diagrammes, schémas, graphiques et images utiles.

## Invariants d'exécution

- Chaque document possède un état et un pourcentage propres ; un lot n'efface
  jamais la progression individuelle.
- L'OCR est désactivé par défaut. L'administrateur peut l'activer dans les
  valeurs plateforme ; une Data Source peut reprendre ce défaut ou le
  surcharger. Le choix du modèle OCR/VLM reste soumis à `models.manage`.
- PostgreSQL reste la source de vérité des jobs. BullMQ accélère le traitement,
  et le worker réconcilie les lignes `processing` après une panne ou un restart.
- Une Data Source liée ne déclenche aucune recherche automatique. Le modèle
  choisit explicitement une ou plusieurs sources à partir de leur nom et de
  leur description.
- `search_knowledge` renvoie des références bornées. Le contenu adjacent est lu
  à la demande avec `read_knowledge_context`.
- Les citations conservent `knowledgeBaseId`, `documentId`, `chunkId` et
  `chunkIndex` afin d'ouvrir le document complet et de mettre en évidence le
  passage cité.
- Les changements de modèle doivent réindexer les chunks existants. Les futurs
  changements de stratégie de chunking devront créer une nouvelle révision
  d'index à partir de la source durable, puis basculer atomiquement une fois
  cette révision prête.

## Évolutions prévues

Le prochain palier doit introduire une révision d'index immuable par Data
Source : configuration résolue, version de l'extracteur, modèle et dimensions,
statut de build, puis pointeur vers la révision active. Cela permet une
réindexation sans rendre la Data Source indisponible et évite de mélanger des
vecteurs produits avec des modèles ou dimensions incompatibles.
