/* ============================================================
   SOL-NET TERMINAL — APPLICATION LOGIC
   ============================================================ */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

(function () {
  "use strict";

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
  let planetMeshes = [];
  let sunMesh;
  let targetCameraPos = null;
  let targetLookAt = null;
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

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 8;
    controls.maxDistance = 140;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;

    // lighting
    scene.add(new THREE.AmbientLight(0x223344, 0.6));
    const sunLight = new THREE.PointLight(0xfff2cc, 3.2, 400, 1.4);
    scene.add(sunLight);

    // starfield
    scene.add(makeStarfield());

    // sun
    const sunData = BODIES[0];
    const sunGeo = new THREE.SphereGeometry(sunData.size, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: sunData.color });
    sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.userData.bodyIndex = 0;
    scene.add(sunMesh);
    scene.add(makeGlowSprite("rgba(255,200,80,0.9)", sunData.size * 6));

    // planets + orbit rings
    planetMeshes = [sunMesh];
    for (let i = 1; i < BODIES.length; i++) {
      const b = BODIES[i];

      const ringGeo = new THREE.RingGeometry(b.orbitRadius - 0.03, b.orbitRadius + 0.03, 128);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x0a8f5c, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
      const orbitLine = new THREE.Mesh(ringGeo, ringMat);
      orbitLine.rotation.x = Math.PI / 2;
      scene.add(orbitLine);

      const geo = new THREE.SphereGeometry(b.size, 28, 28);
      const mat = new THREE.MeshStandardMaterial({
        color: b.color,
        emissive: b.emissive,
        emissiveIntensity: 0.4,
        roughness: 0.85,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.x = b.orbitRadius;
      mesh.userData.bodyIndex = i;
      mesh.userData.orbitRadius = b.orbitRadius;
      mesh.userData.speed = b.speed * 0.05;
      mesh.userData.angle = Math.random() * Math.PI * 2;
      mesh.userData.spin = 0.4 + Math.random() * 0.6;

      if (b.ring) {
        const rGeo = new THREE.RingGeometry(b.size * 1.4, b.size * 2.1, 48);
        const rMat = new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const r = new THREE.Mesh(rGeo, rMat);
        r.rotation.x = Math.PI / 2.3;
        mesh.add(r);
      }

      scene.add(mesh);
      planetMeshes.push(mesh);
    }

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    canvas.addEventListener("click", onCanvasClick);

    window.addEventListener("resize", onResize);

    animate();
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

  function onCanvasClick(evt) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(planetMeshes);
    if (intersects.length > 0) {
      const idx = intersects[0].object.userData.bodyIndex;
      selectBody(idx);
    }
  }

  function flyToBody(index) {
    const mesh = planetMeshes[index];
    const pos = new THREE.Vector3();
    mesh.getWorldPosition(pos);
    const dist = index === 0 ? 18 : Math.max(6, BODIES[index].size * 4.2);
    const dir = pos.clone().normalize();
    if (dir.lengthSq() === 0) dir.set(0, 0.3, 1);
    targetCameraPos = pos.clone().add(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.35, 0));
    targetLookAt = pos.clone();
  }

  function onResize() {
    const viewport = document.querySelector(".viewport");
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    for (let i = 1; i < planetMeshes.length; i++) {
      const mesh = planetMeshes[i];
      mesh.userData.angle += mesh.userData.speed * dt;
      mesh.position.x = Math.cos(mesh.userData.angle) * mesh.userData.orbitRadius;
      mesh.position.z = Math.sin(mesh.userData.angle) * mesh.userData.orbitRadius;
      mesh.rotation.y += mesh.userData.spin * dt;
    }
    sunMesh.rotation.y += 0.02 * dt;

    if (targetCameraPos) {
      camera.position.lerp(targetCameraPos, 0.04);
      controls.target.lerp(targetLookAt, 0.06);
      if (camera.position.distanceTo(targetCameraPos) < 0.5) targetCameraPos = null;
    }

    controls.update();
    renderer.render(scene, camera);
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
