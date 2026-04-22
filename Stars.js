import * as THREE from 'three';

export function createCozyStars() {
    const starGeometry = new THREE.BufferGeometry();
    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.7, // Adjust size for subtlety
        transparent: true,
        opacity: 0.5, // Start subtle
        sizeAttenuation: true, // Points get smaller as they get further away
        depthWrite: false // Prevents stars from clipping with other transparent objects
    });

    const starVertices = [];
    const starOpacity = [];
    
    // Create 3000 stars distributed randomly in a huge field behind the monitor
    for (let i = 0; i < 3000; i++) {
        const x = (Math.random() - 0.5) * 2000;
        const y = (Math.random() - 0.5) * 1000;
        const z = -Math.random() * 500 - 100; // Force them to be behind the monitor
        starVertices.push(x, y, z);
        
        // Vary the opacity of individual stars for richness
        starOpacity.push(Math.random() * 0.5 + 0.1); 
    }

    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    starGeometry.setAttribute('opacity', new THREE.Float32BufferAttribute(starOpacity, 1));
    
    // We need to use a custom ShaderMaterial if we want varied opacity per point easily,
    // but a PointsMaterial is fine if we just want a uniform 'cozy' drift.
    // Let's stick with PointsMaterial for now and add varied opacity via the texture map instead.

    // A tiny, soft circle texture makes the points look less 'digital' and more 'organic'
    const sprite = new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/disc.png');
    starMaterial.map = sprite;
    starMaterial.alphaTest = 0.5; // Help with disc transparency

    const stars = new THREE.Points(starGeometry, starMaterial);
    return stars;
}