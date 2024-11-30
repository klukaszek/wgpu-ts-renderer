// noise.ts

import { vec3 } from 'gl-matrix';
import { Mesh } from './mesh.js';

export class NoiseGenerator {
    private static readonly PERM: number[] = new Array(512);

    constructor() {
        // Initialize permutation table
        for (let i = 0; i < 256; i++) {
            NoiseGenerator.PERM[i] = NoiseGenerator.PERM[i + 256] = Math.floor(Math.random() * 256);
        }
    }

    // Perlin noise implementation
    public perlin(x: number, y: number, z: number): number {
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

        return this.lerp(w,
            this.lerp(v,
                this.lerp(u,
                    this.grad(NoiseGenerator.PERM[AA], x, y, z),
                    this.grad(NoiseGenerator.PERM[BA], x - 1, y, z)
                ),
                this.lerp(u,
                    this.grad(NoiseGenerator.PERM[AB], x, y - 1, z),
                    this.grad(NoiseGenerator.PERM[BB], x - 1, y - 1, z)
                )
            ),
            this.lerp(v,
                this.lerp(u,
                    this.grad(NoiseGenerator.PERM[AA + 1], x, y, z - 1),
                    this.grad(NoiseGenerator.PERM[BA + 1], x - 1, y, z - 1)
                ),
                this.lerp(u,
                    this.grad(NoiseGenerator.PERM[AB + 1], x, y - 1, z - 1),
                    this.grad(NoiseGenerator.PERM[BB + 1], x - 1, y - 1, z - 1)
                )
            )
        );
    }

    // Fractal Brownian Motion (fBm) noise
    public fbm(x: number, y: number, z: number, octaves: number = 6): number {
        let result = 0;
        let amplitude = 1.0;
        let frequency = 1.0;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            result += amplitude * this.perlin(
                x * frequency,
                y * frequency,
                z * frequency
            );
            maxValue += amplitude;
            amplitude *= 0.5;
            frequency *= 2.0;
        }

        return result / maxValue;
    }

    // Ridged noise for mountainous terrain
    public ridgedNoise(x: number, y: number, z: number, octaves: number = 6): number {
        let result = 0;
        let amplitude = 1.0;
        let frequency = 1.0;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            const noise = this.perlin(
                x * frequency,
                y * frequency,
                z * frequency
            );
            result += amplitude * (1.0 - Math.abs(noise));
            maxValue += amplitude;
            amplitude *= 0.5;
            frequency *= 2.0;
        }

        return result / maxValue;
    }

    private fade(t: number): number {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    private lerp(t: number, a: number, b: number): number {
        return a + t * (b - a);
    }

    private grad(hash: number, x: number, y: number, z: number): number {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
}

export class Noise {

    private static readonly MORPH_SPEED = 0.005;
    private static meshStates = new Map<Mesh, {
        initialVertices: Float32Array;
        targetVertices: Float32Array;
        morphProgress: number;
    }>();

    // Apply perlin noise to mesh vertices
    public static perlin(mesh: Mesh, scale: number = 1.0, amplitude: number = 1.0): void {
        if (!mesh.vertices) return;

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
            const normal = Noise.calculateNormal(x, y, z, scale, noiseGen,
                (x, y, z) => noiseGen.perlin(x, y, z));
            newVertices[baseIdx + 3] = normal[0];
            newVertices[baseIdx + 4] = normal[1];
            newVertices[baseIdx + 5] = normal[2];
        }

        // Update GPU buffer
        mesh.updateVertexBuffer(newVertices);
    }

    // Apply FBM (Fractal Brownian Motion) noise
    public static fbm(mesh: Mesh, scale: number = 1.0, amplitude: number = 1.0, octaves: number = 6): void {
        if (!mesh.vertices) return;

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

            const normal = Noise.calculateNormal(x, y, z, scale, noiseGen,
                (x, y, z) => noiseGen.fbm(x, y, z, octaves));

            newVertices[baseIdx + 3] = normal[0];
            newVertices[baseIdx + 4] = normal[1];
            newVertices[baseIdx + 5] = normal[2];
        }

        mesh.updateVertexBuffer(newVertices);
    }

    private static calculateNormal(x: number, y: number, z: number, scale: number,
        noiseGen: NoiseGenerator, noiseFunction: (x: number, y: number, z: number) => number): vec3 {
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

    public static animate(
        mesh: Mesh,
        noiseType: 'perlin' | 'fbm' ,
        scale: number = 1.0,
        amplitude: number = 1.0,
        octaves: number = 6
    ): void {
        // Initialize state if not exists
        if (!this.meshStates.has(mesh)) {
            this.meshStates.set(mesh, {
                initialVertices: new Float32Array(mesh.vertices!),
                targetVertices: this.generateTargetState(mesh, noiseType, scale, amplitude, octaves),
                morphProgress: 0
            });
        }

        const state = this.meshStates.get(mesh)!;
        state.morphProgress += this.MORPH_SPEED;

        // Generate new target if morphing is complete
        if (state.morphProgress >= 1.0) {
            state.initialVertices = state.targetVertices;
            state.targetVertices = this.generateTargetState(mesh, noiseType, scale, amplitude, octaves);
            state.morphProgress = 0;
        }

        // Interpolate between initial and target states
        const vertexCount = mesh.vertices!.length / 6;
        const newVertices = new Float32Array(mesh.vertices!);

        for (let i = 0; i < vertexCount; i++) {
            const baseIdx = i * 6;

            // Interpolate position
            newVertices[baseIdx + 1] = this.lerp(
                state.initialVertices[baseIdx + 1],
                state.targetVertices[baseIdx + 1],
                state.morphProgress
            );

            // Interpolate normals
            for (let j = 3; j < 6; j++) {
                newVertices[baseIdx + j] = this.lerp(
                    state.initialVertices[baseIdx + j],
                    state.targetVertices[baseIdx + j],
                    state.morphProgress
                );
            }
        }

        mesh.updateVertexBuffer(newVertices);
    }

    private static generateTargetState(
        mesh: Mesh,
        noiseType: 'perlin' | 'fbm',
        scale: number,
        amplitude: number,
        octaves: number = 6
    ): Float32Array {
        const targetMesh = new Float32Array(mesh.vertices!);
        const noiseGen = new NoiseGenerator();
        const vertexCount = mesh.vertices!.length / 6;

        for (let i = 0; i < vertexCount; i++) {
            const baseIdx = i * 6;
            const x = targetMesh[baseIdx];
            const y = targetMesh[baseIdx + 1];
            const z = targetMesh[baseIdx + 2];

            const noise = noiseType === 'perlin'
                ? noiseGen.perlin(x * scale, 0, z * scale)
                : noiseGen.fbm(x * scale, 0, z * scale, octaves)

            targetMesh[baseIdx + 1] = noise * amplitude;

            const normal = this.calculateNormal(
                x, y, z, scale, noiseGen,
                b => noiseType === 'perlin'
                    ? noiseGen.perlin(b, 0, z * scale)
                    : noiseGen.fbm(b, 0, z * scale, octaves)
            );

            targetMesh[baseIdx + 3] = normal[0];
            targetMesh[baseIdx + 4] = normal[1];
            targetMesh[baseIdx + 5] = normal[2];
        }

        return targetMesh;
    }

    // Simple quadratic easing
    private static easeInOut(t: number): number {
        // Quadratic ease-in for first half
        if (t < 0.5) {
            return 2 * t * t;
        }
        // Quadratic ease-out for second half
        return -1 + (4 - 2 * t) * t;
    }

    private static lerp(start: number, end: number, t: number): number {
        const easedT = this.easeInOut(t);
        return start + easedT * (end - start);
    }
}
