const tabBar = document.querySelector(".t-tabs");
const pill = tabBar.querySelector(".t-tabs-pill");
const tabs = [...tabBar.querySelectorAll(".t-tab")];
const themeToggle = document.querySelector(".theme-toggle");
const toolsPanel = document.querySelector(".tools-panel");
const toolsBackdrop = document.querySelector(".tools-backdrop");
const toolsCloseButtons = [
  document.querySelector(".tools-close"),
  document.querySelector(".tools-done"),
];
const historyPanel = document.querySelector(".history-panel");
const artifactDrawer = document.querySelector(".artifact-drawer");
const orbitScreen = document.querySelector(".concept-orbit");
let orbitGenerationTimer;
const closeMs =
  parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--dropdown-close-dur",
    ),
  ) || 150;

function movePill(tab, animate) {
  if (!animate) {
    const previousTransition = pill.style.transition;
    pill.style.transition = "none";
    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
    pill.style.width = `${tab.offsetWidth}px`;
    void pill.offsetWidth;
    pill.style.transition = previousTransition;
    return;
  }

  pill.style.transform = `translateX(${tab.offsetLeft}px)`;
  pill.style.width = `${tab.offsetWidth}px`;
}

function replayReveal(screen) {
  const block = screen.querySelector(".t-stagger");
  if (!block) return;
  block.classList.remove("is-hiding", "is-shown");
  void block.offsetHeight;
  block.classList.add("is-shown");
}

function closeDropdown(menu, trigger) {
  if (!menu?.classList.contains("is-open")) return;
  menu.classList.remove("is-open");
  menu.classList.add("is-closing");
  trigger?.setAttribute("aria-expanded", "false");
  window.setTimeout(() => menu.classList.remove("is-closing"), closeMs);
}

function closeAllDropdowns(except) {
  document.querySelectorAll(".agent-menu.is-open").forEach((menu) => {
    if (menu === except) return;
    closeDropdown(menu, menu.parentElement.querySelector(".agent-trigger"));
  });
}

function activateConcept(tab) {
  const name = tab.dataset.concept;
  const nextScreen = document.querySelector(`[data-screen="${name}"]`);
  const currentScreen = document.querySelector(".concept-screen.is-active");
  if (!nextScreen || nextScreen === currentScreen) return;

  tabs.forEach((item) =>
    item.setAttribute("aria-selected", item === tab ? "true" : "false"),
  );
  movePill(tab, true);
  closeAllDropdowns();

  currentScreen.classList.remove("is-active");
  window.setTimeout(() => {
    currentScreen.hidden = true;
    nextScreen.hidden = false;
    requestAnimationFrame(() => {
      nextScreen.classList.add("is-active");
      replayReveal(nextScreen);
    });
  }, 180);
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => activateConcept(tab));
});

document.querySelectorAll(".agent-trigger").forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const screen = trigger.closest(".concept-screen");
    const menu = screen.querySelector(".agent-menu");
    const shouldOpen = !menu.classList.contains("is-open");
    closeAllDropdowns(menu);

    if (shouldOpen) {
      menu.classList.remove("is-closing");
      menu.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
    } else {
      closeDropdown(menu, trigger);
    }
  });
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".agent-menu")) return;
  closeAllDropdowns();
});

const toast = document.querySelector(".prototype-toast");
let toastTimer;

function showToast(title = "Message prêt", detail = "Simulation effectuée") {
  window.clearTimeout(toastTimer);
  toast.querySelector("strong").textContent = title;
  toast.querySelector("small").textContent = detail;
  toast.classList.add("is-shown");
  toastTimer = window.setTimeout(
    () => toast.classList.remove("is-shown"),
    2600,
  );
}

function setOrbitPage(page) {
  const validPages = ["chat", "agents", "tools", "knowledge", "planning"];
  const nextPage = validPages.includes(page) ? page : "chat";
  orbitScreen.dataset.orbitPage = nextPage;
  orbitScreen
    .querySelectorAll(
      ".orbit-app-navigation [data-orbit-page], .orbit-header-nav [data-orbit-page]",
    )
    .forEach((button) =>
      button.classList.toggle(
        "is-active",
        button.dataset.orbitPage === nextPage,
      ),
    );
  const pageNames = {
    chat: "Orbit",
    agents: "Assistants",
    tools: "Outils",
    knowledge: "Connaissances",
    planning: "Planification",
  };
  orbitScreen.querySelector(".orbit-wordmark span").textContent =
    pageNames[nextPage];
  orbitScreen.querySelector(".orbit-product-pages")?.scrollTo({ top: 0 });
}

orbitScreen.querySelectorAll("[data-orbit-page]").forEach((button) => {
  button.addEventListener("click", () =>
    setOrbitPage(button.dataset.orbitPage),
  );
});

orbitScreen
  .querySelectorAll("[data-filter-group='agent-kind'] [data-filter]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.dataset.filter;
      button.parentElement
        .querySelectorAll("button")
        .forEach((item) => item.classList.toggle("is-active", item === button));
      orbitScreen.querySelectorAll(".product-agent-card").forEach((card) => {
        card.hidden = kind !== "all" && card.dataset.kind !== kind;
      });
    });
  });

orbitScreen
  .querySelector("[data-product-search='agent']")
  .addEventListener("input", (event) => {
    const query = event.target.value.trim().toLocaleLowerCase("fr");
    orbitScreen.querySelectorAll(".product-agent-card").forEach((card) => {
      card.hidden = !card.textContent.toLocaleLowerCase("fr").includes(query);
    });
  });

orbitScreen.querySelectorAll("[data-product-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.productTab;
    button.parentElement
      .querySelectorAll("button")
      .forEach((item) => item.classList.toggle("is-active", item === button));
    orbitScreen.querySelectorAll("[data-product-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.productPanel !== tab;
    });
  });
});

orbitScreen
  .querySelectorAll(".knowledge-layout > aside > button")
  .forEach((button) => {
    button.addEventListener("click", () => {
      button.parentElement
        .querySelectorAll(":scope > button")
        .forEach((item) => item.classList.toggle("is-active", item === button));
      showToast(
        "Base sélectionnée",
        `${button.querySelector("strong").textContent} est maintenant ouverte`,
      );
    });
  });

orbitScreen
  .querySelector(".orbit-product-pages")
  .addEventListener("click", (event) => {
    const action = event.target.closest("[data-demo-action]");
    if (!action) return;
    if (action.dataset.demoAction === "chat-agent") {
      setOrbitPage("chat");
      showToast("Assistant sélectionné", "La conversation est prête");
      return;
    }
    if (
      action.dataset.demoAction === "approve" ||
      action.dataset.demoAction === "reject"
    ) {
      action.closest("article").remove();
      showToast(
        action.dataset.demoAction === "approve"
          ? "Action autorisée"
          : "Action refusée",
        "La demande a été traitée en simulation",
      );
      return;
    }
    const labels = {
      "new-agent": ["Création ouverte", "Nouvel assistant"],
      "configure-agent": ["Configuration ouverte", "Maiah Orchestrateur"],
      "connect-tool": ["Connexion ouverte", "Choisissez une intégration"],
      "configure-tool": ["Configuration ouverte", "Paramètres du connecteur"],
      "new-base": ["Création ouverte", "Nouvelle base de connaissances"],
      "attach-agent": ["Assistants disponibles", "Sélection simulée"],
      "upload-doc": ["Sélecteur de fichiers ouvert", "Import simulé"],
      "new-task": ["Planification ouverte", "Nouvelle tâche récurrente"],
    };
    const [title, detail] = labels[action.dataset.demoAction] || [
      "Action simulée",
      "Aucune modification réelle",
    ];
    showToast(title, detail);
  });

function appendMessage(thread, role, text, delay = 0) {
  const message = document.createElement("div");
  message.className = `message ${role === "user" ? "is-user" : "is-assistant"}`;
  message.style.animationDelay = `${delay}ms`;

  const avatar = document.createElement("span");
  avatar.className = "message-avatar";
  avatar.textContent = role === "user" ? "NP" : "M";

  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = text;

  const meta = document.createElement("small");
  const selectedModel =
    thread.closest(".concept-screen").querySelector(".model-control select")
      ?.value || "Qwen 3.6 27B";
  meta.textContent =
    role === "user" ? "Vous · maintenant" : `Maiah · ${selectedModel}`;
  body.append(meta);
  const actions = document.createElement("div");
  actions.className = "message-actions";
  const actionDefinitions = [
    ["copy", "Copier", "i-copy"],
    [
      "edit",
      role === "user" ? "Modifier" : "Régénérer",
      role === "user" ? "i-edit" : "i-spark",
    ],
    ["delete", "Supprimer", "i-trash"],
  ];
  actionDefinitions.forEach(([action, label, icon]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.messageAction = action;
    button.setAttribute("aria-label", label);
    button.innerHTML = `<svg><use href="#${icon}"></use></svg>`;
    actions.append(button);
  });
  message.append(avatar, body, actions);
  thread.append(message);
  thread.scrollTop = thread.scrollHeight;
  return message;
}

function animateComposerMove(screen, composer, stateClass, addState) {
  const first = composer.getBoundingClientRect();
  screen.classList.toggle(stateClass, addState);
  const last = composer.getBoundingClientRect();
  const deltaX = first.left - last.left;
  const deltaY = first.top - last.top;

  if (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    (!deltaX && !deltaY)
  ) {
    return;
  }

  composer.animate(
    [
      {
        translate: `${deltaX}px ${deltaY}px`,
        scale: "1.015",
        boxShadow: "0 26px 70px rgba(15, 127, 148, .16)",
      },
      {
        translate: "0 0",
        scale: "1",
      },
    ],
    {
      duration: 760,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "both",
    },
  );
}

function startConversation(screen, composer, text) {
  const thread = screen.querySelector(".chat-thread");
  const isFirstMessage = !screen.classList.contains("has-chat");

  if (isFirstMessage) {
    animateComposerMove(screen, composer, "has-chat", true);
  }

  if (screen.classList.contains("concept-orbit")) {
    startOrbitGeneration(screen, composer, text);
    return;
  }

  appendMessage(thread, "user", text);
  window.setTimeout(
    () =>
      appendMessage(
        thread,
        "assistant",
        "C’est noté. Je rassemble le contexte et les outils utiles pour commencer.",
      ),
    420,
  );
}

function createToolRun(thread) {
  const card = document.createElement("div");
  card.className = "tool-run-card";
  card.innerHTML =
    '<span><svg><use href="#i-search"></use></svg></span><span><strong>Analyse du contexte</strong><small>Lecture des sources et des fichiers joints</small></span><i></i>';
  thread.append(card);
  thread.scrollTop = thread.scrollHeight;
  return card;
}

function finishOrbitGeneration(message) {
  window.clearTimeout(orbitGenerationTimer);
  orbitScreen.dataset.generating = "false";
  const sendButton = orbitScreen.querySelector(".send-button");
  sendButton.classList.remove("is-generating");
  sendButton.setAttribute("aria-label", "Envoyer");
  sendButton.innerHTML = '<svg><use href="#i-arrow"></use></svg>';
  if (message)
    appendMessage(
      orbitScreen.querySelector(".chat-thread"),
      "assistant",
      message,
    );
}

function addOrbitResult(thread) {
  appendMessage(
    thread,
    "assistant",
    "J’ai préparé une première proposition structurée. Elle conserve l’historique, les outils et les actions avancées sans surcharger l’espace principal.",
  );

  const citations = document.createElement("div");
  citations.className = "citation-row";
  citations.innerHTML =
    '<a href="#" aria-label="Source Architecture">01 · Architecture</a><a href="#" aria-label="Source Design system">02 · Design system</a>';
  thread.append(citations);

  const artifact = document.createElement("div");
  artifact.className = "artifact-callout";
  artifact.innerHTML =
    '<span><svg><use href="#i-code"></use></svg></span><div><strong>Interface générée</strong><small>HTML · CSS · JavaScript</small></div><button type="button" class="artifact-open">Ouvrir</button>';
  thread.append(artifact);
  thread.scrollTop = thread.scrollHeight;
  finishOrbitGeneration();
}

function requestOrbitApproval(thread, toolCard) {
  toolCard.querySelector("strong").textContent = "Contexte analysé";
  toolCard.querySelector("small").textContent =
    "4 sources pertinentes identifiées";
  toolCard.querySelector("i").remove();

  const approval = document.createElement("div");
  approval.className = "approval-card";
  approval.innerHTML =
    '<span>AUTORISATION REQUISE</span><strong>Créer un aperçu interactif</strong><p>Maiah souhaite générer un artefact HTML local à partir du brief.</p><div class="approval-actions"><button type="button" data-approval="reject">Refuser</button><button type="button" data-approval="approve">Autoriser</button></div>';
  thread.append(approval);
  thread.scrollTop = thread.scrollHeight;
}

function startOrbitGeneration(screen, composer, text) {
  const thread = screen.querySelector(".chat-thread");
  if (screen.dataset.generating === "true") {
    const queued = document.createElement("div");
    queued.className = "tool-run-card queued-message";
    queued.innerHTML =
      '<span><svg><use href="#i-clock"></use></svg></span><span><strong>Message en attente</strong><small></small></span>';
    queued.querySelector("small").textContent = text;
    thread.append(queued);
    showToast(
      "Message mis en attente",
      "Il sera envoyé après la réponse en cours",
    );
    return;
  }

  screen.dataset.generating = "true";
  appendMessage(thread, "user", text);
  const toolCard = createToolRun(thread);
  const sendButton = composer.querySelector(".send-button");
  sendButton.classList.add("is-generating");
  sendButton.setAttribute("aria-label", "Arrêter la génération");
  sendButton.innerHTML = '<svg><use href="#i-stop"></use></svg>';
  orbitGenerationTimer = window.setTimeout(
    () => requestOrbitApproval(thread, toolCard),
    700,
  );
}

function resetConversation(screen) {
  const composer = screen.querySelector(".composer");
  if (!composer || !screen.classList.contains("has-chat")) return;
  animateComposerMove(screen, composer, "has-chat", false);
  window.setTimeout(() => {
    const thread = screen.querySelector(".chat-thread");
    thread.replaceChildren();
    thread.classList.remove("is-tool-showcase");
    screen
      .querySelectorAll("[data-conversation-id]")
      .forEach((item) =>
        item.classList.toggle(
          "is-current",
          item.dataset.conversationId === "new",
        ),
      );
    replayReveal(screen);
  }, 320);
}

function setTheme(theme, persist = true) {
  document.documentElement.dataset.theme = theme;
  const isDark = theme === "dark";
  themeToggle.setAttribute("aria-pressed", isDark ? "true" : "false");
  themeToggle.setAttribute(
    "aria-label",
    isDark ? "Activer le mode clair" : "Activer le mode sombre",
  );
  if (persist) window.localStorage.setItem("maiah-prototype-theme", theme);
}

function openToolsPanel() {
  toolsPanel.classList.remove("is-closing");
  toolsPanel.classList.add("is-open");
  toolsBackdrop.classList.add("is-open");
  toolsPanel.setAttribute("aria-hidden", "false");
  document.querySelector(".tools-close").focus();
}

function closeToolsPanel() {
  if (!toolsPanel.classList.contains("is-open")) return;
  toolsPanel.classList.remove("is-open");
  toolsPanel.classList.add("is-closing");
  toolsBackdrop.classList.remove("is-open");
  toolsPanel.setAttribute("aria-hidden", "true");
  window.setTimeout(() => toolsPanel.classList.remove("is-closing"), closeMs);
}

function openHistoryPanel() {
  closeToolsPanel();
  historyPanel.classList.remove("is-closing");
  historyPanel.classList.add("is-open");
  toolsBackdrop.classList.add("is-open");
  historyPanel.setAttribute("aria-hidden", "false");
  historyPanel.querySelector(".history-panel-close").focus();
}

function closeHistoryPanel() {
  if (!historyPanel.classList.contains("is-open")) return;
  historyPanel.classList.remove("is-open");
  historyPanel.classList.add("is-closing");
  toolsBackdrop.classList.remove("is-open");
  historyPanel.setAttribute("aria-hidden", "true");
  window.setTimeout(() => historyPanel.classList.remove("is-closing"), closeMs);
}

function openArtifact() {
  artifactDrawer.classList.add("is-open");
  artifactDrawer.setAttribute("aria-hidden", "false");
}

function closeArtifact() {
  artifactDrawer.classList.remove("is-open");
  artifactDrawer.setAttribute("aria-hidden", "true");
}

function syncToolsCount() {
  const count = toolsPanel.querySelectorAll(
    '.tool-list input[type="checkbox"]:checked',
  ).length;
  document.querySelectorAll(".tools-control").forEach((button) => {
    button.classList.toggle("is-active", count > 0);
    button.setAttribute("aria-pressed", count > 0 ? "true" : "false");
    button.querySelector("span").textContent = String(count);
  });
  document.querySelector(".active-tools-count").textContent = String(count);
}

function loadConversation(button) {
  const screen = button.closest(".concept-screen");
  const composer = screen.querySelector(".composer");
  const thread = screen.querySelector(".chat-thread");
  const title = button.querySelector("strong")?.textContent?.trim();
  if (!composer || !thread || !title) return;

  screen
    .querySelectorAll("[data-conversation-id]")
    .forEach((item) => item.classList.toggle("is-current", item === button));

  if (!screen.classList.contains("has-chat")) {
    animateComposerMove(screen, composer, "has-chat", true);
  }
  thread.replaceChildren();
  thread.classList.toggle(
    "is-tool-showcase",
    button.dataset.conversationId === "tool-showcase",
  );
  if (button.dataset.conversationId === "tool-showcase") {
    renderToolShowcase(thread);
    return;
  }
  appendMessage(
    thread,
    "user",
    `Reprenons « ${title} » là où nous nous sommes arrêtés.`,
  );
  appendMessage(
    thread,
    "assistant",
    "Conversation restaurée. J’ai retrouvé le contexte, les pièces jointes et les outils utilisés.",
    180,
  );
}

const visualArtifactTypes = [
  ["Présentation", "Slides interactives"],
  ["Document", "Note structurée"],
  ["Tableur", "Tableau + export CSV"],
  ["Réunion", "Agenda et décisions"],
  ["Plan d’action", "Phases et responsables"],
  ["Matrice", "Comparaison pondérée"],
  ["Emails", "Séquence de messages"],
  ["Statut projet", "Jalons et indicateurs"],
  ["Risques", "Probabilité et impact"],
  ["RACI", "Rôles et responsabilités"],
  ["Compte client", "Parties prenantes"],
  ["Battlecard", "Positionnement concurrentiel"],
];

function artifactTypeTiles() {
  return visualArtifactTypes
    .map(
      ([name, detail], index) => `
        <button type="button" class="artifact-type-tile" data-demo-action="artifact">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <strong>${name}</strong><small>${detail}</small>
        </button>`,
    )
    .join("");
}

function renderToolShowcase(thread) {
  thread.classList.add("is-tool-showcase");
  thread.innerHTML = `
    <div class="showcase-intro">
      <span class="message-avatar">M</span>
      <div>
        <small>RÉFÉRENCE VISUELLE · BASÉE SUR LES RENDUS MAIAH</small>
        <h2>Outils, sorties et états</h2>
        <p>Les outils qui produisent un résultat visuel l’affichent directement dans le fil. Utilisez les filtres pour isoler un état.</p>
      </div>
    </div>
    <nav class="showcase-filters" aria-label="Filtrer les états">
      <button type="button" class="is-active" data-showcase-filter="all">Tous <span>20</span></button>
      <button type="button" data-showcase-filter="orchestration">Orchestration <span>4</span></button>
      <button type="button" data-showcase-filter="running">En cours <span>4</span></button>
      <button type="button" data-showcase-filter="approval">Validation <span>2</span></button>
      <button type="button" data-showcase-filter="success">Succès <span>10</span></button>
      <button type="button" data-showcase-filter="error">Erreurs <span>4</span></button>
    </nav>

    <section class="showcase-section" data-demo-state="running">
      <header><span>01</span><div><strong>Entrée en streaming</strong><small>render_html_artifact · saisie des paramètres</small></div><i class="state-dot is-running"></i></header>
      <div class="live-code-lines"><i></i><i></i><i></i><i></i><span>Génération de l’aperçu…</span></div>
      <div class="inline-web-preview is-loading">
        <div class="preview-bar"><i></i><i></i><i></i><span>Aperçu en direct</span></div>
        <div class="preview-skeleton"><i></i><i></i><i></i></div>
      </div>
    </section>

    <section class="showcase-section" data-demo-state="approval">
      <header><span>02</span><div><strong>Autorisation requise</strong><small>http_fetch · action externe</small></div><i class="state-dot is-approval"></i></header>
      <p class="showcase-copy">Maiah souhaite consulter une URL externe. L’exécution reste suspendue jusqu’à votre décision.</p>
      <div class="showcase-actions"><button type="button" data-demo-action="reject">Refuser</button><button type="button" class="is-primary" data-demo-action="approve">Autoriser</button></div>
    </section>

    <section class="showcase-section visual-output" data-demo-state="success">
      <header><span>03</span><div><strong>Aperçu HTML interactif</strong><small>render_html_artifact · terminé</small></div><i class="state-dot is-success"></i></header>
      <div class="inline-web-preview">
        <div class="preview-bar"><i></i><i></i><i></i><span>Tableau de pilotage</span><button type="button" data-demo-action="code">Code</button><button type="button" data-demo-action="fullscreen">Plein écran</button></div>
        <div class="mini-dashboard">
          <div><small>PROGRESSION</small><strong>74%</strong><span><i style="width:74%"></i></span></div>
          <div><small>TÂCHES</small><strong>18</strong><em>+4 cette semaine</em></div>
          <div><small>RISQUES</small><strong>03</strong><em>1 à traiter</em></div>
        </div>
        <pre class="inline-code-view">&lt;main class="dashboard"&gt;…&lt;/main&gt;</pre>
      </div>
    </section>

    <section class="showcase-section visual-output" data-demo-state="success">
      <header><span>04</span><div><strong>Image générée</strong><small>generate_image · 1536 × 1024</small></div><i class="state-dot is-success"></i></header>
      <div class="generated-image-demo" role="img" aria-label="Paysage abstrait bleu généré">
        <span></span><i></i><b></b><em>MAIAH / BLUE HORIZON</em>
      </div>
      <footer class="visual-meta"><span>FLUX.1 · 4,2 s</span><span>0,003 kWh · 1,2 g CO₂</span><button type="button" data-demo-action="download">Télécharger</button></footer>
    </section>

    <section class="showcase-section visual-output" data-demo-state="running">
      <header><span>05</span><div><strong>Espace de code actif</strong><small>code_workspace_write_file · mise à jour</small></div><i class="state-dot is-running"></i></header>
      <div class="workspace-demo">
        <aside><strong>PROJET</strong><span>index.html</span><span class="is-active">styles.css</span><span>app.js</span></aside>
        <div><small>LIVE PREVIEW</small><div class="workspace-preview"><i></i><strong>Votre espace<br>prend forme.</strong><button>Commencer</button></div></div>
      </div>
      <footer class="visual-meta"><span>3 fichiers · synchronisation…</span><button type="button" data-demo-action="artifact">Ouvrir l’espace</button></footer>
    </section>

    <section class="showcase-section" data-demo-state="success">
      <header><span>06</span><div><strong>Code exécuté</strong><small>run_code_sandbox · Python · 428 ms · code 0</small></div><i class="state-dot is-success"></i></header>
      <pre class="sandbox-terminal"><span>$ python analyse.py</span>
12 lignes analysées
✓ graphique.png généré
✓ résultats.csv généré</pre>
      <div class="generated-files"><button type="button" data-demo-action="download"><i>PNG</i><span><strong>graphique.png</strong><small>248 Ko · aperçu disponible</small></span></button><button type="button" data-demo-action="download"><i>CSV</i><span><strong>résultats.csv</strong><small>18 Ko · téléchargement</small></span></button></div>
    </section>

    <section class="showcase-section" data-demo-state="error">
      <header><span>07</span><div><strong>Exécution interrompue</strong><small>run_code_sandbox · délai dépassé après 30 s</small></div><i class="state-dot is-error"></i></header>
      <pre class="sandbox-terminal is-error"><span>stderr</span>
TimeoutError: la limite d’exécution a été atteinte.</pre>
      <div class="showcase-actions"><button type="button" data-demo-action="details">Voir le code</button><button type="button" class="is-primary" data-demo-action="retry">Réessayer</button></div>
    </section>

    <section class="showcase-section" data-demo-state="running">
      <header><span>08</span><div><strong>Plan d’exécution</strong><small>todo list · 2 sur 4 terminées</small></div><i class="state-dot is-running"></i></header>
      <ol class="todo-demo"><li class="is-done"><i></i><span>Analyser le brief<small>Terminé</small></span></li><li class="is-done"><i></i><span>Définir la structure<small>Terminé</small></span></li><li class="is-current"><i></i><span>Construire l’interface<small>En cours</small></span></li><li><i></i><span>Vérifier le rendu<small>À venir</small></span></li></ol>
    </section>

    <section class="showcase-section" data-demo-state="success">
      <header><span>09</span><div><strong>Pièces jointes</strong><small>image et document · états d’extraction</small></div><i class="state-dot is-success"></i></header>
      <div class="attachment-state-grid">
        <article class="attachment-demo is-ready"><div class="attachment-thumb image-thumb"></div><span><strong>maquette.png</strong><small>Image · prête</small></span><i>✓</i></article>
        <article class="attachment-demo is-extracting"><div class="attachment-thumb">PDF</div><span><strong>brief.pdf</strong><small>Extraction du texte…</small></span><i></i></article>
        <article class="attachment-demo is-failed"><div class="attachment-thumb">DOC</div><span><strong>archive.doc</strong><small>Extraction impossible</small></span><button type="button" data-demo-action="retry">Réessayer</button></article>
      </div>
    </section>

    <section class="showcase-section" data-demo-state="approval">
      <header><span>10</span><div><strong>Publication GitHub</strong><small>github_publish_code_workspace · validation</small></div><i class="state-dot is-approval"></i></header>
      <div class="github-demo"><span>MAIAH</span><b>/</b><strong>orbit-interface</strong><i>Pull request</i><small>main ← maiah/orbit-ui</small></div>
      <div class="showcase-actions"><button type="button" data-demo-action="reject">Annuler</button><button type="button" class="is-primary" data-demo-action="approve">Publier</button></div>
    </section>

    <section class="showcase-section" data-demo-state="error">
      <header><span>11</span><div><strong>Résultat refusé</strong><small>http_fetch · autorisation refusée</small></div><i class="state-dot is-error"></i></header>
      <p class="showcase-copy">Aucune donnée externe n’a été transmise. Vous pouvez modifier la demande ou relancer l’autorisation.</p>
      <button type="button" class="inline-retry" data-demo-action="retry">Relancer l’autorisation</button>
    </section>

    <section class="showcase-section" data-demo-state="success">
      <header><span>12</span><div><strong>Sources et citations</strong><small>web_search · 4 résultats utilisés</small></div><i class="state-dot is-success"></i></header>
      <div class="showcase-citations"><button type="button" data-demo-action="source"><span>01</span><strong>Architecture applicative</strong><small>Documentation Maiah</small></button><button type="button" data-demo-action="source"><span>02</span><strong>Système de design</strong><small>Référentiel interne</small></button><button type="button" data-demo-action="source"><span>03</span><strong>Bonnes pratiques UX</strong><small>Guide produit</small></button></div>
    </section>

    <section class="showcase-section artifact-library" data-demo-state="success">
      <header><span>13</span><div><strong>Artefacts métier</strong><small>12 formats · tous rendus directement dans le chat</small></div><i class="state-dot is-success"></i></header>
      <div class="artifact-type-grid">${artifactTypeTiles()}</div>
    </section>

    <section class="showcase-section" data-demo-state="error">
      <header><span>14</span><div><strong>Tool en erreur</strong><small>web_search · service temporairement indisponible</small></div><i class="state-dot is-error"></i></header>
      <p class="showcase-copy">Les résultats précédents restent visibles. La mise à jour n’a pas pu être chargée.</p>
      <button type="button" class="inline-retry" data-demo-action="retry">Réessayer</button>
    </section>

    <section class="showcase-section visual-output" data-demo-state="success">
      <header><span>15</span><div><strong>Publication terminée</strong><small>github_publish_code_workspace · pull request créée</small></div><i class="state-dot is-success"></i></header>
      <div class="publish-success"><span>✓</span><div><strong>PR #42 prête à être relue</strong><small>maiah/orbit-ui → main · commit a8f31d2</small></div><button type="button" data-demo-action="source">Ouvrir</button></div>
    </section>

    <section class="showcase-section" data-demo-state="success">
      <header><span>16</span><div><strong>Tool générique terminé</strong><small>calculator · résultat structuré</small></div><i class="state-dot is-success"></i></header>
      <details class="generic-result"><summary>Résultat · 74,2 <span>Voir les détails</span></summary><pre>{ "expression": "53 × 1.4", "result": 74.2 }</pre></details>
    </section>

    <section class="showcase-section orchestration-card" data-demo-state="running" data-demo-group="orchestration">
      <header><span>17</span><div><strong>Orchestration en cours</strong><small>4 étapes · raisonnement · 2 spécialistes en parallèle</small></div><i class="state-dot is-running"></i></header>
      <details class="reasoning-demo" open>
        <summary><span class="reasoning-icon">✦</span><strong>Phase de travail active</strong><small>Voir la progression</small></summary>
        <div class="orchestration-tree">
          <article class="orchestrator-node is-running">
            <span class="agent-node-icon">O</span>
            <div><strong>Maiah Orchestrateur</strong><small>Décompose la demande et coordonne les résultats</small></div>
            <em>En cours</em>
          </article>
          <div class="specialist-branches">
            <article class="specialist-node is-success">
              <header><span>UX</span><div><strong>Spécialiste UX</strong><small>Profondeur 1 · version 12</small></div><em>Terminé</em></header>
              <ol class="tool-chain">
                <li class="is-success"><i></i><span><strong>Raisonnement</strong><small>Identifier les parcours critiques</small></span></li>
                <li class="is-success"><i></i><span><strong>web_search</strong><small>4 sources pertinentes</small></span></li>
                <li class="is-success"><i></i><span><strong>Synthèse spécialiste</strong><small>Résultat transmis à l’orchestrateur</small></span></li>
              </ol>
            </article>
            <article class="specialist-node is-running">
              <header><span>DEV</span><div><strong>Spécialiste Code</strong><small>Profondeur 1 · version 8</small></div><em>En cours</em></header>
              <ol class="tool-chain">
                <li class="is-success"><i></i><span><strong>Raisonnement</strong><small>Préparer le plan d’implémentation</small></span></li>
                <li class="is-running"><i></i><span><strong>run_code_sandbox</strong><small>Exécution de la vérification</small></span></li>
                <li><i></i><span><strong>render_html_artifact</strong><small>En attente du résultat précédent</small></span></li>
              </ol>
            </article>
          </div>
        </div>
      </details>
      <div class="orchestration-budget">
        <span><strong>2 / 4</strong> délégations</span>
        <span><strong>2 / 2</strong> parallèles</span>
        <span><strong>18,4k / 50k</strong> tokens</span>
        <span><strong>43 s / 120 s</strong></span>
      </div>
      <button type="button" class="orchestration-stop" data-demo-action="cancel-run">Arrêter l’exécution</button>
    </section>

    <section class="showcase-section orchestration-card is-condensed" data-demo-state="success" data-demo-group="orchestration">
      <details class="completed-phase">
        <summary>
          <span class="phase-number">18</span>
          <span class="phase-status is-success">✓</span>
          <span class="phase-copy"><strong>Travail terminé</strong><small>Raisonnement · 2 délégations · 5 tools</small></span>
          <span class="phase-duration">32 s</span>
          <span class="phase-toggle">Détails</span>
        </summary>
        <div class="completed-phase-details">
          <div class="chain-overview" aria-label="Chaîne d’exécution terminée">
            <article><span>01</span><strong>Planifier</strong><small>Raisonnement</small><i></i></article>
            <article><span>02</span><strong>Déléguer</strong><small>UX + Code</small><i></i></article>
            <article><span>03</span><strong>Exécuter</strong><small>5 tools</small><i></i></article>
            <article><span>04</span><strong>Synthétiser</strong><small>Réponse finale</small></article>
          </div>
          <div class="reasoning-summary">
            <span>✦</span><p><strong>Raisonnement</strong>La demande a été divisée entre analyse d’usage et construction technique, puis les résultats ont été arbitrés avant la réponse finale.</p>
          </div>
          <div class="delegation-results">
            <article><span>UX</span><div><strong>Spécialiste UX</strong><small>3 étapes · 2 tools · 8,1k tokens</small></div><em>✓</em></article>
            <article><span>DEV</span><div><strong>Spécialiste Code</strong><small>4 étapes · 3 tools · 12,6k tokens</small></div><em>✓</em></article>
          </div>
        </div>
      </details>
    </section>

    <section class="showcase-section orchestration-card is-warning is-condensed" data-demo-state="success" data-demo-group="orchestration">
      <details class="completed-phase">
        <summary>
          <span class="phase-number">19</span>
          <span class="phase-status is-warning">!</span>
          <span class="phase-copy"><strong>Terminé avec réserve</strong><small>1 branche échouée · synthèse conservée</small></span>
          <span class="phase-duration">48 s</span>
          <span class="phase-toggle">Détails</span>
        </summary>
        <div class="completed-phase-details">
          <div class="delegation-results">
            <article><span>UX</span><div><strong>Spécialiste UX</strong><small>Résultat complet transmis</small></div><em>✓</em></article>
            <article class="is-failed"><span>SEC</span><div><strong>Spécialiste Sécurité</strong><small>Tool non interactif bloqué par approbation</small></div><em>!</em></article>
          </div>
          <div class="recovery-note"><span>↳</span><p><strong>Synthèse de repli</strong>La réponse utilise le travail validé et signale explicitement la vérification manquante.</p></div>
          <button type="button" class="inline-retry" data-demo-action="retry">Relancer uniquement la branche échouée</button>
        </div>
      </details>
    </section>

    <section class="showcase-section orchestration-card" data-demo-state="error" data-demo-group="orchestration">
      <header><span>20</span><div><strong>Orchestration arrêtée</strong><small>limite de profondeur, budget ou annulation propagée</small></div><i class="state-dot is-error"></i></header>
      <div class="orchestration-errors">
        <article><span>PROFONDEUR</span><strong>2 / 2 atteinte</strong><small>Aucune nouvelle délégation autorisée</small></article>
        <article><span>ANNULATION</span><strong>Propagée à 3 runs</strong><small>Les résultats partiels restent visibles</small></article>
        <article><span>APPROBATION</span><strong>Refus fermé</strong><small>Un child run ne peut pas attendre une validation</small></article>
      </div>
      <p class="showcase-copy">L’arbre reste consultable et aucun effet externe ambigu n’est rejoué automatiquement.</p>
      <div class="showcase-actions"><button type="button" data-demo-action="details">Voir la trace</button><button type="button" class="is-primary" data-demo-action="retry">Créer une nouvelle exécution</button></div>
    </section>
  `;
  thread.scrollTop = 0;
}

orbitScreen.querySelector(".chat-thread").addEventListener("click", (event) => {
  const filter = event.target.closest("[data-showcase-filter]");
  if (filter) {
    const value = filter.dataset.showcaseFilter;
    filter.parentElement
      .querySelectorAll("button")
      .forEach((button) =>
        button.classList.toggle("is-active", button === filter),
      );
    event.currentTarget
      .querySelectorAll("[data-demo-state]")
      .forEach((card) => {
        card.hidden =
          value !== "all" &&
          (value === "orchestration"
            ? card.dataset.demoGroup !== "orchestration"
            : card.dataset.demoState !== value);
      });
    return;
  }

  const action = event.target.closest("[data-demo-action]");
  if (!action) return;
  const actionName = action.dataset.demoAction;
  if (actionName === "code") {
    action.closest(".inline-web-preview").classList.toggle("show-code");
    action.textContent = action
      .closest(".inline-web-preview")
      .classList.contains("show-code")
      ? "Aperçu"
      : "Code";
    return;
  }
  if (actionName === "approve" || actionName === "reject") {
    const card = action.closest(".showcase-section");
    card.dataset.demoState = actionName === "approve" ? "success" : "error";
    card.querySelector(".state-dot").className =
      `state-dot is-${actionName === "approve" ? "success" : "error"}`;
    card.querySelector(".showcase-actions").innerHTML =
      `<span class="demo-decision">${actionName === "approve" ? "✓ Autorisé — exécution simulée" : "× Refusé — aucune action exécutée"}</span>`;
  }
  if (actionName === "cancel-run") {
    const card = action.closest(".showcase-section");
    card.dataset.demoState = "error";
    card.querySelector(".state-dot").className = "state-dot is-error";
    card.querySelector("header strong").textContent = "Orchestration annulée";
    action.textContent = "Annulation propagée aux spécialistes";
    action.disabled = true;
    card
      .querySelectorAll(".is-running")
      .forEach((item) => item.classList.replace("is-running", "is-cancelled"));
  }
  showToast(
    actionName === "retry" ? "Nouvelle tentative lancée" : "Action simulée",
    "Le prototype ne déclenche aucune action réelle",
  );
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    const screen = button.closest(".concept-screen");
    const textarea = screen.querySelector("textarea");
    textarea.value = button.dataset.prompt;
    textarea.focus();
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 100)}px`;
  });
});

document.querySelectorAll(".composer").forEach((form) => {
  const textarea = form.querySelector("textarea");

  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 100)}px`;
  });

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = textarea.value.trim();
    if (!message) {
      textarea.focus();
      return;
    }
    startConversation(form.closest(".concept-screen"), form, message);
    showToast();
    textarea.value = "";
    textarea.style.height = "auto";
  });
});

document
  .querySelectorAll(".tools-control")
  .forEach((button) => button.addEventListener("click", openToolsPanel));

toolsCloseButtons.forEach((button) =>
  button.addEventListener("click", closeToolsPanel),
);
toolsBackdrop.addEventListener("click", () => {
  closeToolsPanel();
  closeHistoryPanel();
});
toolsPanel
  .querySelectorAll('.tool-list input[type="checkbox"]')
  .forEach((input) => input.addEventListener("change", syncToolsCount));

themeToggle.addEventListener("click", () => {
  const nextTheme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  setTheme(nextTheme);
});

document.querySelectorAll('input[type="search"]').forEach((input) => {
  input.addEventListener("input", () => {
    const query = input.value.trim().toLocaleLowerCase("fr");
    const container = input.closest("aside");
    if (!container) return;
    const items = container.querySelectorAll(
      ".conversation-row, .context-conversation, nav > button",
    );
    items.forEach((item) => {
      item.hidden = !item.textContent.toLocaleLowerCase("fr").includes(query);
    });
  });
});

document
  .querySelectorAll(
    ".conversation-row:not(.is-selected), .context-conversation:not(.is-current), .shared-history nav > button:not(.is-current), .editorial-index li:not(.is-current) button",
  )
  .forEach((button) =>
    button.addEventListener("click", () => loadConversation(button)),
  );

document.querySelectorAll(".agent-menu button").forEach((button) => {
  button.addEventListener("click", () => {
    const screen = button.closest(".concept-screen");
    const name = button.querySelector("strong")?.textContent?.trim();
    const triggerName = screen.querySelector(".agent-trigger strong");
    if (triggerName && name && !button.classList.contains("configure-agent")) {
      triggerName.textContent = name;
    }
    closeDropdown(
      button.closest(".agent-menu"),
      screen.querySelector(".agent-trigger"),
    );
    showToast(
      button.classList.contains("configure-agent")
        ? "Configuration ouverte"
        : "Assistant sélectionné",
      name || "Paramètres des assistants",
    );
  });
});

document
  .querySelectorAll(".history-manage")
  .forEach((button) => button.addEventListener("click", openHistoryPanel));
document
  .querySelector(".history-panel-close")
  .addEventListener("click", closeHistoryPanel);
document.querySelector(".history-save").addEventListener("click", () => {
  const nextName = historyPanel
    .querySelector(".history-name-field input")
    .value.trim();
  const currentTitle = orbitScreen.querySelector(
    '.orbit-history [data-conversation-id="new"] strong',
  );
  if (nextName && currentTitle) currentTitle.textContent = nextName;
  closeHistoryPanel();
  showToast("Historique mis à jour", "Les modifications ont été simulées");
});
historyPanel.querySelectorAll("[data-history-action]").forEach((button) =>
  button.addEventListener("click", () => {
    const action = button.dataset.historyAction;
    button.classList.toggle("is-selected");
    if (action === "delete") {
      showToast(
        "Suppression simulée",
        "La conversation reste disponible dans le prototype",
      );
    }
  }),
);
document.querySelector(".folder-add").addEventListener("click", () => {
  const folder = document.createElement("button");
  folder.type = "button";
  folder.innerHTML = "<i></i>Nouveau dossier <small>0</small>";
  document.querySelector(".folder-add").before(folder);
  showToast(
    "Dossier créé",
    "Vous pouvez maintenant y déplacer une conversation",
  );
});

const orbitFolderToggle = document.querySelector(".orbit-folder-title button");
orbitFolderToggle.addEventListener("click", () => {
  const expanded = orbitFolderToggle.getAttribute("aria-expanded") === "true";
  orbitFolderToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
  orbitScreen.querySelector('[data-conversation-id="atelier"]').hidden =
    expanded;
});

const orbitAttach = document.querySelector(".orbit-attach");
const orbitFileInput = document.querySelector(".orbit-file-input");
const orbitComposer = document.querySelector(".orbit-composer");

function addOrbitFiles(files) {
  const strip = orbitScreen.querySelector(".attachment-strip");
  [...files].slice(0, 5).forEach((file) => {
    const chip = document.createElement("div");
    chip.className = "attachment-chip";
    const size = file.size
      ? `${Math.max(1, Math.round(file.size / 1024))} Ko`
      : "Fichier";
    chip.innerHTML =
      '<svg><use href="#i-paperclip"></use></svg><span></span><small></small><button type="button" aria-label="Retirer le fichier"><svg><use href="#i-close"></use></svg></button>';
    chip.querySelector("span").textContent = file.name;
    chip.querySelector("small").textContent = size;
    chip.querySelector("button").addEventListener("click", () => chip.remove());
    strip.append(chip);
  });
  showToast("Fichier joint", "Extraction simulée et prête pour Maiah");
}

orbitAttach.addEventListener("click", () => orbitFileInput.click());
orbitFileInput.addEventListener("change", () => {
  addOrbitFiles(orbitFileInput.files);
  orbitFileInput.value = "";
});
["dragenter", "dragover"].forEach((eventName) =>
  orbitComposer.addEventListener(eventName, (event) => {
    event.preventDefault();
    orbitComposer.classList.add("is-dragging");
  }),
);
["dragleave", "drop"].forEach((eventName) =>
  orbitComposer.addEventListener(eventName, (event) => {
    event.preventDefault();
    orbitComposer.classList.remove("is-dragging");
    if (eventName === "drop" && event.dataTransfer?.files?.length) {
      addOrbitFiles(event.dataTransfer.files);
    }
  }),
);
orbitComposer.querySelector("textarea").addEventListener("paste", (event) => {
  const files = event.clipboardData?.files;
  if (files?.length) addOrbitFiles(files);
});

orbitComposer
  .querySelector(".send-button")
  .addEventListener("click", (event) => {
    if (orbitScreen.dataset.generating !== "true") return;
    event.preventDefault();
    orbitScreen.querySelector(".approval-card")?.remove();
    finishOrbitGeneration(
      "Génération interrompue. Votre contexte et votre saisie sont conservés.",
    );
    showToast(
      "Génération arrêtée",
      "Vous pouvez reprendre ou modifier votre demande",
    );
  });

orbitScreen
  .querySelector(".chat-thread")
  .addEventListener("click", async (event) => {
    const approval = event.target.closest("[data-approval]");
    if (approval) {
      const card = approval.closest(".approval-card");
      if (approval.dataset.approval === "approve") {
        card.remove();
        addOrbitResult(orbitScreen.querySelector(".chat-thread"));
        showToast("Action autorisée", "L’artefact est prêt à être consulté");
      } else {
        card.remove();
        finishOrbitGeneration("Action refusée. Aucun artefact n’a été créé.");
      }
      return;
    }

    const artifactOpen = event.target.closest(".artifact-open");
    if (artifactOpen) {
      openArtifact();
      return;
    }

    const actionButton = event.target.closest("[data-message-action]");
    if (!actionButton) return;
    const message = actionButton.closest(".message");
    const body = message.querySelector(".message-body");
    const text = body.firstChild?.textContent || "";
    if (actionButton.dataset.messageAction === "copy") {
      await navigator.clipboard.writeText(text);
      showToast("Message copié", "Le contenu est dans le presse-papiers");
    }
    if (actionButton.dataset.messageAction === "delete") message.remove();
    if (actionButton.dataset.messageAction === "edit") {
      if (message.classList.contains("is-user")) {
        body.contentEditable = "true";
        body.focus();
        showToast("Modification activée", "Entrée valide le nouveau message");
      } else {
        body.firstChild.textContent =
          "Voici une nouvelle formulation plus concise de la réponse proposée.";
        showToast(
          "Réponse régénérée",
          "Une nouvelle version simulée est affichée",
        );
      }
    }
  });

document
  .querySelector(".artifact-close")
  .addEventListener("click", closeArtifact);
document.querySelectorAll("[data-artifact-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document
      .querySelectorAll("[data-artifact-tab]")
      .forEach((tab) => tab.classList.toggle("is-active", tab === button));
    document
      .querySelectorAll("[data-artifact-view]")
      .forEach((view) =>
        view.classList.toggle(
          "is-active",
          view.dataset.artifactView === button.dataset.artifactTab,
        ),
      );
  });
});
document.querySelector(".artifact-copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(
    document.querySelector(".artifact-code code").textContent,
  );
  showToast(
    "Code copié",
    "Le contenu de l’artefact est dans le presse-papiers",
  );
});
document.querySelector(".artifact-download").addEventListener("click", () => {
  showToast("Téléchargement simulé", "Le fichier serait préparé au format ZIP");
});

document
  .querySelectorAll(
    ".new-chat, .history-new, .context-section button.is-current",
  )
  .forEach((button) => {
    button.addEventListener("click", () => {
      resetConversation(button.closest(".concept-screen"));
    });
  });

document.querySelector(".mobile-history").addEventListener("click", (event) => {
  event.stopPropagation();
  document.querySelector(".concept-aether").classList.toggle("history-open");
});

document.addEventListener("click", (event) => {
  const aether = document.querySelector(".concept-aether");
  if (
    aether.classList.contains("history-open") &&
    !event.target.closest(".aether-history")
  ) {
    aether.classList.remove("history-open");
  }
});

requestAnimationFrame(() => movePill(tabs[0], false));
window.addEventListener("resize", () => {
  const active = tabs.find(
    (tab) => tab.getAttribute("aria-selected") === "true",
  );
  movePill(active, false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeToolsPanel();
    closeHistoryPanel();
    closeArtifact();
    closeAllDropdowns();
  }
});

const savedTheme = window.localStorage.getItem("maiah-prototype-theme");
setTheme(
  savedTheme ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"),
  false,
);
toolsPanel.setAttribute("aria-hidden", "true");
historyPanel.setAttribute("aria-hidden", "true");
syncToolsCount();
