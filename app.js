(() => {
  "use strict";

  const state = {
    cards: [],
    activeCard: null,
    scratching: false,
    revealed: false,
    progress: 0,
    horizontalTravel: 0,
    minX: Infinity,
    maxX: -Infinity,
    lastPoint: null,
    currentPoint: null,
    pointerId: null,
    particlesAt: 0
  };

  const el = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cache();
    bind();
    await loadCards();
  }

  function cache() {
    el.grid = document.getElementById("card-grid");
    el.empty = document.getElementById("empty-state");
    el.template = document.getElementById("card-template");

    el.modal = document.getElementById("modal");
    el.cardShell = document.getElementById("card-shell");
    el.frontImage = document.getElementById("front-image");
    el.realBackImage = document.getElementById("real-back-image");
    el.title = document.getElementById("modal-title");
    el.description = document.getElementById("modal-description");
    el.validity = document.getElementById("modal-validity");

    el.zone = document.getElementById("secret-zone");
    el.canvas = document.getElementById("scratch-canvas");
    el.ctx = el.canvas.getContext("2d", { willReadFrequently: true });
    el.scissor = document.getElementById("scissor");
    el.hint = document.getElementById("scratch-hint");

    el.statusText = document.getElementById("status-text");
    el.statusDistance = document.getElementById("status-distance");
    el.statusFill = document.getElementById("status-fill");
    el.success = document.getElementById("success-message");
    el.reset = document.getElementById("reset-button");
  }

  function bind() {
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-card-index]");
      if (trigger) openCard(Number(trigger.dataset.cardIndex));
      if (event.target.closest("[data-close-modal]")) closeModal();
    });

    el.reset.addEventListener("click", resetScratch);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && el.modal.classList.contains("open")) closeModal();
    });

    el.zone.addEventListener("pointerdown", onPointerDown, { passive: false });
    el.zone.addEventListener("pointermove", onPointerMove, { passive: false });
    el.zone.addEventListener("pointerup", onPointerUp, { passive: false });
    el.zone.addEventListener("pointercancel", onPointerUp, { passive: false });
  }

  async function loadCards() {
    try {
      const res = await fetch("cards.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`cards.json: HTTP ${res.status}`);
      const data = await res.json();
      state.cards = (Array.isArray(data) ? data : data.cards || []).map((card, i) => ({
        id: String(card.id ?? `card-${i + 1}`),
        name: String(card.name ?? `Easy Gold ${i + 1}`),
        description: String(card.description ?? "Scratch the strip to reveal the hidden number."),
        barNumber: String(card.barNumber ?? "0000 0000 0000"),
        validity: String(card.validity ?? "VALIDITY: 30 DAYS"),
        coverImage: String(card.coverImage ?? ""),
        accent: normalizeAccent(card.accent)
      }));
      renderCards();
    } catch (error) {
      console.error(error);
      state.cards = [];
      renderCards();
    }
  }

  function normalizeAccent(value) {
    if (typeof value !== "string") return "#008542";
    const v = value.trim();
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
    const named = {
      red: "#b4202a",
      green: "#008542",
      blue: "#1769aa",
      black: "#161616",
      gold: "#b08300",
      purple: "#6941a5",
      orange: "#c55b1a"
    };
    return named[v.toLowerCase()] || "#008542";
  }

  function renderCards() {
    el.grid.innerHTML = "";
    if (!state.cards.length) {
      el.empty.classList.remove("hidden");
      return;
    }
    el.empty.classList.add("hidden");

    const frag = document.createDocumentFragment();

    state.cards.forEach((card, index) => {
      const node = el.template.content.cloneNode(true);
      const article = node.querySelector(".claim-card");
      const image = node.querySelector(".thumb-image");
      const validity = node.querySelector(".thumb-validity");
      const name = node.querySelector(".card-name");
      const desc = node.querySelector(".card-description");
      const btn = node.querySelector(".claim-button");

      article.style.setProperty("--theme", card.accent);
      article.dataset.cardIndex = index;
      image.src = card.coverImage;
      image.alt = `${card.name} cover`;
      image.onerror = () => image.src = fallbackCover(card.accent);
      validity.textContent = card.validity;
      name.textContent = card.name;
      desc.textContent = card.description;
      btn.dataset.cardIndex = index;

      frag.appendChild(node);
    });

    el.grid.appendChild(frag);
  }

  function openCard(index) {
    const card = state.cards[index];
    if (!card) return;

    state.activeCard = card;
    applyTheme(card.accent);

    el.title.textContent = card.name;
    el.description.textContent = "Use the scissors to remove the silver coating from the hidden number.";
    el.validity.textContent = card.validity;

    el.frontImage.src = card.coverImage;
    el.frontImage.alt = `${card.name} front`;
    el.frontImage.onerror = () => el.frontImage.src = fallbackCover(card.accent);

    el.realBackImage.onerror = () => {
      el.realBackImage.onerror = null;
      el.realBackImage.src = fallbackBack();
    };

    resetScratch();
    el.cardShell.classList.remove("flipped");

    el.modal.classList.add("open");
    el.modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.cardShell.classList.add("flipped"));
    });
  }

  function closeModal() {
    el.modal.classList.remove("open");
    el.modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    state.activeCard = null;
    state.scratching = false;
  }

  function applyTheme(color) {
    document.documentElement.style.setProperty("--theme", color);
    document.documentElement.style.setProperty("--theme-dark", shade(color, -22));
    document.documentElement.style.setProperty("--theme-soft", tint(color, 88));
  }

  function resetScratch() {
    state.scratching = false;
    state.revealed = false;
    state.progress = 0;
    state.horizontalTravel = 0;
    state.minX = Infinity;
    state.maxX = -Infinity;
    state.lastPoint = null;
    state.pointerId = null;

    el.success.hidden = true;
    el.reset.hidden = true;
    el.scissor.classList.remove("active", "complete");
    el.hint.hidden = false;
    el.hint.textContent = "DRAG TO SCRATCH";
    el.statusText.textContent = "0% scratched";
    el.statusDistance.textContent = "Start at the left and sweep across";
    el.statusFill.style.width = "0%";

    resizeCanvas();
    drawScratchCoating();
  }

  function resizeCanvas() {
    const rect = el.zone.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    el.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    el.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    el.canvas.style.width = `${rect.width}px`;
    el.canvas.style.height = `${rect.height}px`;

    el.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawScratchCoating() {
    const rect = el.zone.getBoundingClientRect();
    const ctx = el.ctx;

    ctx.clearRect(0, 0, rect.width, rect.height);

    // Base material: looks more like a metallic / worn scratch patch than a flat gray div.
    const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
    gradient.addColorStop(0, "#d1d6d2");
    gradient.addColorStop(.47, "#a8b0ab");
    gradient.addColorStop(1, "#c4cac6");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Fine paper/foil grain.
    for (let i = 0; i < Math.floor(rect.width * 0.7); i++) {
      const x = Math.random() * rect.width;
      const y = Math.random() * rect.height;
      const len = 3 + Math.random() * 12;

      ctx.strokeStyle = Math.random() > .5 ? "rgba(255,255,255,.13)" : "rgba(58,68,63,.10)";
      ctx.lineWidth = .6 + Math.random() * .7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y + (Math.random() - .5) * 2);
      ctx.stroke();
    }

    // Cross scratches / print irregularity.
    ctx.globalAlpha = .12;
    ctx.strokeStyle = "#43504a";
    ctx.lineWidth = 1;
    for (let y = 5; y < rect.height; y += 7) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.random() * 1.5);
      ctx.lineTo(rect.width, y + (Math.random() - .5) * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Center instruction remains on the actual coating.
    ctx.fillStyle = "rgba(42,50,46,.74)";
    ctx.font = `900 ${Math.max(9, Math.min(12, rect.width / 32))}px Inter, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SCRATCH TO REVEAL", rect.width / 2, rect.height / 2);
  }

  function onPointerDown(event) {
    if (state.revealed || !state.activeCard) return;

    event.preventDefault();
    state.scratching = true;
    state.pointerId = event.pointerId;

    try { el.zone.setPointerCapture(event.pointerId); } catch (_) {}

    const p = pointInZone(event);
    state.lastPoint = p;
    state.minX = Math.min(state.minX, p.x);
    state.maxX = Math.max(state.maxX, p.x);

    el.scissor.classList.add("active");
    updateScissor(p);
    scratchAt(p.x, p.y, 10);
    emitScratchDust(p, 4);

    el.hint.hidden = true;
  }

  function onPointerMove(event) {
    if (!state.scratching || event.pointerId !== state.pointerId || state.revealed) return;

    event.preventDefault();

    const p = pointInZone(event);
    const last = state.lastPoint || p;

    // Draw a continuous "eraser" stroke so dragging feels like physically removing material.
    const distance = Math.hypot(p.x - last.x, p.y - last.y);
    drawScratchStroke(last, p, 11);

    state.horizontalTravel += Math.abs(p.x - last.x);
    state.minX = Math.min(state.minX, p.x);
    state.maxX = Math.max(state.maxX, p.x);
    state.lastPoint = p;

    updateScissor(p);

    if (performance.now() - state.particlesAt > 38) {
      emitScratchDust(p, 2);
      state.particlesAt = performance.now();
    }

    updateProgress();
  }

  function onPointerUp(event) {
    if (!state.scratching || event.pointerId !== state.pointerId) return;

    state.scratching = false;
    try { el.zone.releasePointerCapture(event.pointerId); } catch (_) {}

    if (!state.revealed) {
      el.statusDistance.textContent =
        state.maxX > state.minX && state.horizontalTravel > 40
          ? "Keep sweeping across the covered strip"
          : "Start at the left and make a long sweep";
    }
  }

  function pointInZone(event) {
    const r = el.zone.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(r.width, event.clientX - r.left)),
      y: Math.max(0, Math.min(r.height, event.clientY - r.top))
    };
  }

  function updateScissor(p) {
    el.scissor.style.left = `${p.x}px`;
    el.scissor.style.top = `${p.y}px`;
  }

  function drawScratchStroke(a, b, radius) {
    const ctx = el.ctx;
    const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      scratchAt(x, y, radius);
    }
  }

  function scratchAt(x, y, radius) {
    const ctx = el.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";

    // Slightly irregular scratch shape.
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 1.15, radius * .82, 0, 0, Math.PI * 2);
    ctx.fill();

    // Several tiny offsets make the abrasion less perfectly digital.
    ctx.beginPath();
    ctx.arc(x + (Math.random() - .5) * 5, y + (Math.random() - .5) * 4, radius * .34, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function updateProgress() {
    const r = el.zone.getBoundingClientRect();
    const width = Math.max(1, r.width);

    // Long physical sweep matters, not just repeated taps.
    const travelScore = Math.min(100, (state.horizontalTravel / (width * 1.05)) * 100);
    const spanScore = state.maxX > state.minX ? Math.min(100, ((state.maxX - state.minX) / width) * 100) : 0;

    // Measure how much of the coating has actually been removed.
    const pixelScore = canvasRevealPercent();

    // A long horizontal sweep contributes strongly; actual material removal contributes the rest.
    const progress = Math.min(100, pixelScore * .66 + travelScore * .24 + spanScore * .10);

    state.progress = progress;
    el.statusFill.style.width = `${progress}%`;
    el.statusText.textContent = `${Math.round(progress)}% scratched`;

    if (spanScore < 28) {
      el.statusDistance.textContent = "Move farther across the strip";
    } else if (spanScore < 72) {
      el.statusDistance.textContent = "Good — keep sliding through the card";
    } else {
      el.statusDistance.textContent = "Almost there — finish the long sweep";
    }

    // Finish threshold is intentionally high so the card cannot reveal from a few taps.
    if (pixelScore >= 78 && spanScore >= 78 && state.horizontalTravel >= width * .92) {
      reveal();
    }
  }

  function canvasRevealPercent() {
    const canvas = el.canvas;
    const w = canvas.width;
    const h = canvas.height;
    const sampleStep = Math.max(2, Math.round(Math.min(w, h) / 65));
    const pixels = el.ctx.getImageData(0, 0, w, h).data;

    let total = 0;
    let transparent = 0;

    for (let y = 0; y < h; y += sampleStep) {
      for (let x = 0; x < w; x += sampleStep) {
        const alpha = pixels[(y * w + x) * 4 + 3];
        total++;
        if (alpha < 55) transparent++;
      }
    }

    return total ? (transparent / total) * 100 : 0;
  }

  function reveal() {
    if (state.revealed) return;

    state.revealed = true;
    state.scratching = false;
    state.progress = 100;

    el.ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
    el.statusFill.style.width = "100%";
    el.statusText.textContent = "100% revealed";
    el.statusDistance.textContent = "Scratch complete";
    el.scissor.classList.add("complete");
    el.hint.hidden = true;
    el.success.hidden = false;
    el.reset.hidden = false;
    el.description.textContent = `Your card number is ${state.activeCard.barNumber}.`;

    // Magical "rub-off" dust stays around the scratch area rather than falling from the top.
    const r = el.zone.getBoundingClientRect();
    for (let i = 0; i < 38; i++) {
      const point = {
        x: Math.random() * r.width,
        y: Math.random() * r.height
      };
      emitScratchDust(point, 1, true);
    }
  }

  function emitScratchDust(p, count = 2, celebratory = false) {
    const zoneRect = el.zone.getBoundingClientRect();

    for (let i = 0; i < count; i++) {
      const dot = document.createElement("span");
      dot.className = "fx-particle";

      const startX = zoneRect.left + p.x;
      const startY = zoneRect.top + p.y;
      const angle = Math.random() * Math.PI * 2;
      const distance = celebratory ? 22 + Math.random() * 62 : 8 + Math.random() * 25;

      dot.style.left = `${startX}px`;
      dot.style.top = `${startY}px`;
      dot.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
      dot.style.setProperty("--y", `${Math.sin(angle) * distance}px`);
      dot.style.setProperty("--d", `${.35 + Math.random() * .5}s`);

      document.getElementById("fx-layer").appendChild(dot);
      setTimeout(() => dot.remove(), 950);
    }
  }

  window.addEventListener("resize", () => {
    if (el.modal.classList.contains("open") && !state.scratching) {
      resizeCanvas();
      if (!state.revealed) drawScratchCoating();
    }
  });

  function shade(hex, percent) {
    const { r, g, b } = hexRgb(hex);
    const factor = 1 + percent / 100;
    return rgbHex(
      Math.round(Math.max(0, Math.min(255, r * factor))),
      Math.round(Math.max(0, Math.min(255, g * factor))),
      Math.round(Math.max(0, Math.min(255, b * factor)))
    );
  }

  function tint(hex, amount) {
    const { r, g, b } = hexRgb(hex);
    const p = amount / 100;
    return rgbHex(
      Math.round(r + (255 - r) * p),
      Math.round(g + (255 - g) * p),
      Math.round(b + (255 - b) * p)
    );
  }

  function hexRgb(hex) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    return {
      r: parseInt(h.slice(0,2), 16) || 0,
      g: parseInt(h.slice(2,4), 16) || 0,
      b: parseInt(h.slice(4,6), 16) || 0
    };
  }

  function rgbHex(r, g, b) {
    return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
  }

  function fallbackCover(accent) {
    const a = normalizeAccent(accent);
    const b = tint(a, 35);
    const c = "#f3c84a";
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${a}"/><stop offset=".6" stop-color="${b}"/><stop offset="1" stop-color="${c}"/>
        </linearGradient></defs>
        <rect width="1200" height="760" fill="url(#g)"/>
        <path d="M-40 560 C300 330 620 770 1240 350" stroke="#fff" stroke-width="50" stroke-opacity=".13" fill="none"/>
        <text x="82" y="175" fill="#fff" font-size="76" font-family="Arial" font-weight="800">Easy Gold</text>
        <text x="85" y="232" fill="#fff" fill-opacity=".85" font-size="28" font-family="Arial" font-weight="600">CLASSIC RECHARGE CARD</text>
      </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function fallbackBack() {
    return fallbackCover(state.activeCard ? state.activeCard.accent : "#008542");
  }
})();
