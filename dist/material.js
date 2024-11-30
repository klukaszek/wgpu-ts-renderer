// File: material.ts
// Author: Kyle Lukaszek
// Date: 11/29/2024
import { WGPU_RENDERER } from './main.js';
export class Material {
    constructor(color, ambient, diffuse, specular, shininess, shader) {
        this.color = color || { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
        this.ambient = ambient || 0.1;
        this.diffuse = diffuse || 0.8;
        this.specular = specular || 0.5;
        this.shininess = shininess || 32.0;
        this.shader = shader;
        this.materialBuffer = WGPU_RENDERER.device.createBuffer({
            size: 32, // vec4 color + 4 floats for properties
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }
    updateMaterialBuffer() {
        WGPU_RENDERER.device.queue.writeBuffer(this.materialBuffer, 0, new Float32Array([
            this.color.r, this.color.g, this.color.b, this.color.a,
            this.ambient, this.diffuse, this.specular, this.shininess
        ]));
    }
    getMaterialBuffer() {
        return this.materialBuffer;
    }
}
