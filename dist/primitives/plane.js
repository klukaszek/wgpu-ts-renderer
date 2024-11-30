// file: plane.ts
// author: Kyle Lukaszek
// date: 11/29/2024
import { Mesh } from '../mesh.js';
import { WGPU_RENDERER } from '../main.js';
export class Plane extends Mesh {
    constructor(subdivisions = 1, transform, material) {
        super(transform, material);
        this.subdivisions = subdivisions;
        this.initBuffers();
        this.initPipeline();
    }
    initBuffers() {
        const vertices = [];
        const indices = [];
        // Calculate number of vertices per side
        const verticesPerSide = this.subdivisions + 1;
        // Generate vertices
        for (let z = 0; z < verticesPerSide; z++) {
            for (let x = 0; x < verticesPerSide; x++) {
                // Calculate normalized position (-1 to 1)
                const xPos = (x / this.subdivisions) * 2 - 1;
                const zPos = (z / this.subdivisions) * 2 - 1;
                // Add vertex position
                vertices.push(xPos, 0, zPos, // position
                0, 1, 0 // normal (pointing up)
                );
            }
        }
        // Generate indices for triangles
        for (let z = 0; z < this.subdivisions; z++) {
            for (let x = 0; x < this.subdivisions; x++) {
                const topLeft = z * verticesPerSide + x;
                const topRight = topLeft + 1;
                const bottomLeft = (z + 1) * verticesPerSide + x;
                const bottomRight = bottomLeft + 1;
                // First triangle
                indices.push(topLeft, bottomLeft, topRight);
                // Second triangle
                indices.push(topRight, bottomLeft, bottomRight);
            }
        }
        this.vertices = new Float32Array(vertices);
        this.indices = new Uint16Array(indices);
        console.log(`Plane: ${this.vertices.length / 6} vertices, ${this.indices.length / 3} triangles`);
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
