// File: material.ts
// Author: Kyle Lukaszek
// Date: 11/29/2024
import { WGPU_RENDERER } from './main.js';
export class Material {
    constructor(color, ambient, diffuse, specular, shininess) {
        // Initialize material properties
        this.color = color || { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
        this.ambient = ambient || 0.1;
        this.diffuse = diffuse || 0.8;
        this.specular = specular || 0.0;
        this.shininess = shininess || 1.0;
        // Create reusable buffer data
        this.materialData = new Float32Array(8);
        // Check device limits
        const maxUniformBufferBindingSize = WGPU_RENDERER.device.limits.maxUniformBufferBindingSize;
        const bufferSize = Math.min(32, maxUniformBufferBindingSize);
        this.materialBuffer = WGPU_RENDERER.device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.updateMaterialBuffer();
    }
    static createStatic(name, color, ambient, diffuse, specular, shininess) {
        if (this.staticMaterials.has(name)) {
            return this.staticMaterials.get(name);
        }
        const material = new Material(color, ambient, diffuse, specular, shininess);
        this.staticMaterials.set(name, material);
        return material;
    }
    updateMaterialBuffer() {
        this.materialData.set([
            this.color.r, this.color.g, this.color.b, this.color.a,
            this.ambient, this.diffuse, this.specular, this.shininess
        ]);
        WGPU_RENDERER.device.queue.writeBuffer(this.materialBuffer, 0, this.materialData);
    }
    getMaterialBuffer() {
        return this.materialBuffer;
    }
}
Material.staticMaterials = new Map();
