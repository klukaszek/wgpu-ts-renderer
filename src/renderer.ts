// File: renderer.ts
// Author: Kyle Lukaszek
// Date: 11/29/2024
//
// Description: This file contains the Renderer class which is responsible for rendering object3D objects to the screen.

import { vec3, quat } from 'gl-matrix';
import { Camera } from './camera.js';
import { InputManager } from './input.js';
// Essentially unused but my renderer will yell at me if I don't import it
import { SceneLights } from './lights.js';
import { CIELUVPointCloud } from './pointclouds/cieluv.js';
import { PointCloud } from './pointclouds/pointcloud.js';
import { WGPU_RENDERER } from './main.js';

export interface Transform {
    position?: vec3;
    rotation?: quat;
    scale?: vec3;
}

export interface Color {
    r: number;
    g: number;
    b: number;
    a: number;
}

interface Resolve {
    texture: GPUTexture;
    view: GPUTextureView;
}

interface MSAA {
    texture: GPUTexture;
    view: GPUTextureView;
    sampleCount: number;
}

interface DepthTexture {
    texture: GPUTexture;
    view: GPUTextureView;
    format: GPUTextureFormat;
}

export interface PPMTexture {
    width: number;
    height: number;
    maxval: number;
    data: Float32Array;
}

export class Renderer {
    public device!: GPUDevice;
    public context!: GPUCanvasContext;
    private adapter!: GPUAdapter | null;
    public limits!: GPUSupportedLimits;
    public format!: GPUTextureFormat;

    public camera!: Camera;
    public controls!: InputManager;

    public resolve: Resolve = {
        texture: {} as GPUTexture,
        view: {} as GPUTextureView
    };

    public msaa: MSAA = {
        texture: {} as GPUTexture,
        view: {} as GPUTextureView,
        sampleCount: 4
    };

    public depthTexture: DepthTexture = {
        texture: {} as GPUTexture,
        view: {} as GPUTextureView,
        format: 'depth24plus'
    };

    private lastFrameTime: number = 0;
    private frameCount: number = 0;

    // Scene objects
    public sceneLights: SceneLights | undefined;
    private pointCloud!: PointCloud;
    private ppmTexture!: PPMTexture;
    public animateRotation: boolean = true;

    constructor(private canvas: HTMLCanvasElement) { }

    // Initialize the renderer with a controllable first person camera.
    async init() {
        if (!navigator.gpu) {
            throw new Error("WebGPU not supported");
        }

        // Request an adapter
        this.adapter = await navigator.gpu.requestAdapter();
        if (!this.adapter) {
            throw new Error("No appropriate GPUAdapter found");
        }

        this.limits = this.adapter.limits;

        const maxBufferBindingSize = this.adapter.limits.maxStorageBufferBindingSize;

        // Create a GPUDevice
        // I specified some limits here to ensure that the device can handle large buffers
        this.device = await this.adapter.requestDevice({
            requiredLimits: {
                maxStorageBufferBindingSize: maxBufferBindingSize,
                maxBufferSize: maxBufferBindingSize,
                maxComputeWorkgroupStorageSize: 32768,
                
            },
        });

        this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;

        // Resize the canvas to fill the window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // Get the preferred format of the canvas
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied',
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });

        // Create MSAA texture
        this.msaa.texture = this.device.createTexture({
            size: {
                width: this.canvas.width,
                height: this.canvas.height,
            },
            sampleCount: 4,
            format: navigator.gpu.getPreferredCanvasFormat(),
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.msaa.view = this.msaa.texture.createView();
        this.context.getCurrentTexture().createView();

        this.depthTexture.texture = this.device.createTexture({
            size: {
                width: this.canvas.width,
                height: this.canvas.height,
            },
            sampleCount: 4,
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTexture.view = this.depthTexture.texture.createView();

        // Create camera & controls
        this.camera = new Camera(
            this.device,
            vec3.fromValues(0, 0, 3),
            60 * Math.PI / 180,    // fov in radians
            this.canvas.width / this.canvas.height, // aspect ratio
            0.05,                   // near
            100.0                  // far
        );

        // Create controls manager
        this.controls = new InputManager(this.camera, this.canvas);
        this.pointCloud = new CIELUVPointCloud(256);
        await this.pointCloud.generateCloud();
    }

    // Perform a render pass and submit it to the GPU
    // This function is called every frame
    // The timestamp is the current time in milliseconds
    async render(timestamp: number) {

        const deltaTime = (timestamp - this.lastFrameTime) / 1000;
        this.lastFrameTime = timestamp;

        // Before we render a new frame, poll for user input and update state accordingly
        this.controls.update();

        // Create a command encoder to encode the commands for the GPU
        const commandEncoder = this.device.createCommandEncoder();

        this.resolve.texture = this.context.getCurrentTexture();
        this.resolve.view = this.resolve.texture.createView();

        // Begin a render pass to clear initially clear the frame
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.msaa.view,
                resolveTarget: this.resolve.view,
                clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store'
            }],
            depthStencilAttachment: {
                view: this.depthTexture.view,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
                depthLoadValue: 0.0,
                depthClearValue: 1.0,
            } as GPURenderPassDepthStencilAttachment
        });

        await this.pointCloud.render(renderPass);

        if (this.animateRotation) {
            this.pointCloud.rotate(0, deltaTime * 0.2, 0);
        }

        // End the render pass
        renderPass.end();

        // Submit the commands to the GPU
        this.device.queue.submit([commandEncoder.finish()]);

        this.frameCount++;

        if (this.frameCount === Number.MAX_SAFE_INTEGER - 1) {
            this.frameCount = 0;
        }
    }

    public set ppmTextureData(ppmTexture: PPMTexture | undefined) {

        if (ppmTexture === undefined) {
            return;
        }

        this.ppmTexture = ppmTexture;
        console.log(this.ppmTexture);
    }

    public setPointCloud(ppc: PointCloud) {
        this.pointCloud = ppc;
        this.pointCloud.generateCloud();
    }

    public releasePointcloud() {
        this.pointCloud.destroy();
    }

    public get framecount(): number {
        return this.frameCount;
    }

    public createGPUBuffer(data: Float32Array | null, size: number | 1024, usage: GPUBufferUsageFlags, label?: string) {
        if (size % 4 !== 0) {
            size += 4 - (size % 4);
        }

        // pad the buffer
        if (data && data.byteLength !== size) {
            const paddedData = new Float32Array(size);
            paddedData.set(data);
            data = paddedData;
        }

        const buffer = this.device.createBuffer({
            size: data ? data.byteLength : size,
            usage: usage,
            label: label
        });

        if (data) {
            WGPU_RENDERER.device.queue.writeBuffer(buffer, 0, data);
        }

        return buffer;
    }
    
    public async markGPUBufferForDeletion(buffer: GPUBuffer) {
        setTimeout(() => {
            buffer.destroy();
            console.log("Buffer destroyed");
        }, 10000);
    }
}
