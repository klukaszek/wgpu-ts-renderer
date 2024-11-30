// file: pointcloud.ts
// author: Kyle Lukaszek
// date: 11/29/2024

import { vec3, mat4, quat } from 'gl-matrix';
import { Transform } from './renderer.js';
import { WGPU_RENDERER } from './main.js';

export class PointCloud {
    private transform: Transform;
    private modelMatrix: mat4 = mat4.create();
    private vertexBuffer: GPUBuffer;
    private modelMatrixBuffer: GPUBuffer;
    private bindGroup: GPUBindGroup | null = null;
    private computePipeline: GPUComputePipeline | null = null;
    private renderPipeline: GPURenderPipeline | null = null;
    private numPoints: number;
    
    // Fibonacci sphere distribution algorithm
    private computeShader = `
        @group(0) @binding(0) var<storage, read_write> vertices: array<f32>;

        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
            let index = global_id.x;
            if (index >= arrayLength(&vertices) / 6) { return; }
            
            // Generate position (sphere distribution)
            let phi = acos(1.0 - 2.0 * f32(index) / f32(arrayLength(&vertices) / 6));
            let theta = 3.14159 * (1.0 + sqrt(5.0)) * f32(index);
            
            let pos_index = index * 6;
            vertices[pos_index] = 2.0 * sin(phi) * cos(theta);     // x
            vertices[pos_index + 1] = 2.0 * sin(phi) * sin(theta); // y
            vertices[pos_index + 2] = 2.0 * cos(phi);              // z
            
            // Generate color (HSL to RGB)
            let h = f32(index) / f32(arrayLength(&vertices) / 6);
            let s = 1.0;
            let l = 0.5;
            
            let c = (1.0 - abs(2.0 * l - 1.0)) * s;
            let x = c * (1.0 - abs((h * 6.0) % 2.0 - 1.0));
            let m = l - c/2.0;
            
            let color_index = pos_index + 3;
            if (h < 1.0/6.0) { 
                vertices[color_index] = c + m;
                vertices[color_index + 1] = x + m;
                vertices[color_index + 2] = m;
            } else if (h < 2.0/6.0) {
                vertices[color_index] = x + m;
                vertices[color_index + 1] = c + m;
                vertices[color_index + 2] = m;
            } else if (h < 3.0/6.0) {
                vertices[color_index] = m;
                vertices[color_index + 1] = c + m;
                vertices[color_index + 2] = x + m;
            } else if (h < 4.0/6.0) {
                vertices[color_index] = m;
                vertices[color_index + 1] = x + m;
                vertices[color_index + 2] = c + m;
            } else if (h < 5.0/6.0) {
                vertices[color_index] = x + m;
                vertices[color_index + 1] = m;
                vertices[color_index + 2] = c + m;
            } else {
                vertices[color_index] = c + m;
                vertices[color_index + 1] = m;
                vertices[color_index + 2] = x + m;
            }
        }
    `;

    private vertexShader = `
        struct Uniforms {
            viewMatrix: mat4x4<f32>,
            projectionMatrix: mat4x4<f32>,
        }

        struct ModelUniform {
            modelMatrix: mat4x4<f32>,
        }

        @binding(0) @group(0) var<uniform> uniforms: Uniforms;
        @binding(1) @group(0) var<uniform> model: ModelUniform;

        struct VertexOutput {
            @builtin(position) position: vec4f,
            @location(0) color: vec3f,
        }

        @vertex
        fn main(
            @location(0) position: vec3f,
            @location(1) color: vec3f,
        ) -> VertexOutput {
            var output: VertexOutput;
            let worldPos = (model.modelMatrix * vec4f(position, 1.0)).xyz;
            output.position = uniforms.projectionMatrix * uniforms.viewMatrix * vec4f(worldPos, 1.0);
            output.color = color;
            return output;
        }
    `;

    private fragmentShader = `
        @fragment
        fn main(@location(0) color: vec3f) -> @location(0) vec4f {
            return vec4f(color, 1.0);
        }
    `;

    constructor(numPoints: number, transform?: Transform) {
        this.numPoints = numPoints;
        this.transform = transform || {
            position: vec3.create(),
            rotation: quat.create(),
            scale: vec3.fromValues(1, 1, 1)
        };

        this.vertexBuffer = WGPU_RENDERER.device.createBuffer({
            size: numPoints * 6 * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
        });

        this.modelMatrixBuffer = WGPU_RENDERER.device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.initComputePipeline();
        this.initRenderPipeline();
        this.generatePointCloud();
        this.updateModelMatrix();
    }

    private initComputePipeline(): void {
        const bindGroupLayout = WGPU_RENDERER.device.createBindGroupLayout({
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: 'storage' }
            }]
        });

        this.computePipeline = WGPU_RENDERER.device.createComputePipeline({
            layout: WGPU_RENDERER.device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout]
            }),
            compute: {
                module: WGPU_RENDERER.device.createShaderModule({
                    code: this.computeShader
                }),
                entryPoint: 'main'
            }
        });
    }

    private initRenderPipeline(): void {
        const bindGroupLayout = WGPU_RENDERER.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: 'uniform' }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: 'uniform' }
                }
            ]
        });

        this.renderPipeline = WGPU_RENDERER.device.createRenderPipeline({
            layout: WGPU_RENDERER.device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout]
            }),
            vertex: {
                module: WGPU_RENDERER.device.createShaderModule({
                    code: this.vertexShader
                }),
                entryPoint: 'main',
                buffers: [{
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
                }]
            },
            fragment: {
                module: WGPU_RENDERER.device.createShaderModule({
                    code: this.fragmentShader
                }),
                entryPoint: 'main',
                targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }]
            },
            primitive: {
                topology: 'point-list'
            },
            multisample: {
                count: 4
            },
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: true,
                depthCompare: 'less'
            }
        });
    }

    private generatePointCloud(): void {
        const computeBindGroup = WGPU_RENDERER.device.createBindGroup({
            layout: this.computePipeline!.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: { buffer: this.vertexBuffer }
            }]
        });

        const commandEncoder = WGPU_RENDERER.device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        
        computePass.setPipeline(this.computePipeline!);
        computePass.setBindGroup(0, computeBindGroup);
        computePass.dispatchWorkgroups(Math.ceil(this.numPoints / 64));
        computePass.end();
        
        WGPU_RENDERER.device.queue.submit([commandEncoder.finish()]);
    }

    private updateModelMatrix(): void {
        mat4.fromRotationTranslationScale(
            this.modelMatrix,
            this.transform.rotation!,
            this.transform.position!,
            this.transform.scale!
        );
        WGPU_RENDERER.device.queue.writeBuffer(
            this.modelMatrixBuffer,
            0,
            this.modelMatrix as Float32Array
        );
    }

    public render(renderPass: GPURenderPassEncoder): void {
        if (!this.bindGroup) {
            this.bindGroup = WGPU_RENDERER.device.createBindGroup({
                layout: this.renderPipeline!.getBindGroupLayout(0),
                entries: [
                    {
                        binding: 0,
                        resource: { buffer: WGPU_RENDERER.camera.getUniformBuffer() }
                    },
                    {
                        binding: 1,
                        resource: { buffer: this.modelMatrixBuffer }
                    }
                ]
            });
        }

        renderPass.setPipeline(this.renderPipeline!);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, this.vertexBuffer);
        renderPass.draw(this.numPoints, 1, 0, 0);
    }
}
