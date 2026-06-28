import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

window.addEventListener('DOMContentLoaded', () => {

    // -- Shared canvas / elements -------------------------------------------
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

    // ---------------------------------------------------------------------
    // SCENE A - Intro: monitor sitting in space
    // SCENE B - Star tunnel: 3D fly-through before OS
    // Both rendered on the same WebGL canvas; we swap scenes.
    // ---------------------------------------------------------------------

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.autoClear = true;

    // -- AUDIO -------------------------------------------------------------
    const listener      = new THREE.AudioListener();
    const bootSound     = new THREE.Audio(listener);
    const shutdownSound = new THREE.Audio(listener);
    const ambientTrack  = new THREE.Audio(listener);
    const audioLoader   = new THREE.AudioLoader();

    audioLoader.load('./boot.wav',     b => { bootSound.setBuffer(b);     bootSound.setVolume(0.8); });
    audioLoader.load('./shutdown.wav', b => { shutdownSound.setBuffer(b); shutdownSound.setVolume(0.6); });
    audioLoader.load('./ambience.wav', b => { ambientTrack.setBuffer(b); ambientTrack.setLoop(true); ambientTrack.setVolume(0); });
    const spaceAmbienceTrack = new THREE.Audio(listener);
    audioLoader.load('./ambience-space.wav', b => { spaceAmbienceTrack.setBuffer(b); spaceAmbienceTrack.setLoop(true); spaceAmbienceTrack.setVolume(0); });
    window._spaceAmbienceTrack = spaceAmbienceTrack;

    // ---------------------------------------------------------------------
    // SCENE A - Intro scene
    // ---------------------------------------------------------------------
    const sceneA  = new THREE.Scene();
    sceneA.background = new THREE.Color(0x010106);

    const cameraA  = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 8000);
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
        const COUNT = 12000;
        const geo   = new THREE.BufferGeometry();
        const mat   = new THREE.PointsMaterial({
            size: 1.4, transparent: true, opacity: 0,
            sizeAttenuation: true, depthWrite: false, vertexColors: true,
        });
        mat.map = new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/disc.png');
        mat.alphaTest = 0.01;
        const v = [], c = [];
        for (let i = 0; i < COUNT; i++) {
            // 60% inner dense layer, 40% outer exploration layer
            const inner = i < COUNT*0.6;
            const range = inner ? 2000 : 8000;
            const yRange = inner ? 1000 : 4000;
            v.push(
                (Math.random()-0.5)*range,
                (Math.random()-0.5)*yRange,
                inner ? (Math.random()-0.5)*2000 : (Math.random()-0.5)*8000
            );
            const roll = Math.random();
            const b = Math.random()*0.4+0.6;
            if (roll<0.15)       c.push(b, b*0.85, b*0.7);
            else if (roll<0.25)  c.push(b*0.8, b*0.9, b);
            else                 c.push(b, b, b);
            starOffsetsA.push(Math.random()*Math.PI*2);
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        geo.setAttribute('color',    new THREE.Float32BufferAttribute(c, 3));
        starFieldA = new THREE.Points(geo, mat);
        sceneA.add(starFieldA);
    })();

    function spawnShootingStar() {
        const SEGS   = 12;
        const trailLen = 80 + Math.random() * 120;
        const speed    = 180 + Math.random() * 140;
        const start  = new THREE.Vector3(
            (Math.random()-0.5)*1200,
            Math.random()*0.5*400 + 80,
            -Math.random()*400-100
        );
        const angle = (Math.random()-0.5)*0.6;
        const dir   = new THREE.Vector3(
            Math.cos(angle)*(Math.random()>0.5?1:-1),
            -(Math.random()*0.3+0.05), 0
        ).normalize();
        // Color tint
        let cr=1,cg=1,cb=1;
        const roll = Math.random();
        if (roll<0.2){cr=1;cg=0.95;cb=0.7;}
        else if(roll<0.35){cr=0.8;cg=0.9;cb=1;}
        // Build trail geometry
        const positions = new Float32Array((SEGS+1)*3);
        for(let i=0;i<=SEGS;i++){
            const t=i/SEGS;
            const p=start.clone().sub(dir.clone().multiplyScalar(t*trailLen*0.3));
            positions[i*3]=p.x; positions[i*3+1]=p.y; positions[i*3+2]=p.z;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
        const colors = new Float32Array((SEGS+1)*3);
        for(let i=0;i<=SEGS;i++){
            const b=Math.pow(1-i/SEGS,1.8);
            colors[i*3]=cr*b; colors[i*3+1]=cg*b; colors[i*3+2]=cb*b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
        const mat = new THREE.LineBasicMaterial({
            vertexColors:true, transparent:true, opacity:0,
            blending:THREE.AdditiveBlending, depthWrite:false
        });
        const line = new THREE.Line(geo,mat);
        line.userData = {
            velocity: dir.clone().multiplyScalar(speed),
            life:0, maxLife:1.0, fadeInEnd:0.12, fadeOutStart:0.78
        };
        shootingStars.push(line); sceneA.add(line);
    }
    function scheduleNextShootingStar(){
        const delay = 3000+Math.random()*5000;
        setTimeout(()=>{ if(appState==='INTRO'||appState==='UNDOCKED') spawnShootingStar(); scheduleNextShootingStar(); },delay);
    }
    scheduleNextShootingStar();

    let monitorGroup;

    // -- Screen texture canvas ----------------------------------------------
    // Renders directly onto the CRT screen mesh via CanvasTexture
    const screenCanvas  = document.createElement('canvas');
    screenCanvas.width  = 512;
    screenCanvas.height = 384;
    const screenCtx     = screenCanvas.getContext('2d');
    let   screenTexture = null;
    window._screenCanvas = screenCanvas;
    window._screenCtx    = screenCtx;
    window._getScreenTexture = () => screenTexture;

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

    // -- TUNNEL STARS IN SCENE A -------------------------------------------
    // The star tunnel lives in sceneA, starting just behind the monitor screen
    // (z - -2) and extending deep into negative Z. This means cameraA can fly
    // through it continuously - no scene swap, no cuts.
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
    // create genuine parallax - close stars blur past, far ones barely move.
    // ---------------------------------------------------------------------
    const sceneB  = new THREE.Scene();
    sceneB.background = new THREE.Color(0x000002);

    const cameraB = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
    cameraB.position.set(0, 0, 0);
    cameraB.lookAt(0, 0, -1);

    // Fog - stars in the far distance fade into black, adds depth
    sceneB.fog = new THREE.FogExp2(0x000002, 0.0008);

    // Star field B - 3D points with real Z depth
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

            // Slight color variation - most white, some faintly blue
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

    // -- OS PREVIEW SCREEN - what we crash into ----------------------------
    // A floating "monitor" showing the real desktop wallpaper, planted at
    // the far end of the tunnel dead ahead of the camera. We fly straight
    // at it, it grows into a glowing portal, then we punch through it into
    // the actual OS - instead of just blacking out into a flat white flash.
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

    // -- SPACE CORE easter egg ---------------------------------------------
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

        // Gentle drift velocity - moves slowly through space
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

    // -- Which scene are we rendering --------------------------------------
    let activeScene  = sceneA;
    let activeCamera = cameraA;

    // ---------------------------------------------------------------------
    // INTRO UI
    // ---------------------------------------------------------------------
    gsap.set(uiOverlay, { opacity: 0 });

    enterBtn.addEventListener('click', () => {
        if (appState !== 'INTRO') return;
        appState = 'TRANSITIONING';
        uiOverlay.style.pointerEvents = 'none';
        gsap.to(uiOverlay, { opacity:0, duration:0.5, onComplete:() => { uiOverlay.style.display='none'; } });
        gsap.to(introLight, { intensity:2, duration:1.8 });

        // -- Step 1: Fade star preview onto monitor screen via canvas blend --
        // We keep the screen mesh on screenTexture (never transparent).
        // Instead we draw the render target into a temp canvas and blend
        // it onto screenCanvas using globalAlpha - clean fade, no flash.
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

            // Fade alpha 0-1 over 0.8s, then start zoom
            gsap.to(window, {
                _previewAlpha: 1,
                duration: 0.8,
                ease: 'power2.out',
                onComplete: startZoom,
            });
        } else {
            startZoom();
        }

        // -- Step 2: Camera zooms toward monitor, then enters star scene ---
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

    // Reusable offscreen canvas for render target - screenCanvas blending
    const previewOffscreen    = document.createElement('canvas');
    previewOffscreen.width    = 512;
    previewOffscreen.height   = 384;
    const previewOffscreenCtx = previewOffscreen.getContext('2d');
    window._previewAlpha      = 0;
    window._previewLive       = false;
    infoBtn.addEventListener('click',   () => infoModal.classList.remove('modal-hidden'));
    closeInfo.addEventListener('click', () => infoModal.classList.add('modal-hidden'));

    // =========================================================
    // TERMINAL MENU - appears on monitor screen when clicked
    // =========================================================
    let terminalOpen = false;
    let terminalSel  = 0;
    const TERMINAL_ITEMS = [
        { label: 'SYSTEM INFORMATION', action: 'sysinfo'  },
        { label: 'VERSION INFO',        action: 'version'  },
        { label: 'UNDOCK',              action: 'undock'   },
        { label: '[ CLOSE ]',           action: 'close'    },
    ];

    // Safe drawable zone - calibrated to monitor bezel
    const SZ = { x: 108, y: 68, w: 287, h: 252 };

    function drawTerminalMenu(sel) {
        const W = screenCanvas.width, H = screenCanvas.height;
        screenCtx.fillStyle = '#000';
        screenCtx.fillRect(0, 0, W, H);

        const fnt = Math.floor(SZ.h / 14);

        // Header
        screenCtx.font = 'bold ' + fnt + 'px "Courier New", monospace';
        screenCtx.fillStyle = '#00ff44';
        screenCtx.fillText('KNOXIA BIOS v1.0', SZ.x + 6, SZ.y + fnt);
        screenCtx.fillStyle = 'rgba(0,255,68,0.4)';
        screenCtx.fillRect(SZ.x + 6, SZ.y + fnt + 4, SZ.w - 12, 1);

        // Menu items
        const itemH = Math.floor((SZ.h - fnt * 3) / TERMINAL_ITEMS.length);
        TERMINAL_ITEMS.forEach(function(item, i) {
            const iy = SZ.y + fnt * 2.8 + i * itemH;
            if (i === sel) {
                screenCtx.fillStyle = '#00ff44';
                screenCtx.fillRect(SZ.x + 4, iy - fnt + 2, SZ.w - 8, fnt + 4);
                screenCtx.fillStyle = '#000';
                screenCtx.font = 'bold ' + fnt + 'px "Courier New", monospace';
                screenCtx.fillText('> ' + item.label, SZ.x + 8, iy);
            } else {
                screenCtx.fillStyle = 'rgba(0,255,68,0.75)';
                screenCtx.font = fnt + 'px "Courier New", monospace';
                screenCtx.fillText('  ' + item.label, SZ.x + 8, iy);
            }
        });

        // Footer
        screenCtx.fillStyle = 'rgba(0,255,68,0.35)';
        screenCtx.font = (fnt - 3) + 'px "Courier New", monospace';
        screenCtx.fillText('UP/DOWN  ENTER select  ESC close', SZ.x + 6, SZ.y + SZ.h - 4);

        if (screenTexture) screenTexture.needsUpdate = true;
    }

    function drawInfoScreen(lines) {
        const W = screenCanvas.width, H = screenCanvas.height;
        screenCtx.fillStyle = '#000';
        screenCtx.fillRect(0, 0, W, H);
        const fnt = Math.floor(SZ.h / 16);
        screenCtx.fillStyle = '#00ff44';
        screenCtx.font = fnt + 'px "Courier New", monospace';
        lines.forEach(function(l, i) {
            screenCtx.fillText(l, SZ.x + 6, SZ.y + fnt + i * (fnt + 3));
        });
        if (screenTexture) screenTexture.needsUpdate = true;
    }

    function openTerminalMenu() {
        if (terminalOpen || appState !== 'INTRO') return;
        terminalOpen = true;
        terminalSel  = 0;
        window._terminalOpen = true;
        // Stop idle easter egg immediately
        if (window._eggRAF) { cancelAnimationFrame(window._eggRAF); window._eggRAF = null; }
        clearScreenCanvas();
        drawTerminalMenu(0);
    }

    function closeTerminalMenu() {
        terminalOpen = false;
        window._terminalOpen = false;
        clearScreenCanvas();
    }

    function terminalAction(action) {
        if (action === 'close') { closeTerminalMenu(); return; }
        if (action === 'sysinfo') {
            // Don't close terminal - keep _terminalOpen true
            drawInfoScreen([
                'KNOXIA MACHINA v1.0',
                '--------------------',
                'CPU:  Knox Creative Engine',
                'RAM:  Unlimited Imagination',
                'GPU:  WebGL / Three.js',
                'OS:   KnoxiaOS Build 2025',
                'LOC:  Stockholm, SE',
                '',
                'Press any key to go back',
            ]);
            function dismissSys() {
                drawTerminalMenu(terminalSel);
                document.removeEventListener('keydown', dismissSys);
            }
            setTimeout(function() { document.addEventListener('keydown', dismissSys, {once:true}); }, 200);
            return;
        }
        if (action === 'version') {
            // Don't close terminal - keep _terminalOpen true
            drawInfoScreen([
                'KnoxiaOS v1.0.4',
                '--------------------',
                'Build:    2025.06',
                'Renderer: Three.js r160',
                'Audio:    Web Audio API',
                'Chat:     Supabase RT',
                'Artist:   Ramsey Knox',
                '',
                'Press any key to go back',
            ]);
            function dismissVer() {
                drawTerminalMenu(terminalSel);
                document.removeEventListener('keydown', dismissVer);
            }
            setTimeout(function() { document.addEventListener('keydown', dismissVer, {once:true}); }, 200);
            return;
        }
        if (action === 'undock') {
            closeTerminalMenu();
            startUndock();
        }
    }

    // Canvas click - open terminal if monitor hit
    canvas.addEventListener('click', function(e) {
        if (appState !== 'INTRO') return;
        const mx =  (e.clientX / window.innerWidth)  * 2 - 1;
        const my = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(new THREE.Vector2(mx, my), cameraA);
        if (!monitorGroup) return;
        const hits = raycaster.intersectObjects(monitorGroup.children, true);
        if (hits.length > 0) {
            if (!terminalOpen) openTerminalMenu();
        } else if (terminalOpen) {
            closeTerminalMenu();
        }
    });

    // Keyboard navigation for terminal
    document.addEventListener('keydown', function(e) {
        if (!terminalOpen) return;
        if (e.key === 'ArrowUp')   { e.preventDefault(); terminalSel = (terminalSel-1+TERMINAL_ITEMS.length)%TERMINAL_ITEMS.length; drawTerminalMenu(terminalSel); }
        if (e.key === 'ArrowDown') { e.preventDefault(); terminalSel = (terminalSel+1)%TERMINAL_ITEMS.length; drawTerminalMenu(terminalSel); }
        if (e.key === 'Enter')     { e.preventDefault(); terminalAction(TERMINAL_ITEMS[terminalSel].action); }
        if (e.key === 'Escape')    { closeTerminalMenu(); }
    });

    // =========================================================
    // FREE FLIGHT - UNDOCK MODE
    // =========================================================
    let flightActive = false;
    const flightKeys = { w:false, a:false, s:false, d:false, q:false, e:false, shift:false };
    const flightSpeed     = 200;
    const flightSpeedBoost = 600;
    const flightEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    let mouseLocked = false;

    function startUndock() {
        appState = 'UNDOCKED';
        gsap.to(uiOverlay, { opacity:0, duration:0.8, onComplete:function(){ uiOverlay.style.display='none'; } });

        // Crossfade to space ambience
        if (ambientTrack.isPlaying) gsap.to(ambientTrack.gain.gain, { value:0, duration:2 });
        if (window._spaceAmbienceTrack && window._spaceAmbienceTrack.buffer) {
            const sat = window._spaceAmbienceTrack;
            const ctx = sat.context;
            const startAmbience = () => {
                if (!sat.isPlaying) sat.play();
                sat.gain.gain.cancelScheduledValues(ctx.currentTime);
                sat.gain.gain.setValueAtTime(0, ctx.currentTime);
                sat.gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 6);
            };
            if (ctx.state === 'suspended') {
                ctx.resume().then(startAmbience);
            } else {
                startAmbience();
            }
        }

        // Show undock message
        drawInfoScreen([
            'UNDOCKING...',
            '',
            'Free flight mode enabled',
            '',
            'WASD to move',
            'Mouse to look',
            'ESC to return',
        ]);

        setTimeout(function() {
            // Set flight euler from current camera orientation so no snap
            flightEuler.setFromQuaternion(cameraA.quaternion, 'YXZ');
            flightActive = true;
            clearScreenCanvas();
            showFlightHUD(true);
            canvas.requestPointerLock();
        }, 1800);
    }

    function stopUndock() {
        flightActive = false;
        appState     = 'INTRO';
        mouseLocked  = false;
        terminalOpen = false;
        window._terminalOpen = false;
        showFlightHUD(false);
        if (document.pointerLockElement) document.exitPointerLock();

        // Fade out space ambience
        if (window._spaceAmbienceTrack && window._spaceAmbienceTrack.isPlaying) {
            const sat = window._spaceAmbienceTrack;
            sat.gain.gain.cancelScheduledValues(sat.context.currentTime);
            sat.gain.gain.setValueAtTime(sat.gain.gain.value, sat.context.currentTime);
            sat.gain.gain.linearRampToValueAtTime(0, sat.context.currentTime + 2.5);
            setTimeout(function() { if (sat.isPlaying) sat.stop(); }, 2600);
        }

        // Return camera to menu and reset orientation
        flightEuler.set(0, 0, 0);
        gsap.to(cameraA.position, { x:menuPos.x, y:menuPos.y, z:menuPos.z, duration:2.5, ease:'power2.inOut',
            onUpdate:function() { cameraA.lookAt(0,0,0); } });
        gsap.to(uiOverlay, { opacity:1, duration:1, delay:2,
            onStart:function() { uiOverlay.style.display='flex'; } });

        // Clear screen canvas cleanly
        clearScreenCanvas();
    }

    function showFlightHUD(show) {
        var existing = document.getElementById('flight-hud');
        if (!show) { if (existing) existing.remove(); return; }
        if (existing) return;
        var hud = document.createElement('div');
        hud.id = 'flight-hud';
        hud.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:500;color:rgba(255,255,255,0.45);font-family:Courier New,monospace;font-size:11px;text-align:center;pointer-events:none;letter-spacing:0.08em;';
        hud.textContent = 'WASD - MOVE    SHIFT - SPRINT    MOUSE - LOOK    Q/E - UP/DOWN    ESC - RETURN';
        document.body.appendChild(hud);
    }

    // Pointer lock
    document.addEventListener('pointerlockchange', function() {
        mouseLocked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', function(e) {
        if (!mouseLocked || !flightActive) return;
        var sens = 0.0018;
        flightEuler.y -= e.movementX * sens;
        flightEuler.x -= e.movementY * sens;
        flightEuler.x = Math.max(-Math.PI/2+0.05, Math.min(Math.PI/2-0.05, flightEuler.x));
        cameraA.quaternion.setFromEuler(flightEuler);
    });
    document.addEventListener('keydown', function(e) {
        if (!flightActive) return;
        var k = e.key.toLowerCase();
        if (k in flightKeys) flightKeys[k] = true;
        if (e.key === 'Shift') flightKeys.shift = true;
        if (e.key === 'Escape') { e.preventDefault(); stopUndock(); }
    });
    document.addEventListener('keyup', function(e) {
        if (!flightActive) return;
        var k = e.key.toLowerCase();
        if (k in flightKeys) flightKeys[k] = false;
        if (e.key === 'Shift') flightKeys.shift = false;
    });
    canvas.addEventListener('click', function() {
        if (flightActive && !mouseLocked) canvas.requestPointerLock();
    });



    // ---------------------------------------------------------------------
    // ENTER STAR ROOM
    // Swap to scene B, fly through stars, then boot into OS.
    // ---------------------------------------------------------------------
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

        // Start the fly-through immediately - no waiting
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

        // Fade in from black quickly - hides the scene swap seam
        // Scene is already flying underneath; user fades in mid-flight
        gsap.killTweensOf(transOverlay);
        gsap.set(transOverlay, { opacity: 1 });
        gsap.to(transOverlay, { opacity: 0, duration: 0.55, ease: 'power2.out' });
    }

    // -- Fly-through animation ---------------------------------------------
    // Three phases:
    //   DRIFT   (0-35%): slow, serene - floating in the star room
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
            // At t=0.45 this gives eased-0.12, meaning we're already moving.
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

            // The OS preview screen grows into view dead ahead - this is the
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

            // Star field opacity fades out at warp peak - white takes over
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

    // -- Screen crash ------------------------------------------------------
    // The camera makes a final hard lunge straight through the OS preview
    // screen - FOV slams in, the screen blows out bright, the camera shakes
    // on impact - then a radial flash burst covers the cut to the real OS.
    function doScreenCrash(onComplete) {
        crtCanvas.width         = window.innerWidth;
        crtCanvas.height        = window.innerHeight;
        crtCanvas.style.display = 'block';
        crtCanvas.style.opacity = '1';

        const PUNCH_MS = 420;
        const targetZ  = OS_SCREEN_Z - 160; // overshoot - fly clean through the plane

        gsap.to(cameraB.position, {
            z: targetZ, duration: PUNCH_MS / 1000, ease: 'power4.in',
            onUpdate: () => cameraB.lookAt(0, 0, targetZ - 300),
        });
        // FOV slams narrow - pure g-force, we cut away before it can recover
        gsap.to(cameraB, {
            fov: 46, duration: PUNCH_MS / 1000, ease: 'power3.in',
            onUpdate: () => cameraB.updateProjectionMatrix(),
        });
        // The screen and its glow blow out bright right as we hit it
        gsap.to(osScreenMesh.material, { opacity: 0, duration: 0.18, delay: 0.16 });
        gsap.to(osScreenGlow.material, { opacity: 0, duration: 0.18, delay: 0.16 });

        // Camera shake - builds through the lunge
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

    // -- Impact flash -------------------------------------------------------
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

    // ---------------------------------------------------------------------
    // ORBIT EXPERIENCE
    // ---------------------------------------------------------------------
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
                    // Back to OS - glitch handled by orbit.js, now restore OS
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
                    // Leave experience - full shutdown flow
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

    // ---------------------------------------------------------------------
    // SHUTDOWN
    // CRT flicker - collapse line - zoom back through stars - zoom out to intro
    // ---------------------------------------------------------------------
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

        // Go straight to CRT collapse - no flicker
        window._crtCollapseRunning = false;
        osLayer.style.display = 'none';
        playCRTCollapse(() => {
            gsap.to(transOverlay, {
                opacity: 1, duration: 0.4,
                onComplete: () => {
                    // -- Full reset ----------------------------------------
                    crtCanvas.style.display = 'none';
                    crtCtx.clearRect(0, 0, crtCanvas.width, crtCanvas.height);
                    canvas.style.display = 'block';

                    // Reset preview - screen goes black
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


    // -- CRT flicker (over OS) ---------------------------------------------
    // Simulates the monitor dying - scanlines flicker and intensity pulses
    function playCRTFlicker(onComplete) {
        const w = crtCanvas.width, h = crtCanvas.height;
        const DURATION = 900;
        const start    = performance.now();

        function tick(now) {
            const t = Math.min((now - start) / DURATION, 1);

            crtCtx.clearRect(0, 0, w, h);

            // Scanline overlay - intensifies over time
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

    // -- CRT collapse -------------------------------------------------------
    // Screen shrinks to a bright horizontal line, then fades
    function playCRTCollapse(onComplete) {
        // Prevent double-running - cancel any existing collapse
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

            // Hard guard - if dimensions are bad, skip frame
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

    // -- Fly backward through stars ----------------------------------------
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

            // Single continuous deceleration - exact mirror of the entry curve.
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

    // ---------------------------------------------------------------------
    // MODEL LOADING
    // ---------------------------------------------------------------------
    const loader = new GLTFLoader();
    loader.load('./crt_monitor.glb', (gltf) => {
        monitorGroup = gltf.scene;
        sceneA.add(monitorGroup);
        monitorGroup.rotation.y = -Math.PI / 2;
        monitorGroup.position.y = -3.5;
        monitorGroup.scale.set(0, 0, 0);

        // Map canvas texture onto screen mesh (black by default)
        screenTexture = new THREE.CanvasTexture(screenCanvas);

        // -- Render target for star scene preview --------------------------
        // Created once. We render sceneB into it (one frame, static) when
        // the user clicks Enter, then show that on the screen mesh.
        const previewRT = new THREE.WebGLRenderTarget(512, 384, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
        });
        // Static preview camera - fixed at start of tunnel, never moves
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

        // Start idle easter egg - triggers after 12 seconds of inactivity
        startMonitorIdleEasterEgg();
    });

    // -- Monitor idle easter egg -------------------------------------------
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
            if (appState !== 'INTRO' || window._terminalOpen) return;
            eggActive = true;

            function drawEgg(now) {
                if (!eggActive || appState !== 'INTRO' || window._terminalOpen) {
                    clearScreenCanvas();
                    return;
                }
                eggRAF = requestAnimationFrame(drawEgg);
                window._eggRAF = eggRAF;

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

    // ---------------------------------------------------------------------
    // RENDER LOOP - renders whichever scene is active
    // ---------------------------------------------------------------------
    let lastTime = performance.now();

    function animate() {
        requestAnimationFrame(animate);
        const now   = performance.now();
        const delta = (now - lastTime) / 1000;
        lastTime = now;

        // Scene A maintenance
        if (activeScene === sceneA) {
            if (starFieldA) {
                // starFieldA.rotation.y += delta * 0.002; // static starfield
                const colors = starFieldA.geometry.attributes.color;
                for (let i = 0; i < starOffsetsA.length; i++) {
                    const tw = Math.sin((now*0.001) + starOffsetsA[i]) * 0.3 + 0.7;
                    colors.setXYZ(i, tw, tw, tw);
                }
                colors.needsUpdate = true;
            }

            for (let i = shootingStars.length-1; i >= 0; i--) {
                const s  = shootingStars[i];
                const ud = s.userData;
                ud.life  = Math.min(ud.maxLife, ud.life + delta*0.55);
                let opacity;
                if (ud.life < ud.fadeInEnd)           opacity = ud.life/ud.fadeInEnd;
                else if (ud.life > ud.fadeOutStart)   opacity = 1-(ud.life-ud.fadeOutStart)/(ud.maxLife-ud.fadeOutStart);
                else                                  opacity = 1;
                s.material.opacity = Math.max(0,Math.min(1,opacity));
                s.position.add(ud.velocity.clone().multiplyScalar(delta));
                if (ud.life >= ud.maxLife) {
                    sceneA.remove(s); s.geometry.dispose(); s.material.dispose(); shootingStars.splice(i,1);
                }
            }

            if (monitorGroup && appState === 'INTRO') {
                raycaster.setFromCamera(mouse, activeCamera);
                const hits = raycaster.intersectObjects(monitorGroup.children, true);
                document.body.style.cursor = hits.length > 0 ? 'pointer' : 'default';
            }
        } else {
            document.body.style.cursor = 'default';
        }

        // Black hole animation - update uniforms, billboard faces camera
        if (window._bhAnimate) window._bhAnimate(delta, now, renderer);
        if (window._sunAnimate) window._sunAnimate(delta, now);
        if (window._planetsAnimate) window._planetsAnimate(delta, now);

        // Free flight movement
        if (flightActive && window._bhState && window._bhState() !== 'swallowed') {
            var fwd   = new THREE.Vector3(0,0,-1).applyQuaternion(cameraA.quaternion);
            var right = new THREE.Vector3(1,0, 0).applyQuaternion(cameraA.quaternion);
            var up    = new THREE.Vector3(0,1, 0);
            const spd = flightKeys.shift ? flightSpeedBoost : flightSpeed;
            if (flightKeys.w) cameraA.position.addScaledVector(fwd,    spd*delta);
            if (flightKeys.s) cameraA.position.addScaledVector(fwd,   -spd*delta);
            if (flightKeys.a) cameraA.position.addScaledVector(right,  -spd*delta);
            if (flightKeys.d) cameraA.position.addScaledVector(right,   spd*delta);
            if (flightKeys.q) cameraA.position.addScaledVector(up,     -spd*delta);
            if (flightKeys.e) cameraA.position.addScaledVector(up,      spd*delta);
        }

        renderer.autoClear = true;
        renderer.clearDepth();
        renderer.render(activeScene, activeCamera);

        // -- Star twinkle ---------------------------------------------------
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

        // -- Live monitor screen preview ------------------------------------
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
            // This keeps the mesh material opaque - no transparent flash ever
            const alpha = window._previewAlpha ?? 1;
            const W = screenCanvas.width, H = screenCanvas.height;

            // Black base
            screenCtx.fillStyle = '#000';
            screenCtx.fillRect(0, 0, W, H);

            // Draw render target content via a temp ImageData
            // Three.js render target - read pixels - draw on canvas
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





    // JS smoothstep helper used by black hole locator
    function smoothstepJS(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    // =========================================================
    // BLACK HOLE -- Cinematic Interstellar-style
    // =========================================================
    (function buildBlackHole() {

        const BH_POS = new THREE.Vector3(0, -80, 1800);
        window._BH_POS = BH_POS;
        const BH_PULL_START  = 500;
        const BH_PULL_STRONG = 200;
        const BH_SWALLOW     = 18;

        let bhState = 'idle';

        // ================================================================
        // BLACK HOLE - Geometry-based approach
        // Dark sphere + animated accretion disk ring + lensing halo layers
        // + screen-space warp canvas overlay for star distortion effect
        // ================================================================

        const bhGroup = new THREE.Group();
        bhGroup.position.copy(BH_POS);
        bhGroup.visible = false;
        sceneA.add(bhGroup);

        // -- Event horizon: pure black sphere ----------------------------
        const horizonGeo = new THREE.SphereGeometry(28, 64, 64);
        const horizonMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const horizonMesh = new THREE.Mesh(horizonGeo, horizonMat);
        bhGroup.add(horizonMesh);

        // -- Photon ring: thin bright torus just outside horizon ---------
        const photonRingGeo = new THREE.TorusGeometry(30, 0.7, 16, 200);
        const photonRingMat = new THREE.MeshBasicMaterial({
            color: 0xfff0d0,
            transparent: true,
            opacity: 0.9,
        });
        const photonRing = new THREE.Mesh(photonRingGeo, photonRingMat);
        photonRing.rotation.x = Math.PI / 2;
        bhGroup.add(photonRing);

        // -- Accretion disk: multiple layered rings with custom shader ---
        const diskVert = `
            varying vec2 vUv;
            varying vec3 vPos;
            void main() {
                vUv = uv;
                vPos = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
        const diskFrag = `
            precision highp float;
            varying vec2 vUv;
            varying vec3 vPos;
            uniform float uTime;

            float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
            float noise(vec2 p) {
                vec2 i = floor(p), f = fract(p), u = f*f*(3.0-2.0*f);
                return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
                           mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
            }
            float fbm(vec2 p) {
                return noise(p)*0.5 + noise(p*2.1+vec2(9.2,3.1))*0.25 + noise(p*4.3+vec2(2.8,7.4))*0.125;
            }

            void main() {
                // vUv.x = angle (0..1), vUv.y = radial (0=inner, 1=outer)
                float angle  = vUv.x;
                float radial = vUv.y;

                // Turbulent flow bands
                float flow = fbm(vec2(angle * 6.0 + uTime * 0.12, radial * 4.0 - uTime * 0.07));
                flow      += fbm(vec2(angle * 12.0 - uTime * 0.09, radial * 8.0)) * 0.4;
                flow       = clamp(flow, 0.0, 1.0);

                // Radial brightness: very bright inner edge, fades out
                float brightness = pow(1.0 - radial, 2.2) * (0.6 + flow * 0.4);

                // Relativistic doppler: one side ~2x brighter
                float doppler = 0.45 + 0.55 * cos(angle * 6.28318 + uTime * 0.15);
                brightness *= 0.5 + doppler * 1.0;

                // Color: dark ember -> orange -> white-yellow hot inner
                vec3 col = mix(vec3(0.08, 0.02, 0.00),
                               vec3(0.90, 0.35, 0.04),
                               smoothstep(0.0, 0.6, 1.0 - radial));
                col       = mix(col,
                               vec3(1.00, 0.94, 0.78),
                               smoothstep(0.3, 1.0, 1.0 - radial));
                col      += vec3(1.0, 0.6, 0.15) * smoothstep(0.65, 1.0, flow) * 0.6 * brightness;

                // Edge fade at both inner and outer rim
                float edgeFade = smoothstep(0.0, 0.06, radial) * smoothstep(1.0, 0.88, radial);
                float alpha    = brightness * edgeFade * 2.0;
                alpha          = clamp(alpha, 0.0, 1.0);

                gl_FragColor = vec4(col * alpha, alpha);
            }
        `;

        // Build disk as a ring geometry with UVs mapped to angle/radial
        function buildDiskRing(innerR, outerR, segments) {
            const geo = new THREE.BufferGeometry();
            const verts = [], uvs = [], indices = [];
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const cos = Math.cos(angle), sin = Math.sin(angle);
                const u = i / segments;
                verts.push(cos * innerR, 0, sin * innerR);
                uvs.push(u, 0.0);
                verts.push(cos * outerR, 0, sin * outerR);
                uvs.push(u, 1.0);
            }
            for (let i = 0; i < segments; i++) {
                const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
                indices.push(a, b, c, b, d, c);
            }
            geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
            geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs,   2));
            geo.setIndex(indices);
            geo.computeVertexNormals();
            return geo;
        }

        const diskMat = new THREE.ShaderMaterial({
            vertexShader:   diskVert,
            fragmentShader: diskFrag,
            transparent:    true,
            depthWrite:     false,
            side:           THREE.DoubleSide,
            blending:       THREE.AdditiveBlending,
            uniforms: { uTime: { value: 0.0 } },
        });

        // Main disk
        const diskMesh = new THREE.Mesh(buildDiskRing(32, 110, 256), diskMat);
        bhGroup.add(diskMesh);

        // Secondary thinner bright inner ring for extra detail
        const innerDiskMat = diskMat.clone();
        innerDiskMat.uniforms = { uTime: { value: 0.0 } };
        const innerDisk = new THREE.Mesh(buildDiskRing(29, 48, 256), innerDiskMat);
        bhGroup.add(innerDisk);

        // -- Gravitational lensing halo: layered glow sprites -----------
        // These are billboard quads that create the "light bending" look
        // — stacked soft glows of decreasing size and opacity
        const haloLayers = [];
        const haloData = [
            { radius: 200, opacity: 0.08 },
            { radius: 130, opacity: 0.14 },
            { radius: 80,  opacity: 0.20 },
            { radius: 50,  opacity: 0.28 },
        ];
        const haloVert = `
            varying vec2 vUv;
            void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
        `;
        const haloFrag = `
            varying vec2 vUv;
            uniform float uOpacity;
            void main() {
                vec2  c = vUv - 0.5;
                float d = length(c) * 2.0;
                // Ring shape: bright band, dark center (simulates lensed light ring)
                float ring  = smoothstep(1.0, 0.6, d) * smoothstep(0.1, 0.5, d);
                float glow  = smoothstep(1.0, 0.0, d) * 0.3;
                float a     = (ring + glow) * uOpacity;
                gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * a, a);
            }
        `;
        haloData.forEach(function(h) {
            const mat = new THREE.ShaderMaterial({
                vertexShader:  haloVert,
                fragmentShader: haloFrag,
                transparent:   true,
                depthWrite:    false,
                blending:      THREE.AdditiveBlending,
                uniforms: { uOpacity: { value: h.opacity } },
            });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h.radius * 2, h.radius * 2), mat);
            mesh.renderOrder = 2;
            bhGroup.add(mesh);
            haloLayers.push(mesh);
        });

        // -- Screen-space star warp overlay (canvas) --------------------
        // As you get close, we draw radial streaks on the crtCanvas
        // that simulate stars being pulled toward the BH on screen.
        // This gives the "gravitational lensing" look without GLSL reprojection.
        const warpCanvas  = document.createElement('canvas');
        warpCanvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:790;opacity:0;';
        document.body.appendChild(warpCanvas);

        // -- Vignette overlay -------------------------------------------
        const vigEl = document.createElement('div');
        vigEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:800;background:radial-gradient(ellipse at center,transparent 20%,#000 100%);opacity:0;transition:opacity 0.1s;';
        document.body.appendChild(vigEl);
        const lensEl = document.createElement('div');
        lensEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:799;opacity:0;';
        document.body.appendChild(lensEl);

        let bhTime = 0;

        window._bhAnimate = function(delta, now) {
            bhTime += delta;

            const inFlight = appState === 'UNDOCKED';
            if (!inFlight) {
                bhGroup.visible      = false;
                warpCanvas.style.opacity = '0';
                vigEl.style.opacity      = '0';
                document.body.style.filter = '';
                return;
            }
            bhGroup.visible = true;

            // Animate disk shaders
            diskMat.uniforms.uTime.value       = bhTime;
            innerDiskMat.uniforms.uTime.value  = bhTime;

            // Billboard halos to always face camera
            haloLayers.forEach(function(h) { h.quaternion.copy(cameraA.quaternion); });
            photonRing.rotation.x = Math.PI / 2;

            // Disk slight tilt toward camera for visibility
            const camToBH = BH_POS.clone().sub(cameraA.position).normalize();
            diskMesh.lookAt(diskMesh.position.clone().add(camToBH));
            diskMesh.rotateX(Math.PI / 2);
            innerDisk.lookAt(innerDisk.position.clone().add(camToBH));
            innerDisk.rotateX(Math.PI / 2);

            const dist = cameraA.position.distanceTo(BH_POS);

            // Proximity vignette
            if (dist < BH_PULL_START) {
                const t = 1 - (dist / BH_PULL_START);
                vigEl.style.opacity = String(Math.pow(t, 1.5) * 0.9);
            } else {
                vigEl.style.opacity = '0';
            }
            lensEl.style.opacity = '0';

            // Screen-space warp canvas — radial streak effect near BH
            if (dist < 800) {
                const w = window.innerWidth, h = window.innerHeight;
                if (warpCanvas.width !== w || warpCanvas.height !== h) {
                    warpCanvas.width = w; warpCanvas.height = h;
                }
                const ctx  = warpCanvas.getContext('2d');
                const prox = Math.max(0, 1 - dist / 800);

                // Project BH world position to screen
                const bhScreen = BH_POS.clone().project(cameraA);
                const sx = (bhScreen.x * 0.5 + 0.5) * w;
                const sy = (-bhScreen.y * 0.5 + 0.5) * h;

                ctx.clearRect(0, 0, w, h);

                // Only draw if BH is on screen
                if (bhScreen.z < 1.0) {
                    const numStreaks = Math.floor(prox * 80);
                    const maxLen     = prox * w * 0.35;
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    for (let i = 0; i < numStreaks; i++) {
                        const angle  = Math.random() * Math.PI * 2;
                        const startR = (0.15 + Math.random() * 0.5) * w;
                        const endR   = startR * (0.3 + Math.random() * 0.3);
                        const x1 = sx + Math.cos(angle) * startR;
                        const y1 = sy + Math.sin(angle) * startR;
                        const x2 = sx + Math.cos(angle) * endR;
                        const y2 = sy + Math.sin(angle) * endR;
                        const alpha = (0.03 + Math.random() * 0.08) * prox;
                        const warm  = Math.random() > 0.6;
                        ctx.strokeStyle = warm
                            ? 'rgba(255,230,180,' + alpha + ')'
                            : 'rgba(220,230,255,' + alpha + ')';
                        ctx.lineWidth = 0.5 + Math.random() * 1.0;
                        ctx.beginPath();
                        ctx.moveTo(x1, y1);
                        ctx.lineTo(x2, y2);
                        ctx.stroke();
                    }
                    ctx.restore();
                }
                warpCanvas.style.opacity = String(prox * 0.85);
            } else {
                warpCanvas.style.opacity = '0';
            }

            document.body.style.filter = '';

            // Swallow trigger
            if (bhState === 'idle' && dist < BH_SWALLOW) {
                bhState = 'swallowed';
                warpCanvas.style.opacity = '0';
                vigEl.style.opacity = '0';
                triggerTunnel();
            }
        };

        window._bhState = () => bhState;

        function ringBell() {
            try {
                const actx = new (window.AudioContext || window.webkitAudioContext)();
                [[440,1],[880,0.6],[1320,0.3],[1760,0.15],[2200,0.08]].forEach(function(hm) {
                    const osc = actx.createOscillator(), gain = actx.createGain();
                    osc.connect(gain); gain.connect(actx.destination);
                    osc.frequency.value = hm[0]; osc.type = 'sine';
                    gain.gain.setValueAtTime(hm[1]*0.4, actx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime+3.5);
                    osc.start(actx.currentTime); osc.stop(actx.currentTime+3.5);
                });
            } catch(e) {}
        }

        function triggerTunnel() {
            if (document.pointerLockElement) document.exitPointerLock();
            showFlightHUD(false);
            const scene = document.createElement('div');
            scene.style.cssText = 'position:fixed;inset:0;z-index:5000;background:#000;perspective:350px;perspective-origin:50% 50%;overflow:hidden;opacity:0;';
            document.body.appendChild(scene);
            const ringEls = [], partEls = [];
            for (let i = 0; i < 60; i++) {
                const ring = document.createElement('div');
                const depth = -(i/60)*4000, hue = 215+(i/60)*45;
                ring.style.cssText = 'position:absolute;width:180vmin;height:180vmin;left:50%;top:50%;transform:translate(-50%,-50%) translateZ('+depth+'px);border-radius:50%;border:2px solid hsla('+hue+',80%,65%,0.4);box-shadow:0 0 18px 3px hsla('+hue+',90%,70%,0.2),inset 0 0 18px 3px hsla('+hue+',90%,70%,0.08);pointer-events:none;';
                scene.appendChild(ring); ring._z=depth; ring._hue=hue; ringEls.push(ring);
            }
            for (let i = 0; i < 100; i++) {
                const p = document.createElement('div');
                const angle=Math.random()*360, radius=28+Math.random()*32, depth=-Math.random()*4000, len=15+Math.random()*50;
                p.style.cssText = 'position:absolute;left:50%;top:50%;width:1px;height:'+len+'px;background:linear-gradient(rgba(160,140,255,0.9),transparent);transform-origin:top center;transform:translate(-50%,-50%) translateZ('+depth+'px) rotate('+angle+'deg) translateY(-'+radius+'vmin);pointer-events:none;opacity:0.5;';
                scene.appendChild(p); p._z=depth; p._angle=angle; p._radius=radius; p._speed=1+Math.random()*2; partEls.push(p);
            }
            let elapsed=0, lastT=performance.now(), done=false;
            function animTunnel(now) {
                if(done)return; requestAnimationFrame(animTunnel);
                const dt=Math.min((now-lastT)/1000,0.05); lastT=now; elapsed+=dt;
                const spd=300+elapsed*200;
                ringEls.forEach(function(r){
                    r._z+=spd*dt; if(r._z>300)r._z-=4300;
                    const prox=Math.max(0,Math.min(1,(r._z+4000)/4000)), a=0.08+prox*0.85;
                    r.style.transform='translate(-50%,-50%) translateZ('+r._z+'px)';
                    r.style.borderColor='hsla('+r._hue+',80%,65%,'+a+')';
                    r.style.boxShadow='0 0 18px 3px hsla('+r._hue+',90%,70%,'+(a*0.35)+'),inset 0 0 18px 3px hsla('+r._hue+',90%,70%,'+(a*0.12)+')';
                });
                partEls.forEach(function(p){
                    p._z+=p._speed*spd*dt*0.5; if(p._z>300){p._z-=4300;p._angle=Math.random()*360;}
                    p.style.transform='translate(-50%,-50%) translateZ('+p._z+'px) rotate('+p._angle+'deg) translateY(-'+p._radius+'vmin)';
                });
                if(elapsed>8&&!done){done=true;doWhiteFlash(scene);}
            }
            gsap.to(scene,{opacity:1,duration:0.5,onComplete:function(){
                vigEl.style.opacity='0'; requestAnimationFrame(animTunnel);
            }});
        }

        function doWhiteFlash(scene) {
            const f=document.createElement('div'); f.style.cssText='position:absolute;inset:0;background:#fff;opacity:0;z-index:10;pointer-events:none;';
            scene.appendChild(f); gsap.to(f,{opacity:1,duration:0.5,onComplete:function(){enterWhiteRoom(scene);}});
        }

        function enterWhiteRoom(tunnelScene) {
            const wrR=new THREE.WebGLRenderer({antialias:true});
            wrR.setSize(window.innerWidth,window.innerHeight); wrR.setPixelRatio(Math.min(window.devicePixelRatio,2));
            wrR.setClearColor(0xffffff,1); wrR.domElement.style.cssText='position:fixed;inset:0;z-index:6000;opacity:0;';
            document.body.appendChild(wrR.domElement);
            const wrS=new THREE.Scene(); wrS.background=new THREE.Color(0xffffff);
            const wrC=new THREE.PerspectiveCamera(70,window.innerWidth/window.innerHeight,0.1,80);
            wrC.position.set(0,1.75,10);
            wrS.add(new THREE.AmbientLight(0xffffff,3));
            const wm=new THREE.MeshBasicMaterial({color:0xffffff}), fm=new THREE.MeshBasicMaterial({color:0xf2f2f2});
            const fl=new THREE.Mesh(new THREE.PlaneGeometry(28,28),fm); fl.rotation.x=-Math.PI/2; wrS.add(fl);
            const cl=new THREE.Mesh(new THREE.PlaneGeometry(28,28),wm); cl.rotation.x=Math.PI/2; cl.position.y=8; wrS.add(cl);
            [[[0,4,-14],[0,0,0]],[[0,4,14],[0,Math.PI,0]],[[-14,4,0],[0,Math.PI/2,0]],[[14,4,0],[0,-Math.PI/2,0]]].forEach(function(w){
                const m=new THREE.Mesh(new THREE.PlaneGeometry(28,8),wm); m.position.set(w[0][0],w[0][1],w[0][2]); m.rotation.set(w[1][0],w[1][1],w[1][2]); wrS.add(m);
            });
            wrS.add(new THREE.GridHelper(28,14,0xdddddd,0xe8e8e8));
            const bg=new THREE.Group(); bg.position.set(0,0,-4);
            const bM=new THREE.MeshStandardMaterial({color:0x111111,roughness:0.3,metalness:0.85});
            const sM=new THREE.MeshStandardMaterial({color:0xe0e0e0,metalness:0.98,roughness:0.02});
            const ba=new THREE.Mesh(new THREE.CylinderGeometry(0.58,0.62,0.14,48),bM); ba.position.y=0.07; bg.add(ba);
            const ri=new THREE.Mesh(new THREE.TorusGeometry(0.58,0.04,12,48),new THREE.MeshStandardMaterial({color:0x333333,roughness:0.5,metalness:0.7})); ri.rotation.x=Math.PI/2; ri.position.y=0.09; bg.add(ri);
            const dm=new THREE.Mesh(new THREE.SphereGeometry(0.48,64,64,0,Math.PI*2,0,Math.PI*0.58),sM); dm.position.y=0.16; bg.add(dm);
            const st=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.04,0.25,16),sM); st.position.y=0.78; bg.add(st);
            const nu=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.055,0.04,6),sM); nu.position.y=0.88; bg.add(nu);
            const bt=new THREE.Mesh(new THREE.SphereGeometry(0.065,16,16),sM); bt.position.y=0.93; bg.add(bt);
            wrS.add(bg);
            const wrE=new THREE.Euler(0,0,0,'YXZ'); wrC.quaternion.setFromEuler(wrE);
            const wrK={w:false,a:false,s:false,d:false};
            let wrL=false, bRing=false;
            function onK(e,v){const k=e.key.toLowerCase();if(k in wrK)wrK[k]=v;}
            document.addEventListener('keydown',function(e){onK(e,true);});
            document.addEventListener('keyup',function(e){onK(e,false);});
            document.addEventListener('pointerlockchange',function(){wrL=document.pointerLockElement===wrR.domElement;});
            document.addEventListener('mousemove',function(e){
                if(!wrL)return; wrE.y-=e.movementX*0.002;
                wrE.x=Math.max(-1.3,Math.min(1.3,wrE.x-e.movementY*0.002));
                wrC.quaternion.setFromEuler(wrE);
            });
            const xh=document.createElement('div'); xh.style.cssText='position:fixed;top:50%;left:50%;width:16px;height:16px;transform:translate(-50%,-50%);z-index:7000;pointer-events:none;'; xh.innerHTML='<div style="position:absolute;top:50%;left:0;right:0;height:1px;background:rgba(0,0,0,0.3);transform:translateY(-50%);"></div><div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(0,0,0,0.3);transform:translateX(-50%);"></div>'; document.body.appendChild(xh);
            const hn=document.createElement('div'); hn.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:7000;color:rgba(0,0,0,0.35);font-family:Georgia,serif;font-size:13px;letter-spacing:0.12em;pointer-events:none;opacity:0;transition:opacity 0.4s;'; hn.textContent='Click to ring'; document.body.appendChild(hn);
            wrR.domElement.addEventListener('click',function(){
                if(!wrL){wrR.domElement.requestPointerLock();return;}
                if(bRing)return;
                const rc=new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(0,0),wrC);
                const hc=rc.intersectObjects(bg.children,true);
                if(hc.length>0&&hc[0].distance<5)doRingExit();
            });
            function doRingExit(){
                bRing=true; ringBell(); hn.style.opacity='0'; xh.remove();
                let wt=0;
                function wb(){
                    wt+=0.016; bg.rotation.z=Math.sin(wt*18)*Math.exp(-wt*3)*0.3;
                    if(wt<1.5){requestAnimationFrame(wb);return;}
                    bg.rotation.z=0;
                    const fd=document.createElement('div'); fd.style.cssText='position:fixed;inset:0;z-index:8000;background:#fff;opacity:0;'; document.body.appendChild(fd);
                    gsap.to(fd,{opacity:1,duration:1.5,onComplete:function(){
                        cancelAnimationFrame(wrAF);
                        if(document.pointerLockElement)document.exitPointerLock();
                        document.removeEventListener('keydown',onK); document.removeEventListener('keyup',onK);
                        wrR.dispose(); wrR.domElement.remove(); hn.remove(); fd.remove();
                        if(tunnelScene&&tunnelScene.parentNode)tunnelScene.remove();
                        endSequence();
                    }});
                }
                requestAnimationFrame(wb);
            }
            let wrAF, wrLT=performance.now();
            function wrLoop(now){
                wrAF=requestAnimationFrame(wrLoop); const dt=Math.min((now-wrLT)/1000,0.05); wrLT=now;
                if(!bRing&&wrL){
                    const yaw=wrE.y;
                    const fw=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
                    const rg=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
                    const sp=5;
                    if(wrK.w)wrC.position.addScaledVector(fw,sp*dt);
                    if(wrK.s)wrC.position.addScaledVector(fw,-sp*dt);
                    if(wrK.a)wrC.position.addScaledVector(rg,-sp*dt);
                    if(wrK.d)wrC.position.addScaledVector(rg,sp*dt);
                    wrC.position.x=Math.max(-12,Math.min(12,wrC.position.x));
                    wrC.position.z=Math.max(-12,Math.min(12,wrC.position.z));
                    wrC.position.y=1.75;
                    hn.style.opacity=wrC.position.distanceTo(bg.position)<5?'1':'0';
                }
                wrR.render(wrS,wrC);
            }
            gsap.to(wrR.domElement,{opacity:1,duration:0.5,onComplete:function(){
                if(tunnelScene&&tunnelScene.parentNode)tunnelScene.remove();
                wrR.domElement.requestPointerLock();
            }});
            requestAnimationFrame(wrLoop);
        }

        function endSequence() {
            bhState='idle';
            cameraA.position.set(menuPos.x,menuPos.y,menuPos.z);
            cameraA.lookAt(0,0,0);
            flightEuler.setFromQuaternion(cameraA.quaternion,'YXZ');
            vigEl.style.opacity='0';
            lensEl.style.opacity='0';
            document.body.style.filter='';
            flightActive=true;
            showFlightHUD(true);
            canvas.requestPointerLock();
        }

    })();

    // =========================================================
    // SUN
    // =========================================================
    (function buildSun() {
        const SUN_POS = new THREE.Vector3(-3000, 600, -800);
        window._SUN_POS = SUN_POS;

        // Core sphere
        const sunGeo = new THREE.SphereGeometry(180, 64, 64);
        const sunMat = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 } },
            vertexShader: `
                varying vec3 vNormal; varying vec2 vUv;
                void main() { vNormal=normal; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
            `,
            fragmentShader: `
                precision highp float;
                varying vec3 vNormal; varying vec2 vUv; uniform float uTime;
                float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
                float noise(vec2 p){
                    vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);
                    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
                }
                float fbm(vec2 p){ return noise(p)*0.5+noise(p*2.1)*0.25+noise(p*4.3)*0.125+noise(p*8.7)*0.0625; }
                void main() {
                    vec2 p   = vUv*4.0 + vec2(uTime*0.012, uTime*0.008);
                    float n  = fbm(p);
                    float n2 = fbm(p*1.8 + vec2(3.1,1.7) + uTime*0.006);
                    float spot = smoothstep(0.62, 0.55, n2) * 0.35;
                    vec3 col = mix(vec3(1.00,0.97,0.85), vec3(1.00,0.72,0.20), n*0.5);
                    col      = mix(col, vec3(0.90,0.40,0.05), spot);
                    float limb = 1.0 - clamp(dot(vNormal, vec3(0,0,1)), 0.0, 1.0);
                    col = mix(col, vec3(0.80,0.30,0.02), pow(limb,2.5)*0.6);
                    gl_FragColor = vec4(col, 1.0);
                }
            `,
        });
        const sunMesh = new THREE.Mesh(sunGeo, sunMat);
        sunMesh.position.copy(SUN_POS);
        sunMesh.visible = false;
        sceneA.add(sunMesh);

        // Corona glow layers
        const coronaData = [
            { scale:1.18, opacity:0.55 },
            { scale:1.40, opacity:0.28 },
            { scale:1.80, opacity:0.13 },
            { scale:2.60, opacity:0.06 },
        ];
        const coronaMeshes = [];
        const coronaVert = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
        const coronaFrag = `
            precision highp float;
            varying vec2 vUv; uniform float uOpacity; uniform float uTime;
            float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
            float noise(vec2 p){
                vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);
                return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
            }
            void main(){
                vec2 c=vUv-0.5; float d=length(c);
                float base=smoothstep(0.5,0.0,d);
                float angle=atan(c.y,c.x);
                float ray=noise(vec2(angle*3.0, uTime*0.04))*0.3+0.7;
                float a=base*base*ray*uOpacity;
                vec3 col=mix(vec3(1.0,0.75,0.25),vec3(1.0,0.95,0.70),base);
                gl_FragColor=vec4(col*a,a);
            }
        `;
        coronaData.forEach(function(c) {
            const mat = new THREE.ShaderMaterial({
                vertexShader: coronaVert, fragmentShader: coronaFrag,
                transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
                uniforms:{ uOpacity:{value:c.opacity}, uTime:{value:0} },
            });
            const r = 180 * c.scale;
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(r*2,r*2), mat);
            mesh.position.copy(SUN_POS);
            mesh.visible = false;
            sceneA.add(mesh);
            coronaMeshes.push(mesh);
        });

        // Lens flare streak
        const flareMat = new THREE.ShaderMaterial({
            transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
            uniforms:{ uOpacity:{value:1.0} },
            vertexShader: coronaVert,
            fragmentShader:`
                precision highp float;
                varying vec2 vUv; uniform float uOpacity;
                void main(){
                    float x=abs(vUv.x-0.5)*2.0, y=abs(vUv.y-0.5)*2.0;
                    float a=smoothstep(1.0,0.0,x)*smoothstep(1.0,0.0,y*6.0);
                    a=a*a*uOpacity;
                    gl_FragColor=vec4(vec3(1.0,0.90,0.60)*a,a);
                }
            `,
        });
        const flareMesh = new THREE.Mesh(new THREE.PlaneGeometry(1400,18), flareMat);
        flareMesh.position.copy(SUN_POS);
        flareMesh.visible = false;
        sceneA.add(flareMesh);

        // Point light so planets catch sun illumination
        const sunLight = new THREE.PointLight(0xfff4e0, 1.4, 14000);
        sunLight.position.copy(SUN_POS);
        sceneA.add(sunLight);

        let sunTime = 0;
        window._sunAnimate = function(delta) {
            sunTime += delta;
            const inFlight = appState === 'UNDOCKED';
            sunMesh.visible = inFlight;
            flareMesh.visible = inFlight;
            coronaMeshes.forEach(function(m) { m.visible = inFlight; });
            if (!inFlight) return;

            sunMat.uniforms.uTime.value = sunTime;
            coronaMeshes.forEach(function(m) {
                m.quaternion.copy(cameraA.quaternion);
                m.material.uniforms.uTime.value = sunTime;
            });
            flareMesh.quaternion.copy(cameraA.quaternion);

            // Flare only visible when looking near the sun
            const toSun   = SUN_POS.clone().sub(cameraA.position).normalize();
            const forward = new THREE.Vector3(0,0,-1).applyQuaternion(cameraA.quaternion);
            const dot     = toSun.dot(forward);
            flareMat.uniforms.uOpacity.value = Math.max(0, (dot - 0.92) / 0.08) * 0.6;
        };
    })();

    // =========================================================
    // PLANETS -- Procedural solar system in sceneA
    // =========================================================
    (function buildPlanets() {

        // Each planet: position, radius, and shader style
        const PLANET_DEFS = [
            // Gas giant — deep to the left of BH approach
            {
                pos:    new THREE.Vector3(-1200, 120, 1400),
                radius: 90,
                type:   'gas',
                hue:    { band1: [0.55, 0.38, 0.18], band2: [0.72, 0.55, 0.30], band3: [0.40, 0.25, 0.10] },
                rings:  true,
            },
            // Icy blue-white planet — far upper right
            {
                pos:    new THREE.Vector3(900, 300, 2400),
                radius: 55,
                type:   'ice',
                hue:    { base: [0.55, 0.72, 0.90], accent: [0.85, 0.93, 1.00] },
                rings:  false,
            },
            // Rocky red-brown — close, lower left
            {
                pos:    new THREE.Vector3(-600, -200, 900),
                radius: 38,
                type:   'rock',
                hue:    { base: [0.38, 0.18, 0.10], crack: [0.22, 0.10, 0.06], bright: [0.60, 0.35, 0.20] },
                rings:  false,
            },
            // Lush green-blue — far right, above the plane
            {
                pos:    new THREE.Vector3(1800, 80, 1100),
                radius: 65,
                type:   'lush',
                hue:    { ocean: [0.08, 0.22, 0.55], land: [0.12, 0.38, 0.15], cloud: [0.88, 0.91, 0.95] },
                rings:  false,
            },
            // Tiny hot ember — near the BH, very small
            {
                pos:    new THREE.Vector3(200, -60, 1500),
                radius: 22,
                type:   'ember',
                hue:    { hot: [1.00, 0.45, 0.05], dark: [0.18, 0.05, 0.01] },
                rings:  false,
            },
        ];

        // Light direction from sun position (set after sun is built)
        const SUN_DIR = window._SUN_POS
            ? new THREE.Vector3().subVectors(new THREE.Vector3(0,0,0), window._SUN_POS).normalize().negate()
            : new THREE.Vector3(1,1,-0.5).normalize();

        // Shared vertex shader for all planets
        const planetVert = `
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vWorldPos;
            void main() {
                vUv       = uv;
                vNormal   = normalize(normalMatrix * normal);
                vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        // Noise helpers used by all planet shaders
        const noiseGLSL = `
            float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
            float noise2(vec2 p) {
                vec2 i = floor(p), f = fract(p), u = f*f*(3.0-2.0*f);
                return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
                           mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
            }
            float noise3(vec3 p) {
                vec3 i = floor(p), f = fract(p), u = f*f*(3.0-2.0*f);
                return mix(mix(mix(hash3(i),           hash3(i+vec3(1,0,0)), u.x),
                               mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), u.x), u.y),
                           mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), u.x),
                               mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), u.x), u.y), u.z);
            }
            float fbm3(vec3 p) {
                return noise3(p)*0.5 + noise3(p*2.1+vec3(3.1,1.7,2.3))*0.25
                     + noise3(p*4.3+vec3(1.2,5.6,3.4))*0.125
                     + noise3(p*8.7+vec3(7.1,2.3,4.8))*0.0625
                     + noise3(p*17.3+vec3(4.4,8.1,2.9))*0.03125
                     + noise3(p*34.1+vec3(9.2,3.7,6.1))*0.015625;
            }
        `;

        // ── Gas giant shader ─────────────────────────────────────────────
        function makeGasMat(def) {
            const b1 = def.hue.band1, b2 = def.hue.band2, b3 = def.hue.band3;
            return new THREE.ShaderMaterial({
                uniforms: { uTime: { value: 0 }, uLight: { value: SUN_DIR.clone() } },
                vertexShader: planetVert,
                fragmentShader: `
                    precision highp float;
                    varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorldPos;
                    uniform float uTime; uniform vec3 uLight;
                    ${noiseGLSL}
                    void main() {
                        vec3 p = vWorldPos * 0.012;
                        // Horizontal bands with turbulence
                        float lat   = vUv.y;
                        float turb  = fbm3(vec3(p.x + uTime*0.01, p.y*3.0, p.z + uTime*0.005)) * 0.18;
                        float band  = fract(lat * 7.0 + turb);
                        float band2 = fract(lat * 3.0 - turb * 0.5);
                        vec3 col = mix(vec3(${b1}), vec3(${b2}), smoothstep(0.3, 0.7, band));
                        col      = mix(col, vec3(${b3}), smoothstep(0.6, 0.9, band2) * 0.6);
                        // Storm spot
                        vec2 storm = vec2(0.35, 0.55);
                        float sd = length(vec2(vUv.x - storm.x, (vUv.y - storm.y)*2.0));
                        col = mix(col, vec3(${b1[0]+0.1}, ${b1[1]+0.08}, ${b1[2]+0.05}), smoothstep(0.12, 0.0, sd));
                        // Lighting
                        float diff = clamp(dot(vNormal, uLight), 0.0, 1.0);
                        col *= 0.18 + diff * 0.85;
                        // Atmosphere rim
                        float rim = 1.0 - clamp(dot(vNormal, vec3(0,0,1)), 0.0, 1.0);
                        col += vec3(${b2[0]*0.4}, ${b2[1]*0.4}, ${b2[2]*0.3}) * pow(rim, 3.0) * 0.6;
                        gl_FragColor = vec4(col, 1.0);
                    }
                `,
            });
        }

        // ── Ice planet shader ────────────────────────────────────────────
        function makeIceMat(def) {
            const base = def.hue.base, acc = def.hue.accent;
            return new THREE.ShaderMaterial({
                uniforms: { uTime: { value: 0 }, uLight: { value: SUN_DIR.clone() } },
                vertexShader: planetVert,
                fragmentShader: `
                    precision highp float;
                    varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorldPos;
                    uniform float uTime; uniform vec3 uLight;
                    ${noiseGLSL}
                    void main() {
                        vec3 p = vWorldPos * 0.018;
                        float cracks = fbm3(p * 2.0);
                        float polar  = pow(abs(vUv.y - 0.5) * 2.0, 1.5);
                        vec3 col = mix(vec3(${base}), vec3(${acc}), clamp(cracks + polar * 0.8, 0.0, 1.0));
                        // Crack lines
                        float crackLine = smoothstep(0.55, 0.45, noise3(p * 5.0));
                        col = mix(col, vec3(0.3, 0.45, 0.65), crackLine * 0.4);
                        float diff = clamp(dot(vNormal, uLight), 0.0, 1.0);
                        col *= 0.25 + diff * 0.80;
                        float rim = 1.0 - clamp(dot(vNormal, vec3(0,0,1)), 0.0, 1.0);
                        col += vec3(0.7, 0.88, 1.0) * pow(rim, 2.5) * 0.5;
                        gl_FragColor = vec4(col, 1.0);
                    }
                `,
            });
        }

        // ── Rocky planet shader ──────────────────────────────────────────
        function makeRockMat(def) {
            const base = def.hue.base, crack = def.hue.crack, bright = def.hue.bright;
            return new THREE.ShaderMaterial({
                uniforms: { uTime: { value: 0 }, uLight: { value: SUN_DIR.clone() } },
                vertexShader: planetVert,
                fragmentShader: `
                    precision highp float;
                    varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorldPos;
                    uniform float uTime; uniform vec3 uLight;
                    ${noiseGLSL}
                    void main() {
                        vec3 p = vWorldPos * 0.020;
                        float n1 = fbm3(p);
                        float n2 = fbm3(p * 3.0 + vec3(5.1));
                        vec3 col = mix(vec3(${crack}), vec3(${base}), smoothstep(0.3, 0.7, n1));
                        col      = mix(col, vec3(${bright}), smoothstep(0.65, 0.85, n2) * 0.5);
                        // Craters: circular dips in noise
                        for (int i = 0; i < 5; i++) {
                            vec3 co = vec3(float(i)*1.37+0.5, float(i)*0.71+0.3, float(i)*1.91+0.1);
                            float cd = length(fract(p + co) - 0.5);
                            col = mix(col, vec3(${crack}), smoothstep(0.22, 0.18, cd) * 0.7);
                            col = mix(col, vec3(${bright}), smoothstep(0.18, 0.16, cd) * 0.4);
                        }
                        float diff = clamp(dot(vNormal, uLight), 0.0, 1.0);
                        col *= 0.12 + diff * 0.90;
                        float rim = 1.0 - clamp(dot(vNormal, vec3(0,0,1)), 0.0, 1.0);
                        col += vec3(${base[0]*0.5}, ${base[1]*0.3}, ${base[2]*0.2}) * pow(rim, 4.0) * 0.3;
                        gl_FragColor = vec4(col, 1.0);
                    }
                `,
            });
        }

        // ── Lush planet shader ───────────────────────────────────────────
        function makeLushMat(def) {
            const oc = def.hue.ocean, la = def.hue.land, cl = def.hue.cloud;
            return new THREE.ShaderMaterial({
                uniforms: { uTime: { value: 0 }, uLight: { value: SUN_DIR.clone() } },
                vertexShader: planetVert,
                fragmentShader: `
                    precision highp float;
                    varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorldPos;
                    uniform float uTime; uniform vec3 uLight;
                    ${noiseGLSL}
                    void main() {
                        vec3 p = vWorldPos * 0.014;
                        float continent = fbm3(p);
                        float cloudN    = fbm3(p * 1.8 + vec3(uTime*0.003, 0.0, uTime*0.002));
                        // Ocean vs land
                        vec3 col = mix(vec3(${oc}), vec3(${la}), smoothstep(0.42, 0.55, continent));
                        // Snow caps at poles
                        float polar = pow(abs(vUv.y - 0.5) * 2.0, 3.5);
                        col = mix(col, vec3(0.92, 0.95, 0.98), smoothstep(0.5, 0.9, polar));
                        // Cloud layer
                        float clouds = smoothstep(0.52, 0.65, cloudN);
                        col = mix(col, vec3(${cl}), clouds * 0.75);
                        float diff = clamp(dot(vNormal, uLight), 0.0, 1.0);
                        col *= 0.15 + diff * 0.88;
                        // Blue atmosphere rim
                        float rim = 1.0 - clamp(dot(vNormal, vec3(0,0,1)), 0.0, 1.0);
                        col += vec3(0.15, 0.40, 0.90) * pow(rim, 2.0) * 0.65;
                        gl_FragColor = vec4(col, 1.0);
                    }
                `,
            });
        }

        // ── Ember planet shader ──────────────────────────────────────────
        function makeEmberMat(def) {
            const hot = def.hue.hot, dark = def.hue.dark;
            return new THREE.ShaderMaterial({
                uniforms: { uTime: { value: 0 }, uLight: { value: SUN_DIR.clone() } },
                vertexShader: planetVert,
                fragmentShader: `
                    precision highp float;
                    varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorldPos;
                    uniform float uTime; uniform vec3 uLight;
                    ${noiseGLSL}
                    void main() {
                        vec3 p = vWorldPos * 0.030;
                        float lava = fbm3(p + vec3(uTime*0.008, 0.0, uTime*0.005));
                        float crust = fbm3(p * 2.5 + vec3(1.3, 2.7, 0.9));
                        vec3 col = mix(vec3(${dark}), vec3(${hot}), smoothstep(0.35, 0.65, lava));
                        // Glowing cracks
                        float crack = smoothstep(0.5, 0.4, crust);
                        col = mix(col, vec3(1.0, 0.75, 0.1), crack * 0.8);
                        // Self-illuminated — doesn't need much external light
                        float diff = clamp(dot(vNormal, uLight), 0.0, 1.0);
                        col *= 0.55 + diff * 0.50;
                        // Orange glow rim
                        float rim = 1.0 - clamp(dot(vNormal, vec3(0,0,1)), 0.0, 1.0);
                        col += vec3(1.0, 0.35, 0.02) * pow(rim, 2.5) * 0.8;
                        gl_FragColor = vec4(col, 1.0);
                    }
                `,
            });
        }

        const matMakers = { gas: makeGasMat, ice: makeIceMat, rock: makeRockMat, lush: makeLushMat, ember: makeEmberMat };
        const planetMeshes = [];

        PLANET_DEFS.forEach(function(def) {
            const geo = new THREE.SphereGeometry(def.radius, 128, 128);
            const mat = matMakers[def.type](def);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(def.pos);
            mesh.visible = false;
            sceneA.add(mesh);
            planetMeshes.push({ mesh, mat, def });

            // Rings for gas giant
            if (def.rings) {
                const ringGeo = new THREE.BufferGeometry();
                const ringVerts = [], ringUVs = [], ringIdx = [];
                const innerR = def.radius * 1.45, outerR = def.radius * 2.6;
                const segs = 256;
                for (let i = 0; i <= segs; i++) {
                    const angle = (i / segs) * Math.PI * 2;
                    const cos = Math.cos(angle), sin = Math.sin(angle);
                    const u = i / segs;
                    ringVerts.push(cos*innerR, 0, sin*innerR); ringUVs.push(u, 0);
                    ringVerts.push(cos*outerR, 0, sin*outerR); ringUVs.push(u, 1);
                }
                for (let i = 0; i < segs; i++) {
                    const a = i*2; ringIdx.push(a, a+1, a+2, a+1, a+3, a+2);
                }
                ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringVerts, 3));
                ringGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(ringUVs, 2));
                ringGeo.setIndex(ringIdx);
                const ringMat = new THREE.ShaderMaterial({
                    transparent: true, depthWrite: false, side: THREE.DoubleSide,
                    uniforms: { uTime: { value: 0 } },
                    vertexShader: `
                        varying vec2 vUv;
                        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
                    `,
                    fragmentShader: `
                        precision highp float;
                        varying vec2 vUv; uniform float uTime;
                        float hash(float n) { return fract(sin(n)*43758.5453); }
                        void main() {
                            float r     = vUv.y;
                            float band  = fract(r * 12.0 + hash(floor(r*12.0)) * 0.3);
                            float alpha = (0.35 + 0.45 * smoothstep(0.2, 0.8, band))
                                        * smoothstep(0.0, 0.05, r) * smoothstep(1.0, 0.88, r);
                            vec3 col = mix(vec3(0.55, 0.45, 0.30), vec3(0.80, 0.70, 0.52), band);
                            col      = mix(col, vec3(0.92, 0.86, 0.72), smoothstep(0.7, 1.0, band) * 0.5);
                            gl_FragColor = vec4(col, alpha * 0.72);
                        }
                    `,
                });
                const ringMesh = new THREE.Mesh(ringGeo, ringMat);
                ringMesh.rotation.x = Math.PI * 0.18; // slight tilt
                mesh.add(ringMesh);
                planetMeshes.push({ mesh: ringMesh, mat: ringMat, def: null });
            }
        });

        // Slow rotation for each planet
        const rotSpeeds = [0.04, 0.07, 0.12, 0.06, 0.18];

        // Planet names
        const PLANET_NAMES = ['Gorgon Prime', 'Cryos IV', 'Dustfall', 'New Elysium', 'Ember-9'];

        // ── Planet labels (XP-style tooltip HUD) ──────────────────────
        const labelContainer = document.createElement('div');
        labelContainer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:850;';
        document.body.appendChild(labelContainer);

        const planetLabels = PLANET_DEFS.map(function(def, i) {
            const el = document.createElement('div');
            el.style.cssText = [
                'position:absolute',
                'pointer-events:none',
                'opacity:0',
                'transition:opacity 0.4s',
                'display:flex',
                'flex-direction:column',
                'align-items:center',
                'gap:4px',
            ].join(';');
            // Name tag
            const tag = document.createElement('div');
            tag.textContent = PLANET_NAMES[i];
            tag.style.cssText = [
                'font-family:"Tahoma","Segoe UI",sans-serif',
                'font-size:11px',
                'font-weight:bold',
                'color:#e8f4ff',
                'background:rgba(0,20,60,0.72)',
                'border:1px solid rgba(100,160,255,0.45)',
                'padding:2px 8px',
                'border-radius:2px',
                'white-space:nowrap',
                'letter-spacing:0.05em',
                'text-shadow:0 0 8px rgba(100,180,255,0.8)',
            ].join(';');
            // Distance indicator
            const dist = document.createElement('div');
            dist.style.cssText = [
                'font-family:"Tahoma",sans-serif',
                'font-size:9px',
                'color:rgba(160,200,255,0.7)',
                'letter-spacing:0.08em',
            ].join(';');
            // Crosshair dot
            const dot = document.createElement('div');
            dot.style.cssText = [
                'width:4px',
                'height:4px',
                'border-radius:50%',
                'background:rgba(100,180,255,0.6)',
                'box-shadow:0 0 6px rgba(100,180,255,0.8)',
            ].join(';');
            el.appendChild(dot);
            el.appendChild(tag);
            el.appendChild(dist);
            labelContainer.appendChild(el);
            return { el, dist, def };
        });

        // ── Moon orbiting the gas giant ────────────────────────────────
        const gasPlanetMesh = planetMeshes[0].mesh;
        const moonGeo = new THREE.SphereGeometry(14, 64, 64);
        const moonMat = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 }, uLight: { value: SUN_DIR.clone() } },
            vertexShader: planetVert,
            fragmentShader: `
                precision highp float;
                varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorldPos;
                uniform float uTime; uniform vec3 uLight;
                ${noiseGLSL}
                void main() {
                    vec3 p = vWorldPos * 0.035;
                    float n = fbm3(p);
                    float crater = fbm3(p * 3.0 + vec3(2.1, 5.3, 1.7));
                    vec3 col = mix(vec3(0.28, 0.26, 0.24), vec3(0.55, 0.52, 0.48), smoothstep(0.35, 0.65, n));
                    col = mix(col, vec3(0.18, 0.16, 0.14), smoothstep(0.55, 0.45, crater) * 0.6);
                    float diff = clamp(dot(vNormal, uLight), 0.0, 1.0);
                    col *= 0.08 + diff * 0.94;
                    gl_FragColor = vec4(col, 1.0);
                }
            `,
        });
        const moonMesh = new THREE.Mesh(moonGeo, moonMat);
        moonMesh.visible = false;
        sceneA.add(moonMesh);
        let moonAngle = 0;

        // ── Space ambience audio ───────────────────────────────────────
        // Low drone that shifts with BH proximity — wired into Three.js audio
        // We just set up a gain node drone via Web Audio directly
        let ambienceCtx = null, ambienceDrone = null, ambienceGain = null;
        let ambienceStarted = false;

        function startSpaceAmbience() {
            if (ambienceStarted) return;
            ambienceStarted = true;
            try {
                ambienceCtx  = new (window.AudioContext || window.webkitAudioContext)();
                ambienceGain = ambienceCtx.createGain();
                ambienceGain.gain.value = 0;
                ambienceGain.connect(ambienceCtx.destination);

                // Layer 1: deep sub drone
                const osc1 = ambienceCtx.createOscillator();
                osc1.type = 'sine'; osc1.frequency.value = 38;
                const g1 = ambienceCtx.createGain(); g1.gain.value = 0.28;
                osc1.connect(g1); g1.connect(ambienceGain); osc1.start();

                // Layer 2: mid harmonic
                const osc2 = ambienceCtx.createOscillator();
                osc2.type = 'sine'; osc2.frequency.value = 76;
                const g2 = ambienceCtx.createGain(); g2.gain.value = 0.10;
                osc2.connect(g2); g2.connect(ambienceGain); osc2.start();

                // Layer 3: very slow LFO wobble on osc1
                const lfo = ambienceCtx.createOscillator();
                lfo.frequency.value = 0.08;
                const lfoGain = ambienceCtx.createGain(); lfoGain.gain.value = 4;
                lfo.connect(lfoGain); lfoGain.connect(osc1.frequency); lfo.start();

                // Fade in
                ambienceGain.gain.linearRampToValueAtTime(0.18, ambienceCtx.currentTime + 4);
                ambienceDrone = osc1;
                window._ambienceCtx  = ambienceCtx;
                window._ambienceDrone = osc1;
                window._ambienceOsc2  = osc2;
            } catch(e) {}
        }

        window._planetsAnimate = function(delta, now) {
            const inFlight = appState === 'UNDOCKED';
            planetMeshes.forEach(function(p) { p.mesh.visible = inFlight; });
            moonMesh.visible         = inFlight;
            labelContainer.style.display = inFlight ? 'block' : 'none';
            if (!inFlight) return;

            // BH proximity audio — only audible within 1200 units
            if (window._BH_POS) {
                const bhDist = cameraA.position.distanceTo(window._BH_POS);
                if (bhDist < 1200 && !ambienceStarted) startSpaceAmbience();
                if (ambienceDrone && ambienceGain) {
                    const t          = Math.max(0, 1 - bhDist / 1200);
                    const vol        = t * t * 0.45;
                    const pitchShift = t * 28;
                    ambienceDrone.frequency.value = 38 + pitchShift;
                    window._ambienceOsc2.frequency.value = 76 + pitchShift * 2;
                    ambienceGain.gain.setTargetAtTime(vol, ambienceCtx.currentTime, 0.8);
                }
            }

            // Moon orbit around gas giant
            moonAngle += delta * 0.12;
            const gasPos = PLANET_DEFS[0].pos;
            const moonOrbitR = PLANET_DEFS[0].radius * 2.8;
            moonMesh.position.set(
                gasPos.x + Math.cos(moonAngle) * moonOrbitR,
                gasPos.y + Math.sin(moonAngle * 0.3) * 20,
                gasPos.z + Math.sin(moonAngle) * moonOrbitR
            );
            moonMesh.rotation.y += delta * 0.2;
            moonMat.uniforms.uTime.value = now;

            // Planet rotation + time uniform
            planetMeshes.forEach(function(p, i) {
                if (p.def) {
                    p.mesh.rotation.y += (rotSpeeds[i % rotSpeeds.length] || 0.05) * delta;
                    if (p.mat.uniforms && p.mat.uniforms.uTime) {
                        p.mat.uniforms.uTime.value = now;
                    }
                }
            });

            // Planet labels — project to screen
            const W = window.innerWidth, H = window.innerHeight;
            planetLabels.forEach(function(lbl, i) {
                const pos  = PLANET_DEFS[i].pos.clone().project(cameraA);
                // Behind camera or off screen — hide
                if (pos.z > 1.0 || Math.abs(pos.x) > 1.2 || Math.abs(pos.y) > 1.2) {
                    lbl.el.style.opacity = '0';
                    return;
                }
                const sx = (pos.x *  0.5 + 0.5) * W;
                const sy = (pos.y * -0.5 + 0.5) * H;
                const camDist = cameraA.position.distanceTo(PLANET_DEFS[i].pos);

                // Fade in when within 2500 units, fade out when very close (inside planet)
                const fadeIn  = smoothstepJS(2500, 1800, camDist);
                const fadeOut = smoothstepJS(80, 180, camDist);
                const opacity = fadeIn * fadeOut;

                lbl.el.style.opacity  = String(opacity);
                lbl.el.style.left     = (sx - 40) + 'px';
                lbl.el.style.top      = (sy - PLANET_DEFS[i].radius * 0.3 - 36) + 'px';
                lbl.dist.textContent  = Math.round(camDist) + ' u';
            });
        };

    })();

});
