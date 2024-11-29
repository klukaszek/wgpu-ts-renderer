// cube.ts
import { Object3D } from './object.js';
export class Cube extends Object3D {
    initBuffers() {
        this.vertices = new Float32Array([
            // Front face
            -1, -1, 1, 1, 0, 0,
            1, -1, 1, 0, 1, 0,
            1, 1, 1, 0, 0, 1,
            -1, 1, 1, 1, 1, 0,
            // Back face
            -1, -1, -1, 1, 0, 0,
            -1, 1, -1, 0, 1, 0,
            1, 1, -1, 0, 0, 1,
            1, -1, -1, 1, 1, 0,
        ]);
        this.indices = new Uint16Array([
            0, 1, 2, 0, 2, 3, // Front
            4, 5, 6, 4, 6, 7, // Back
            0, 3, 5, 0, 5, 4, // Left
            1, 7, 6, 1, 6, 2, // Right
            3, 2, 6, 3, 6, 5, // Top
            0, 4, 7, 0, 7, 1, // Bottom
        ]);
        this.vertexBuffer = this.device.createBuffer({
            size: this.vertices.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.vertexBuffer, 0, this.vertices);
        this.indexBuffer = this.device.createBuffer({
            size: this.indices.length * 2,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.indexBuffer, 0, this.indices);
    }
    initPipeline() {
        const vertexShader = `
            struct Uniforms {
                viewMatrix: mat4x4<f32>,
                projectionMatrix: mat4x4<f32>,
            }
            @binding(0) @group(0) var<uniform> uniforms: Uniforms;

            @vertex
            fn main(
                @location(0) position: vec3<f32>,
                @location(1) color: vec3<f32>
            ) -> @builtin(position) vec4<f32> {
                return uniforms.projectionMatrix * uniforms.viewMatrix * vec4<f32>(position, 1.0);
            }
        `;
        const fragmentShader = `
            @fragment
            fn main() -> @location(0) vec4<f32> {
                return vec4<f32>(1.0, 0.0, 0.0, 1.0);
            }
        `;
        const vertexBufferLayout = {
            arrayStride: 24,
            attributes: [
                {
                    format: 'float32x3',
                    offset: 0,
                    shaderLocation: 0
                },
                {
                    format: 'float32x3',
                    offset: 12,
                    shaderLocation: 1
                }
            ]
        };
        const bindGroupLayout = this.device.createBindGroupLayout({
            entries: [{
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: 'uniform' }
                }]
        });
        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout]
        });
        this.pipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: this.device.createShaderModule({
                    code: vertexShader
                }),
                entryPoint: 'main',
                buffers: [vertexBufferLayout]
            },
            fragment: {
                module: this.device.createShaderModule({
                    code: fragmentShader
                }),
                entryPoint: 'main',
                targets: [{
                        format: navigator.gpu.getPreferredCanvasFormat()
                    }]
            },
            primitive: {
                topology: 'triangle-list'
            },
            multisample: {
                count: 4
            }
        });
    }
    render(renderPass, cameraUniformBuffer) {
        if (!this.bindGroup) {
            this.bindGroup = this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(0),
                entries: [{
                        binding: 0,
                        resource: { buffer: cameraUniformBuffer }
                    }]
            });
        }
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, this.vertexBuffer);
        renderPass.setIndexBuffer(this.indexBuffer, 'uint16');
        renderPass.drawIndexed(36);
    }
}
