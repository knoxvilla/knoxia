/**
 * KnoxiaOS — orbit.js
 * The Orbit experience: star system, planet orbit, planet surfaces.
 * THREE is passed in from main.js at runtime to avoid module timing issues.
 * Exposes window.KnoxiaOrbit = { enter }
 */

(function() {
'use strict';

// THREE is injected at runtime by main.js via KnoxiaOrbit.enter()
let THREE;

// ── Planet definitions ────────────────────────────────────────────────────
const PLANETS = [
    {
        id:      'lyra',
        name:    'Lyra',
        tagline: 'Communications Array',
        desc:    'A warm, inhabited world. Open a channel.',
        color:   0xe8823a,
        emissive:0x331100,
        size:    3.2,
        orbitR:  38,
        speed:   0.0028,
        phase:   0,
        surface: 'chat',
        atmColor:'rgba(255,140,60,0.18)',
        glowColor:'#ff8c3a',
    },
    {
        id:      'vex',
        name:    'Vex',
        tagline: 'Neural Game Grid',
        desc:    'A synthetic world running on pure electricity.',
        color:   0x4466ff,
        emissive:0x001133,
        size:    2.6,
        orbitR:  62,
        speed:   0.0018,
        phase:   2.1,
        surface: 'game',
        atmColor:'rgba(60,100,255,0.18)',
        glowColor:'#4466ff',
    },
    {
        id:      'nox',
        name:    'Nox',
        tagline: 'Bioluminescent Archive',
        desc:    'A living world. Every leaf tells a story.',
        color:   0x22ddaa,
        emissive:0x003322,
        size:    3.8,
        orbitR:  90,
        speed:   0.0012,
        phase:   4.4,
        surface: 'about',
        atmColor:'rgba(30,220,160,0.18)',
        glowColor:'#22ddaa',
    },
];

// ── State ─────────────────────────────────────────────────────────────────
let scene, camera, renderer, canvas;
let orbitActive   = false;
let planetMeshes  = [];
let orbitAngle    = [0, 2.1, 4.4];
let planetSpeedMult = [1, 1, 1]; // per-planet phase
let starMesh, coronaMesh, starLight;
let currentPlanet = null;
let animRAF       = null;
let uiEl          = null;
let surfaceEl     = null;
let overlayEl     = null;
let orbitRingMeshes = [];

// ── Init — called once, borrows renderer from main.js ────────────────────
// ── Scene B: star system ──────────────────────────────────────────────────
function buildScene() {
    scene  = new THREE.Scene();
    scene.background = new THREE.Color(0x000008);
    scene.fog = new THREE.FogExp2(0x000008, 0.004);

    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 40, 140);
    camera.lookAt(0, 0, 0);

    // Background stars
    buildBackgroundStars();

    // The star
    buildStar();

    // Planets
    buildPlanets();

    // Orbit rings
    buildOrbitRings();
}

function buildBackgroundStars() {
    const geo = new THREE.BufferGeometry();
    const v   = [];
    for (let i = 0; i < 3000; i++) {
        v.push(
            (Math.random() - 0.5) * 2000,
            (Math.random() - 0.5) * 2000,
            (Math.random() - 0.5) * 2000
        );
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true, opacity: 0.7 });
    scene.add(new THREE.Points(geo, mat));
}

function buildStar() {
    // Core sphere
    const geo = new THREE.SphereGeometry(10, 64, 64);
    const mat = new THREE.MeshStandardMaterial({
        color:           0xffdd44,
        emissive:        0xff8800,
        emissiveIntensity: 2.2,
        roughness:       0.8,
        metalness:       0,
    });
    starMesh = new THREE.Mesh(geo, mat);
    scene.add(starMesh);

    // Star light
    starLight = new THREE.PointLight(0xffcc44, 3.5, 400);
    scene.add(starLight);

    scene.add(new THREE.AmbientLight(0x111122, 0.8));

    // Corona — layered glowing halos
    const coronaGeo = new THREE.SphereGeometry(13, 32, 32);
    const coronaMat = new THREE.MeshBasicMaterial({
        color: 0xff9900,
        transparent: true,
        opacity: 0.12,
        side: THREE.BackSide,
    });
    coronaMesh = new THREE.Mesh(coronaGeo, coronaMat);
    scene.add(coronaMesh);

    // Outer glow
    const outerGeo = new THREE.SphereGeometry(18, 32, 32);
    const outerMat = new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0.05,
        side: THREE.BackSide,
    });
    scene.add(new THREE.Mesh(outerGeo, outerMat));

    // Surface detail — animated noise via vertex displacement would be ideal
    // but for lightweight we use a second layer with additive blending
    const surfaceGeo = new THREE.SphereGeometry(10.2, 32, 32);
    const surfaceMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const surfaceLayer = new THREE.Mesh(surfaceGeo, surfaceMat);
    starMesh.add(surfaceLayer);
}

function buildPlanets() {
    PLANETS.forEach((p, i) => {
        const geo = new THREE.SphereGeometry(p.size, 32, 32);
        const mat = new THREE.MeshStandardMaterial({
            color:            p.color,
            emissive:         p.emissive,
            emissiveIntensity:0.4,
            roughness:        0.7,
            metalness:        0.1,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        scene.add(mesh);

        // Atmosphere glow ring
        const atmGeo = new THREE.SphereGeometry(p.size + 0.8, 32, 32);
        const atmMat = new THREE.MeshBasicMaterial({
            color: p.color,
            transparent: true,
            opacity: 0.12,
            side: THREE.BackSide,
        });
        const atm = new THREE.Mesh(atmGeo, atmMat);
        mesh.add(atm);

        orbitAngle[i] = p.phase;
        planetMeshes.push(mesh);
    });
}

function buildOrbitRings() {
    PLANETS.forEach(p => {
        const geo = new THREE.TorusGeometry(p.orbitR, 0.08, 8, 128);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x334466,
            transparent: true,
            opacity: 0.25,
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = Math.PI / 2;
        scene.add(ring);
        orbitRingMeshes.push(ring);
    });
}

// ── Animation loop ────────────────────────────────────────────────────────
let starPulse = 0;
let cameraOrbitAngle = 0;

function animateOrbit(now) {
    animRAF = requestAnimationFrame(animateOrbit);
    if (!orbitActive) return;

    const t = now * 0.001;
    starPulse = t;

    // Star pulse
    const pulse = 1 + Math.sin(t * 1.2) * 0.02;
    starMesh.scale.setScalar(pulse);
    coronaMesh.material.opacity = 0.10 + Math.sin(t * 0.8) * 0.04;
    starMesh.rotation.y = t * 0.04;

    // Star light flicker
    starLight.intensity = 3.2 + Math.sin(t * 2.3) * 0.3;

    // Planet orbits
    PLANETS.forEach((p, i) => {
        orbitAngle[i] += p.speed * planetSpeedMult[i];
        const x = Math.cos(orbitAngle[i]) * p.orbitR;
        const z = Math.sin(orbitAngle[i]) * p.orbitR;
        const y = Math.sin(orbitAngle[i] * 0.5) * 4; // slight incline
        planetMeshes[i].position.set(x, y, z);
        planetMeshes[i].rotation.y += 0.005 * planetSpeedMult[i];
    });

    // Gentle camera drift in orbit view
    if (!currentPlanet) {
        cameraOrbitAngle += 0.0006;
        const camR = 140;
        camera.position.x = Math.sin(cameraOrbitAngle) * camR * 0.15;
        camera.position.y = 40 + Math.sin(cameraOrbitAngle * 0.7) * 5;
        camera.lookAt(0, 0, 0);
    }

    renderer.render(scene, camera);
}

// ── Enter orbit experience ────────────────────────────────────────────────
function enter(rendererRef, canvasRef, onReady) {
    renderer = rendererRef;
    canvas   = canvasRef;

    orbitActive   = true;
    currentPlanet = null;
    planetSpeedMult = [1, 1, 1];
    canvas.style.display = 'block';

    // Reset camera
    camera.position.set(0, 40, 140);
    camera.lookAt(0, 0, 0);
    camera.fov = 55;
    camera.updateProjectionMatrix();

    // Start render loop
    if (animRAF) cancelAnimationFrame(animRAF);
    animRAF = requestAnimationFrame(animateOrbit);

    // Build HUD
    buildOrbitUI();

    if (onReady) onReady();
}

// ── Orbit HUD ─────────────────────────────────────────────────────────────
function buildOrbitUI() {
    if (uiEl) uiEl.remove();

    uiEl = document.createElement('div');
    uiEl.id = 'orbit-ui';
    uiEl.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:500',
        'pointer-events:none', 'font-family:Helvetica Neue,Helvetica,Arial,sans-serif',
    ].join(';');

    // Top bar
    const topBar = document.createElement('div');
    topBar.style.cssText = [
        'position:absolute', 'top:0', 'left:0', 'right:0', 'height:44px',
        'background:rgba(0,0,10,0.7)',
        'border-bottom:1px solid rgba(100,150,255,0.2)',
        'display:flex', 'align-items:center', 'padding:0 20px',
        'gap:16px', 'pointer-events:auto',
        'backdrop-filter:blur(8px)',
    ].join(';');

    const title = document.createElement('span');
    title.style.cssText = 'color:rgba(200,220,255,0.9);font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;flex:1;';
    title.textContent = 'Knoxia Star System';

    const backOsBtn = makeHudBtn('⌫ Back to OS');
    backOsBtn.addEventListener('click', leaveToOS);

    const leaveBtn = makeHudBtn('✕ Leave Experience');
    leaveBtn.style.color = 'rgba(255,100,100,0.9)';
    leaveBtn.style.borderColor = 'rgba(255,100,100,0.3)';
    leaveBtn.addEventListener('click', leaveExperience);

    topBar.append(title, backOsBtn, leaveBtn);
    uiEl.appendChild(topBar);

    // Planet labels — positioned in 3D→2D projection
    const labelsWrap = document.createElement('div');
    labelsWrap.id = 'orbit-labels';
    labelsWrap.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    uiEl.appendChild(labelsWrap);

    document.body.appendChild(uiEl);

    // Build label elements once (positions updated each frame)
    buildLabels();

    // Start label position update loop
    requestAnimationFrame(updateLabels);
}

function makeHudBtn(text) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = [
        'background:rgba(255,255,255,0.06)',
        'border:1px solid rgba(200,220,255,0.25)',
        'color:rgba(200,220,255,0.85)',
        'padding:6px 14px', 'border-radius:6px',
        'font-size:11px', 'font-weight:600',
        'cursor:pointer', 'letter-spacing:0.04em',
        'font-family:Helvetica Neue,Helvetica,Arial,sans-serif',
        'transition:background 0.2s',
    ].join(';');
    btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(255,255,255,0.12)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(255,255,255,0.06)');
    return btn;
}

// Label elements created once, repositioned each frame
let labelEls = [];

function buildLabels() {
    const wrap = document.getElementById('orbit-labels');
    if (!wrap) return;
    wrap.innerHTML = '';
    labelEls = [];

    PLANETS.forEach((p, i) => {
        const label = document.createElement('div');
        label.style.cssText = [
            'position:absolute',
            'transform:translateX(-50%)',
            'text-align:center',
            'pointer-events:auto',
            'cursor:default',
            'transition:opacity 0.2s',
        ].join(';');

        const name = document.createElement('div');
        name.style.cssText = `font-size:12px;font-weight:700;color:${p.glowColor};letter-spacing:0.08em;text-shadow:0 0 12px ${p.glowColor};`;
        name.textContent = p.name.toUpperCase();

        const tag = document.createElement('div');
        tag.style.cssText = `font-size:10px;color:rgba(200,220,255,0.6);margin-top:2px;letter-spacing:0.04em;`;
        tag.textContent = p.tagline;

        const enterBtn = document.createElement('button');
        enterBtn.style.cssText = [
            'margin-top:6px',
            `background:rgba(${hexToRgb(p.glowColor)},0.15)`,
            `border:1px solid rgba(${hexToRgb(p.glowColor)},0.4)`,
            `color:${p.glowColor}`,
            'font-size:10px', 'font-weight:600',
            'padding:5px 14px', 'border-radius:20px',
            'letter-spacing:0.06em',
            'cursor:pointer',
            'display:block',
            'margin-left:auto', 'margin-right:auto',
            'font-family:Helvetica Neue,Helvetica,Arial,sans-serif',
            'transition:background 0.15s',
        ].join(';');
        enterBtn.textContent = '● ENTER';

        enterBtn.addEventListener('mouseenter', () => {
            enterBtn.style.background = `rgba(${hexToRgb(p.glowColor)},0.35)`;
        });
        enterBtn.addEventListener('mouseleave', () => {
            enterBtn.style.background = `rgba(${hexToRgb(p.glowColor)},0.15)`;
        });
        enterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            enterPlanet(i);
        });

        label.append(name, tag, enterBtn);
        wrap.appendChild(label);
        labelEls.push(label);
    });
}

function updateLabels() {
    if (!orbitActive || !uiEl) return;

    PLANETS.forEach((p, i) => {
        const mesh  = planetMeshes[i];
        const label = labelEls[i];
        if (!mesh || !label) return;

        const pos = mesh.position.clone();
        pos.project(camera);

        // Behind camera — hide
        if (pos.z > 1) {
            label.style.opacity = '0';
            label.style.pointerEvents = 'none';
            return;
        }

        const sx = (pos.x *  0.5 + 0.5) * window.innerWidth;
        const sy = (pos.y * -0.5 + 0.5) * window.innerHeight;

        label.style.left   = sx + 'px';
        label.style.top    = (sy + p.size * 14) + 'px';
        label.style.opacity = '1';
        label.style.pointerEvents = 'auto';
    });

    requestAnimationFrame(updateLabels);
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `${r},${g},${b}`;
}

// ── Enter planet ──────────────────────────────────────────────────────────
function enterPlanet(idx) {
    if (currentPlanet !== null) return;
    currentPlanet = idx;
    const p    = PLANETS[idx];
    const mesh = planetMeshes[idx];

    // Phase 1: smoothly decelerate this planet to a stop over 1.2s
    const decelObj = { mult: 1 };
    gsap.to(decelObj, {
        mult: 0,
        duration: 1.2,
        ease: 'power2.out',
        onUpdate: () => { planetSpeedMult[idx] = decelObj.mult; },
        onComplete: () => {
            // Planet is now stopped. Phase 2: zoom camera to it.
            // We track the mesh's current (frozen) position live during zoom.
            const zoomDuration = 2.0;
            const startPos = camera.position.clone();
            const startTime = performance.now();

            function zoomTick(now) {
                const t      = Math.min((now - startTime) / (zoomDuration * 1000), 1);
                const eased  = t < 0.5 ? 2*t*t : -1+(4-2*t)*t; // ease in-out quad

                // Destination: just in front of the (now frozen) planet
                const planetPos = mesh.position.clone();
                const dir       = planetPos.clone().normalize();
                const dest      = planetPos.clone().sub(dir.multiplyScalar(p.size + 16));
                dest.y += 3;

                camera.position.lerpVectors(startPos, dest, eased);
                camera.lookAt(planetPos);

                if (t < 1) {
                    requestAnimationFrame(zoomTick);
                } else {
                    // Landed — atmosphere flash then surface
                    flashColor(p.atmColor, () => showPlanetSurface(p));
                }
            }
            requestAnimationFrame(zoomTick);
        }
    });
}

function flashColor(color, onComplete) {
    const flash = document.createElement('div');
    flash.style.cssText = `position:fixed;inset:0;background:${color};z-index:600;opacity:0;pointer-events:none;transition:opacity 0.3s;`;
    document.body.appendChild(flash);
    requestAnimationFrame(() => {
        flash.style.opacity = '1';
        setTimeout(() => {
            flash.style.opacity = '0';
            setTimeout(() => { flash.remove(); if (onComplete) onComplete(); }, 320);
        }, 200);
    });
}

// ── Planet surfaces ───────────────────────────────────────────────────────
function showPlanetSurface(p) {
    if (surfaceEl) surfaceEl.remove();
    surfaceEl = document.createElement('div');
    surfaceEl.id = 'planet-surface';

    const builders = { chat: buildChatSurface, game: buildGameSurface, about: buildAboutSurface };
    (builders[p.surface] || buildAboutSurface)(surfaceEl, p);

    document.body.appendChild(surfaceEl);
}

function surfaceBase(p) {
    // Returns a styled container with planet background
    const wrap = document.createElement('div');
    wrap.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:550',
        `background:radial-gradient(ellipse at 50% 80%, ${p.atmColor.replace('0.18','0.35')} 0%, rgba(0,0,8,0.97) 70%)`,
        'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
        'font-family:Helvetica Neue,Helvetica,Arial,sans-serif',
    ].join(';');

    // Animated "ground" at bottom
    const ground = document.createElement('div');
    ground.style.cssText = [
        'position:absolute', 'bottom:0', 'left:0', 'right:0', 'height:30%',
        `background:linear-gradient(0deg, ${p.glowColor}22 0%, transparent 100%)`,
        'border-top:1px solid ' + p.glowColor + '33',
    ].join(';');
    wrap.appendChild(ground);

    // Floating particles
    for (let i = 0; i < 18; i++) {
        const dot = document.createElement('div');
        const size = Math.random() * 3 + 1;
        dot.style.cssText = [
            'position:absolute',
            `left:${Math.random()*100}%`,
            `top:${Math.random()*100}%`,
            `width:${size}px`, `height:${size}px`,
            'border-radius:50%',
            `background:${p.glowColor}`,
            `opacity:${(Math.random()*0.4+0.1).toFixed(2)}`,
            `animation:particle-float ${(3+Math.random()*4).toFixed(1)}s ease-in-out infinite alternate`,
            `animation-delay:${(Math.random()*3).toFixed(1)}s`,
        ].join(';');
        wrap.appendChild(dot);
    }

    // Back button
    const back = document.createElement('button');
    back.textContent = '← Back to System';
    back.style.cssText = [
        'position:absolute', 'top:16px', 'left:20px',
        'background:rgba(0,0,0,0.5)',
        `border:1px solid ${p.glowColor}55`,
        `color:${p.glowColor}`,
        'padding:7px 16px', 'border-radius:6px',
        'font-size:11px', 'font-weight:600', 'cursor:pointer',
        'letter-spacing:0.05em',
        'font-family:Helvetica Neue,Helvetica,Arial,sans-serif',
    ].join(';');
    back.addEventListener('click', leavePlanet);
    wrap.appendChild(back);

    // Planet name top-right
    const nameEl = document.createElement('div');
    nameEl.style.cssText = [
        'position:absolute', 'top:16px', 'right:20px',
        `color:${p.glowColor}`, 'font-size:11px', 'font-weight:700',
        'letter-spacing:0.1em', 'text-transform:uppercase',
        `text-shadow:0 0 10px ${p.glowColor}`,
    ].join(';');
    nameEl.textContent = `◉ ${p.name}`;
    wrap.appendChild(nameEl);

    // Inject particle float keyframe once
    if (!document.getElementById('orbit-kf')) {
        const s = document.createElement('style');
        s.id = 'orbit-kf';
        s.textContent = '@keyframes particle-float{0%{transform:translateY(0)}100%{transform:translateY(-20px)}}';
        document.head.appendChild(s);
    }

    return wrap;
}

// ── Chat surface (Lyra) ───────────────────────────────────────────────────
function buildChatSurface(container, p) {
    // ── Supabase config ───────────────────────────────────────────────
    const SUPA_URL = 'https://tmgyzqmelczjqlebmgpv.supabase.co';
    const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtZ3l6cW1lbGN6anFsZWJtZ3B2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjYyMTYsImV4cCI6MjA5NzIwMjIxNn0.YqR0tyNbQA8uLFuikwmk0GfxBHUXkNrdS4x5YCCziXU';
    const headers  = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

    let realtimeSocket = null;
    let seenIds = new Set();
    // Visitor gets a random name each session so messages are distinguishable
    const visitorName = 'Visitor_' + Math.random().toString(36).slice(2, 6).toUpperCase();

    Object.assign(container.style, { position:'fixed', inset:0, zIndex:550 });
    const base = surfaceBase(p);

    // ── Terminal window ───────────────────────────────────────────────
    const terminal = document.createElement('div');
    terminal.style.cssText = [
        'position:relative', 'z-index:2',
        'width:min(520px,90vw)', 'height:440px',
        'background:rgba(0,0,8,0.88)',
        `border:1px solid ${p.glowColor}44`,
        'border-radius:12px', 'overflow:hidden',
        'display:flex', 'flex-direction:column',
        `box-shadow:0 0 40px ${p.glowColor}22, inset 0 1px 0 rgba(255,255,255,0.06)`,
    ].join(';');

    // Traffic lights + title
    const termHead = document.createElement('div');
    termHead.style.cssText = [
        'height:36px', 'display:flex', 'align-items:center', 'padding:0 14px', 'gap:8px',
        `background:rgba(${hexToRgb(p.glowColor)},0.1)`,
        `border-bottom:1px solid ${p.glowColor}33`,
        'flex-shrink:0',
    ].join(';');
    const dot = c => { const d = document.createElement('div'); d.style.cssText = `width:10px;height:10px;border-radius:50%;background:${c};`; return d; };
    termHead.append(dot('#ff5f57'), dot('#febc2e'), dot('#28c840'));
    const termTitle = document.createElement('span');
    termTitle.style.cssText = `color:${p.glowColor};font-size:11px;font-weight:600;letter-spacing:0.06em;margin-left:6px;flex:1;`;
    termTitle.textContent = 'LYRA COMMS — OPEN CHANNEL';
    // Connection status dot
    const statusDot = document.createElement('span');
    statusDot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#555;display:inline-block;margin-left:auto;';
    statusDot.title = 'Connecting…';
    termHead.append(termTitle, statusDot);
    terminal.appendChild(termHead);

    // ── Messages area ─────────────────────────────────────────────────
    const msgs = document.createElement('div');
    msgs.style.cssText = [
        'flex:1', 'overflow-y:auto', 'padding:14px',
        'display:flex', 'flex-direction:column', 'gap:8px',
    ].join(';');
    terminal.appendChild(msgs);

    function fmtTime(ts) {
        const d = new Date(ts);
        return d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true });
    }

    function addMsg(text, from, isSystem, ts) {
        // Deduplicate by content+author if needed
        const row = document.createElement('div');
        const isSelf = from === visitorName;
        row.style.cssText = `display:flex;flex-direction:column;align-items:${isSystem ? 'center' : isSelf ? 'flex-end' : 'flex-start'};`;

        if (isSystem) {
            const sys = document.createElement('div');
            sys.style.cssText = 'font-size:10px;color:rgba(200,220,255,0.3);letter-spacing:0.06em;padding:2px 0;';
            sys.textContent = text;
            row.appendChild(sys);
            msgs.appendChild(row);
            msgs.scrollTop = msgs.scrollHeight;
            return;
        }

        const bubble = document.createElement('div');
        bubble.style.cssText = [
            'max-width:75%', 'padding:8px 12px',
            'font-size:12px', 'line-height:1.5',
            isSelf
                ? `background:rgba(${hexToRgb(p.glowColor)},0.2);color:${p.glowColor};border:1px solid ${p.glowColor}44;border-radius:10px 10px 2px 10px;`
                : 'background:rgba(255,255,255,0.06);color:rgba(200,220,255,0.88);border:1px solid rgba(255,255,255,0.08);border-radius:10px 10px 10px 2px;',
        ].join(';');
        bubble.textContent = text;

        const meta = document.createElement('div');
        meta.style.cssText = 'font-size:9px;color:rgba(200,220,255,0.3);margin-top:3px;letter-spacing:0.04em;';
        meta.textContent = ts ? `${from} · ${fmtTime(ts)}` : from;

        row.append(bubble, meta);
        msgs.appendChild(row);
        msgs.scrollTop = msgs.scrollHeight;
    }

    // ── Input row ─────────────────────────────────────────────────────
    const inputRow = document.createElement('div');
    inputRow.style.cssText = [
        'height:48px', 'display:flex', 'align-items:center',
        'padding:0 12px', 'gap:8px',
        `border-top:1px solid ${p.glowColor}22`,
        'flex-shrink:0',
    ].join(';');

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Transmit a message…';
    input.maxLength = 300;
    input.style.cssText = [
        'flex:1', 'background:rgba(255,255,255,0.05)',
        `border:1px solid ${p.glowColor}33`, 'border-radius:6px',
        'padding:0 10px', 'height:30px',
        'color:rgba(220,235,255,0.9)', 'font-size:12px',
        'outline:none',
        'font-family:Helvetica Neue,Helvetica,Arial,sans-serif',
    ].join(';');
    input.style.userSelect = 'text';

    const sendBtn = document.createElement('button');
    sendBtn.textContent = 'Send';
    sendBtn.style.cssText = [
        'height:30px', 'padding:0 16px',
        `background:rgba(${hexToRgb(p.glowColor)},0.2)`,
        `border:1px solid ${p.glowColor}55`,
        `color:${p.glowColor}`, 'border-radius:6px',
        'font-size:11px', 'font-weight:700', 'cursor:pointer',
        'font-family:Helvetica Neue,Helvetica,Arial,sans-serif',
        'transition:background 0.15s',
        'flex-shrink:0',
    ].join(';');

    inputRow.append(input, sendBtn);
    terminal.appendChild(inputRow);
    base.appendChild(terminal);
    container.appendChild(base);

    // ── Supabase: load recent messages ────────────────────────────────
    async function loadHistory() {
        try {
            const res = await fetch(
                `${SUPA_URL}/rest/v1/messages?select=*&order=created_at.asc&limit=60`,
                { headers }
            );
            if (!res.ok) throw new Error(await res.text());
            const rows = await res.json();
            addMsg('CHANNEL OPEN — LYRA COMMS ARRAY', '', true);
            if (rows.length === 0) {
                addMsg('No prior transmissions. Be the first.', '', true);
            } else {
                addMsg(`— ${rows.length} prior message${rows.length !== 1 ? 's' : ''} —`, '', true);
                rows.forEach(r => { seenIds.add(r.id); addMsg(r.content, r.author, false, r.created_at); });
            }
            statusDot.style.background = '#22dd88';
            statusDot.title = 'Connected';
        } catch (e) {
            addMsg('Connection error. Check console.', '', true);
            console.error('[Lyra]', e);
        }
    }

    // ── Supabase: send message ────────────────────────────────────────
    async function sendMessage(text) {
        sendBtn.disabled = true;
        try {
            const res = await fetch(`${SUPA_URL}/rest/v1/messages`, {
                method: 'POST',
                headers: { ...headers, 'Prefer': 'return=minimal' },
                body: JSON.stringify({ author: visitorName, content: text }),
            });
            if (!res.ok) throw new Error(await res.text());
        } catch (e) {
            addMsg('Failed to send. Try again.', '', true);
            console.error('[Lyra]', e);
        }
        sendBtn.disabled = false;
    }

    // ── Supabase Realtime (WebSocket) ─────────────────────────────────
    function connectRealtime() {
        const wsUrl = SUPA_URL.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + SUPA_KEY + '&vsn=1.0.0';
        realtimeSocket = new WebSocket(wsUrl);

        let heartbeatInterval = null;
        let joinRef = '1';

        realtimeSocket.onopen = () => {
            // Supabase realtime v2: topic must be 'realtime:*' with filter in config
            realtimeSocket.send(JSON.stringify({
                topic:   'realtime:knoxia-chat',
                event:   'phx_join',
                payload: {
                    config: {
                        postgres_changes: [{
                            event:  'INSERT',
                            schema: 'public',
                            table:  'messages',
                        }],
                    }
                },
                ref: joinRef,
            }));

            heartbeatInterval = setInterval(() => {
                if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) {
                    realtimeSocket.send(JSON.stringify({
                        topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'hb',
                    }));
                }
            }, 20000);
        };

        realtimeSocket.onmessage = (evt) => {
            try {
                const msg = JSON.parse(evt.data);

                if (msg.event === 'postgres_changes') {
                    const record = msg.payload?.data?.record;
                    if (record && !seenIds.has(record.id)) {
                        seenIds.add(record.id);
                        if (record.author !== visitorName) {
                            addMsg(record.content, record.author, false, record.created_at);
                        }
                    }
                }
            } catch(e) {}
        };

        realtimeSocket.onclose = () => {
            clearInterval(heartbeatInterval);
            statusDot.style.background = '#dd4422';
            statusDot.title = 'Disconnected';
            setTimeout(() => {
                if (realtimeSocket && realtimeSocket.readyState === WebSocket.CLOSED) {
                    connectRealtime();
                }
            }, 3000);
        };

        realtimeSocket.onerror = (e) => {
            console.error('[Lyra WS onerror]', e);
            statusDot.style.background = '#dd4422';
        };
    }

    // ── Send handler ──────────────────────────────────────────────────
    const send = () => {
        const txt = input.value.trim();
        if (!txt || sendBtn.disabled) return;
        input.value = '';
        // Optimistically show the message immediately
        addMsg(txt, visitorName, false, new Date().toISOString());
        sendMessage(txt);
    };

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); send(); } });

    // ── Cleanup on leave ──────────────────────────────────────────────
    container._cleanup = () => {
        if (realtimeSocket) {
            realtimeSocket.onclose = null; // prevent reconnect loop on intentional close
            realtimeSocket.close();
            realtimeSocket = null;
        }
    };

    // ── Boot ──────────────────────────────────────────────────────────
    loadHistory();
    connectRealtime();
}

// ── Game surface (Vex) ────────────────────────────────────────────────────
function buildGameSurface(container, p) {
    Object.assign(container.style, { position:'fixed', inset:0, zIndex:550 });
    const base = surfaceBase(p);

    const gameWrap = document.createElement('div');
    gameWrap.style.cssText = [
        'position:relative', 'z-index:2',
        'display:flex', 'flex-direction:column', 'align-items:center', 'gap:12px',
    ].join(';');

    const title = document.createElement('div');
    title.style.cssText = `color:${p.glowColor};font-size:18px;font-weight:700;letter-spacing:0.12em;text-shadow:0 0 20px ${p.glowColor};`;
    title.textContent = 'VEX GRID — DODGE';

    const sub = document.createElement('div');
    sub.style.cssText = 'color:rgba(150,170,255,0.6);font-size:11px;letter-spacing:0.08em;margin-top:-6px;';
    sub.textContent = 'ARROW KEYS / WASD TO MOVE — AVOID THE ASTEROIDS';

    // Game canvas
    const gc = document.createElement('canvas');
    gc.width  = 480;
    gc.height = 320;
    gc.style.cssText = [
        `border:1px solid ${p.glowColor}44`,
        'border-radius:8px',
        'background:#000008',
        `box-shadow:0 0 30px ${p.glowColor}22`,
        'display:block',
    ].join(';');

    const scoreEl = document.createElement('div');
    scoreEl.style.cssText = `color:${p.glowColor};font-size:13px;font-weight:600;letter-spacing:0.08em;`;

    const startBtn = document.createElement('button');
    startBtn.textContent = '▶ START GAME';
    startBtn.style.cssText = [
        `background:rgba(${hexToRgb(p.glowColor)},0.15)`,
        `border:1px solid ${p.glowColor}55`,
        `color:${p.glowColor}`, 'padding:8px 24px',
        'border-radius:6px', 'font-size:12px', 'font-weight:700',
        'cursor:pointer', 'letter-spacing:0.08em',
        'font-family:Helvetica Neue,Helvetica,Arial,sans-serif',
    ].join(';');

    gameWrap.append(title, sub, gc, scoreEl, startBtn);
    base.appendChild(gameWrap);
    container.appendChild(base);

    // ── Minimal asteroid dodge game ───────────────────────────────────
    const ctx = gc.getContext('2d');
    const W = gc.width, H = gc.height;
    let gameRunning = false, gameRAF = null;
    let player = { x: W/2, y: H - 40, w: 16, h: 20, speed: 4 };
    let asteroids = [], score = 0, frame = 0;
    const keys = {};

    document.addEventListener('keydown', (e) => {
        keys[e.key] = true;
        e.stopPropagation();
    });
    document.addEventListener('keyup', (e) => { keys[e.key] = false; });

    function spawnAsteroid() {
        asteroids.push({
            x: Math.random() * (W - 20) + 10,
            y: -15,
            r: Math.random() * 10 + 6,
            speed: Math.random() * 2 + 1.5 + score * 0.002,
            rot: 0, rotSpeed: (Math.random()-0.5) * 0.08,
        });
    }

    function gameLoop() {
        gameRAF = requestAnimationFrame(gameLoop);
        frame++;
        ctx.fillStyle = '#000008';
        ctx.fillRect(0, 0, W, H);

        // Grid lines
        ctx.strokeStyle = 'rgba(80,100,255,0.08)';
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
        for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

        // Player movement
        if ((keys['ArrowLeft'] || keys['a'] || keys['A']) && player.x > player.w/2)   player.x -= player.speed;
        if ((keys['ArrowRight']|| keys['d'] || keys['D']) && player.x < W-player.w/2) player.x += player.speed;
        if ((keys['ArrowUp']   || keys['w'] || keys['W']) && player.y > player.h/2)   player.y -= player.speed;
        if ((keys['ArrowDown'] || keys['s'] || keys['S']) && player.y < H-player.h/2) player.y += player.speed;

        // Draw player ship
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.fillStyle = '#4466ff';
        ctx.shadowColor = '#4466ff';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(0, -player.h/2);
        ctx.lineTo(player.w/2, player.h/2);
        ctx.lineTo(-player.w/2, player.h/2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Spawn asteroids
        if (frame % Math.max(20, 60 - Math.floor(score/5)) === 0) spawnAsteroid();

        // Update and draw asteroids
        for (let i = asteroids.length - 1; i >= 0; i--) {
            const a = asteroids[i];
            a.y += a.speed;
            a.rot += a.rotSpeed;

            // Remove if off screen
            if (a.y > H + 20) { asteroids.splice(i, 1); score++; continue; }

            // Collision
            const dx = a.x - player.x, dy = a.y - player.y;
            if (Math.sqrt(dx*dx+dy*dy) < a.r + 8) {
                gameRunning = false;
                cancelAnimationFrame(gameRAF);
                ctx.fillStyle = 'rgba(0,0,8,0.7)';
                ctx.fillRect(0, 0, W, H);
                ctx.fillStyle = '#ff4444';
                ctx.font = 'bold 22px Helvetica Neue, Arial';
                ctx.textAlign = 'center';
                ctx.fillText('GAME OVER', W/2, H/2 - 14);
                ctx.fillStyle = '#4466ff';
                ctx.font = '13px Helvetica Neue, Arial';
                ctx.fillText(`Score: ${score}`, W/2, H/2 + 14);
                ctx.fillStyle = 'rgba(150,170,255,0.6)';
                ctx.font = '11px Helvetica Neue, Arial';
                ctx.fillText('Click START to play again', W/2, H/2 + 36);
                startBtn.style.display = 'block';
                return;
            }

            ctx.save();
            ctx.translate(a.x, a.y);
            ctx.rotate(a.rot);
            ctx.fillStyle = 'rgba(160,140,200,0.9)';
            ctx.shadowColor = 'rgba(100,80,200,0.5)';
            ctx.shadowBlur = 8;
            // Jagged asteroid shape
            ctx.beginPath();
            const sides = 7;
            for (let j = 0; j < sides; j++) {
                const ang = (j / sides) * Math.PI * 2;
                const jag = a.r * (0.7 + Math.sin(j * 2.3) * 0.3);
                j === 0 ? ctx.moveTo(Math.cos(ang)*jag, Math.sin(ang)*jag)
                        : ctx.lineTo(Math.cos(ang)*jag, Math.sin(ang)*jag);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        scoreEl.textContent = `SCORE: ${score}`;
    }

    startBtn.addEventListener('click', () => {
        player = { x: W/2, y: H - 40, w: 16, h: 20, speed: 4 };
        asteroids = []; score = 0; frame = 0;
        if (gameRAF) cancelAnimationFrame(gameRAF);
        gameRunning = true;
        startBtn.style.display = 'none';
        gameLoop();
    });

    // Cleanup when leaving
    container._cleanup = () => {
        if (gameRAF) cancelAnimationFrame(gameRAF);
        document.removeEventListener('keydown', () => {});
    };
}

// ── About surface (Nox) ───────────────────────────────────────────────────
function buildAboutSurface(container, p) {
    Object.assign(container.style, { position:'fixed', inset:0, zIndex:550 });
    const base = surfaceBase(p);

    const card = document.createElement('div');
    card.style.cssText = [
        'position:relative', 'z-index:2',
        'width:min(480px,88vw)',
        'background:rgba(0,0,8,0.82)',
        `border:1px solid ${p.glowColor}44`,
        'border-radius:14px', 'padding:28px 32px',
        `box-shadow:0 0 40px ${p.glowColor}18, inset 0 1px 0 rgba(255,255,255,0.05)`,
        'display:flex', 'flex-direction:column', 'gap:16px',
    ].join(';');

    const makeSection = (label, content) => {
        const sec = document.createElement('div');
        const lbl = document.createElement('div');
        lbl.style.cssText = `font-size:9px;font-weight:700;letter-spacing:0.12em;color:${p.glowColor};text-transform:uppercase;margin-bottom:5px;`;
        lbl.textContent = label;
        const cnt = document.createElement('div');
        cnt.style.cssText = 'font-size:13px;color:rgba(200,220,255,0.85);line-height:1.65;';
        cnt.innerHTML = content;
        sec.append(lbl, cnt);
        return sec;
    };

    const divider = () => {
        const d = document.createElement('div');
        d.style.cssText = `height:1px;background:linear-gradient(90deg,transparent,${p.glowColor}44,transparent);`;
        return d;
    };

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:16px;';

    const avatar = document.createElement('div');
    avatar.style.cssText = [
        'width:56px', 'height:56px', 'border-radius:50%',
        `background:radial-gradient(circle at 35% 35%, rgba(${hexToRgb(p.glowColor)},0.6), rgba(0,0,20,0.8))`,
        `border:2px solid ${p.glowColor}66`,
        `box-shadow:0 0 20px ${p.glowColor}44`,
        'flex-shrink:0', 'display:flex', 'align-items:center', 'justify-content:center',
        'font-size:22px',
    ].join(';');
    avatar.textContent = '◎';

    const headerText = document.createElement('div');
    const hName = document.createElement('div');
    hName.style.cssText = 'font-size:18px;font-weight:700;color:rgba(220,235,255,0.95);letter-spacing:-0.01em;';
    hName.textContent = 'Ramsey Knox';
    const hSub = document.createElement('div');
    hSub.style.cssText = `font-size:11px;color:${p.glowColor};letter-spacing:0.06em;margin-top:2px;`;
    hSub.textContent = 'Producer · Vocalist · Stockholm';
    headerText.append(hName, hSub);
    header.append(avatar, headerText);

    card.append(
        header,
        divider(),
        makeSection('About', 'Making old-school R&B for new ears. Based in Stockholm. This site is an interactive archive of music, ideas, and whatever else ends up orbiting the same star.'),
        divider(),
        makeSection('Links', `
            <div style="display:flex;flex-direction:column;gap:6px;">
                <a href="#" style="color:inherit;text-decoration:none;opacity:0.7;">🎵 Spotify — Ramsey Knox</a>
                <a href="#" style="color:inherit;text-decoration:none;opacity:0.7;">📹 TikTok — @ramseyknox</a>
                <a href="#" style="color:inherit;text-decoration:none;opacity:0.7;">📸 Instagram — @ramseyknox</a>
            </div>
        `),
        divider(),
        makeSection('Built with', 'Three.js · Web Audio API · WebGL · KnoxiaOS'),
    );

    base.appendChild(card);
    container.appendChild(base);
}

// ── Leave planet ──────────────────────────────────────────────────────────
function leavePlanet() {
    if (surfaceEl) {
        if (surfaceEl._cleanup) surfaceEl._cleanup();
        surfaceEl.remove();
        surfaceEl = null;
    }

    const idx = currentPlanet;
    currentPlanet = null;

    // Zoom camera back to orbit position
    gsap.to(camera.position, {
        x: 0, y: 40, z: 140,
        duration: 2.0, ease: 'power2.inOut',
        onUpdate: () => camera.lookAt(0, 0, 0),
        onComplete: () => {
            // Smoothly resume the planet's orbit
            if (idx !== null) {
                const reaccel = { mult: 0 };
                gsap.to(reaccel, {
                    mult: 1, duration: 1.5, ease: 'power2.inOut',
                    onUpdate: () => { planetSpeedMult[idx] = reaccel.mult; },
                });
            }
        }
    });
}

// ── Leave to OS ───────────────────────────────────────────────────────────
function leaveToOS() {
    // Glitch flash then hand back to main.js
    const glitch = document.createElement('div');
    glitch.style.cssText = 'position:fixed;inset:0;z-index:700;pointer-events:none;';
    document.body.appendChild(glitch);

    let ticks = 0;
    const flicker = setInterval(() => {
        glitch.style.background = ticks % 2 === 0
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(0,200,255,0.05)';
        ticks++;
        if (ticks > 8) {
            clearInterval(flicker);
            glitch.remove();
            shutdown('os');
        }
    }, 60);
}

// ── Leave experience ──────────────────────────────────────────────────────
function leaveExperience() {
    shutdown('exit');
}

// ── Shutdown orbit ────────────────────────────────────────────────────────
function shutdown(mode) {
    orbitActive = false;
    if (animRAF) { cancelAnimationFrame(animRAF); animRAF = null; }
    if (uiEl) { uiEl.remove(); uiEl = null; }
    if (surfaceEl) { surfaceEl.remove(); surfaceEl = null; }

    if (window.KnoxiaOrbit._onLeave) {
        window.KnoxiaOrbit._onLeave(mode);
    }
}

// ── Public API ────────────────────────────────────────────────────────────
window.KnoxiaOrbit = {
    enter: (threeRef, rendererRef, canvasRef, onLeave) => {
        // Receive THREE from main.js — avoids module timing issues
        THREE    = threeRef;
        renderer = rendererRef;
        canvas   = canvasRef;
        window.KnoxiaOrbit._onLeave = onLeave;

        // Build scene now that THREE is available
        if (!scene) buildScene();

        enter(rendererRef, canvasRef, null);
    },
    isActive: () => orbitActive,
    _onLeave: null,
};

})();
