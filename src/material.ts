// File: material.ts
// Author: Kyle Lukaszek
// Date: 11/29/2024

import { Color } from './renderer.js';
import { WGPU_RENDERER } from './main.js';

export class Material {
    public color: Color;
    public ambient: number;   // Ambient light coefficient
    public diffuse: number;   // Diffuse light coefficient
    public specular: number;  // Specular light coefficient
    public shininess: number; // Specular shininess factor
    private shader?: string;   // Custom shader code
    private materialBuffer!: GPUBuffer;

    constructor(color?: Color, ambient?: number, diffuse?: number, specular?: number, shininess?: number, shader?: string) {
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

    public updateMaterialBuffer(): void {
        WGPU_RENDERER.device.queue.writeBuffer(this.materialBuffer, 0, new Float32Array([
            this.color.r, this.color.g, this.color.b, this.color.a,
            this.ambient, this.diffuse, this.specular, this.shininess
        ]));
    }


    public getMaterialBuffer(): GPUBuffer {
        return this.materialBuffer;
    }
}
