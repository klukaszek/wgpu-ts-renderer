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

        this.vertices = new Float32Array([
            // Front face
            -1, -1, 1, 0, 0, 1,  // vertex xyz, normal xyz
            1, -1, 1, 0, 0, 1,
            1, 1, 1, 0, 0, 1,
            -1, 1, 1, 0, 0, 1,

            // Back face
            -1, -1, -1, 0, 0, -1,
            -1, 1, -1, 0, 0, -1,
            1, 1, -1, 0, 0, -1,
            1, -1, -1, 0, 0, -1,

            // Top face
            -1, 1, -1, 0, 1, 0,
            -1, 1, 1, 0, 1, 0,
            1, 1, 1, 0, 1, 0,
            1, 1, -1, 0, 1, 0,

            // Bottom face
            -1, -1, -1, 0, -1, 0,
            1, -1, -1, 0, -1, 0,
            1, -1, 1, 0, -1, 0,
            -1, -1, 1, 0, -1, 0,

            // Right face
            1, -1, -1, 1, 0, 0,
            1, 1, -1, 1, 0, 0,
            1, 1, 1, 1, 0, 0,
            1, -1, 1, 1, 0, 0,

            // Left face
            -1, -1, -1, -1, 0, 0,
            -1, -1, 1, -1, 0, 0,
            -1, 1, 1, -1, 0, 0,
            -1, 1, -1, -1, 0, 0,
        ]);

        this.indices = new Uint16Array([
            0, 1, 2, 0, 2, 3,  // Front
            4, 5, 6, 4, 6, 7,  // Back
            0, 3, 5, 0, 5, 4,  // Left
            1, 7, 6, 1, 6, 2,  // Right
            3, 2, 6, 3, 6, 5,  // Top
            0, 4, 7, 0, 7, 1,  // Bottom
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
