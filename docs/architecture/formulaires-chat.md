# Formulaires de questions dans le chat

L’outil intégré **Question form** (`ask_question_form`) se configure dans les outils de l’assistant. Les politiques d’accès et d’approbation habituelles restent applicables.

L’assistant fournit un titre, une description facultative et 1 à 12 questions. Types disponibles : texte court, texte long, choix simple, choix multiple, nombre et date. Chaque question possède un identifiant unique, un libellé, une aide facultative et un indicateur obligatoire. Les listes sont limitées à 20 options. Aucun HTML ni script fourni par le modèle n’est exécuté.

Un résultat valide interrompt la boucle du modèle : le formulaire est affiché immédiatement dans la conversation. L’utilisateur peut envoyer le formulaire ou répondre librement dans le chat. Les réponses du formulaire sont envoyées comme un message utilisateur normal (libellés lisibles, sans identifiants techniques) dans la même conversation ; le modèle reprend avec l’historique existant. Le brouillon du champ de conversation et les pièces jointes ne sont pas consommés par cet envoi.

L’affichage du formulaire est persisté avec le résultat de l’outil ; les réponses envoyées sont persistées dans l’historique du chat. Les valeurs non envoyées restent locales au composant et disparaissent lors d’un rechargement. Un formulaire peut être renseigné à nouveau après rechargement ; il ne constitue pas une approbation à usage unique. En cas d’échec d’envoi, les champs restent remplis et l’erreur peut être copiée via les détails.

L’outil refuse les appels sans contexte de conversation interactive (exécutions planifiées, sous-agents et API non interactives). L’envoi est désactivé pour une conversation en lecture seule, pendant une génération et pendant la prise en charge Genesys. Les formulaires ne doivent pas demander de mots de passe, clés API ou autres secrets.
