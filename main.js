import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.querySelector('#monitor-canvas');
    const screenCanvas = document.querySelector('#os-screen-canvas');
    const ctx = screenCanvas.getContext('2d');

    let appState = 'LOADING'; 
    let systemState = 'POWERED_OFF';
    
    let lastTime = performance.now();
    let bootElapsed = 0; 
    let lightTime = 0;

    let monitorGroup;
    const mouse = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();

    let starField;
    const shootingStarSpeed = 200;
    const shootingStars = [];

    // UI Elements
    const uiOverlay = document.getElementById('ui-overlay');
    const enterBtn = document.getElementById('enter-btn');
    const infoBtn = document.getElementById('info-btn');
    const infoModal = document.getElementById('info-modal');
    const closeInfo = document.getElementById('close-info');

    // Initial state: Hidden, but in its CSS position
    gsap.set(uiOverlay, { opacity: 0 });

    // --- 1. AUDIO SETUP ---
    const listener = new THREE.AudioListener();
    const bootSound = new THREE.Audio(listener);
    const fanSound = new THREE.Audio(listener);
    const ambientTrack = new THREE.Audio(listener);
    const audioLoader = new THREE.AudioLoader();

    audioLoader.load('./boot.wav', (buffer) => { bootSound.setBuffer(buffer); bootSound.setVolume(0.5); });
    audioLoader.load('./fan_whir.mp3', (buffer) => { 
        fanSound.setBuffer(buffer); 
        fanSound.setLoop(true); 
        fanSound.setVolume(0); 
    });
    audioLoader.load('./ambience.wav', (buffer) => { 
        ambientTrack.setBuffer(buffer); 
        ambientTrack.setLoop(true); 
        ambientTrack.setVolume(0); 
    });

    // --- 2. SCENE & CAMERA ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020207); 

    const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.add(listener);
    camera.position.set(12, 6, 28); 
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const screenTexture = new THREE.CanvasTexture(screenCanvas);

    // --- 3. STARS SYSTEM ---
    function createCozyStars() {
        const starGeometry = new THREE.BufferGeometry();
        const starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 1.0, 
            transparent: true,
            opacity: 0.5, 
            sizeAttenuation: true,
            depthWrite: false
        });
        const sprite = new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/disc.png');
        starMaterial.map = sprite;
        starMaterial.alphaTest = 0.2;
        const starVertices = [];
        for (let i = 0; i < 4000; i++) {
            const x = (Math.random() - 0.5) * 1500;
            const y = (Math.random() - 0.5) * 800;
            const z = -Math.random() * 500 - 100; 
            starVertices.push(x, y, z);
        }
        starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
        return new THREE.Points(starGeometry, starMaterial);
    }

    starField = createCozyStars();
    starField.material.opacity = 0;
    scene.add(starField);

    function spawnShootingStar() {
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending });
        const startX = (Math.random() - 0.5) * 1000;
        const startY = (Math.random() - 0.5) * 600;
        const startZ = -Math.random() * 300 - 200;
        const direction = new THREE.Vector3((Math.random() * 0.5 + 0.5), -(Math.random() * 0.5 + 0.2), 0).normalize();
        const streakLength = 30 + Math.random() * 50;
        const endPoint = new THREE.Vector3(startX, startY, startZ).add(direction.clone().multiplyScalar(streakLength));
        const vertices = new Float32Array([startX, startY, startZ, endPoint.x, endPoint.y, endPoint.z]);
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        const streak = new THREE.Line(geometry, material);
        streak.userData = { velocity: direction.clone().multiplyScalar(shootingStarSpeed), life: 1.0 };
        shootingStars.push(streak);
        scene.add(streak);
    }

    setInterval(() => {
        if (appState === 'READY_TO_POWER' || appState === 'WARMING_UP' || systemState === 'DESKTOP') {
            if (Math.random() < 0.4) spawnShootingStar();
        }
    }, 5000);

    // --- 4. LIGHTING ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.05)); 
    const introLight = new THREE.PointLight(0xffffff, 0, 100); 
    introLight.position.set(-15, 5, 10);
    scene.add(introLight);
    const roomLight = new THREE.DirectionalLight(0xffffff, 0);
    roomLight.position.set(5, 5, 5);
    scene.add(roomLight);

    // --- 5. UI LOGIC ---
    const runIntroUIAnim = () => {
        gsap.to(uiOverlay, { 
            opacity: 1, 
            duration: 1.5, 
            ease: "power2.out" 
        });
    };

    enterBtn.addEventListener('click', () => {
        if(appState !== 'INTRO') return;
        appState = 'TRANSITIONING';

        // --- SPECIFIC FADE FIX ---
        const exitTl = gsap.timeline();
        exitTl.to(uiOverlay, { 
            opacity: 0, 
            duration: 0.8, 
            ease: "power2.inOut",
            onComplete: () => { 
                uiOverlay.style.display = 'none'; 
            }
        });

        gsap.to(camera.position, {
            x: 0, y: 0, z: 14, 
            duration: 3.5,
            ease: "expo.inOut",
            onUpdate: () => camera.lookAt(0, 0, 0),
            onComplete: () => { appState = 'READY_TO_POWER'; }
        });

        gsap.to(introLight, { intensity: 80, duration: 3 }); 
        gsap.to(starField.material, { opacity: 0.6, duration: 5, ease: "power2.inOut" });
    });

    infoBtn.onclick = () => infoModal.classList.remove('modal-hidden');
    closeInfo.onclick = () => infoModal.classList.add('modal-hidden');

    window.addEventListener('mousemove', (event) => {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    });

    // --- 6. BOOT ENGINE ---
    function drawScreen(deltaTime) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, screenCanvas.width, screenCanvas.height);
        const centerX = screenCanvas.width / 2;
        const centerY = screenCanvas.height / 2;

        if (systemState === 'BOOTING') {
            bootElapsed += deltaTime; 
            let exitAlpha = (bootElapsed > 5.5) ? Math.max(1 - (bootElapsed - 5.5) / 1.5, 0) : 1;
            const mAlpha = Math.min(bootElapsed / 2, 1) * exitAlpha;
            ctx.fillStyle = `rgba(255, 255, 255, ${mAlpha})`;
            ctx.textAlign = 'center';
            ctx.font = 'bold 50px Tahoma';
            ctx.fillText('Machina™', centerX, centerY - 60);

            if (bootElapsed > 2) {
                const kAlpha = Math.min((bootElapsed - 2) / 2, 1) * exitAlpha;
                ctx.fillStyle = `rgba(255, 255, 255, ${kAlpha})`;
                ctx.font = 'bold 85px Tahoma';
                ctx.fillText('KnoxiaOS', centerX, centerY + 40);
            }

            if (bootElapsed > 3.5) {
                const barAlpha = Math.min((bootElapsed - 3.5) / 1.0, 1) * exitAlpha;
                const bx = centerX - 175;
                const by = centerY + 150;
                ctx.strokeStyle = `rgba(136, 136, 136, ${barAlpha})`;
                ctx.lineWidth = 2;
                ctx.strokeRect(bx, by, 350, 25);
                ctx.fillStyle = `rgba(60, 129, 243, ${barAlpha})`;
                let offset = (bootElapsed * 150) % 450; 
                ctx.save();
                ctx.beginPath(); ctx.rect(bx, by, 350, 25); ctx.clip();
                for(let i = 0; i < 3; i++) { ctx.fillRect((bx - 60) + offset + (i * 40), by + 4, 20, 17); }
                ctx.restore();
            }

            if (bootElapsed > 7.2) { 
                systemState = 'DESKTOP'; 
                bootElapsed = 0; 
                if (bootSound.buffer) bootSound.play();
                setTimeout(() => {
                    if (fanSound.isPlaying) {
                        let currentFanVol = fanSound.getVolume();
                        let fanFade = setInterval(() => {
                            currentFanVol -= 0.01;
                            if (currentFanVol > 0) fanSound.setVolume(currentFanVol);
                            else { fanSound.stop(); clearInterval(fanFade); }
                        }, 30);
                    }
                }, 2000); 
                setTimeout(() => {
                    ambientTrack.play();
                    let currentAmbVol = 0;
                    let ambFade = setInterval(() => {
                        currentAmbVol += 0.003; 
                        if (currentAmbVol < 0.4) ambientTrack.setVolume(currentAmbVol);
                        else clearInterval(ambFade);
                    }, 50);
                }, 4500); 
            }
        }

        if (systemState === 'DESKTOP') {
            bootElapsed += deltaTime;
            const desktopFade = Math.min(bootElapsed / 2, 1);
            ctx.globalAlpha = desktopFade;
            ctx.fillStyle = '#1a3a6d'; 
            ctx.fillRect(0, 0, screenCanvas.width, screenCanvas.height);
            ctx.globalAlpha = 0.2 * desktopFade;
            ctx.fillStyle = 'white';
            ctx.font = 'bold 60px Tahoma';
            ctx.textAlign = 'center';
            ctx.fillText('K N O X I A', centerX, centerY);
            ctx.globalAlpha = 1.0;
        }
    }

    // --- 7. MODEL LOADING ---
    const loader = new GLTFLoader();
    loader.load('./crt_monitor.glb', (gltf) => {
        monitorGroup = gltf.scene;
        scene.add(monitorGroup);
        monitorGroup.rotation.y = -Math.PI / 2; 
        monitorGroup.position.y = -3.5; 
        monitorGroup.scale.set(0, 0, 0);
        monitorGroup.traverse((node) => {
            if (node.isMesh && node.name === "RM_Monitor_Type_2_(CRT)_Screen_Surface001_0") {
                node.material = new THREE.MeshBasicMaterial({ map: screenTexture });
            }
        });
        gsap.to(monitorGroup.scale, { x: 1, y: 1, z: 1, duration: 2, ease: "power4.out" });
        gsap.to(introLight, { intensity: 80, duration: 2.5 });
        appState = 'INTRO';
        runIntroUIAnim();
    });

    // --- 8. INTERACTION ---
    window.addEventListener('mousedown', () => {
        if (appState !== 'READY_TO_POWER') return; 
        raycaster.setFromCamera(mouse, camera);
        if (monitorGroup) {
            const intersects = raycaster.intersectObjects(monitorGroup.children, true);
            if (intersects.length > 0 && intersects[0].object.name === "PowerButton" && systemState === 'POWERED_OFF') {
                systemState = 'WARMING_UP';
                if (fanSound.buffer) { fanSound.setVolume(0.1); fanSound.play(); }
                setTimeout(() => { systemState = 'BOOTING'; bootElapsed = 0; }, 1000);
            }
        }
    });

    // --- 9. ANIMATION LOOP ---
    function animate() {
        requestAnimationFrame(animate);
        const currentTime = performance.now();
        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;
        lightTime += deltaTime * 0.3; 
        introLight.position.x = Math.sin(lightTime) * 20;
        introLight.position.y = Math.cos(lightTime * 0.7) * 10;
        if (starField) {
            starField.rotation.y += deltaTime * 0.003;
            starField.rotation.z += deltaTime * 0.001;
        }
        for (let i = shootingStars.length - 1; i >= 0; i--) {
            const streak = shootingStars[i];
            streak.position.add(streak.userData.velocity.clone().multiplyScalar(deltaTime));
            streak.userData.life -= deltaTime * 0.5; 
            streak.material.opacity = streak.userData.life;
            if (streak.userData.life <= 0) {
                scene.remove(streak);
                shootingStars.splice(i, 1);
            }
        }
        if (appState === 'READY_TO_POWER' && monitorGroup) {
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(monitorGroup.children, true);
            document.body.style.cursor = (intersects.length > 0 && intersects[0].object.name === "PowerButton" && systemState === 'POWERED_OFF') ? 'pointer' : 'default';
        }
        drawScreen(deltaTime);
        screenTexture.needsUpdate = true;
        renderer.render(scene, camera);
    }

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    animate();
});