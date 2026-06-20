import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

window.addEventListener('DOMContentLoaded', () => {

    // ── Shared canvas / elements ───────────────────────────────────────────
    const canvas       = document.querySelector('#monitor-canvas');
    const uiOverlay    = document.getElementById('ui-overlay');
    const enterBtn     = document.getElementById('enter-btn');
    const infoBtn      = document.getElementById('info-btn');
    const infoModal    = document.getElementById('info-modal');
    const closeInfo    = document.getElementById('close-info');
    const transOverlay = document.getElementById('transition-overlay');
    const crtCanvas    = document.getElementById('crt-canvas');
    const osLayer      = document.getElementById('os-layer');
    const crtCtx       = crtCanvas.getContext('2d');

    let appState = 'LOADING';

    // ═════════════════════════════════════════════════════════════════════
    // SCENE A — Intro: monitor sitting in space
    // SCENE B — Star tunnel: 3D fly-through before OS
    // Both rendered on the same WebGL canvas; we swap scenes.
    // ═════════════════════════════════════════════════════════════════════

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.autoClear = true;

    // ── AUDIO ─────────────────────────────────────────────────────────────
    const listener      = new THREE.AudioListener();
    const bootSound     = new THREE.Audio(listener);
    const shutdownSound = new THREE.Audio(listener);
    const ambientTrack  = new THREE.Audio(listener);
    const audioLoader   = new THREE.AudioLoader();

    audioLoader.load('./boot.wav',     b => { bootSound.setBuffer(b);     bootSound.setVolume(0.8); });
    audioLoader.load('./shutdown.wav', b => { shutdownSound.setBuffer(b); shutdownSound.setVolume(0.6); });
    audioLoader.load('./ambience.wav', b => { ambientTrack.setBuffer(b);  ambientTrack.setLoop(true); ambientTrack.setVolume(0); });

    // ═════════════════════════════════════════════════════════════════════
    // SCENE A — Intro scene
    // ═════════════════════════════════════════════════════════════════════
    const sceneA  = new THREE.Scene();
    sceneA.background = new THREE.Color(0x010106);

    const cameraA  = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 2000);
    const menuPos  = { x: 12, y: 6, z: 28 };
    cameraA.position.set(menuPos.x, menuPos.y, menuPos.z);
    cameraA.lookAt(0, 0, 0);
    cameraA.add(listener);

    sceneA.add(new THREE.HemisphereLight(0xffffff, 0x000000, 0.1));
    const introLight = new THREE.PointLight(0xffffff, 0, 100);
    introLight.position.set(-15, 5, 10);
    sceneA.add(introLight);

    // Background stars for scene A
    let starFieldA, starOffsetsA = [];
    const shootingStars = [];

    (function buildSceneAStars() {
        const COUNT = 4000;
        const geo   = new THREE.BufferGeometry();
        const mat   = new THREE.PointsMaterial({
            size: 1.2, transparent: true, opacity: 0,
            sizeAttenuation: true, depthWrite: false, vertexColors: true,
        });
        mat.map = new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/disc.png');
        mat.alphaTest = 0.01;
        const v = [], c = [];
        for (let i = 0; i < COUNT; i++) {
            v.push((Math.random()-0.5)*1500, (Math.random()-0.5)*800, -Math.random()*500-100);
            const b = Math.random()*0.5+0.5; c.push(b,b,b);
            starOffsetsA.push(Math.random()*Math.PI*2);
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        geo.setAttribute('color',    new THREE.Float32BufferAttribute(c, 3));
        starFieldA = new THREE.Points(geo, mat);
        sceneA.add(starFieldA);
    })();

    function spawnShootingStar() {
        const geo   = new THREE.BufferGeometry();
        const mat   = new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:1, blending:THREE.AdditiveBlending });
        const start = new THREE.Vector3((Math.random()-0.5)*1000, (Math.random()-0.5)*600, -Math.random()*300-200);
        const dir   = new THREE.Vector3(Math.random()*0.5+0.5, -(Math.random()*0.5+0.2), 0).normalize();
        const end   = start.clone().add(dir.clone().multiplyScalar(40+Math.random()*60));
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([start.x,start.y,start.z,end.x,end.y,end.z]), 3));
        const s = new THREE.Line(geo, mat);
        s.userData = { velocity: dir.multiplyScalar(200), life: 1.0 };
        shootingStars.push(s); sceneA.add(s);
    }
    setInterval(() => { if (appState === 'INTRO') spawnShootingStar(); }, 4500);

    let monitorGroup;

    // ── Screen texture canvas ──────────────────────────────────────────────
    // Renders directly onto the CRT screen mesh via CanvasTexture
    const screenCanvas  = document.createElement('canvas');
    screenCanvas.width  = 512;
    screenCanvas.height = 384;
    const screenCtx     = screenCanvas.getContext('2d');
    let   screenTexture = null;

    function clearScreenCanvas() {
        screenCtx.fillStyle = '#000';
        screenCtx.fillRect(0, 0, screenCanvas.width, screenCanvas.height);
        if (screenTexture) screenTexture.needsUpdate = true;
    }
    clearScreenCanvas();
    const mouse     = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    window.addEventListener('mousemove', e => {
        mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    // ── TUNNEL STARS IN SCENE A ───────────────────────────────────────────
    // The star tunnel lives in sceneA, starting just behind the monitor screen
    // (z ≈ -2) and extending deep into negative Z. This means cameraA can fly
    // through it continuously — no scene swap, no cuts.
    let tunnelStarsA = null;
    const TUNNEL_A_LENGTH = 2400;
    const TUNNEL_A_RADIUS = 500;
    const TUNNEL_A_START  = -2; // just behind the monitor screen face

    (function buildTunnelStarsInSceneA() {
        const COUNT = 5000;
        const geo   = new THREE.BufferGeometry();
        const mat   = new THREE.PointsMaterial({
            size: 1.4, transparent: true, opacity: 0,
            sizeAttenuation: true, depthWrite: false, color: 0xffffff,
        });
        mat.map = new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/disc.png');
        mat.alphaTest = 0.01;

        const positions = [];
        for (let i = 0; i < COUNT; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r     = Math.pow(Math.random(), 0.5) * TUNNEL_A_RADIUS;
            positions.push(
                Math.cos(angle) * r,
                Math.sin(angle) * r,
                TUNNEL_A_START - Math.random() * TUNNEL_A_LENGTH
            );
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        tunnelStarsA = new THREE.Points(geo, mat);
        sceneA.add(tunnelStarsA);
    })();

    function resetTunnelStarsA() {
        if (!tunnelStarsA) return;
        const pos = tunnelStarsA.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r     = Math.pow(Math.random(), 0.5) * TUNNEL_A_RADIUS;
            pos.setXYZ(i,
                Math.cos(angle) * r,
                Math.sin(angle) * r,
                TUNNEL_A_START - Math.random() * TUNNEL_A_LENGTH
            );
        }
        pos.needsUpdate = true;
        tunnelStarsA.material.opacity = 0;
    }
    // A deep 3D space the camera flies through. Stars at varying Z depths
    // create genuine parallax — close stars blur past, far ones barely move.
    // ═════════════════════════════════════════════════════════════════════
    const sceneB  = new THREE.Scene();
    sceneB.background = new THREE.Color(0x000002);

    const cameraB = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
    cameraB.position.set(0, 0, 0);
    cameraB.lookAt(0, 0, -1);

    // Fog — stars in the far distance fade into black, adds depth
    sceneB.fog = new THREE.FogExp2(0x000002, 0.0008);

    // Star field B — 3D points with real Z depth
    // Stars distributed in a long tube in front of the camera
    let starFieldB;
    const TUNNEL_LENGTH = 2400; // how deep the star room goes
    const TUNNEL_RADIUS = 500;  // width/height of the room

    (function buildSceneBStars() {
        const COUNT = 5000;
        const geo   = new THREE.BufferGeometry();
        const v = [], c = [], sizes = [];

        for (let i = 0; i < COUNT; i++) {
            // Distribute in a cylinder so stars surround the camera path
            const angle = Math.random() * Math.PI * 2;
            const r     = Math.pow(Math.random(), 0.5) * TUNNEL_RADIUS; // bias outward
            const x     = Math.cos(angle) * r;
            const y     = Math.sin(angle) * r;
            const z     = -(Math.random() * TUNNEL_LENGTH); // ahead of camera

            v.push(x, y, z);

            // Slight color variation — most white, some faintly blue
            const warm = Math.random();
            const rb   = warm > 0.85 ? 0.75 + Math.random()*0.15 : 1.0;
            const gb   = warm > 0.85 ? 0.82 + Math.random()*0.12 : 1.0;
            c.push(rb, gb, 1.0);

            sizes.push(Math.random() * 2.5 + 0.5);
        }

        geo.setAttribute('position', new THREE.Float32BufferAttribute(v,     3));
        geo.setAttribute('color',    new THREE.Float32BufferAttribute(c,     3));
        geo.setAttribute('size',     new THREE.Float32BufferAttribute(sizes, 1));

        // Random phase offset per star for independent twinkling
        const twinkleOffsets = new Float32Array(COUNT);
        const twinkleSpeeds  = new Float32Array(COUNT);
        for (let i = 0; i < COUNT; i++) {
            twinkleOffsets[i] = Math.random() * Math.PI * 2;
            twinkleSpeeds[i]  = 0.4 + Math.random() * 0.8; // vary speed slightly
        }
        geo.userData.twinkleOffsets = twinkleOffsets;
        geo.userData.twinkleSpeeds  = twinkleSpeeds;
        geo.userData.baseColors     = new Float32Array(c); // store original colors

        const mat = new THREE.PointsMaterial({
            size: 1.8, sizeAttenuation: true,
            transparent: true, opacity: 0,
            vertexColors: true, depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        mat.map = new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/disc.png');
        mat.alphaTest = 0.01;

        starFieldB = new THREE.Points(geo, mat);
        sceneB.add(starFieldB);

        // Permanent lighting for sceneB (needed for space core and any 3D objects)
        sceneB.add(new THREE.AmbientLight(0x334455, 1.2));
        sceneB.add(new THREE.DirectionalLight(0xffffff, 0.6));
    })();

    // Resets all star positions back to their original distribution
    // Called each time we enter the star room so re-entry is always fresh
    function resetStarFieldB() {
        const positions = starFieldB.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r     = Math.pow(Math.random(), 0.5) * TUNNEL_RADIUS;
            positions.setXYZ(
                i,
                Math.cos(angle) * r,
                Math.sin(angle) * r,
                -(Math.random() * TUNNEL_LENGTH)
            );
        }
        positions.needsUpdate = true;
        starFieldB.material.opacity = 0;
    }

    // ── OS PREVIEW SCREEN — what we crash into ────────────────────────────
    // A floating "monitor" showing the real desktop wallpaper, planted at
    // the far end of the tunnel dead ahead of the camera. We fly straight
    // at it, it grows into a glowing portal, then we punch through it into
    // the actual OS — instead of just blacking out into a flat white flash.
    let osScreenMesh, osScreenGlow;
    const OS_SCREEN_Z = -(TUNNEL_LENGTH * 0.92 + 70);

    (function buildOSPreviewScreen() {
        const screenTex = new THREE.TextureLoader().load('./wallpaper.jpg');
        screenTex.colorSpace = THREE.SRGBColorSpace;

        const screenW = 130, screenH = screenW * 0.625; // 16:10, matches the desktop
        const screenMat = new THREE.MeshBasicMaterial({
            map: screenTex, transparent: true, opacity: 0, toneMapped: false,
        });
        osScreenMesh = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), screenMat);
        osScreenMesh.position.set(0, 0, OS_SCREEN_Z);
        sceneB.add(osScreenMesh);

        // Soft additive glow halo bleeding out from behind the screen
        const gc = document.createElement('canvas');
        gc.width = gc.height = 256;
        const gctx = gc.getContext('2d');
        const grad = gctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        grad.addColorStop(0,   'rgba(150,195,255,0.95)');
        grad.addColorStop(0.5, 'rgba(90,150,255,0.35)');
        grad.addColorStop(1,   'rgba(40,80,200,0)');
        gctx.fillStyle = grad;
        gctx.fillRect(0, 0, 256, 256);

        const glowMat = new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(gc), transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false,
        });
        osScreenGlow = new THREE.Mesh(new THREE.PlaneGeometry(screenW * 2.4, screenH * 2.4), glowMat);
        osScreenGlow.position.set(0, 0, OS_SCREEN_Z - 4);
        sceneB.add(osScreenGlow);
    })();

    // Re-arms the preview screen so each entry into the star room is fresh
    function resetOSPreviewScreen() {
        osScreenMesh.material.opacity = 0;
        osScreenGlow.material.opacity = 0;
        osScreenMesh.rotation.set(0, 0, 0);
    }

    // ── SPACE CORE easter egg ─────────────────────────────────────────────
    // 60% chance of appearing each run. Random position, visibly drifting.
    let spaceCoreGroup = null;
    let spaceCoreRAF   = null;

    function buildSpaceCore() {
        // 60% chance
        if (Math.random() > 0.6) return;

        const group = new THREE.Group();
        spaceCoreGroup = group;

        const bodyGeo = new THREE.SphereGeometry(4, 16, 12);
        bodyGeo.scale(1, 1.1, 1);
        const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color:0xd0cfc8, roughness:0.55, metalness:0.4 }));
        group.add(body);

        const eyeRing = new THREE.Mesh(
            new THREE.TorusGeometry(2.2, 0.35, 12, 32),
            new THREE.MeshStandardMaterial({ color:0x888880, roughness:0.3, metalness:0.8 })
        );
        eyeRing.position.set(0, 0, 3.8);
        group.add(eyeRing);

        const iris = new THREE.Mesh(
            new THREE.CircleGeometry(1.8, 32),
            new THREE.MeshStandardMaterial({ color:0x001a33, roughness:0.1, metalness:0.2 })
        );
        iris.position.set(0, 0, 4.05);
        group.add(iris);

        const pupilMesh = new THREE.Mesh(
            new THREE.CircleGeometry(0.7, 24),
            new THREE.MeshStandardMaterial({ color:0x44aaff, emissive:0x2266ff, emissiveIntensity:2.5, roughness:0, metalness:0 })
        );
        pupilMesh.position.set(0, 0, 4.1);
        group.add(pupilMesh);

        const slatGeo = new THREE.BoxGeometry(8.2, 0.25, 0.25);
        const slatMat = new THREE.MeshStandardMaterial({ color:0xaaa89a, roughness:0.6, metalness:0.5 });
        [-1.8, 0, 1.8].forEach(y => {
            const s = new THREE.Mesh(slatGeo, slatMat);
            s.position.set(0, y, 0);
            group.add(s);
        });

        const eyeLight = new THREE.PointLight(0x3388ff, 1.2, 30);
        eyeLight.position.set(0, 0, 6);
        group.add(eyeLight);

        // Random position: somewhere between 20%-50% depth, offset to one side
        const side    = Math.random() < 0.5 ? 1 : -1;
        const xOffset = (60 + Math.random() * 60) * side;
        const yOffset = (Math.random() - 0.5) * 80;
        const zDepth  = -(TUNNEL_LENGTH * (0.2 + Math.random() * 0.3));
        group.position.set(xOffset, yOffset, zDepth);
        group.rotation.y = -0.6 * side;
        group.rotation.z = (Math.random() - 0.5) * 0.4;

        sceneB.add(group);

        // Gentle drift velocity — moves slowly through space
        const drift = new THREE.Vector3(
            (Math.random() - 0.5) * 0.015,
            (Math.random() - 0.5) * 0.01,
            (Math.random() - 0.5) * 0.008
        );

        let angle = 0;
        function animateCore() {
            spaceCoreRAF = requestAnimationFrame(animateCore);
            if (appState === 'OS_ACTIVE' || appState === 'LOADING') return;

            // Drift through space
            group.position.add(drift);

            // Tumble
            angle += 0.004;
            group.rotation.y += 0.003;
            group.rotation.x = Math.sin(angle * 0.7) * 0.15;

            // Pupil wander
            pupilMesh.position.x = Math.sin(angle * 1.3) * 0.25;
            pupilMesh.position.y = Math.cos(angle * 0.9) * 0.2;
        }
        animateCore();
    }

    function destroySpaceCore() {
        if (spaceCoreRAF) { cancelAnimationFrame(spaceCoreRAF); spaceCoreRAF = null; }
        if (spaceCoreGroup) { sceneB.remove(spaceCoreGroup); spaceCoreGroup = null; }
    }

    // ── Which scene are we rendering ──────────────────────────────────────
    let activeScene  = sceneA;
    let activeCamera = cameraA;

    // ═════════════════════════════════════════════════════════════════════
    // INTRO UI
    // ═════════════════════════════════════════════════════════════════════
    gsap.set(uiOverlay, { opacity: 0 });

    enterBtn.addEventListener('click', () => {
        if (appState !== 'INTRO') return;
        appState = 'TRANSITIONING';
        uiOverlay.style.pointerEvents = 'none';
        gsap.to(uiOverlay, { opacity:0, duration:0.5, onComplete:() => { uiOverlay.style.display='none'; } });
        gsap.to(introLight, { intensity:2, duration:1.8 });

        // ── Step 1: Fade star preview onto monitor screen via canvas blend ──
        // We keep the screen mesh on screenTexture (never transparent).
        // Instead we draw the render target into a temp canvas and blend
        // it onto screenCanvas using globalAlpha — clean fade, no flash.
        if (window._previewRT && window._previewCam && window._screenMesh) {
            resetStarFieldB();
            starFieldB.material.opacity = 0.9;

            // Render one frame into the RT
            window._previewCam.position.copy(cameraA.position);
            window._previewCam.quaternion.copy(cameraA.quaternion);
            window._previewCam.fov    = cameraA.fov;
            window._previewCam.aspect = 512 / 384;
            window._previewCam.updateProjectionMatrix();
            monitorGroup.visible = false;
            renderer.setRenderTarget(window._previewRT);
            renderer.render(sceneA, window._previewCam);
            renderer.setRenderTarget(null);
            monitorGroup.visible = true;

            // Start live rendering and flag for fade
            window._previewLive     = true;
            window._previewAlpha    = 0;
            window._previewFadingIn = true;

            // Fade alpha 0→1 over 0.8s, then start zoom
            gsap.to(window, {
                _previewAlpha: 1,
                duration: 0.8,
                ease: 'power2.out',
                onComplete: startZoom,
            });
        } else {
            startZoom();
        }

        // ── Step 2: Camera zooms toward monitor, then enters star scene ───
        function startZoom() {
            resetOSPreviewScreen();
            destroySpaceCore();
            buildSpaceCore();

            let sceneSwapped = false;
            gsap.to(cameraA.position, {
                x: 0, y: 0, z: 3.5,
                duration: 2.3, ease: 'expo.in',
                onUpdate: () => {
                    cameraA.lookAt(0, 0, 0);
                    if (!sceneSwapped && cameraA.position.z < 6.8) {
                        sceneSwapped = true;
                        window._previewLive = false; // stop live render
                        enterStarRoom();
                    }
                },
            });
        }
    });

    // Reusable offscreen canvas for render target → screenCanvas blending
    const previewOffscreen    = document.createElement('canvas');
    previewOffscreen.width    = 512;
    previewOffscreen.height   = 384;
    const previewOffscreenCtx = previewOffscreen.getContext('2d');
    window._previewAlpha      = 0;
    window._previewLive       = false;
    infoBtn.addEventListener('click',   () => infoModal.classList.remove('modal-hidden'));
    closeInfo.addEventListener('click', () => infoModal.classList.add('modal-hidden'));

    // ═════════════════════════════════════════════════════════════════════
    // ENTER STAR ROOM
    // Swap to scene B, fly through stars, then boot into OS.
    // ═════════════════════════════════════════════════════════════════════
    function enterStarRoom() {
        if (bootSound.buffer) bootSound.play();

        // Reset star field positions back to initial distribution
        resetStarFieldB();
        resetOSPreviewScreen();

        // Spawn space core (60% chance, random position)
        destroySpaceCore();
        buildSpaceCore();

        // Switch to scene B immediately and start flying
        activeScene  = sceneB;
        activeCamera = cameraB;
        cameraB.position.set(0, 0, 0);
        cameraB.lookAt(0, 0, -1);
        cameraB.fov = 75;
        cameraB.updateProjectionMatrix();
        starFieldB.material.opacity = 0.9;

        // Start the fly-through immediately — no waiting
        flyThroughStars(() => {
            doScreenCrash(() => {
                activeScene  = sceneA;
                activeCamera = cameraA;
                canvas.style.display = 'none';
                osLayer.style.display = 'block';
                gsap.from(osLayer, { opacity:0, duration:0.7, ease:'power2.out' });
                appState = 'OS_ACTIVE';

                if (bootSound.buffer && ambientTrack.buffer) {
                    const bootDur = bootSound.buffer.duration * 1000;
                    setTimeout(() => {
                        ambientTrack.setVolume(0);
                        ambientTrack.play();
                        gsap.to(ambientTrack.gain.gain, { value:0.28, duration:5, ease:'power1.in' });
                    }, Math.max(0, bootDur - 1500));
                }

                window.KnoxiaOS.init();
                window._ambienceTrack = ambientTrack;
            });
        });

        // Fade in from black quickly — hides the scene swap seam
        // Scene is already flying underneath; user fades in mid-flight
        gsap.killTweensOf(transOverlay);
        gsap.set(transOverlay, { opacity: 1 });
        gsap.to(transOverlay, { opacity: 0, duration: 0.55, ease: 'power2.out' });
    }

    // ── Fly-through animation ─────────────────────────────────────────────
    // Three phases:
    //   DRIFT   (0-35%): slow, serene — floating in the star room
    //   ACCEL   (35-80%): gradual pull, stars start sliding past
    //   WARP    (80-100%): explosive speed, everything blurs, white blooms ahead
    //
    // Camera moves along -Z. FOV also expands slightly at warp for tunnel feel.
    // startT: where on the 0..1 curve to begin (default 0.45 = already moving well)
    function flyThroughStars(onComplete, startT = 0.58, startZ = 0) {
        const TOTAL_MS    = 5200;
        const TOTAL_DIST  = TUNNEL_LENGTH * 0.92;

        let startTime  = performance.now() - (startT * TOTAL_MS);

        let driftX = 0, driftY = 0, driftAngle = 0;
        let camZ = startZ; // begin from handed-off depth
        let rafId;

        function tick(now) {
            const elapsed = now - startTime;
            const t       = Math.min(elapsed / TOTAL_MS, 1);

            // Speed curve: power of 2.8 gives a smooth but not too-flat start.
            // At t=0.45 this gives eased≈0.12, meaning we're already moving.
            // At t=1.0 we've covered the full distance.
            const eased = Math.pow(t, 2.8);

            camZ = -eased * TOTAL_DIST;
            cameraB.position.z = camZ;

            // Gentle camera drift (adds life to the slow phase)
            driftAngle += 0.008;
            const driftAmt = Math.pow(Math.max(0, 1 - t * 1.4), 2) * 0.5; // only in early phase
            driftX = Math.sin(driftAngle * 0.7) * driftAmt;
            driftY = Math.cos(driftAngle * 0.5) * driftAmt;
            cameraB.position.x = driftX;
            cameraB.position.y = driftY;
            cameraB.lookAt(driftX * 0.3, driftY * 0.3, camZ - 100);

            // FOV expands smoothly during the latter half of the journey
            cameraB.fov = 75 + Math.pow(Math.max(0, (t - 0.5) / 0.5), 2) * 28;
            cameraB.updateProjectionMatrix();

            // The OS preview screen grows into view dead ahead — this is the
            // target we're flying toward. It fades in, wobbles gently like a
            // beacon, then settles dead-still as we lock onto it for impact.
            if (t > 0.4) {
                const screenT = Math.min((t - 0.4) / 0.5, 1);
                const smooth  = screenT * screenT * (3 - 2 * screenT);
                osScreenMesh.material.opacity = smooth;
                osScreenGlow.material.opacity = smooth * 0.85 * (0.85 + 0.15 * Math.sin(now * 0.004));
                const settle = 1 - smooth * 0.7;
                osScreenMesh.rotation.y = Math.sin(now * 0.0006) * 0.05 * settle;
                osScreenMesh.rotation.x = Math.cos(now * 0.0004) * 0.03 * settle;
            }

            // Star field opacity fades out at warp peak → white takes over
            if (t > 0.88) {
                const fadeT = (t - 0.88) / 0.12;
                starFieldB.material.opacity = Math.max(0, 0.9 - fadeT * 0.9);
            }

            // Recycle stars that the camera has passed
            const positions = starFieldB.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) {
                const sz = positions.getZ(i);
                // If camera passed this star, teleport it far ahead
                if (sz > camZ + 30) {
                    positions.setXYZ(
                        i,
                        (Math.random()-0.5) * TUNNEL_RADIUS * 2,
                        (Math.random()-0.5) * TUNNEL_RADIUS * 2,
                        camZ - (Math.random() * TUNNEL_LENGTH * 0.8 + 100)
                    );
                }
            }
            positions.needsUpdate = true;

            if (t < 1) {
                rafId = requestAnimationFrame(tick);
            } else {
                cameraB.fov = 75;
                cameraB.updateProjectionMatrix();
                onComplete();
            }
        }

        rafId = requestAnimationFrame(tick);
    }

    // ── Screen crash ──────────────────────────────────────────────────────
    // The camera makes a final hard lunge straight through the OS preview
    // screen — FOV slams in, the screen blows out bright, the camera shakes
    // on impact — then a radial flash burst covers the cut to the real OS.
    function doScreenCrash(onComplete) {
        crtCanvas.width         = window.innerWidth;
        crtCanvas.height        = window.innerHeight;
        crtCanvas.style.display = 'block';
        crtCanvas.style.opacity = '1';

        const PUNCH_MS = 420;
        const targetZ  = OS_SCREEN_Z - 160; // overshoot — fly clean through the plane

        gsap.to(cameraB.position, {
            z: targetZ, duration: PUNCH_MS / 1000, ease: 'power4.in',
            onUpdate: () => cameraB.lookAt(0, 0, targetZ - 300),
        });
        // FOV slams narrow — pure g-force, we cut away before it can recover
        gsap.to(cameraB, {
            fov: 46, duration: PUNCH_MS / 1000, ease: 'power3.in',
            onUpdate: () => cameraB.updateProjectionMatrix(),
        });
        // The screen and its glow blow out bright right as we hit it
        gsap.to(osScreenMesh.material, { opacity: 0, duration: 0.18, delay: 0.16 });
        gsap.to(osScreenGlow.material, { opacity: 0, duration: 0.18, delay: 0.16 });

        // Camera shake — builds through the lunge
        const shakeStart = performance.now();
        (function shakeTick() {
            const e = performance.now() - shakeStart;
            if (e >= PUNCH_MS) return;
            const mag = Math.pow(e / PUNCH_MS, 2) * 2.2;
            cameraB.position.x += (Math.random() - 0.5) * mag;
            cameraB.position.y += (Math.random() - 0.5) * mag;
            requestAnimationFrame(shakeTick);
        })();

        // Impact flash fires right as the camera reaches the screen
        setTimeout(() => {
            playImpactFlash(() => {
                crtCanvas.style.display = 'none';
                cameraB.fov = 75;
                cameraB.updateProjectionMatrix();
                onComplete();
            });
        }, PUNCH_MS * 0.62);
    }

    // ── Impact flash ───────────────────────────────────────────────────────
    // Radial speed-line burst + white blowout, drawn on the crtCanvas overlay
    function playImpactFlash(onComplete) {
        const w = crtCanvas.width, h = crtCanvas.height;
        const cx = w / 2, cy = h / 2;
        const streaks = Array.from({ length: 48 }, (_, i) => ({
            angle: Math.random() * Math.PI * 2,
            len:   0.45 + (i % 6) * 0.12,
        }));

        const STREAK_MS = 110, FLASH_IN = 70, HOLD = 70, FLASH_OUT = 360;
        const start = performance.now();

        // At the same moment, hide the WebGL canvas (OS will appear behind)
        setTimeout(() => { canvas.style.display = 'none'; }, FLASH_IN + HOLD - 10);

        function tick(now) {
            const e = now - start;
            crtCtx.clearRect(0, 0, w, h);

            // Radial speed-line burst, fading as it expands outward
            const streakT = Math.min(e / STREAK_MS, 1);
            crtCtx.save();
            crtCtx.globalCompositeOperation = 'lighter';
            streaks.forEach((s, i) => {
                const len   = streakT * Math.max(w, h) * s.len;
                const x2    = cx + Math.cos(s.angle) * len;
                const y2    = cy + Math.sin(s.angle) * len;
                const alpha = (1 - streakT) * 0.6;
                crtCtx.strokeStyle = i % 3 === 0 ? `rgba(255,255,255,${alpha})` : `rgba(150,200,255,${alpha})`;
                crtCtx.lineWidth = 1.5;
                crtCtx.beginPath();
                crtCtx.moveTo(cx, cy);
                crtCtx.lineTo(x2, y2);
                crtCtx.stroke();
            });
            crtCtx.restore();

            // White blowout
            let alpha;
            if      (e < FLASH_IN)        alpha = e / FLASH_IN;
            else if (e < FLASH_IN + HOLD) alpha = 1;
            else {
                const t = (e - FLASH_IN - HOLD) / FLASH_OUT;
                alpha = 1 - Math.pow(t, 0.6);
                if (t >= 1) { onComplete(); return; }
            }
            crtCtx.fillStyle = `rgba(255,255,255,${alpha})`;
            crtCtx.fillRect(0, 0, w, h);

            requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    // ═════════════════════════════════════════════════════════════════════
    // ORBIT EXPERIENCE
    // ═════════════════════════════════════════════════════════════════════
    window.addEventListener('knoxiaos:orbit', () => {
        if (appState !== 'OS_ACTIVE') return;
        appState = 'ORBIT_ACTIVE';

        // Stop ambient
        if (ambientTrack.isPlaying) {
            gsap.to(ambientTrack.gain.gain, { value:0, duration:0.5, onComplete:() => ambientTrack.stop() });
        }

        // CRT glitch effect over OS, then transition to orbit
        crtCanvas.width         = window.innerWidth;
        crtCanvas.height        = window.innerHeight;
        crtCanvas.style.display = 'block';
        crtCanvas.style.opacity = '1';

        playCRTFlicker(() => {
            osLayer.style.display = 'none';
            crtCanvas.style.display = 'none';

            // Fade in the WebGL canvas with the orbit scene
            canvas.style.display = 'block';
            gsap.set(transOverlay, { opacity: 1 });

            // Init and enter orbit
            KnoxiaOrbit.enter(THREE, renderer, canvas, (mode) => {
                // Called when user leaves orbit
                if (mode === 'os') {
                    // Back to OS — glitch handled by orbit.js, now restore OS
                    gsap.to(transOverlay, {
                        opacity: 1, duration: 0.3,
                        onComplete: () => {
                            canvas.style.display = 'none';
                            osLayer.style.display = 'block';
                            gsap.to(transOverlay, { opacity: 0, duration: 0.4 });
                            appState = 'OS_ACTIVE';
                            // Restart ambient
                            if (ambientTrack.buffer) {
                                ambientTrack.setVolume(0);
                                ambientTrack.play();
                                gsap.to(ambientTrack.gain.gain, { value:0.28, duration:3 });
                            }
                        }
                    });
                } else {
                    // Leave experience — full shutdown flow
                    appState = 'SHUTTING_DOWN';
                    canvas.style.display = 'block';
                    activeScene  = sceneA;
                    activeCamera = cameraA;
                    cameraA.position.set(0, 0, 4.5);
                    cameraA.lookAt(0, 0, 0);
                    osLayer.style.display = 'none';

                    gsap.to(transOverlay, {
                        opacity: 0, duration: 0.8, delay: 0.1,
                        onComplete: () => {
                            gsap.to(cameraA.position, {
                                x: menuPos.x, y: menuPos.y, z: menuPos.z,
                                duration: 3.0, ease: 'expo.inOut',
                                onUpdate:   () => cameraA.lookAt(0, 0, 0),
                                onComplete: () => {
                                    appState = 'INTRO';
                                    uiOverlay.style.display       = 'flex';
                                    uiOverlay.style.pointerEvents = 'auto';
                                    gsap.set(uiOverlay, { opacity: 0 });
                                    gsap.to(uiOverlay,  { opacity: 1, duration: 1.5, ease: 'power2.out' });
                                    gsap.to(introLight, { intensity: 80, duration: 2 });
                                    // Reset screen mesh back to black canvas texture
                                    window._previewLive = false;
                                    if (window._screenMesh && screenTexture) {
                                        clearScreenCanvas();
                                        window._screenMesh.material.map     = screenTexture;
                                        window._screenMesh.material.opacity  = 1;
                                        window._screenMesh.material.needsUpdate = true;
                                    }
                                }
                            });
                        }
                    });
                }
            });

            gsap.to(transOverlay, { opacity: 0, duration: 0.6, delay: 0.1 });
        });
    });

    // ═════════════════════════════════════════════════════════════════════
    // SHUTDOWN
    // CRT flicker → collapse line → zoom back through stars → zoom out to intro
    // ═════════════════════════════════════════════════════════════════════
    window.addEventListener('knoxiaos:shutdown', () => {
        if (appState !== 'OS_ACTIVE') return;
        appState = 'SHUTTING_DOWN';

        // Stop all audio immediately
        if (ambientTrack.isPlaying) ambientTrack.stop();
        ambientTrack.gain.gain.value = 0;
        if (bootSound.isPlaying) bootSound.stop();
        if (shutdownSound.buffer) shutdownSound.play();

        // Show CRT canvas over OS
        crtCanvas.width         = window.innerWidth;
        crtCanvas.height        = window.innerHeight;
        crtCanvas.style.display = 'block';
        crtCanvas.style.opacity = '1';

        // Go straight to CRT collapse — no flicker
        window._crtCollapseRunning = false;
        osLayer.style.display = 'none';
        playCRTCollapse(() => {
            gsap.to(transOverlay, {
                opacity: 1, duration: 0.4,
                onComplete: () => {
                    // ── Full reset ────────────────────────────────────────
                    crtCanvas.style.display = 'none';
                    crtCtx.clearRect(0, 0, crtCanvas.width, crtCanvas.height);
                    canvas.style.display = 'block';

                    // Reset preview — screen goes black
                    window._previewLive  = false;
                    window._previewAlpha = 0;
                    clearScreenCanvas();
                    if (window._screenMesh && screenTexture) {
                        window._screenMesh.material.map = screenTexture;
                        window._screenMesh.material.needsUpdate = true;
                    }

                    // Reset space core and star fields
                    destroySpaceCore();
                    resetStarFieldB();
                    resetOSPreviewScreen();
                    if (typeof tunnelStarsA !== 'undefined' && tunnelStarsA) tunnelStarsA.material.opacity = 0;

                    // Reset both scenes and cameras
                    activeScene  = sceneA;
                    activeCamera = cameraA;
                    starFieldB.material.opacity = 0;
                    cameraB.position.set(0, 0, 0);
                    cameraB.fov = 75;
                    cameraB.updateProjectionMatrix();
                    if (starFieldA) starFieldA.material.opacity = 0.8;

                    // Reset OS layer to XP structure
                    osLayer.style.display = 'none';
                    osLayer.style.opacity = '1';
                    osLayer.innerHTML = `
                        <div id="desktop"></div>
                        <div id="start-menu"></div>
                        <div id="taskbar"></div>
                        <div id="menubar"         style="display:none;"></div>
                        <div id="app-menu"        style="display:none;"></div>
                        <div id="dock-container"  style="display:none;"><div id="dock"></div></div>
                        <div id="taskbar-windows" style="display:none;"></div>
                        <div id="system-tray"     style="display:none;"></div>
                        <div id="clock"           style="display:none;"></div>
                    `;

                    // Place camera just in front of monitor then zoom out
                    cameraA.position.set(0, 0, 4.5);
                    cameraA.lookAt(0, 0, 0);

                    gsap.to(transOverlay, {
                        opacity: 0, duration: 0.6, delay: 0.1,
                        onComplete: () => {
                            gsap.to(cameraA.position, {
                                x: menuPos.x, y: menuPos.y, z: menuPos.z,
                                duration: 3.0, ease: 'expo.inOut',
                                onUpdate: () => cameraA.lookAt(0, 0, 0),
                                onComplete: () => {
                                    appState = 'INTRO';
                                    uiOverlay.style.display       = 'flex';
                                    uiOverlay.style.pointerEvents = 'auto';
                                    gsap.set(uiOverlay, { opacity: 0 });
                                    gsap.to(uiOverlay,  { opacity: 1, duration: 1.5, ease: 'power2.out' });
                                    gsap.to(introLight, { intensity: 80, duration: 2 });
                                    startMonitorIdleEasterEgg();
                                }
                            });
                        }
                    });
                }
            });
        });
    });


    // ── CRT flicker (over OS) ─────────────────────────────────────────────
    // Simulates the monitor dying — scanlines flicker and intensity pulses
    function playCRTFlicker(onComplete) {
        const w = crtCanvas.width, h = crtCanvas.height;
        const DURATION = 900;
        const start    = performance.now();

        function tick(now) {
            const t = Math.min((now - start) / DURATION, 1);

            crtCtx.clearRect(0, 0, w, h);

            // Scanline overlay — intensifies over time
            const scanAlpha = Math.min(t * 0.5, 0.35);
            for (let y = 0; y < h; y += 2) {
                crtCtx.fillStyle = `rgba(0,0,0,${scanAlpha})`;
                crtCtx.fillRect(0, y, w, 1);
            }

            // Random brightness flicker
            const flicker = Math.sin(now * 0.06) * 0.5 + 0.5;
            const glitch  = t > 0.6 && Math.random() < 0.3 * t;

            if (glitch) {
                // Horizontal shift artifact
                const shiftY = Math.random() * h;
                const shiftH = Math.random() * 20 + 4;
                const shiftX = (Math.random() - 0.5) * 18 * t;
                crtCtx.save();
                crtCtx.globalAlpha = 0.15 * t;
                crtCtx.fillStyle   = `rgba(255,255,255,0.12)`;
                crtCtx.fillRect(0, shiftY, w, shiftH);
                crtCtx.restore();
            }

            // Overall white flash that pulses
            const pulseAlpha = flicker * t * 0.12;
            crtCtx.fillStyle = `rgba(255,255,255,${pulseAlpha})`;
            crtCtx.fillRect(0, 0, w, h);

            if (t < 1) requestAnimationFrame(tick);
            else onComplete();
        }
        requestAnimationFrame(tick);
    }

    // ── CRT collapse ───────────────────────────────────────────────────────
    // Screen shrinks to a bright horizontal line, then fades
    function playCRTCollapse(onComplete) {
        // Prevent double-running — cancel any existing collapse
        if (window._crtCollapseRunning) return;
        window._crtCollapseRunning = true;

        // Ensure canvas is sized
        if (!crtCanvas.width || !crtCanvas.height) {
            crtCanvas.width  = window.innerWidth;
            crtCanvas.height = window.innerHeight;
        }
        const w  = crtCanvas.width  || window.innerWidth;
        const h  = crtCanvas.height || window.innerHeight;
        const cy = h / 2;
        const COLLAPSE = 200, HOLD = 180, FADE = 320;
        let   phase = 'collapse', phaseStart = performance.now();

        function tick(now) {
            if (!now || !isFinite(now)) { requestAnimationFrame(tick); return; }

            // Hard guard — if dimensions are bad, skip frame
            if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) {
                requestAnimationFrame(tick);
                return;
            }

            try {
            const e = now - phaseStart;
            crtCtx.fillStyle = 'black';
            crtCtx.fillRect(0, 0, w, h);

            if (phase === 'collapse') {
                const t     = Math.min(e / COLLAPSE, 1);
                const beamH = Math.max(2, (1 - Math.pow(t, 0.5)) * h);
                const beamY = Math.max(0, cy - beamH / 2);
                const y0    = Math.max(0, beamY - 30);
                const y1    = Math.min(h, beamY + beamH + 30);

                if (isFinite(y0) && isFinite(y1) && y1 > y0) {
                    const glow = crtCtx.createLinearGradient(0, y0, 0, y1);
                    glow.addColorStop(0,   'rgba(160,255,185,0)');
                    glow.addColorStop(0.5, `rgba(180,255,200,${(1-t)*0.1})`);
                    glow.addColorStop(1,   'rgba(160,255,185,0)');
                    crtCtx.fillStyle = glow;
                    crtCtx.fillRect(0, y0, w, y1 - y0);
                }

                const cy0 = Math.max(0, beamY);
                const cy1 = Math.min(h, beamY + beamH);
                if (isFinite(cy0) && isFinite(cy1) && cy1 > cy0) {
                    const core = crtCtx.createLinearGradient(0, cy0, 0, cy1);
                    core.addColorStop(0,   'rgba(220,255,235,0)');
                    core.addColorStop(0.5, 'rgba(255,255,255,1)');
                    core.addColorStop(1,   'rgba(220,255,235,0)');
                    crtCtx.fillStyle = core;
                    crtCtx.fillRect(0, cy0, w, Math.max(2, cy1 - cy0));
                }

                if (t >= 1) { phase = 'hold'; phaseStart = performance.now(); }
                requestAnimationFrame(tick);

            } else if (phase === 'hold') {
                const flicker = 0.75 + Math.sin(e * 0.14) * 0.25;
                const glow = crtCtx.createLinearGradient(0, cy-16, 0, cy+16);
                glow.addColorStop(0,   'rgba(160,255,185,0)');
                glow.addColorStop(0.5, `rgba(200,255,220,${0.16*flicker})`);
                glow.addColorStop(1,   'rgba(160,255,185,0)');
                crtCtx.fillStyle = glow; crtCtx.fillRect(0, cy-16, w, 32);
                crtCtx.fillStyle = `rgba(255,255,255,${flicker})`;
                crtCtx.fillRect(0, cy-1, w, 2);

                if (e >= HOLD) { phase = 'fade'; phaseStart = performance.now(); }
                requestAnimationFrame(tick);

            } else {
                const t   = Math.min(e / FADE, 1);
                const a   = Math.pow(1-t, 1.2);
                const gy0 = Math.max(0, cy - 12);
                const gy1 = Math.min(h, cy + 12);
                if (isFinite(gy0) && isFinite(gy1) && gy1 > gy0) {
                    const glow = crtCtx.createLinearGradient(0, gy0, 0, gy1);
                    glow.addColorStop(0,   'rgba(160,255,185,0)');
                    glow.addColorStop(0.5, `rgba(200,255,220,${a*0.12})`);
                    glow.addColorStop(1,   'rgba(160,255,185,0)');
                    crtCtx.fillStyle = glow;
                    crtCtx.fillRect(0, gy0, w, gy1 - gy0);
                }
                crtCtx.fillStyle = `rgba(255,255,255,${a})`;
                crtCtx.fillRect(0, cy-1, w, 2);

                if (t >= 1) { crtCtx.clearRect(0,0,w,h); window._crtCollapseRunning = false; onComplete(); return; }
                requestAnimationFrame(tick);
            }
            } catch(err) {
                // If any drawing fails, skip frame and continue
                requestAnimationFrame(tick);
            }
        }
        requestAnimationFrame(tick);
    }

    // ── Fly backward through stars ────────────────────────────────────────
    // Reverse of flyThroughStars: starts at warp, decelerates to drift
    function flyBackThroughStars(onComplete) {
        const TOTAL_MS   = 4200;
        const TOTAL_DIST = TUNNEL_LENGTH * 0.92;
        const startZ     = -TOTAL_DIST;
        const startTime  = performance.now();
        let driftAngle   = 0;

        function tick(now) {
            const elapsed = now - startTime;
            const t       = Math.min(elapsed / TOTAL_MS, 1);

            // Single continuous deceleration — exact mirror of the entry curve.
            const eased = 1 - Math.pow(1 - t, 2.8);

            const camZ = startZ + eased * TOTAL_DIST;
            cameraB.position.z = camZ;

            // Gentle drift returns as we slow down
            driftAngle += 0.008;
            const driftAmt = Math.pow(Math.max(0, t * 1.4 - 0.4), 2) * 0.5;
            cameraB.position.x = Math.sin(driftAngle * 0.7) * driftAmt;
            cameraB.position.y = Math.cos(driftAngle * 0.5) * driftAmt;
            cameraB.lookAt(cameraB.position.x * 0.3, cameraB.position.y * 0.3, camZ - 100);

            // FOV narrows smoothly back to normal as we decelerate
            cameraB.fov = 103 - Math.pow(t, 2) * 28;
            cameraB.updateProjectionMatrix();

            // Star fade in from 0 at start (was faded by warp)
            starFieldB.material.opacity = Math.min(t * 5, 0.9);

            // Recycle stars behind camera
            const positions = starFieldB.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) {
                const sz = positions.getZ(i);
                if (sz > camZ + 50) {
                    positions.setXYZ(i,
                        (Math.random()-0.5) * TUNNEL_RADIUS * 2,
                        (Math.random()-0.5) * TUNNEL_RADIUS * 2,
                        camZ - (Math.random() * TUNNEL_LENGTH * 0.8 + 80)
                    );
                }
            }
            positions.needsUpdate = true;

            if (t < 1) requestAnimationFrame(tick);
            else onComplete();
        }
        requestAnimationFrame(tick);
    }

    // ═════════════════════════════════════════════════════════════════════
    // MODEL LOADING
    // ═════════════════════════════════════════════════════════════════════
    const loader = new GLTFLoader();
    loader.load('./crt_monitor.glb', (gltf) => {
        monitorGroup = gltf.scene;
        sceneA.add(monitorGroup);
        monitorGroup.rotation.y = -Math.PI / 2;
        monitorGroup.position.y = -3.5;
        monitorGroup.scale.set(0, 0, 0);

        // Map canvas texture onto screen mesh (black by default)
        screenTexture = new THREE.CanvasTexture(screenCanvas);

        // ── Render target for star scene preview ──────────────────────────
        // Created once. We render sceneB into it (one frame, static) when
        // the user clicks Enter, then show that on the screen mesh.
        const previewRT = new THREE.WebGLRenderTarget(512, 384, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
        });
        // Static preview camera — fixed at start of tunnel, never moves
        const previewCam = new THREE.PerspectiveCamera(75, 512 / 384, 0.1, 3000);
        previewCam.position.set(0, 0, 0);
        previewCam.lookAt(0, 0, -1);

        // Store refs for use in enter handler
        window._previewRT  = previewRT;
        window._previewCam = previewCam;

        let screenMesh = null;
        monitorGroup.traverse(child => {
            if (child.name === 'RM_Monitor_Type_2_(CRT)_Screen_Surface001_0') {
                child.material = new THREE.MeshBasicMaterial({
                    map: screenTexture, // starts black
                    transparent: true,
                    opacity: 1,
                });
                screenMesh = child;
                window._screenMesh = child;
            }
        });

        gsap.to(monitorGroup.scale, { x:1, y:1, z:1, duration:2, ease:'power4.out' });
        gsap.to(starFieldA.material, { opacity:0.8, duration:3, delay:0.5 });
        gsap.to(introLight,          { intensity:80, duration:2.5 });

        appState = 'INTRO';
        gsap.to(uiOverlay, { opacity:1, duration:1.5 });

        // Start idle easter egg — triggers after 12 seconds of inactivity
        startMonitorIdleEasterEgg();
    });

    // ── Monitor idle easter egg ───────────────────────────────────────────
    // Draws text directly onto the CRT screen mesh via CanvasTexture.
    function startMonitorIdleEasterEgg() {
        const MESSAGES = [
            'enter the experience. cmon',
            'wtf you waiting for',
            'what happened to lil pump...',
            'still here? really?',
            '...How About Now?',
            'gakfsjgklafdsjgakljdhfgjdgkgjdkjgdklgdkdghs4hjafljghadfljghughsairofghiauoh7290456y1074895HEEEEEEEEEEEEEEYYYYYYYHOWUDOING???????????????HIHIHHIHIHIHIHIHNONOEWILLREADTHISPROBABLYBUTAYEIFYOUARE.... ILY <3gasffguhipfghy13r08t1y3804 END OF TRANSMISSIONSYKE LMFAO YALL THOGHT??????? Just enter experience please....................................................................................................................................................................................................................................................................................',
            'shoutout claude for this',
            'very buggy btw',
            'miley cyrus the goat',
            "the experience won't bite.",
        ];
        const chosen = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

        let eggRAF    = null;
        let eggActive = false;
        let typedLen  = 0;
        let blinkOn   = true;
        let lastBlink = 0;
        let lastType  = 0;
        let phase     = 'typing';
        const TYPE_SPEED  = 60;
        const BLINK_SPEED = 530;
        const W = screenCanvas.width;
        const H = screenCanvas.height;

        const idleTimer = setTimeout(() => {
            if (appState !== 'INTRO') return;
            eggActive = true;

            function drawEgg(now) {
                if (!eggActive || appState !== 'INTRO') {
                    clearScreenCanvas();
                    return;
                }
                eggRAF = requestAnimationFrame(drawEgg);

                screenCtx.fillStyle = '#000';
                screenCtx.fillRect(0, 0, W, H);

                if (phase === 'typing') {
                    if (now - lastType > TYPE_SPEED) {
                        lastType = now;
                        if (typedLen < chosen.length) typedLen++;
                        else { phase = 'blinking'; lastBlink = now; }
                    }
                }
                if (phase === 'blinking') {
                    if (now - lastBlink > BLINK_SPEED) { lastBlink = now; blinkOn = !blinkOn; }
                }

                const display = chosen.slice(0, typedLen) + (phase === 'blinking' ? (blinkOn ? '|' : ' ') : '|');

                screenCtx.font         = "16px 'Courier New', monospace";
                screenCtx.textAlign    = 'center';
                screenCtx.textBaseline = 'middle';
                screenCtx.shadowColor  = 'rgba(0, 0, 0, 0.7)';
                screenCtx.shadowBlur   = 10;
                screenCtx.fillStyle    = 'rgba(255, 255, 255, 0.95)';
                screenCtx.fillText(display, W / 2, H / 2);
                screenCtx.shadowBlur   = 0;

                if (screenTexture) screenTexture.needsUpdate = true;
            }

            eggRAF = requestAnimationFrame(drawEgg);
        }, 12000);

        const cancelEgg = () => {
            clearTimeout(idleTimer);
            eggActive = false;
            if (eggRAF) cancelAnimationFrame(eggRAF);
            clearScreenCanvas();
        };

        document.getElementById('enter-btn')?.addEventListener('click', cancelEgg, { once: true });
    }

    // ═════════════════════════════════════════════════════════════════════
    // RENDER LOOP — renders whichever scene is active
    // ═════════════════════════════════════════════════════════════════════
    let lastTime = performance.now();

    function animate() {
        requestAnimationFrame(animate);
        const now   = performance.now();
        const delta = (now - lastTime) / 1000;
        lastTime = now;

        // Scene A maintenance
        if (activeScene === sceneA) {
            if (starFieldA) {
                starFieldA.rotation.y += delta * 0.002;
                const colors = starFieldA.geometry.attributes.color;
                for (let i = 0; i < starOffsetsA.length; i++) {
                    const tw = Math.sin((now*0.001) + starOffsetsA[i]) * 0.3 + 0.7;
                    colors.setXYZ(i, tw, tw, tw);
                }
                colors.needsUpdate = true;
            }

            for (let i = shootingStars.length-1; i >= 0; i--) {
                const s = shootingStars[i];
                s.position.add(s.userData.velocity.clone().multiplyScalar(delta));
                s.userData.life -= delta * 0.5;
                s.material.opacity = s.userData.life;
                if (s.userData.life <= 0) { sceneA.remove(s); shootingStars.splice(i,1); }
            }

            if (monitorGroup && appState === 'INTRO') {
                raycaster.setFromCamera(mouse, activeCamera);
                const hits = raycaster.intersectObjects(monitorGroup.children, true);
                document.body.style.cursor = hits.length > 0 ? 'pointer' : 'default';
            }
        } else {
            document.body.style.cursor = 'default';
        }

        renderer.render(activeScene, activeCamera);

        // ── Star twinkle ───────────────────────────────────────────────────
        if (activeScene === sceneB && starFieldB) {
            const colors  = starFieldB.geometry.attributes.color;
            const base    = starFieldB.geometry.userData.baseColors;
            const offsets = starFieldB.geometry.userData.twinkleOffsets;
            const speeds  = starFieldB.geometry.userData.twinkleSpeeds;
            const t       = performance.now() * 0.001;
            // Only update a subset each frame for performance (every 3rd star)
            for (let i = 0; i < colors.count; i += 3) {
                const twinkle = 0.75 + Math.sin(t * speeds[i] + offsets[i]) * 0.25;
                colors.setXYZ(i,
                    base[i*3]   * twinkle,
                    base[i*3+1] * twinkle,
                    base[i*3+2] * twinkle
                );
            }
            colors.needsUpdate = true;
        }

        // ── Live monitor screen preview ────────────────────────────────────
        if (window._previewLive && window._previewRT && window._previewCam && monitorGroup) {
            // Update preview camera to match cameraA
            window._previewCam.position.copy(cameraA.position);
            window._previewCam.quaternion.copy(cameraA.quaternion);
            window._previewCam.fov    = cameraA.fov;
            window._previewCam.aspect = 512 / 384;
            window._previewCam.updateProjectionMatrix();

            // Render sceneA (without monitor) into render target
            monitorGroup.visible = false;
            renderer.setRenderTarget(window._previewRT);
            renderer.render(sceneA, window._previewCam);
            renderer.setRenderTarget(null);
            monitorGroup.visible = true;

            // Read render target pixels and draw onto screenCanvas with alpha
            // This keeps the mesh material opaque — no transparent flash ever
            const alpha = window._previewAlpha ?? 1;
            const W = screenCanvas.width, H = screenCanvas.height;

            // Black base
            screenCtx.fillStyle = '#000';
            screenCtx.fillRect(0, 0, W, H);

            // Draw render target content via a temp ImageData
            // Three.js render target → read pixels → draw on canvas
            const pixelBuffer = new Uint8Array(W * H * 4);
            renderer.readRenderTargetPixels(window._previewRT, 0, 0, W, H, pixelBuffer);

            // Flip Y (WebGL is bottom-up, canvas is top-down)
            const imageData = new ImageData(W, H);
            for (let y = 0; y < H; y++) {
                const srcRow = (H - 1 - y) * W * 4;
                const dstRow = y * W * 4;
                imageData.data.set(pixelBuffer.subarray(srcRow, srcRow + W * 4), dstRow);
            }

            // Draw with alpha blend onto canvas
            previewOffscreenCtx.putImageData(imageData, 0, 0);

            screenCtx.globalAlpha = alpha;
            screenCtx.drawImage(previewOffscreen, 0, 0);
            screenCtx.globalAlpha = 1;

            if (screenTexture) screenTexture.needsUpdate = true;
        }
    }

    window.addEventListener('resize', () => {
        const w = window.innerWidth, h = window.innerHeight;
        cameraA.aspect = w/h; cameraA.updateProjectionMatrix();
        cameraB.aspect = w/h; cameraB.updateProjectionMatrix();
        renderer.setSize(w, h);
    });

    animate();
});
