// file: lights.ts
// author: Kyle Lukaszek
// date: 11/29/2024
import { WGPU_RENDERER } from './main.js';
export class SceneLights {
    constructor() {
        this.lights = [];
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
    addLight(light) {
        this.lights.push(light);
        this.updateLightBuffers();
    }
    updateLightBuffers() {
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
        WGPU_RENDERER.device.queue.writeBuffer(this.lightCountBuffer, 0, new Uint32Array([this.lights.length]));
    }
    getLightsBuffer() {
        return this.lightsBuffer;
    }
    getLightCountBuffer() {
        return this.lightCountBuffer;
    }
}
