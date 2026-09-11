(() => {
  "use strict";

  const state = {
    cards: [],
    activeCard: null,
    scratching: false,
    revealed: false,
    progress: 0,
    startX: null,
    lastX: null,
    maxDragDistance: 0,
    scratchTimer: null
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    bindGlobalEvents();
    await loadCards();
  }

  function cacheElements() {
    els.cardGrid = document.getElementById("card-grid");
    els.emptyState = document.getElementById("empty-state");
    els.template = document.getElementById("card-template");

    els.modal = document.getElementById("card-modal");
    els.scratchModal = document.querySelector(".scratch-modal");
    els.scratchCard = document.getElementById("scratch-card");
    els.flipStage = document.getElementById("flip-stage");

    els.modalTitle = document.getElementById("modal-title");
    els.modalDescription = document.getElementById("modal-description");
    els.modalValidity = document.getElementById("modal-validity");
    els.modalCover = document.getElementById("modal-cover");

    els.scratchArea = document.getElementById("scratch-area");
    els.scratchCoating = document.querySelector(".scratch-coating");
    els.secretNumber = document.getElementById("secret-number");
    els.scissorHint = document.getElementById("scissor-hint");
    els.progressLabel = document.getElementById("progress-label");
    els.progressBar = document.getElementById("progress-bar");
    els.revealedMessage = document.getElementById("revealed-message");
    els.scratchAgain = document.getElementById("scratch-again-button");
  }

  function bindGlobalEvents() {
    document.addEventListener("click", (event) => {
      const claimButton = event.target.closest("[data-card-index]");
      if (claimButton) {
        const index = Number(claimButton.dataset.cardIndex);
        openCard(index);
      }

      if (event.target.closest("[data-close-modal]")) {
        closeModal();
      }
    });

    els.scratchAgain.addEventListener("click", resetScratch);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && els.modal.classList.contains("open")) {
        closeModal();
      }
    });

    els.scratchArea.addEventListener("pointerdown", handlePointerDown, { passive: false });
    els.scratchArea.addEventListener("pointermove", handlePointerMove, { passive: false });
    els.scratchArea.addEventListener("pointerup", handlePointerUp, { passive: false });
    els.scratchArea.addEventListener("pointercancel", handlePointerUp, { passive: false });

    // A click anywhere in the scratch area gives a small nudge on touch screens.
    els.scratchArea.addEventListener("click", () => {
      if (!state.revealed) {
        setProgress(Math.min(10, state.progress + 5));
      }
    });
  }

  async function loadCards() {
    try {
      const response = await fetch("cards.json", { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      state.cards = normalizeCards(payload);
      renderCards();
    } catch (error) {
      console.error("Unable to load cards.json:", error);
      state.cards = [];
      renderCards();
    }
  }

  function normalizeCards(payload) {
    const cards = Array.isArray(payload) ? payload : payload.cards;

    if (!Array.isArray(cards)) {
      throw new Error("cards.json must contain an array or a { cards: [] } object.");
    }

    return cards
      .filter(Boolean)
      .map((card, index) => ({
        id: String(card.id ?? `card-${index + 1}`),
        name: String(card.name ?? `Easy Gold Card ${index + 1}`),
        description: String(card.description ?? "Scratch to reveal your secret number."),
        barNumber: String(card.barNumber ?? "0000 0000 0000"),
        validity: String(card.validity ?? "VALIDITY: 30 DAYS"),
        coverImage: String(card.coverImage ?? ""),
        accent: String(card.accent ?? "green")
      }));
  }

  function renderCards() {
    els.cardGrid.innerHTML = "";

    if (!state.cards.length) {
      els.emptyState.classList.remove("hidden");
      return;
    }

    els.emptyState.classList.add("hidden");

    const fragment = document.createDocumentFragment();

    state.cards.forEach((card, index) => {
      const node = els.template.content.cloneNode(true);

      const article = node.querySelector(".claim-card");
      const cover = node.querySelector(".claim-cover");
      const validity = node.querySelector(".mini-validity");
      const name = node.querySelector(".claim-name");
      const description = node.querySelector(".claim-description");
      const claimButton = node.querySelector(".claim-button");

      article.dataset.cardId = card.id;
      cover.src = card.coverImage;
      cover.alt = `${card.name} cover`;
      cover.addEventListener("error", () => {
        cover.src = makeFallbackCover(index);
      }, { once: true });

      validity.textContent = card.validity;
      name.textContent = card.name;
      description.textContent = card.description;
      claimButton.dataset.cardIndex = String(index);

      fragment.appendChild(node);
    });

    els.cardGrid.appendChild(fragment);
  }

  function openCard(index) {
    const card = state.cards[index];
    if (!card) return;

    state.activeCard = card;
    state.scratching = false;
    state.revealed = false;
    state.progress = 0;

    clearTimeout(state.scratchTimer);

    els.modalCover.src = card.coverImage;
    els.modalCover.alt = `${card.name} cover`;
    els.modalCover.onerror = () => {
      els.modalCover.src = makeFallbackCover(index);
      els.modalCover.onerror = null;
    };

    els.modalTitle.textContent = card.name;
    els.modalDescription.textContent = card.description;
    els.modalValidity.textContent = card.validity;
    els.secretNumber.textContent = card.barNumber;

    resetScratchVisuals();
    els.scratchCard.classList.remove("flipped");

    els.modal.classList.add("open");
    els.modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    // Let the browser paint the front side before starting the flip.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        els.scratchCard.classList.add("flipped");
      });
    });
  }

  function closeModal() {
    els.modal.classList.remove("open");
    els.modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    clearTimeout(state.scratchTimer);
  }

  function resetScratch() {
    state.scratching = false;
    state.revealed = false;
    state.progress = 0;
    state.startX = null;
    state.lastX = null;

    resetScratchVisuals();
    els.scratchAgain.hidden = true;
    els.revealedMessage.hidden = true;
  }

  function resetScratchVisuals() {
    els.scratchCoating.style.opacity = "1";
    els.progressBar.style.width = "0%";
    els.progressLabel.textContent = "0%";
    els.scissorHint.innerHTML = '<span class="scissor-icon" aria-hidden="true">✂</span><span>Drag across the strip</span>';
  }

  function handlePointerDown(event) {
    if (state.revealed || !state.activeCard) return;

    event.preventDefault();
    state.scratching = true;
    state.startX = event.clientX;
    state.lastX = event.clientX;

    try {
      els.scratchArea.setPointerCapture(event.pointerId);
    } catch (_) {
      // Pointer capture is optional.
    }

    els.scissorHint.innerHTML = '<span class="scissor-icon" aria-hidden="true">✂</span><span>Keep sliding...</span>';
  }

  function handlePointerMove(event) {
    if (!state.scratching || state.revealed) return;

    event.preventDefault();

    const rect = els.scratchArea.getBoundingClientRect();
    const x = Math.max(rect.left, Math.min(rect.right, event.clientX));
    const localX = x - rect.left;

    const movement = Math.abs(x - (state.lastX ?? x));
    const normalizedMove = rect.width ? (movement / rect.width) * 100 : 0;

    state.lastX = x;

    // Direct horizontal movement increases the reveal.
    // A little extra is granted when the pointer is actively traveling through the bar.
    const boost = normalizedMove * 1.55;
    const sweepProgress = rect.width ? (localX / rect.width) * 12 : 0;

    setProgress(
      Math.max(
        state.progress + boost,
        Math.min(100, state.progress + sweepProgress * 0.025)
      )
    );
  }

  function handlePointerUp(event) {
    if (!state.scratching) return;

    state.scratching = false;

    try {
      els.scratchArea.releasePointerCapture(event.pointerId);
    } catch (_) {
      // Not all browsers support pointer capture.
    }

    if (!state.revealed) {
      els.scissorHint.innerHTML = '<span class="scissor-icon" aria-hidden="true">✂</span><span>Drag across the strip again</span>';
    }
  }

  function setProgress(value) {
    if (state.revealed) return;

    state.progress = Math.max(0, Math.min(100, value));
    els.progressBar.style.width = `${state.progress.toFixed(1)}%`;
    els.progressLabel.textContent = `${Math.round(state.progress)}%`;

    // Make the coating fade gradually instead of vanishing all at once.
    const opacity = Math.max(0, 1 - (state.progress / 100) * 1.08);
    els.scratchCoating.style.opacity = opacity.toFixed(3);

    if (state.progress >= 100) {
      revealCard();
    }
  }

  function revealCard() {
    if (state.revealed) return;

    state.revealed = true;
    state.scratching = false;
    state.progress = 100;

    els.scratchCoating.style.opacity = "0";
    els.progressBar.style.width = "100%";
    els.progressLabel.textContent = "100%";
    els.scissorHint.innerHTML = '<span class="scissor-icon" aria-hidden="true">✂</span><span>Revealed!</span>';
    els.revealedMessage.hidden = false;
    els.scratchAgain.hidden = false;

    els.modalDescription.textContent = "Your Easy Gold number is now visible.";
    fireConfetti();

    // Give the number a tiny emphasis animation.
    els.secretNumber.animate(
      [
        { transform: "scale(1)", opacity: 0.72 },
        { transform: "scale(1.08)", opacity: 1 },
        { transform: "scale(1)", opacity: 1 }
      ],
      {
        duration: 620,
        easing: "cubic-bezier(.2,.8,.2,1)"
      }
    );
  }

  function fireConfetti() {
    const layer = document.getElementById("confetti-layer");

    // Keep the animation light enough for phones.
    const colors = ["#008542", "#00a357", "#f4c542", "#ffd865", "#ffffff"];
    const count = 90;

    for (let i = 0; i < count; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";

      const left = Math.random() * 100;
      const width = 6 + Math.random() * 6;
      const height = 9 + Math.random() * 10;
      const duration = 1.8 + Math.random() * 1.7;
      const delay = Math.random() * 0.35;
      const drift = (Math.random() - 0.5) * 240;
      const spin = `${Math.round((Math.random() - 0.5) * 1000)}deg`;

      piece.style.left = `${left}%`;
      piece.style.width = `${width}px`;
      piece.style.height = `${height}px`;
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.setProperty("--fall-duration", `${duration}s`);
      piece.style.setProperty("--fall-delay", `${delay}s`);
      piece.style.setProperty("--drift", `${drift}px`);
      piece.style.setProperty("--spin", spin);

      layer.appendChild(piece);

      window.setTimeout(() => piece.remove(), (duration + delay + 0.25) * 1000);
    }
  }

  function makeFallbackCover(index) {
    const palettes = [
      ["#006a35", "#00a357", "#f4c542"],
      ["#005f36", "#0ca26a", "#ffd865"],
      ["#0a7143", "#00a16a", "#f2c24a"]
    ];

    const [a, b, c] = palettes[index % palettes.length];

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${a}"/>
            <stop offset="55%" stop-color="${b}"/>
            <stop offset="100%" stop-color="${c}"/>
          </linearGradient>
          <radialGradient id="r" cx="78%" cy="18%" r="55%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity=".24"/>
            <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="1200" height="760" fill="url(#g)"/>
        <circle cx="980" cy="140" r="340" fill="url(#r)"/>
        <circle cx="170" cy="700" r="290" fill="#ffffff" fill-opacity=".06"/>
        <path d="M-30 550 C280 360 540 740 1230 420" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="36"/>
        <text x="75" y="160" fill="#fff" font-size="70" font-family="Arial, sans-serif" font-weight="800">Easy Gold</text>
        <text x="78" y="225" fill="#fff" fill-opacity=".84" font-size="27" font-family="Arial, sans-serif">Classic scratch card</text>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }
})();
