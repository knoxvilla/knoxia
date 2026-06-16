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

    // ═════════════════════════════════════════════════════════════════════
    // SCENE B — Star tunnel: the "room" inside the monitor
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

        // Zoom into monitor. We don't wait for the zoom to finish —
        // the moment the monitor fills most of the view (z < 6.8) we swap
        // to the star scene. This makes the join seamless.
        let sceneSwapped = false;
        gsap.to(cameraA.position, {
            x:0, y:0, z:3.5,
            duration:2.3, ease:'expo.in',
            onUpdate: () => {
                cameraA.lookAt(0,0,0);
                if (!sceneSwapped && cameraA.position.z < 6.8) {
                    sceneSwapped = true;
                    enterStarRoom();
                }
            },
        });
    });

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
            doWhiteBloom(() => {
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
    function flyThroughStars(onComplete, startT = 0.58) {
        const TOTAL_MS    = 5200;
        const TOTAL_DIST  = TUNNEL_LENGTH * 0.92; // travel almost the full depth

        // Camera velocity state (we drive it manually for the ease curve)
        // Offset startTime backward so we begin at startT on the curve
        // This gives us the carry-over momentum from the 3D zoom
        let startTime  = performance.now() - (startT * TOTAL_MS);

        // Subtle camera drift — slight horizontal wobble for immersion
        let driftX = 0, driftY = 0, driftAngle = 0;
        let camZ = 0;
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

    // ── White bloom ────────────────────────────────────────────────────────
    // Renders on top of the 3D canvas using the crtCanvas overlay
    function doWhiteBloom(onComplete) {
        crtCanvas.width         = window.innerWidth;
        crtCanvas.height        = window.innerHeight;
        crtCanvas.style.display = 'block';
        crtCanvas.style.opacity = '1';

        const w = crtCanvas.width, h = crtCanvas.height;
        const BLOOM_IN  = 140;
        const HOLD      = 80;
        const BLOOM_OUT = 380;
        const start     = performance.now();

        // At the same moment, hide the WebGL canvas (OS will appear behind)
        setTimeout(() => { canvas.style.display = 'none'; }, BLOOM_IN + HOLD);

        function tick(now) {
            const e = now - start;
            let alpha;
            if      (e < BLOOM_IN)               alpha = e / BLOOM_IN;
            else if (e < BLOOM_IN + HOLD)         alpha = 1;
            else {
                const t = (e - BLOOM_IN - HOLD) / BLOOM_OUT;
                alpha = 1 - Math.pow(t, 0.6);
                if (t >= 1) {
                    crtCanvas.style.display = 'none';
                    onComplete();
                    return;
                }
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

        // Stop all audio immediately — prevents buggy re-entry audio
        if (ambientTrack.isPlaying) ambientTrack.stop();
        ambientTrack.gain.gain.value = 0;
        if (bootSound.isPlaying) bootSound.stop();
        if (shutdownSound.buffer) shutdownSound.play();

        // Show CRT canvas over OS
        crtCanvas.width         = window.innerWidth;
        crtCanvas.height        = window.innerHeight;
        crtCanvas.style.display = 'block';
        crtCanvas.style.opacity = '1';

        // 1. CRT flicker
        playCRTFlicker(() => {
            // 2. Hide OS, CRT collapse line
            osLayer.style.display = 'none';
            playCRTCollapse(() => {
                // 3. Fade to black
                gsap.to(transOverlay, {
                    opacity: 1, duration: 0.4,
                    onComplete: () => {
                        // Full reset — everything back to initial state
                        crtCanvas.style.display = 'none';
                        crtCtx.clearRect(0, 0, crtCanvas.width, crtCanvas.height);
                        canvas.style.display = 'block';

                        // Destroy space core so it gets re-randomized next entry
                        destroySpaceCore();

                        // Reset star field so re-entry starts fresh
                        resetStarFieldB();

                        // Reset both scenes
                        activeScene  = sceneA;
                        activeCamera = cameraA;
                        starFieldB.material.opacity = 0;
                        cameraB.position.set(0, 0, 0);
                        cameraB.fov = 75;
                        cameraB.updateProjectionMatrix();

                        // Reset OS layer — rebuild the static structure, KnoxiaOS.init() will repopulate
                        osLayer.style.display  = 'none';
                        osLayer.style.opacity  = '1';
                        osLayer.innerHTML = `
                            <div id="menubar"></div>
                            <div id="desktop"></div>
                            <div id="app-menu"></div>
                            <div id="dock-container"><div id="dock"></div></div>
                            <div id="taskbar" style="display:none;"></div>
                            <div id="start-menu" style="display:none;"></div>
                            <div id="taskbar-windows" style="display:none;"></div>
                            <div id="system-tray" style="display:none;"></div>
                            <div id="clock" style="display:none;"></div>
                        `;

                        // Place cameraA just in front of monitor, then zoom out
                        cameraA.position.set(0, 0, 4.5);
                        cameraA.lookAt(0, 0, 0);

                        // 4. Fade in 3D scene
                        gsap.to(transOverlay, {
                            opacity: 0, duration: 0.6, delay: 0.1,
                            onComplete: () => {
                                // 5. Zoom out to menu
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
                                    }
                                });
                            }
                        });
                    }
                });
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
        const w  = crtCanvas.width, h = crtCanvas.height, cy = h / 2;
        const COLLAPSE = 200, HOLD = 180, FADE = 320;
        let   phase = 'collapse', phaseStart = performance.now();

        function tick(now) {
            const e = now - phaseStart;
            crtCtx.fillStyle = 'black';
            crtCtx.fillRect(0, 0, w, h);

            if (phase === 'collapse') {
                const t     = Math.min(e / COLLAPSE, 1);
                const beamH = Math.max(1, (1 - Math.pow(t, 0.5)) * h);
                const beamY = cy - beamH / 2;

                // Phosphor glow
                const glow = crtCtx.createLinearGradient(0, beamY-30, 0, beamY+beamH+30);
                glow.addColorStop(0,   'rgba(160,255,185,0)');
                glow.addColorStop(0.5, `rgba(180,255,200,${(1-t)*0.1})`);
                glow.addColorStop(1,   'rgba(160,255,185,0)');
                crtCtx.fillStyle = glow;
                crtCtx.fillRect(0, beamY-30, w, beamH+60);

                const core = crtCtx.createLinearGradient(0, beamY, 0, beamY+beamH);
                core.addColorStop(0,   'rgba(220,255,235,0)');
                core.addColorStop(0.5, 'rgba(255,255,255,1)');
                core.addColorStop(1,   'rgba(220,255,235,0)');
                crtCtx.fillStyle = core;
                crtCtx.fillRect(0, beamY, w, Math.max(1, beamH));

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
                const t = Math.min(e / FADE, 1);
                const a = Math.pow(1-t, 1.2);
                const glow = crtCtx.createLinearGradient(0, cy-12, 0, cy+12);
                glow.addColorStop(0,   'rgba(160,255,185,0)');
                glow.addColorStop(0.5, `rgba(200,255,220,${a*0.12})`);
                glow.addColorStop(1,   'rgba(160,255,185,0)');
                crtCtx.fillStyle = glow; crtCtx.fillRect(0, cy-12, w, 24);
                crtCtx.fillStyle = `rgba(255,255,255,${a})`;
                crtCtx.fillRect(0, cy-1, w, 2);

                if (t >= 1) { crtCtx.clearRect(0,0,w,h); onComplete(); return; }
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

        // Map our canvas texture onto the screen mesh
        screenTexture = new THREE.CanvasTexture(screenCanvas);
        monitorGroup.traverse(child => {
            if (child.name === 'RM_Monitor_Type_2_(CRT)_Screen_Surface001_0') {
                child.material = new THREE.MeshBasicMaterial({ map: screenTexture });
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
            'gakfsjgklafdsjgakljdhfgjdgkgjdkjgdklgdkdghs4hjafljghadfljghughsairofghiauoh7290456y1074895HEEEEEEEEEEEEEEYYYYYYYHOWUDOING???????????????HIHIHHIHIHIHIHIHNONOEWILLREADTHISPROBABLYBUTAYEIFYOUARE.... ILY <3gasffguhipfghy13r08t1y3804 END OF TRANSMISSIONSYKE LMFAO YALL THOGHT??????? Just enter experience please................................................................................................................................................................................................................................................',
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
    }

    window.addEventListener('resize', () => {
        const w = window.innerWidth, h = window.innerHeight;
        cameraA.aspect = w/h; cameraA.updateProjectionMatrix();
        cameraB.aspect = w/h; cameraB.updateProjectionMatrix();
        renderer.setSize(w, h);
    });

    animate();
});
