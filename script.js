/* ============================================================
   SOL-NET TERMINAL — APPLICATION LOGIC
   ============================================================ */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

(function () {
  "use strict";

  /* ---------------------------------------------------------
     0. PROCEDURAL TEXTURE ENGINE
     Generates realistic-looking surface, bump and cloud maps
     entirely on <canvas> — no external image assets required,
     so every body renders with genuine 3D shading offline.
  --------------------------------------------------------- */
  const TextureFactory = (() => {
    const cache = new Map();

    function rand(seed) {
      // small deterministic PRNG so each body looks stable across reloads
      let s = seed % 2147483647;
      if (s <= 0) s += 2147483646;
      return function () {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
      };
    }

    function mkCanvas(w, h) {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      return c;
    }

    function lerpColor(a, b, t) {
      return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
      ];
    }

    function hexToRgb(hex) {
      return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    }

    // base mottled noise fill: gives every surface a non-flat, organic look
    function paintMottle(ctx, w, h, rng, baseRgb, varAmt, blobCount) {
      ctx.fillStyle = `rgb(${baseRgb[0]},${baseRgb[1]},${baseRgb[2]})`;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < blobCount; i++) {
        const x = rng() * w, y = rng() * h;
        const r = (0.02 + rng() * 0.09) * w;
        const shade = (rng() - 0.5) * varAmt;
        const c = [
          clamp255(baseRgb[0] + shade),
          clamp255(baseRgb[1] + shade * 0.9),
          clamp255(baseRgb[2] + shade * 0.8),
        ];
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.55)`);
        grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function clamp255(v) { return Math.max(0, Math.min(255, Math.round(v))); }

    function paintCraters(ctx, w, h, rng, count, rimRgb, floorDarken) {
      for (let i = 0; i < count; i++) {
        const x = rng() * w, y = rng() * h;
        const r = (0.006 + Math.pow(rng(), 2.4) * 0.085) * w;
        if (r < 1.2) continue;
        // dark floor
        const floorGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
        floorGrad.addColorStop(0, `rgba(0,0,0,${0.32 * floorDarken})`);
        floorGrad.addColorStop(0.7, `rgba(0,0,0,${0.18 * floorDarken})`);
        floorGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = floorGrad;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        // bright rim (lit edge, offset to fake a light direction)
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = `rgb(${rimRgb[0]},${rimRgb[1]},${rimRgb[2]})`;
        ctx.lineWidth = Math.max(0.6, r * 0.14);
        ctx.beginPath();
        ctx.arc(x - r * 0.12, y - r * 0.12, r * 0.92, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    function paintBands(ctx, w, h, rng, palette, turbulence) {
      const bandCount = palette.length;
      const bandH = h / bandCount;
      for (let i = 0; i < bandCount; i++) {
        const y0 = i * bandH;
        const grad = ctx.createLinearGradient(0, y0, 0, y0 + bandH);
        grad.addColorStop(0, palette[i]);
        grad.addColorStop(1, palette[(i + 1) % bandCount]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, y0, w, bandH + 1);
      }
      // turbulent streaks across the bands (storms / jet streams)
      ctx.globalCompositeOperation = "overlay";
      for (let i = 0; i < turbulence; i++) {
        const y = rng() * h;
        const amp = (4 + rng() * 18);
        const len = w * (0.3 + rng() * 0.7);
        const x0 = rng() * w;
        ctx.strokeStyle = rng() > 0.5 ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)";
        ctx.lineWidth = 1.5 + rng() * 4;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        for (let x = 0; x < len; x += 14) {
          ctx.lineTo(x0 + x, y + Math.sin(x * 0.05 + i) * amp);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    function paintGreatSpot(ctx, w, h, rng, x, y, rw, rh, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(rw, rh);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function paintContinents(ctx, w, h, rng, landRgb, count) {
      for (let i = 0; i < count; i++) {
        const cx = rng() * w, cy = rng() * h * 0.8 + h * 0.1;
        const pts = 8 + Math.floor(rng() * 6);
        const baseR = (0.06 + rng() * 0.12) * w;
        ctx.beginPath();
        for (let p = 0; p <= pts; p++) {
          const ang = (p / pts) * Math.PI * 2;
          const r = baseR * (0.55 + rng() * 0.7);
          const px = cx + Math.cos(ang) * r;
          const py = cy + Math.sin(ang) * r * 0.7;
          if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(${landRgb[0]},${landRgb[1]},${landRgb[2]},0.85)`;
        ctx.fill();
      }
    }

    function paintClouds(ctx, w, h, rng, count) {
      for (let i = 0; i < count; i++) {
        const x = rng() * w, y = rng() * h;
        const r = (0.02 + rng() * 0.05) * w;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, "rgba(255,255,255,0.55)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }

    function paintPolarCaps(ctx, w, h, color, coverage) {
      const capH = h * coverage;
      let grad = ctx.createLinearGradient(0, 0, 0, capH);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, capH);
      grad = ctx.createLinearGradient(0, h, 0, h - capH);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, h - capH, w, capH);
    }

    function vignetteShade(ctx, w, h) {
      // subtle equirect shading so the sphere reads with more depth even
      // before lighting is applied
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(0,0,0,0.18)");
      grad.addColorStop(0.5, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.22)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    /* ---- per-body-type generators, keyed by a "texture" tag ---- */
    const generators = {
      sun(ctx, w, h, rng) {
        paintMottle(ctx, w, h, rng, [255, 200, 60], 70, 90);
        // granulation + flare loops
        for (let i = 0; i < 40; i++) {
          const x = rng() * w, y = rng() * h;
          const r = (0.01 + rng() * 0.04) * w;
          const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
          grad.addColorStop(0, "rgba(255,255,220,0.5)");
          grad.addColorStop(1, "rgba(255,140,0,0)");
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
      },
      "rocky-grey"(ctx, w, h, rng) {
        paintMottle(ctx, w, h, rng, [150, 146, 138], 26, 70);
        paintCraters(ctx, w, h, rng, 130, [205, 200, 190], 1);
        vignetteShade(ctx, w, h);
      },
      "venus-clouds"(ctx, w, h, rng) {
        paintMottle(ctx, w, h, rng, [222, 196, 138], 30, 60);
        paintBands(ctx, w, h, rng, [
          "rgba(235,210,150,0.5)", "rgba(210,180,120,0.5)",
          "rgba(240,220,170,0.5)", "rgba(200,165,105,0.5)",
        ], 30);
        vignetteShade(ctx, w, h);
      },
      "earth-like"(ctx, w, h, rng) {
        paintMottle(ctx, w, h, rng, [22, 70, 120], 22, 40);
        paintContinents(ctx, w, h, rng, [58, 110, 58], 9);
        paintContinents(ctx, w, h, rng, [120, 140, 70], 5);
        paintPolarCaps(ctx, w, h, "rgba(235,245,250,0.9)", 0.12);
        paintClouds(ctx, w, h, rng, 70);
        vignetteShade(ctx, w, h);
      },
      "mars-like"(ctx, w, h, rng) {
        paintMottle(ctx, w, h, rng, [165, 78, 42], 30, 80);
        paintCraters(ctx, w, h, rng, 90, [210, 140, 100], 0.8);
        paintPolarCaps(ctx, w, h, "rgba(245,240,235,0.85)", 0.08);
        vignetteShade(ctx, w, h);
      },
      "jupiter-bands"(ctx, w, h, rng) {
        paintBands(ctx, w, h, rng, [
          "#e3c8a0", "#c79a66", "#e8d2ab", "#a9744a",
          "#f0ddb8", "#bb8a58", "#e3c8a0", "#caa274",
        ], 70);
        paintGreatSpot(ctx, w, h, rng, w * 0.32, h * 0.62, w * 0.09, h * 0.045, "rgba(190,90,60,0.65)");
        vignetteShade(ctx, w, h);
      },
      "saturn-bands"(ctx, w, h, rng) {
        paintBands(ctx, w, h, rng, [
          "#e9dcb8", "#d8c79a", "#ecdfc0", "#cdb988", "#e9dcb8",
        ], 40);
        vignetteShade(ctx, w, h);
      },
      "ice-giant-cyan"(ctx, w, h, rng) {
        paintMottle(ctx, w, h, rng, [120, 205, 208], 20, 50);
        paintBands(ctx, w, h, rng, [
          "rgba(140,215,218,0.4)", "rgba(100,190,195,0.4)", "rgba(160,225,225,0.4)",
        ], 18);
        vignetteShade(ctx, w, h);
      },
      "ice-giant-blue"(ctx, w, h, rng) {
        paintMottle(ctx, w, h, rng, [55, 90, 220], 24, 60);
        paintBands(ctx, w, h, rng, [
          "rgba(70,100,225,0.4)", "rgba(40,70,190,0.4)", "rgba(90,120,235,0.4)",
        ], 26);
        vignetteShade(ctx, w, h);
      },
      "dwarf-icy"(ctx, w, h, rng) {
        paintMottle(ctx, w, h, rng, [196, 178, 158], 26, 60);
        paintCraters(ctx, w, h, rng, 60, [225, 215, 205], 0.6);
        paintPolarCaps(ctx, w, h, "rgba(240,235,228,0.5)", 0.1);
        vignetteShade(ctx, w, h);
      },
      /* ---- moon textures ---- */
      "cratered-grey"(ctx, w, h, rng) {
        paintMottle(ctx, w, h, rng, [165, 162, 158], 22, 70);
        paintCraters(ctx, w, h, rng, 160, [205, 202, 196], 1);
        vignetteShade(ctx, w, h);
      },
      "cratered-tan"(ctx, w, h, rng) {
        paintMottle(ctx, w, h, rng, [190, 172, 140], 22, 60);
        paintCraters(ctx, w, h, rng, 120, [220, 205, 175], 0.9);
        vignetteShade(ctx, w, h);
      },
      "cratered-dark"(ctx, w, h, rng) {
        paintMottle(ctx, w, h, rng, [95, 88, 80], 18, 70);
        paintCraters(ctx, w, h, rng, 170, [140, 132, 120], 1);
        vignetteShade(ctx, w, h);
      },
      "asteroid-dark"(ctx, w, h, rng) {
        paintMottle(ctx, w, h, rng, [80, 74, 68], 24, 90);
        paintCraters(ctx, w, h, rng, 90, [120, 112, 100], 1);
        vignetteShade(ctx, w, h);
      },
      "icy-white"(ctx, w, h, rng) {
        paintMottle(ctx, w, h, rng, [225, 232, 235], 14, 50);
        paintCraters(ctx, w, h, rng, 50, [245, 248, 250], 0.4);
        // crack lines for Europa-style terrain
        ctx.strokeStyle = "rgba(150,120,110,0.35)";
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 14; i++) {
          ctx.beginPath();
          let x = rng() * w, y = rng() * h;
          ctx.moveTo(x, y);
          for (let s = 0; s < 6; s++) {
            x += (rng() - 0.5) * w * 0.18;
            y += (rng() - 0.5) * h * 0.1;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        vignetteShade(ctx, w, h);
      },
      "icy-grey"(ctx, w, h, rng) {
        paintMottle(ctx, w, h, rng, [185, 188, 192], 16, 60);
        paintCraters(ctx, w, h, rng, 80, [215, 217, 220], 0.6);
        vignetteShade(ctx, w, h);
      },
      "icy-pink"(ctx, w, h, rng) {
        paintMottle(ctx, w, h, rng, [205, 180, 185], 18, 55);
        paintCraters(ctx, w, h, rng, 40, [225, 205, 208], 0.5);
        vignetteShade(ctx, w, h);
      },
      "volcanic-yellow"(ctx, w, h, rng) {
        paintMottle(ctx, w, h, rng, [220, 200, 90], 36, 90);
        for (let i = 0; i < 22; i++) {
          const x = rng() * w, y = rng() * h;
          const r = (0.01 + rng() * 0.035) * w;
          const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
          grad.addColorStop(0, "rgba(255,90,30,0.7)");
          grad.addColorStop(1, "rgba(255,90,30,0)");
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        vignetteShade(ctx, w, h);
      },
      "hazy-orange"(ctx, w, h, rng) {
        paintBands(ctx, w, h, rng, [
          "#e8a85a", "#d9924a", "#eab36a", "#cf8842",
        ], 12);
        vignetteShade(ctx, w, h);
      },
    };

    function getKey(tag, seed, w, h) { return tag + "|" + seed + "|" + w + "x" + h; }

    function generate(tag, seed, w = 512, h = 256) {
      const key = getKey(tag, seed, w, h);
      if (cache.has(key)) return cache.get(key);
      const canvas = mkCanvas(w, h);
      const ctx = canvas.getContext("2d");
      const rng = rand(seed * 9973 + 17);
      const fn = generators[tag] || generators["rocky-grey"];
      fn(ctx, w, h, rng);
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      cache.set(key, tex);
      return tex;
    }

    // bump map derived from the same seed: brighter = raised, for cheap fake relief
    function generateBump(tag, seed, w = 512, h = 256) {
      const key = "bump|" + getKey(tag, seed, w, h);
      if (cache.has(key)) return cache.get(key);
      const canvas = mkCanvas(w, h);
      const ctx = canvas.getContext("2d");
      const rng = rand(seed * 7777 + 3);
      ctx.fillStyle = "#888"; ctx.fillRect(0, 0, w, h);
      const craterish = ["rocky-grey", "mars-like", "dwarf-icy", "cratered-grey", "cratered-tan", "cratered-dark", "asteroid-dark", "icy-grey", "icy-white", "icy-pink"];
      if (craterish.includes(tag)) {
        paintCraters(ctx, w, h, rng, 140, [40, 40, 40], 1.6);
      } else {
        paintMottle(ctx, w, h, rng, [136, 136, 136], 50, 60);
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      cache.set(key, tex);
      return tex;
    }

    return { generate, generateBump };
  })();

  /* ---------------------------------------------------------
     1. BOOT SEQUENCE
  --------------------------------------------------------- */
  const bootLines = [
    "INITIALIZING SOL-NET DEEP SPACE TERMINAL...",
    "LOADING DECLASSIFIED PLANETARY ARCHIVE...",
    "CALIBRATING LIGHT-SPEED TIMING MODULE [c = 299,792.458 km/s]",
    "ESTABLISHING ORBITAL TELEMETRY...........[OK]",
    "DECRYPTING SECTOR SOL-3 COORDINATES.......[OK]",
    "RENDERING 3D STARFIELD....................[OK]",
    "AWAITING OPERATOR AUTHORIZATION...",
  ];

  const bootTextEl = document.getElementById("boot-text");
  const bootBarFill = document.getElementById("boot-bar-fill");
  const enterBtn = document.getElementById("enter-btn");
  const bootScreen = document.getElementById("boot-screen");
  const appEl = document.getElementById("app");

  let bootProgress = 0;
  function typeLine(lineIndex) {
    if (lineIndex >= bootLines.length) {
      bootBarFill.style.width = "100%";
      setTimeout(() => {
        bootScreen.classList.add("hidden");
        enterBtn.classList.remove("hidden");
      }, 350);
      return;
    }
    const line = bootLines[lineIndex];
    let charIndex = 0;
    const typer = setInterval(() => {
      bootTextEl.textContent += line[charIndex];
      charIndex++;
      if (charIndex >= line.length) {
        clearInterval(typer);
        bootTextEl.textContent += "\n";
        bootProgress = ((lineIndex + 1) / bootLines.length) * 100;
        bootBarFill.style.width = bootProgress + "%";
        setTimeout(() => typeLine(lineIndex + 1), 180);
      }
    }, 14);
  }
  typeLine(0);

  enterBtn.addEventListener("click", () => {
    enterBtn.classList.add("hidden");
    appEl.classList.remove("hidden");
    initScene();
    initUI();
    initClock();
    initGalaxyCanvas();
  });

  /* ---------------------------------------------------------
     2. CLOCK
  --------------------------------------------------------- */
  function initClock() {
    const clockEl = document.getElementById("hud-clock");
    function tick() {
      const now = new Date();
      clockEl.textContent = now.toUTCString().split(" ")[4] + " UTC";
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ---------------------------------------------------------
     3. INFO DRAWER
  --------------------------------------------------------- */
  function initUI() {
    const drawer = document.getElementById("info-drawer");
    document.getElementById("info-toggle").addEventListener("click", () => {
      drawer.classList.toggle("hidden");
    });
    document.getElementById("info-close").addEventListener("click", () => {
      drawer.classList.add("hidden");
    });

    buildTargetStrip();
    buildFormulaGrid();
    buildGalaxyFacts();
    bindNav();
    bindSwipe();
    renderDossier(0, false);

    const moonCloseBtn = document.getElementById("moon-close");
    if (moonCloseBtn) {
      moonCloseBtn.addEventListener("click", () => {
        closeMoonDossier();
        flyToBody(currentIndex);
      });
    }
  }

  function buildTargetStrip() {
    const strip = document.getElementById("target-strip");
    BODIES.forEach((b, i) => {
      const dot = document.createElement("button");
      dot.className = "target-dot" + (i === 0 ? " active" : "");
      dot.textContent = b.name;
      dot.addEventListener("click", () => selectBody(i));
      strip.appendChild(dot);
    });
  }

  function buildFormulaGrid() {
    const grid = document.getElementById("formula-grid");
    FORMULAS.forEach((f) => {
      const card = document.createElement("div");
      card.className = "formula-card";
      card.innerHTML = `
        <div class="formula-tag">${f.tag}</div>
        <h3>${f.title}</h3>
        <div class="formula-expr">${f.formula}</div>
        <p>${f.desc}</p>
      `;
      grid.appendChild(card);
    });
  }

  function buildGalaxyFacts() {
    const grid = document.getElementById("galaxy-facts");
    GALAXY_FACTS.forEach(([k, v]) => {
      const cell = document.createElement("div");
      cell.className = "gfact";
      cell.innerHTML = `<span class="d-key">${k}</span><span class="d-val">${v}</span>`;
      grid.appendChild(cell);
    });
  }

  /* ---------------------------------------------------------
     4. DOSSIER RENDERING
  --------------------------------------------------------- */
  let currentIndex = 0;

  function renderDossier(index, glitch) {
    currentIndex = ((index % BODIES.length) + BODIES.length) % BODIES.length;
    const b = BODIES[currentIndex];

    document.getElementById("d-index").textContent = String(currentIndex).padStart(2, "0");
    document.getElementById("d-class").textContent = b.classification;
    const title = document.getElementById("d-name");
    title.textContent = b.name;
    document.getElementById("d-tagline").textContent = b.tagline;
    document.getElementById("d-note").textContent = "// " + b.note;

    const grid = document.getElementById("d-grid");
    grid.innerHTML = "";
    b.stats.forEach(([k, v]) => {
      const row = document.createElement("div");
      row.className = "d-row";
      row.innerHTML = `<span class="d-key">${k}</span><span class="d-val">${v}</span>`;
      grid.appendChild(row);
    });

    document.querySelectorAll(".target-dot").forEach((d, i) => {
      d.classList.toggle("active", i === currentIndex);
    });

    if (glitch !== false) {
      title.classList.remove("glitching");
      void title.offsetWidth;
      title.classList.add("glitching");
    }

    document.getElementById("coord-tag").textContent =
      "X:" + (1000 + currentIndex * 137).toString().padStart(4, "0") +
      " Y:" + (2400 - currentIndex * 88).toString().padStart(4, "0") +
      " Z:" + (currentIndex * 391).toString().padStart(4, "0");
  }

  function bindNav() {
    document.getElementById("nav-prev").addEventListener("click", () => selectBody(currentIndex - 1));
    document.getElementById("nav-next").addEventListener("click", () => selectBody(currentIndex + 1));
    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") selectBody(currentIndex - 1);
      if (e.key === "ArrowRight") selectBody(currentIndex + 1);
    });
  }

  function bindSwipe() {
    const dossier = document.getElementById("dossier");
    let startX = 0, startY = 0, tracking = false;

    function onStart(x, y) { startX = x; startY = y; tracking = true; }
    function onEnd(x, y) {
      if (!tracking) return;
      tracking = false;
      const dx = x - startX, dy = y - startY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) selectBody(currentIndex + 1);
        else selectBody(currentIndex - 1);
      }
    }

    dossier.addEventListener("touchstart", (e) => onStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    dossier.addEventListener("touchend", (e) => onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY), { passive: true });

    dossier.addEventListener("mousedown", (e) => onStart(e.clientX, e.clientY));
    window.addEventListener("mouseup", (e) => { if (tracking) onEnd(e.clientX, e.clientY); });

    // also allow swipe (navigate) or tap (select) across the whole viewport canvas
    const canvasEl = document.getElementById("scene-canvas");
    let canvasStartX = 0, canvasStartY = 0, canvasTracking = false;
    canvasEl.addEventListener("touchstart", (e) => {
      canvasStartX = e.touches[0].clientX; canvasStartY = e.touches[0].clientY;
      canvasTracking = true;
    }, { passive: true });
    canvasEl.addEventListener("touchend", (e) => {
      if (!canvasTracking) return;
      canvasTracking = false;
      const endX = e.changedTouches[0].clientX, endY = e.changedTouches[0].clientY;
      const dx = endX - canvasStartX, dy = endY - canvasStartY;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) selectBody(currentIndex + 1);
        else selectBody(currentIndex - 1);
      } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
        // treat as a tap: raycast for a planet under the finger
        onCanvasClick({ clientX: endX, clientY: endY });
      }
    }, { passive: true });
  }

  function selectBody(index) {
    renderDossier(index, true);
    flyToBody(currentIndex);
  }

  /* ---------------------------------------------------------
     5. THREE.JS SOLAR SYSTEM SCENE
  --------------------------------------------------------- */
  let renderer, scene, camera, controls, raycaster, mouse;
  let planetMeshes = [];      // sun + planets (clickable, index-matched to BODIES)
  let moonGroups = [];        // per-body group holding that body's moon meshes (index-matched to BODIES)
  let sunMesh;
  let sunLight;
  let warpStreaks;
  let targetCameraPos = null;
  let targetLookAt = null;
  let focusedPlanetIndex = -1;  // which planet currently has its moons revealed, -1 = none
  let focusedMoon = null;        // { planetIndex, moonIndex } while a moon dossier is open
  let warpBoost = 0;             // 0..1, drives the "traveling through space" streak effect
  let warpTarget = 0;
  const clock = new THREE.Clock();

  function makeGlowSprite(color, size) {
    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.25, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(size, size, 1);
    return sprite;
  }

  function initScene() {
    const canvas = document.getElementById("scene-canvas");
    const viewport = document.querySelector(".viewport");

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x04070a, 0.0016);

    camera = new THREE.PerspectiveCamera(55, viewport.clientWidth / viewport.clientHeight, 0.1, 2000);
    camera.position.set(0, 22, 48);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    renderer.setClearColor(0x04070a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.4;
    controls.maxDistance = 140;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;

    // lighting — a warm sun point light plus a soft fill so night-sides
    // of textured planets aren't pitch black (sells the "3D sphere" look)
    scene.add(new THREE.AmbientLight(0x223344, 0.55));
    const hemi = new THREE.HemisphereLight(0x88aaff, 0x0a0805, 0.25);
    scene.add(hemi);
    sunLight = new THREE.PointLight(0xfff2cc, 4.2, 500, 1.35);
    scene.add(sunLight);

    // starfield (ambient + a "warp streak" layer used during travel)
    scene.add(makeStarfield());
    warpStreaks = makeWarpStreaks();
    scene.add(warpStreaks);

    // sun — procedurally textured, emissive so it reads as a light source
    const sunData = BODIES[0];
    const sunTex = TextureFactory.generate(sunData.texture, 1, 512, 256);
    const sunGeo = new THREE.SphereGeometry(sunData.size, 48, 48);
    const sunMat = new THREE.MeshStandardMaterial({
      map: sunTex,
      emissive: 0xffae00,
      emissiveMap: sunTex,
      emissiveIntensity: 1.4,
      roughness: 1,
    });
    sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.userData.bodyIndex = 0;
    scene.add(sunMesh);
    scene.add(makeGlowSprite("rgba(255,200,80,0.9)", sunData.size * 6));
    scene.add(makeGlowSprite("rgba(255,150,40,0.5)", sunData.size * 10));

    // planets + orbit rings + moon systems
    planetMeshes = [sunMesh];
    moonGroups = [null];
    for (let i = 1; i < BODIES.length; i++) {
      const b = BODIES[i];

      const ringGeo = new THREE.RingGeometry(b.orbitRadius - 0.03, b.orbitRadius + 0.03, 128);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x0a8f5c, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
      const orbitLine = new THREE.Mesh(ringGeo, ringMat);
      orbitLine.rotation.x = Math.PI / 2;
      scene.add(orbitLine);

      const seed = i + 1;
      const surfaceTex = TextureFactory.generate(b.texture, seed, 512, 256);
      const bumpTex = TextureFactory.generateBump(b.texture, seed, 512, 256);
      const geo = new THREE.SphereGeometry(b.size, 48, 48);
      const mat = new THREE.MeshStandardMaterial({
        map: surfaceTex,
        bumpMap: bumpTex,
        bumpScale: b.size * 0.045,
        emissive: b.emissive,
        emissiveIntensity: 0.18,
        roughness: 0.92,
        metalness: 0.04,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.x = b.orbitRadius;
      mesh.userData.bodyIndex = i;
      mesh.userData.orbitRadius = b.orbitRadius;
      mesh.userData.speed = b.speed * 0.05;
      mesh.userData.angle = Math.random() * Math.PI * 2;
      mesh.userData.spin = 0.4 + Math.random() * 0.6;
      mesh.castShadow = false;

      // subtle cloud / atmosphere shell for the more "alive"-looking worlds
      if (b.texture === "earth-like" || b.texture === "venus-clouds") {
        const atmoGeo = new THREE.SphereGeometry(b.size * 1.035, 40, 40);
        const atmoMat = new THREE.MeshBasicMaterial({
          color: b.texture === "earth-like" ? 0x9fd0ff : 0xe8d2a0,
          transparent: true,
          opacity: 0.14,
          side: THREE.FrontSide,
          depthWrite: false,
        });
        mesh.add(new THREE.Mesh(atmoGeo, atmoMat));
      }

      if (b.ring) {
        const rTex = makePlanetRingTexture(b.color);
        const rGeo = new THREE.RingGeometry(b.size * 1.4, b.size * 2.3, 64);
        // map the ring texture radially across the geometry
        const ringPos = rGeo.attributes.position;
        const ringUv = rGeo.attributes.uv;
        const v3 = new THREE.Vector3();
        for (let u = 0; u < ringPos.count; u++) {
          v3.fromBufferAttribute(ringPos, u);
          const dist = v3.length();
          const t = (dist - b.size * 1.4) / (b.size * 0.9);
          ringUv.setXY(u, t, 1);
        }
        const rMat = new THREE.MeshBasicMaterial({ map: rTex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
        const r = new THREE.Mesh(rGeo, rMat);
        r.rotation.x = Math.PI / 2.3;
        mesh.add(r);
      }

      scene.add(mesh);
      planetMeshes.push(mesh);

      // --- moon system for this planet (hidden until the planet is focused) ---
      const moons = b.moons || [];
      const group = new THREE.Group();
      group.visible = false;
      group.userData.planetIndex = i;
      if (moons.length) {
        moons.forEach((m, mi) => {
          const mSeed = (i + 1) * 100 + mi + 1;
          const mTex = TextureFactory.generate(m.texture, mSeed, 256, 128);
          const mBump = TextureFactory.generateBump(m.texture, mSeed, 256, 128);
          const mGeo = new THREE.SphereGeometry(m.size, 28, 28);
          const mMat = new THREE.MeshStandardMaterial({
            map: mTex,
            bumpMap: mBump,
            bumpScale: m.size * 0.06,
            roughness: 0.95,
            metalness: 0.02,
          });
          const moonMesh = new THREE.Mesh(mGeo, mMat);
          moonMesh.userData.planetIndex = i;
          moonMesh.userData.moonIndex = mi;
          moonMesh.userData.orbitRadius = m.orbitRadius;
          moonMesh.userData.speed = m.speed * 0.6;
          moonMesh.userData.angle = Math.random() * Math.PI * 2;
          moonMesh.userData.spin = 0.3 + Math.random() * 0.5;
          moonMesh.userData.isMoon = true;

          const mRingGeo = new THREE.RingGeometry(m.orbitRadius - 0.012, m.orbitRadius + 0.012, 96);
          const mRingMat = new THREE.MeshBasicMaterial({ color: 0xffb000, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
          const mOrbit = new THREE.Mesh(mRingGeo, mRingMat);
          mOrbit.rotation.x = Math.PI / 2;

          group.add(mOrbit);
          group.add(moonMesh);
        });
      }
      mesh.add(group);
      moonGroups.push(group);
    }

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    canvas.addEventListener("click", onCanvasClick);

    window.addEventListener("resize", onResize);

    animate();
  }

  // generates a banded, semi-transparent ring texture (radial gradient strip)
  function makePlanetRingTexture(baseColorHex) {
    const w = 256, h = 16;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    const base = [(baseColorHex >> 16) & 255, (baseColorHex >> 8) & 255, baseColorHex & 255];
    for (let x = 0; x < w; x++) {
      const t = x / w;
      const band = Math.sin(t * 38) * 0.5 + Math.sin(t * 11 + 1.3) * 0.3;
      const gapAlpha = 0.35 + 0.5 * Math.abs(band);
      const shade = 1 - t * 0.25;
      ctx.fillStyle = `rgba(${Math.round(base[0] * shade)},${Math.round(base[1] * shade)},${Math.round(base[2] * shade)},${gapAlpha.toFixed(2)})`;
      ctx.fillRect(x, 0, 1, h);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeStarfield() {
    const count = window.innerWidth < 640 ? 2200 : 5000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 200 + Math.random() * 600;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xbfe8df, size: 0.6, sizeAttenuation: true });
    return new THREE.Points(geo, mat);
  }

  // a second star layer rendered as camera-relative streaks, stretched along
  // the travel axis as warpBoost rises — this is what sells "the spaceship
  // is moving through space" rather than just sitting still looking at it
  function makeWarpStreaks() {
    const count = window.innerWidth < 640 ? 500 : 900;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 18 + Math.random() * 90;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      seeds[i] = Math.random();
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
    const mat = new THREE.PointsMaterial({
      color: 0xeaffff,
      size: 1.1,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.userData.baseGeo = geo;
    return pts;
  }

  function onCanvasClick(evt) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // moons take priority when visible, since they sit "in front of" / near their planet
    if (focusedPlanetIndex > -1 && moonGroups[focusedPlanetIndex]) {
      const activeMoons = moonGroups[focusedPlanetIndex].children.filter((c) => c.userData.isMoon);
      const moonHits = raycaster.intersectObjects(activeMoons);
      if (moonHits.length > 0) {
        const { planetIndex, moonIndex } = moonHits[0].object.userData;
        selectMoon(planetIndex, moonIndex);
        return;
      }
    }

    const intersects = raycaster.intersectObjects(planetMeshes);
    if (intersects.length > 0) {
      const idx = intersects[0].object.userData.bodyIndex;
      selectBody(idx);
    }
  }

  function flyToBody(index) {
    closeMoonDossier();
    setFocusedPlanet(index);
    const mesh = planetMeshes[index];
    const pos = new THREE.Vector3();
    mesh.getWorldPosition(pos);
    const dist = index === 0 ? 18 : Math.max(6, BODIES[index].size * 4.2);
    const dir = pos.clone().normalize();
    if (dir.lengthSq() === 0) dir.set(0, 0.3, 1);
    targetCameraPos = pos.clone().add(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.35, 0));
    targetLookAt = pos.clone();
    triggerWarp();
  }

  // reveals/hides each planet's moon group; called whenever the selected body changes
  function setFocusedPlanet(index) {
    if (focusedPlanetIndex === index) return;
    if (focusedPlanetIndex > -1 && moonGroups[focusedPlanetIndex]) {
      moonGroups[focusedPlanetIndex].visible = false;
    }
    focusedPlanetIndex = index;
    const group = moonGroups[index];
    const hasMoons = !!(group && BODIES[index].moons && BODIES[index].moons.length);
    if (group) group.visible = hasMoons;
    updateMoonHint(hasMoons ? BODIES[index].moons.length : 0);
  }

  function updateMoonHint(count) {
    const hint = document.getElementById("moon-hint");
    if (!hint) return;
    if (count > 0) {
      hint.textContent = "◉ " + count + (count === 1 ? " MOON" : " MOONS") + " IN ORBIT — TAP ONE TO INSPECT";
      hint.classList.remove("hidden");
    } else {
      hint.classList.add("hidden");
    }
  }

  // flies the camera in close to a specific moon and opens its dossier
  function selectMoon(planetIndex, moonIndex) {
    const moonData = BODIES[planetIndex].moons[moonIndex];
    const group = moonGroups[planetIndex];
    const moonMesh = group.children.find(
      (c) => c.userData.isMoon && c.userData.moonIndex === moonIndex
    );
    if (!moonMesh) return;

    focusedMoon = { planetIndex, moonIndex };
    const pos = new THREE.Vector3();
    moonMesh.getWorldPosition(pos);
    const dist = Math.max(1.6, moonData.size * 5.5);
    const dir = pos.clone().sub(planetMeshes[planetIndex].position).normalize();
    if (dir.lengthSq() === 0) dir.set(0.3, 0.2, 1);
    targetCameraPos = pos.clone().add(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.3, 0));
    targetLookAt = pos.clone();
    triggerWarp();
    renderMoonDossier(planetIndex, moonIndex);
  }

  function closeMoonDossier() {
    focusedMoon = null;
    const panel = document.getElementById("moon-dossier");
    if (panel) panel.classList.add("hidden");
  }

  function renderMoonDossier(planetIndex, moonIndex) {
    const planet = BODIES[planetIndex];
    const m = planet.moons[moonIndex];
    const panel = document.getElementById("moon-dossier");
    if (!panel) return;

    document.getElementById("md-parent").textContent = planet.name + " // SATELLITE";
    document.getElementById("md-name").textContent = m.name;
    document.getElementById("md-tagline").textContent = m.tagline;
    document.getElementById("md-note").textContent = "// " + m.note;

    const grid = document.getElementById("md-grid");
    grid.innerHTML = "";
    m.stats.forEach(([k, v]) => {
      const row = document.createElement("div");
      row.className = "d-row";
      row.innerHTML = `<span class="d-key">${k}</span><span class="d-val">${v}</span>`;
      grid.appendChild(row);
    });

    panel.classList.remove("hidden");
    const title = document.getElementById("md-name");
    title.classList.remove("glitching");
    void title.offsetWidth;
    title.classList.add("glitching");
  }

  // brief warp-speed pulse: starfield streaks stretch and brighten, then settle —
  // fired on every fly-to so it always feels like the ship is in motion
  function triggerWarp() {
    warpTarget = 1;
    clearTimeout(triggerWarp._t);
    triggerWarp._t = setTimeout(() => { warpTarget = 0; }, 900);
  }

  function onResize() {
    const viewport = document.querySelector(".viewport");
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.06);

    for (let i = 1; i < planetMeshes.length; i++) {
      const mesh = planetMeshes[i];
      mesh.userData.angle += mesh.userData.speed * dt;
      mesh.position.x = Math.cos(mesh.userData.angle) * mesh.userData.orbitRadius;
      mesh.position.z = Math.sin(mesh.userData.angle) * mesh.userData.orbitRadius;
      mesh.rotation.y += mesh.userData.spin * dt;

      // moons orbit their parent planet locally (group is parented to the mesh)
      const group = moonGroups[i];
      if (group && group.visible) {
        group.children.forEach((child) => {
          if (!child.userData.isMoon) return;
          child.userData.angle += child.userData.speed * dt;
          child.position.x = Math.cos(child.userData.angle) * child.userData.orbitRadius;
          child.position.z = Math.sin(child.userData.angle) * child.userData.orbitRadius * 0.55;
          child.position.y = Math.sin(child.userData.angle * 0.7) * child.userData.orbitRadius * 0.12;
          child.rotation.y += child.userData.spin * dt;
        });
      }
    }
    sunMesh.rotation.y += 0.02 * dt;
    if (sunLight) sunLight.position.copy(sunMesh.position);

    if (targetCameraPos) {
      camera.position.lerp(targetCameraPos, 0.04);
      controls.target.lerp(targetLookAt, 0.06);
      if (camera.position.distanceTo(targetCameraPos) < 0.5) targetCameraPos = null;
    }

    // spaceship warp-streak feel: ease toward target boost, stretch + fade the streak layer
    warpBoost += (warpTarget - warpBoost) * Math.min(1, dt * 4);
    if (warpStreaks) {
      warpStreaks.material.opacity = warpBoost * 0.85;
      warpStreaks.material.size = 1.1 + warpBoost * 5;
      warpStreaks.position.copy(camera.position);
    }
    updateCockpitHUD();

    controls.update();
    updateCockpitDrift(dt);
    renderer.render(scene, camera);
  }

  function updateCockpitHUD() {
    const speedEl = document.getElementById("hud-speed-val");
    const headingEl = document.getElementById("hud-heading-val");
    if (speedEl) speedEl.textContent = (warpBoost * 12 + 0.4).toFixed(1);
    if (headingEl) {
      const deg = (THREE.MathUtils.radToDeg(Math.atan2(camera.position.x, camera.position.z)) + 360) % 360;
      headingEl.textContent = String(Math.round(deg)).padStart(3, "0") + "°";
    }
  }

  // gentle continuous cockpit sway so the viewport never feels perfectly
  // static — like standing on a slowly drifting spacecraft
  let driftT = 0;
  function updateCockpitDrift(dt) {
    if (targetCameraPos) return; // don't fight an active fly-to
    driftT += dt;
    const sway = Math.sin(driftT * 0.18) * 0.0009;
    camera.rotation.z = sway;
  }



  /* ---------------------------------------------------------
     6. MILKY WAY 2D CANVAS (lightweight, no 3D cost)
  --------------------------------------------------------- */
  function initGalaxyCanvas() {
    const canvas = document.getElementById("galaxy-canvas");
    const ctx = canvas.getContext("2d");
    let w, h, t = 0;
    const stars = [];

    function size() {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      w = rect.width; h = rect.height;
    }
    size();
    window.addEventListener("resize", () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      size();
    });

    const armCount = 4;
    const starCount = window.innerWidth < 640 ? 1400 : 3000;
    for (let i = 0; i < starCount; i++) {
      const arm = i % armCount;
      const dist = Math.pow(Math.random(), 0.6);
      const angle = arm * ((Math.PI * 2) / armCount) + dist * 6 + (Math.random() - 0.5) * 0.6;
      stars.push({
        dist, angle,
        size: Math.random() * 1.6 + 0.3,
        hue: Math.random() > 0.85 ? "#ffb000" : "#9fe8d4",
        twinkle: Math.random() * Math.PI * 2,
      });
    }

    function draw() {
      t += 0.0025;
      ctx.clearRect(0, 0, w, h);
      const cx = w * 0.5, cy = h * 0.5;
      const maxR = Math.min(w, h) * 0.46;

      // core glow
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.35);
      grad.addColorStop(0, "rgba(255,230,180,0.55)");
      grad.addColorStop(1, "rgba(255,230,180,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      for (const s of stars) {
        const a = s.angle + t;
        const r = s.dist * maxR;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.42; // flatten for disk perspective
        const tw = 0.55 + 0.45 * Math.sin(s.twinkle + t * 20);
        ctx.globalAlpha = tw;
        ctx.fillStyle = s.hue;
        ctx.beginPath();
        ctx.arc(x, y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    }
    draw();
  }
})();
