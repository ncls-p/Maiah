# Accès et tests des workflows

Les workflows utilisent le sélecteur de portée et le partage nominatif communs aux ressources. Le rôle `workspace.workflow_user` accorde uniquement la consultation et l’exécution. Les éditeurs du projet ne reçoivent pas automatiquement les droits sur les workflows privés d’un autre utilisateur. Le créateur, les administrateurs autorisés et les bénéficiaires d’un droit explicite d’édition peuvent modifier la ressource.

La migration 0074 ajoute `visibility` et `is_global`, crée le rôle de partage et conserve l’accès projet des workflows existants. Les nouveaux workflows sont privés par défaut. La portée organisation permet la découverte et l’usage depuis les autres projets de la même organisation, sans accorder l’édition. Les exécutions restent rattachées au projet qui les lance. Leur détail et leur arrêt vérifient les permissions sur le workflow, même lorsqu’un identifiant d’exécution est connu.

Dans l’éditeur, Tester enregistre puis exécute le brouillon. Un utilisateur disposant uniquement du droit d’usage peut exécuter la version publiée. Le lancement d’un brouillon exige aussi le droit d’édition côté API. Les actions du formulaire empêchent les soumissions simultanées.

Le dernier détail sélectionné est conservé quand son panneau se ferme ; le rafraîchissement continue tant que le run est actif. Les états du canevas sont dérivés de ce détail et ne sont pas enregistrés dans la définition. Les erreurs de suivi conservent la dernière donnée et proposent une reprise. L’arrêt marque atomiquement une exécution active comme annulée ; le worker interrompt le moteur et ne peut écraser cet état terminal.

La génération supprime les textes intermédiaires au passage à l’action suivante et conserve la réponse finale. Une sauvegarde réussie reçoit une confirmation explicite et persistée. Les activités et la checklist temporaire disparaissent à la fin du flux ; les demandes d’informations ou d’approbation restent utilisables. Une coupure avant l’événement `done` est traitée comme un échec.
