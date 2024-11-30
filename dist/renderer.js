// File: renderer.ts
// Author: Kyle Lukaszek
// Date: 11/29/2024
//
// Description: This file contains the Renderer class which is responsible for rendering object3D objects to the screen.
import { vec3 } from 'gl-matrix';
import { Camera } from './camera.js';
import { InputManager } from './input.js';
import { Cube } from './primitives/cube.js';
import { Icosphere } from './primitives/icosphere.js';
import { SceneLights } from './lights.js';
export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.msaa = {
            texture: {},
            view: {},
            sampleCount: 4
        };
        this.depthTexture = {
            texture: {},
            view: {},
            format: 'depth24plus'
        };
        this.lastFrameTime = 0;
    }
    // Initialize the renderer with a controllable first person camera.
    async init() {
        if (!navigator.gpu) {
            throw new Error("WebGPU not supported");
        }
        // Request an adapter
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error("No appropriate GPUAdapter found");
        }
        // Create a GPUDevice
        this.device = await adapter.requestDevice();
        this.context = this.canvas.getContext('webgpu');
        // Resize the canvas to fill the window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        // Get the preferred format of the canvas
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied',
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
        this.camera = new Camera(this.device, vec3.fromValues(0, 0, 5), 60 * Math.PI / 180, // fov in radians
        this.canvas.width / this.canvas.height, // aspect ratio
        0.1, // near
        100.0 // far
        );
        // Create controls manager
        this.controls = new InputManager(this.camera, this.canvas);
        // Initialize scene objects
        this.cube = new Cube({ position: vec3.fromValues(0, 0, 0) });
        this.icosphere = new Icosphere(4, { position: vec3.fromValues(0, 2, 0) });
        this.sceneLights = new SceneLights();
        // Add some lights to the scene
        this.sceneLights.addLight({
            position: vec3.fromValues(0, 5, 0),
            color: { r: 1, g: 1, b: 1, a: 1 },
            intensity: 1.0
        });
    }
    // Perform a render pass and submit it to the GPU
    // This function is called every frame
    // The timestamp is the current time in milliseconds
    render(timestamp) {
        const deltaTime = (timestamp - this.lastFrameTime) / 1000;
        this.lastFrameTime = timestamp;
        // Before we render a new frame, poll for user input and update state accordingly
        this.controls.update();
        // Create a command encoder to encode the commands for the GPU
        const commandEncoder = this.device.createCommandEncoder();
        // Begin a render pass to clear initially clear the frame
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                    view: this.msaa.view,
                    resolveTarget: this.context.getCurrentTexture().createView(),
                    clearValue: { r: 0.1, g: 0.2, b: 0.3, a: 1.0 },
                    loadOp: 'clear',
                    storeOp: 'store'
                }],
            depthStencilAttachment: {
                view: this.depthTexture.view,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
                depthLoadValue: 0.0,
                depthClearValue: 1.0,
            }
        });
        // Here we render the primitives.
        // Ideally we would have a scene graph with multiple objects to render
        // but for simplicity we just render the cube here.
        //
        // We can record renderpasses and reuse them in the future if we want
        // reduce the cpu overhead of performing the same commands every frame.
        // This can be explored in the future.  
        this.icosphere.render(renderPass);
        this.cube.render(renderPass);
        this.cube.rotate(0, deltaTime, 0);
        // End the render pass
        renderPass.end();
        // Submit the commands to the GPU
        this.device.queue.submit([commandEncoder.finish()]);
    }
}
