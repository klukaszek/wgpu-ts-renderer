// noise.ts
import { vec3 } from 'gl-matrix';
export class NoiseGenerator {
    constructor() {
        // Initialize permutation table
        for (let i = 0; i < 256; i++) {
            NoiseGenerator.PERM[i] = NoiseGenerator.PERM[i + 256] = Math.floor(Math.random() * 256);
        }
    }
    // Perlin noise implementation
    perlin(x, y, z) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);
        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);
        const A = NoiseGenerator.PERM[X] + Y;
        const AA = NoiseGenerator.PERM[A] + Z;
        const AB = NoiseGenerator.PERM[A + 1] + Z;
        const B = NoiseGenerator.PERM[X + 1] + Y;
        const BA = NoiseGenerator.PERM[B] + Z;
        const BB = NoiseGenerator.PERM[B + 1] + Z;
        return this.lerp(w, this.lerp(v, this.lerp(u, this.grad(NoiseGenerator.PERM[AA], x, y, z), this.grad(NoiseGenerator.PERM[BA], x - 1, y, z)), this.lerp(u, this.grad(NoiseGenerator.PERM[AB], x, y - 1, z), this.grad(NoiseGenerator.PERM[BB], x - 1, y - 1, z))), this.lerp(v, this.lerp(u, this.grad(NoiseGenerator.PERM[AA + 1], x, y, z - 1), this.grad(NoiseGenerator.PERM[BA + 1], x - 1, y, z - 1)), this.lerp(u, this.grad(NoiseGenerator.PERM[AB + 1], x, y - 1, z - 1), this.grad(NoiseGenerator.PERM[BB + 1], x - 1, y - 1, z - 1))));
    }
    // Fractal Brownian Motion (fBm) noise
    fbm(x, y, z, octaves = 6) {
        let result = 0;
        let amplitude = 1.0;
        let frequency = 1.0;
        let maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            result += amplitude * this.perlin(x * frequency, y * frequency, z * frequency);
            maxValue += amplitude;
            amplitude *= 0.5;
            frequency *= 2.0;
        }
        return result / maxValue;
    }
    // Ridged noise for mountainous terrain
    ridgedNoise(x, y, z, octaves = 6) {
        let result = 0;
        let amplitude = 1.0;
        let frequency = 1.0;
        let maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            const noise = this.perlin(x * frequency, y * frequency, z * frequency);
            result += amplitude * (1.0 - Math.abs(noise));
            maxValue += amplitude;
            amplitude *= 0.5;
            frequency *= 2.0;
        }
        return result / maxValue;
    }
    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }
    lerp(t, a, b) {
        return a + t * (b - a);
    }
    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
}
NoiseGenerator.PERM = new Array(512);
export class Noise {
    // Apply perlin noise to mesh vertices
    static perlin(mesh, scale = 1.0, amplitude = 1.0) {
        if (!mesh.vertices)
            return;
        const noiseGen = new NoiseGenerator();
        const vertexCount = mesh.vertices.length / 6; // 6 floats per vertex (pos + normal)
        const newVertices = new Float32Array(mesh.vertices);
        // Modify each vertex
        for (let i = 0; i < vertexCount; i++) {
            const baseIdx = i * 6;
            const x = newVertices[baseIdx];
            const y = newVertices[baseIdx + 1];
            const z = newVertices[baseIdx + 2];
            // Apply noise to y-coordinate
            const noise = noiseGen.perlin(x * scale, 0, z * scale);
            newVertices[baseIdx + 1] = noise * amplitude;
            // Update normal
            const normal = Noise.calculateNormal(x, y, z, scale, noiseGen, (x, y, z) => noiseGen.perlin(x, y, z));
            newVertices[baseIdx + 3] = normal[0];
            newVertices[baseIdx + 4] = normal[1];
            newVertices[baseIdx + 5] = normal[2];
        }
        // Update GPU buffer
        mesh.updateVertexBuffer(newVertices);
    }
    // Apply FBM (Fractal Brownian Motion) noise
    static fbm(mesh, scale = 1.0, amplitude = 1.0, octaves = 6) {
        if (!mesh.vertices)
            return;
        const noiseGen = new NoiseGenerator();
        const vertexCount = mesh.vertices.length / 6;
        const newVertices = new Float32Array(mesh.vertices);
        for (let i = 0; i < vertexCount; i++) {
            const baseIdx = i * 6;
            const x = newVertices[baseIdx];
            const y = newVertices[baseIdx + 1];
            const z = newVertices[baseIdx + 2];
            const noise = noiseGen.fbm(x * scale, 0, z * scale, octaves);
            newVertices[baseIdx + 1] = noise * amplitude;
            const normal = Noise.calculateNormal(x, y, z, scale, noiseGen, (x, y, z) => noiseGen.fbm(x, y, z, octaves));
            newVertices[baseIdx + 3] = normal[0];
            newVertices[baseIdx + 4] = normal[1];
            newVertices[baseIdx + 5] = normal[2];
        }
        mesh.updateVertexBuffer(newVertices);
    }
    static calculateNormal(x, y, z, scale, noiseGen, noiseFunction) {
        const epsilon = 0.001;
        const normal = vec3.create();
        // Get heights
        const hL = noiseFunction((x - epsilon) * scale, 0, z * scale) * scale;
        const hR = noiseFunction((x + epsilon) * scale, 0, z * scale) * scale;
        const hD = noiseFunction(x * scale, 0, (z - epsilon) * scale) * scale;
        const hU = noiseFunction(x * scale, 0, (z + epsilon) * scale) * scale;
        // Create proper tangent vectors including x,z components
        const tangentX = vec3.fromValues(epsilon * 2, (hR - hL), 0);
        const tangentZ = vec3.fromValues(0, (hU - hD), epsilon * 2);
        // Cross product for normal
        vec3.cross(normal, tangentZ, tangentX); // Note: order switched to get upward-facing normal
        vec3.normalize(normal, normal);
        return normal;
    }
    static animate(mesh, noiseType, scale = 1.0, amplitude = 1.0, octaves = 6) {
        // Initialize state if not exists
        if (!this.meshStates.has(mesh)) {
            this.meshStates.set(mesh, {
                initialVertices: new Float32Array(mesh.vertices),
                targetVertices: this.generateTargetState(mesh, noiseType, scale, amplitude, octaves),
                morphProgress: 0
            });
        }
        const state = this.meshStates.get(mesh);
        state.morphProgress += this.MORPH_SPEED;
        // Generate new target if morphing is complete
        if (state.morphProgress >= 1.0) {
            state.initialVertices = state.targetVertices;
            state.targetVertices = this.generateTargetState(mesh, noiseType, scale, amplitude, octaves);
            state.morphProgress = 0;
        }
        // Interpolate between initial and target states
        const vertexCount = mesh.vertices.length / 6;
        const newVertices = new Float32Array(mesh.vertices);
        for (let i = 0; i < vertexCount; i++) {
            const baseIdx = i * 6;
            // Interpolate position
            newVertices[baseIdx + 1] = this.lerp(state.initialVertices[baseIdx + 1], state.targetVertices[baseIdx + 1], state.morphProgress);
            // Interpolate normals
            for (let j = 3; j < 6; j++) {
                newVertices[baseIdx + j] = this.lerp(state.initialVertices[baseIdx + j], state.targetVertices[baseIdx + j], state.morphProgress);
            }
        }
        mesh.updateVertexBuffer(newVertices);
    }
    static generateTargetState(mesh, noiseType, scale, amplitude, octaves = 6) {
        const targetMesh = new Float32Array(mesh.vertices);
        const noiseGen = new NoiseGenerator();
        const vertexCount = mesh.vertices.length / 6;
        for (let i = 0; i < vertexCount; i++) {
            const baseIdx = i * 6;
            const x = targetMesh[baseIdx];
            const y = targetMesh[baseIdx + 1];
            const z = targetMesh[baseIdx + 2];
            const noise = noiseType === 'perlin'
                ? noiseGen.perlin(x * scale, 0, z * scale)
                : noiseGen.fbm(x * scale, 0, z * scale, octaves);
            targetMesh[baseIdx + 1] = noise * amplitude;
            const normal = this.calculateNormal(x, y, z, scale, noiseGen, b => noiseType === 'perlin'
                ? noiseGen.perlin(b, 0, z * scale)
                : noiseGen.fbm(b, 0, z * scale, octaves));
            targetMesh[baseIdx + 3] = normal[0];
            targetMesh[baseIdx + 4] = normal[1];
            targetMesh[baseIdx + 5] = normal[2];
        }
        return targetMesh;
    }
    // Simple quadratic easing
    static easeInOut(t) {
        // Quadratic ease-in for first half
        if (t < 0.5) {
            return 2 * t * t;
        }
        // Quadratic ease-out for second half
        return -1 + (4 - 2 * t) * t;
    }
    static lerp(start, end, t) {
        const easedT = this.easeInOut(t);
        return start + easedT * (end - start);
    }
}
Noise.MORPH_SPEED = 0.005;
Noise.meshStates = new Map();
