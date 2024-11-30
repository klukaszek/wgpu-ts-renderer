// noise.ts
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
            const z = newVertices[baseIdx + 2];
            // Apply noise to y-coordinate
            const noise = noiseGen.perlin(x * scale, 0, z * scale);
            newVertices[baseIdx + 1] = noise * amplitude;
            // Update normal
            const normal = Noise.calculateNormal(x, newVertices[baseIdx + 1], z, scale, noiseGen);
            newVertices[baseIdx + 3] = normal[0];
            newVertices[baseIdx + 4] = normal[1];
            newVertices[baseIdx + 5] = normal[2];
        }
        // Update GPU buffer
        Noise.updateMeshBuffer(mesh, newVertices);
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
            const z = newVertices[baseIdx + 2];
            const noise = noiseGen.fbm(x * scale, 0, z * scale, octaves);
            newVertices[baseIdx + 1] = noise * amplitude;
            const normal = Noise.calculateNormal(x, newVertices[baseIdx + 1], z, scale, noiseGen);
            newVertices[baseIdx + 3] = normal[0];
            newVertices[baseIdx + 4] = normal[1];
            newVertices[baseIdx + 5] = normal[2];
        }
        Noise.updateMeshBuffer(mesh, newVertices);
    }
    // Apply ridged noise for mountainous terrain
    static ridged(mesh, scale = 1.0, amplitude = 1.0, octaves = 6) {
        if (!mesh.vertices)
            return;
        const noiseGen = new NoiseGenerator();
        const vertexCount = mesh.vertices.length / 6;
        const newVertices = new Float32Array(mesh.vertices);
        for (let i = 0; i < vertexCount; i++) {
            const baseIdx = i * 6;
            const x = newVertices[baseIdx];
            const z = newVertices[baseIdx + 2];
            const noise = noiseGen.ridgedNoise(x * scale, 0, z * scale, octaves);
            newVertices[baseIdx + 1] = noise * amplitude;
            const normal = Noise.calculateNormal(x, newVertices[baseIdx + 1], z, scale, noiseGen);
            newVertices[baseIdx + 3] = normal[0];
            newVertices[baseIdx + 4] = normal[1];
            newVertices[baseIdx + 5] = normal[2];
        }
        Noise.updateMeshBuffer(mesh, newVertices);
    }
    static calculateNormal(x, y, z, scale, noiseGen) {
        const epsilon = 0.01;
        const normal = vec3.create();
        // Calculate height differences for tangent vectors
        const hL = noiseGen.perlin((x - epsilon) * scale, 0, z * scale);
        const hR = noiseGen.perlin((x + epsilon) * scale, 0, z * scale);
        const hD = noiseGen.perlin(x * scale, 0, (z - epsilon) * scale);
        const hU = noiseGen.perlin(x * scale, 0, (z + epsilon) * scale);
        // Create tangent vectors
        const tangentX = vec3.fromValues(2 * epsilon, hR - hL, 0);
        const tangentZ = vec3.fromValues(0, hU - hD, 2 * epsilon);
        // Cross product for normal
        vec3.cross(normal, tangentX, tangentZ);
        vec3.normalize(normal, normal);
        return normal;
    }
    static updateMeshBuffer(mesh, vertices) {
        mesh.vertices = vertices;
        WGPU_RENDERER.device.queue.writeBuffer(mesh.getVertexBuffer(), 0, vertices);
    }
}
