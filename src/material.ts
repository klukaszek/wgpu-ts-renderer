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
    private materialData: Float32Array;
    private materialBuffer: GPUBuffer;
    private static readonly staticMaterials = new Map<string, Material>();

    constructor(color?: Color, ambient?: number, diffuse?: number, specular?: number, shininess?: number) {
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

    public static createStatic(name: string, color: Color, ambient: number, diffuse: number, specular: number, shininess: number): Material {
        if (this.staticMaterials.has(name)) {
            return this.staticMaterials.get(name)!;
        }

        const material = new Material(color, ambient, diffuse, specular, shininess);
        this.staticMaterials.set(name, material);
        return material;
    }

    public updateMaterialBuffer(): void {
        this.materialData.set([
            this.color.r, this.color.g, this.color.b, this.color.a,
            this.ambient, this.diffuse, this.specular, this.shininess
        ]);

        WGPU_RENDERER.device.queue.writeBuffer(
            this.materialBuffer,
            0,
            this.materialData
        );
    }

    public getMaterialBuffer(): GPUBuffer {
        return this.materialBuffer;
    }
}
