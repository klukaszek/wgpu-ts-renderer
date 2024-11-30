// file: lights.ts
// author: Kyle Lukaszek
// date: 11/29/2024

import { vec3 } from 'gl-matrix';
import { Color } from './renderer.js';
import { WGPU_RENDERER } from './main.js';

export interface Light {
    position: vec3;
    color: Color;
    intensity: number;
}

export class SceneLights {
    private lights: Light[] = [];
    private lightsBuffer: GPUBuffer;
    private lightCountBuffer: GPUBuffer;
    private lightData: Float32Array;

    constructor() {
        // Each light takes 32 bytes (position: vec3 + padding + color: vec4 + intensity + padding)
        this.lightsBuffer = WGPU_RENDERER.device.createBuffer({
            size: 32 * 10, // Support up to 10 lights
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.lightCountBuffer = WGPU_RENDERER.device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.lightData = new Float32Array(8 * 10); // 8 floats per light, 10 lights max
    }

    public addLight(light: Light): void {
        this.lights.push(light);
        this.updateLightBuffers();
    }

    public updateLightBuffers(): void {
        let offset = 0;
        for (const light of this.lights) {
            // Position + padding
            this.lightData[offset++] = light.position[0];
            this.lightData[offset++] = light.position[1];
            this.lightData[offset++] = light.position[2];
            this.lightData[offset++] = 0; // padding
            
            // Color + padding
            this.lightData[offset++] = light.color.r;
            this.lightData[offset++] = light.color.g;
            this.lightData[offset++] = light.color.b;
            this.lightData[offset++] = light.color.a;
            
            // Intensity + padding
            this.lightData[offset++] = light.intensity;
            offset += 3; // padding
        }

        WGPU_RENDERER.device.queue.writeBuffer(this.lightsBuffer, 0, this.lightData);
        WGPU_RENDERER.device.queue.writeBuffer(
            this.lightCountBuffer, 
            0, 
            new Uint32Array([this.lights.length])
        );
    }

    public getLightsBuffer(): GPUBuffer {
        return this.lightsBuffer;
    }

    public getLightCountBuffer(): GPUBuffer {
        return this.lightCountBuffer;
    }
}
