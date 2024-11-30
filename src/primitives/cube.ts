// File: cube.ts
// Author: Kyle Lukaszek
// Date: 11/29/2024
import { WGPU_RENDERER } from '../main.js';
import { Material } from '../material.js';
import { Mesh } from '../mesh.js';
import { Transform } from '../renderer.js';

export class Cube extends Mesh {

    constructor(transform?: Transform, material?: Material) {
        super(transform, material);
        this.initBuffers();
        this.initPipeline();
    }

    protected initBuffers(): void {
        // Define unique vertices with averaged normals for shared edges
        const s = 1.0 / Math.sqrt(3.0);  // normalized corner normal
        this.vertices = new Float32Array([
            // Front-top-right corner
            1, 1, 1, s, s, s,
            // Front-top-left corner
            -1, 1, 1, -s, s, s,
            // Front-bottom-right corner
            1, -1, 1, s, -s, s,
            // Front-bottom-left corner
            -1, -1, 1, -s, -s, s,
            // Back-top-right corner
            1, 1, -1, s, s, -s,
            // Back-top-left corner
            -1, 1, -1, -s, s, -s,
            // Back-bottom-right corner
            1, -1, -1, s, -s, -s,
            // Back-bottom-left corner
            -1, -1, -1, -s, -s, -s,
        ]);

        this.indices = new Uint16Array([
            0, 1, 2, 1, 3, 2,  // Front
            4, 5, 6, 5, 7, 6,  // Back
            5, 1, 7, 1, 3, 7,  // Left
            0, 4, 2, 4, 6, 2,  // Right
            0, 1, 4, 1, 5, 4,  // Top
            2, 3, 6, 3, 7, 6,  // Bottom
        ]);

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
}
