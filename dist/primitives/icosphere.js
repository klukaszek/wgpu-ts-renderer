import { Mesh } from '../mesh.js';
import { vec3 } from 'gl-matrix';
import { WGPU_RENDERER } from '../main.js';
export class Icosphere extends Mesh {
    constructor(subdivisions = 2, transform, material) {
        super(transform, material);
        this.subdivisions = subdivisions;
        this.initBuffers();
        this.initPipeline();
    }
    initBuffers() {
        const t = (1.0 + Math.sqrt(5.0)) / 2.0;
        // Generate initial icosahedron vertices
        const baseVertices = [
            [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
            [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
            [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
        ];
        // Generate initial icosahedron faces
        const baseIndices = [
            0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
            1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
            3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
            4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1
        ];
        let vertices = [];
        let indices = [];
        // Convert base vertices to flat array with colors
        baseVertices.forEach(v => {
            const normalized = vec3.normalize(vec3.create(), vec3.fromValues(v[0], v[1], v[2]));
            vertices.push(normalized[0], normalized[1], normalized[2], // position
            normalized[0], normalized[1], normalized[2] // normal
            );
        });
        // Copy initial indices
        indices = [...baseIndices];
        console.log(this.subdivisions);
        // Perform subdivisions
        for (let i = 0; i < this.subdivisions; i++) {
            const newIndices = [];
            const vertexMap = new Map();
            for (let j = 0; j < indices.length; j += 3) {
                const v1 = indices[j] * 6;
                const v2 = indices[j + 1] * 6;
                const v3 = indices[j + 2] * 6;
                // Get midpoints
                const m1 = this.getMidpoint(vertices.slice(v1, v1 + 3), vertices.slice(v2, v2 + 3), vertices, vertexMap);
                const m2 = this.getMidpoint(vertices.slice(v2, v2 + 3), vertices.slice(v3, v3 + 3), vertices, vertexMap);
                const m3 = this.getMidpoint(vertices.slice(v3, v3 + 3), vertices.slice(v1, v1 + 3), vertices, vertexMap);
                // Add new triangles
                newIndices.push(indices[j], m1, m3, m1, indices[j + 1], m2, m3, m2, indices[j + 2], m1, m2, m3);
            }
            indices = newIndices;
        }
        this.vertices = new Float32Array(vertices);
        this.indices = new Uint16Array(indices);
        console.log(`Icosphere: ${this.vertices.length / 6} vertices, ${this.indices.length / 3} triangles`);
        this.vertexBuffer = WGPU_RENDERER.device.createBuffer({
            size: this.vertices.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        WGPU_RENDERER.device.queue.writeBuffer(this.vertexBuffer, 0, this.vertices);
        this.indexBuffer = WGPU_RENDERER.device.createBuffer({
            size: this.indices.length * 2,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        WGPU_RENDERER.device.queue.writeBuffer(this.indexBuffer, 0, this.indices);
    }
    getMidpoint(v1, v2, vertices, vertexMap) {
        const key = [v1, v2].sort().toString();
        if (vertexMap.has(key)) {
            return vertexMap.get(key);
        }
        const midpoint = vec3.create();
        vec3.add(midpoint, vec3.fromValues(v1[0], v1[1], v1[2]), vec3.fromValues(v2[0], v2[1], v2[2]));
        vec3.normalize(midpoint, midpoint);
        const index = vertices.length / 6;
        vertices.push(midpoint[0], midpoint[1], midpoint[2], // position
        midpoint[0], midpoint[1], midpoint[2] // normal
        );
        vertexMap.set(key, index);
        return index;
    }
}