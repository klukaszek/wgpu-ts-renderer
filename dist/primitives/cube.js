// cube.ts
import { Mesh3D } from '../mesh.js';
export class Cube extends Mesh3D {
    constructor(renderer, transform, material) {
        super(renderer, transform, material);
        this.initBuffers();
        this.initPipeline();
    }
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
                    buffer: { type: 'uniform' },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: 'uniform' },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: 'uniform' },
                }]
        });
        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout]
        });
        this.pipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: this.device.createShaderModule({
                    code: this.defaultMeshVertexShader,
                }),
                entryPoint: 'main',
                buffers: [vertexBufferLayout]
            },
            fragment: {
                module: this.device.createShaderModule({
                    code: this.defaultMeshFragmentShader,
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
    render(renderPass) {
        if (!this.bindGroup) {
            this.bindGroup = this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(0),
                entries: [
                    {
                        binding: 0,
                        resource: { buffer: this.renderer.camera.getUniformBuffer() }
                    },
                    {
                        binding: 1,
                        resource: { buffer: this.modelViewBuffer }
                    },
                    {
                        binding: 2,
                        resource: { buffer: this.colorBuffer }
                    }
                ],
            });
        }
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, this.vertexBuffer);
        renderPass.setIndexBuffer(this.indexBuffer, 'uint16');
        renderPass.drawIndexed(36);
    }
}
