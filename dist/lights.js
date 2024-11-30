// file: lights.ts
// author: Kyle Lukaszek
// date: 11/29/2024
import { WGPU_RENDERER } from './main.js';
export class SceneLights {
    constructor() {
        this.lights = [];
        this.MAX_LIGHTS = 10; // Maximum number of lights we'll support
        // Size of a single light in the buffer (in bytes)
        this.LIGHT_STRIDE = 32; // vec3 position (16) + vec4 color (16) + float intensity (4) + padding (4)
        // Create a storage buffer large enough for MAX_LIGHTS
        this.lightsBuffer = WGPU_RENDERER.device.createBuffer({
            size: this.MAX_LIGHTS * this.LIGHT_STRIDE,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.lightCountBuffer = WGPU_RENDERER.device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }
    addLight(light) {
        if (this.lights.length >= this.MAX_LIGHTS) {
            console.warn('Maximum number of lights reached');
            return;
        }
        this.lights.push(light);
        this.updateLightsBuffer();
    }
    removeLight(index) {
        if (index >= 0 && index < this.lights.length) {
            this.lights.splice(index, 1);
            this.updateLightsBuffer();
        }
    }
    updateLight(index, light) {
        if (index >= 0 && index < this.lights.length) {
            this.lights[index] = light;
            this.updateLightsBuffer();
        }
    }
    updateLightsBuffer() {
        // Create an array to hold all light data
        const bufferData = new Float32Array(this.MAX_LIGHTS * (this.LIGHT_STRIDE / 4));
        // Fill the buffer with light data
        this.lights.forEach((light, index) => {
            const offset = index * (this.LIGHT_STRIDE / 4);
            // Position (vec3 + padding)
            bufferData[offset] = light.position[0];
            bufferData[offset + 1] = light.position[1];
            bufferData[offset + 2] = light.position[2];
            bufferData[offset + 3] = 0; // padding
            // Color (vec4)
            bufferData[offset + 4] = light.color.r;
            bufferData[offset + 5] = light.color.g;
            bufferData[offset + 6] = light.color.b;
            bufferData[offset + 7] = light.color.a;
            // Intensity + padding
            bufferData[offset + 8] = light.intensity;
            bufferData[offset + 9] = 0; // padding
            bufferData[offset + 10] = 0; // padding
            bufferData[offset + 11] = 0; // padding
        });
        WGPU_RENDERER.device.queue.writeBuffer(this.lightsBuffer, 0, bufferData);
        WGPU_RENDERER.device.queue.writeBuffer(this.lightCountBuffer, 0, new Uint32Array([this.lights.length]));
    }
    getLightsBuffer() {
        return this.lightsBuffer;
    }
    getLightCount() {
        return this.lights.length;
    }
    getLightCountBuffer() {
        return this.lightCountBuffer;
    }
}
