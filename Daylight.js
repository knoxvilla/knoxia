import * as THREE from 'three';

export function createDaylight() {
    const geometry = new THREE.SphereGeometry(1000, 64, 64);
    geometry.scale(-1, 1, 1);

    const material = new THREE.ShaderMaterial({
        uniforms: {
            uOpacity: { value: 0.0 }
        },
        transparent: true,
        vertexShader: `
            varying vec3 vPosition;
            void main() {
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec3 vPosition;
            uniform float uOpacity;
            void main() {
                float y = vPosition.y / 1000.0;
                
                // Sky Logic
                vec3 skyTop = vec3(0.1, 0.4, 0.9);
                vec3 skyBottom = vec3(0.7, 0.85, 1.0);
                vec3 skyColor = mix(skyBottom, skyTop, smoothstep(-0.2, 0.6, y));

                // Hill Logic (Sine-wave terrain)
                float hillPattern = sin(vPosition.x * 0.006) * 60.0 + cos(vPosition.z * 0.004) * 40.0 - 100.0;
                float hillMask = step(vPosition.y, hillPattern);
                
                vec3 grassColor = vec3(0.2, 0.7, 0.2);
                vec3 shadowGrass = vec3(0.05, 0.3, 0.05);
                vec3 finalGrass = mix(shadowGrass, grassColor, smoothstep(hillPattern - 150.0, hillPattern, vPosition.y));
                
                vec3 finalScene = mix(skyColor, finalGrass, hillMask);
                gl_FragColor = vec4(finalScene, uOpacity);
            }
        `
    });

    return new THREE.Mesh(geometry, material);
}