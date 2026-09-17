# Accès et tests des workflows

Les workflows utilisent le sélecteur de portée et le partage nominatif communs aux ressources. Le rôle `workspace.workflow_user` accorde uniquement la consultation et l’exécution. Les éditeurs du projet ne reçoivent pas automatiquement les droits sur les workflows privés d’un autre utilisateur. Le créateur, les administrateurs autorisés et les bénéficiaires d’un droit explicite d’édition peuvent modifier la ressource.

La migration 0074 ajoute `visibility` et `is_global`, crée le rôle de partage et conserve l’accès projet des workflows existants. Les nouveaux workflows sont privés par défaut. La portée organisation permet la découverte et l’usage depuis les autres projets de la même organisation, sans accorder l’édition. Les exécutions restent rattachées au projet qui les lance. Leur détail et leur arrêt vérifient les permissions sur le workflow, même lorsqu’un identifiant d’exécution est connu.

Dans l’éditeur, Tester enregistre puis exécute le brouillon. Un utilisateur disposant uniquement du droit d’usage peut exécuter la version publiée. Le lancement d’un brouillon exige aussi le droit d’édition côté API. Les actions du formulaire empêchent les soumissions simultanées.

Le dernier détail sélectionné est conservé quand son panneau se ferme ; le rafraîchissement continue tant que le run est actif. Les états du canevas sont dérivés de ce détail et ne sont pas enregistrés dans la définition. Les erreurs de suivi conservent la dernière donnée et proposent une reprise. L’arrêt marque atomiquement une exécution active comme annulée ; le worker interrompt le moteur et ne peut écraser cet état terminal.

La génération supprime les textes intermédiaires au passage à l’action suivante et conserve la réponse finale. Une sauvegarde réussie reçoit une confirmation explicite et persistée. Les activités et la checklist temporaire disparaissent à la fin du flux ; les demandes d’informations ou d’approbation restent utilisables. Une coupure avant l’événement `done` est traitée comme un échec.

## Optional local code assistance

The code editor has an opt-in, remembered local-assistance toggle. Monaco's
JavaScript/TypeScript service and the Python Pyright service run in browser
workers inside a disposable iframe. No code is executed for completion and no
LSP API or server process is added. Static assets are built by `workflow:assets`
(in predev/prebuild), served from the application origin, and loaded only after
activation. Python's larger worker is only fetched for Python. Disabling the
feature, closing the editor, or navigating away terminates workers; startup
failure falls back to the textarea without discarding code.

The context is recomputed from the current unsaved graph, including all nodes
and edges. The editor shows each node's inferred input/output and other code
nodes' source. Incoming types follow supported transformations, rename, pick,
remove, HTTP and agent results. Multiple incoming branches, cycles and arbitrary
code/tool/nested workflow output remain unknown. Types based on default input
are estimates, not runtime validation. No upstream secret values are copied into
the generated declarations. All graph inspection stays in the browser.

The `workflow-input` completion inserts a typed stdin reader for JavaScript or
Python. This reflects the runtime contract: stdin contains only the predecessor
output, not global access to every node. The JSON reader is suitable for JSON;
plain string output must be read as text. JavaScript uses a JSDoc-only import of
`workflow-context`; Python imports its virtual stub only under `TYPE_CHECKING`.
Neither virtual module is imported at runtime. Renaming/removing upstream fields
updates the declarations; invalid field access is diagnosed when the input is
typed. Arbitrary scripts are not executed to infer their output.

Library inventories derive from the sandbox manifests. Node standard-library
declarations and locally available package declarations are embedded at build
time; Python includes stdlib/typeshed and matching package stubs. Libraries
without detailed declarations are marked dynamic (the UI lists detailed type
coverage), so their full APIs cannot be checked. These are build-time type
snapshots, not a live introspection of a running sandbox or its filesystem.
Python stub archives avoid a per-file resizable-buffer reservation in the
browser filesystem. Heavy services are kept outside the Next application bundle
and their npm dependencies are needed only during build.
