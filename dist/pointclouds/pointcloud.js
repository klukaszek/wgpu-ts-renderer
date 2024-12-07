// file: pointcloud.ts
// author: Kyle Lukaszek
// date: 11/29/2024
import { vec3, mat4, quat } from 'gl-matrix';
import { WGPU_RENDERER } from '../main.js';
export class PointCloud {
    constructor(numPoints, transform) {
        this.modelMatrix = mat4.create();
        this.renderBindGroup = null;
        this.renderPipeline = null;
        this.computeBindGroup = null;
        this.transformPipeline = null;
        // Basic initialization kernel
        this.initKernel = `
        @group(0) @binding(0) var<storage, read_write> vertices: array<f32>;

        @compute @workgroup_size(256)
        fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
            let index = global_id.x + (global_id.y * 65535u * 256u);
            if (index >= arrayLength(&vertices)) {
                return;
            }
            vertices[index] = 0.0;
        }
    `;
        this.transformKernel = `
        @group(0) @binding(0) var<storage, read_write> vertices: array<f32>;
        @group(0) @binding(1) var<uniform> transform: Transform;

        struct Transform {
            translation: vec3<f32>,
            _pad1: f32,          // Padding for 16-byte alignment
            rotation: vec3<f32>,
            _pad2: f32,          // Padding for 16-byte alignment
            scale: vec3<f32>,
            _pad3: f32,          // Padding for 16-byte alignment
        }

        fn rotatePoint(p: vec3<f32>, r: vec3<f32>) -> vec3<f32> {
            
            // Apply rotation matrices in XYZ order
            var result = p;

            if (r.x != 0.0) {
                let cx = cos(r.x);
                let sx = sin(r.x);

                // Rotate X
                result = vec3<f32>(
                    result.x,
                    result.y * cx - result.z * sx,
                    result.y * sx + result.z * cx
                );
            }
            

            if (r.y != 0.0) {
                let cy = cos(r.y);
                let sy = sin(r.y);

                // Rotate Y
                result = vec3<f32>(
                    result.x * cy + result.z * sy,
                    result.y,
                    -result.x * sy + result.z * cy
                );
            }
    

            if (r.z != 0.0) {
                let cz = cos(r.z);
                let sz = sin(r.z);
            
                // Rotate Z
                result = vec3<f32>(
                    result.x * cz - result.y * sz,
                    result.x * sz + result.y * cz,
                    result.z
                );
            }

            return result;
        }

        @compute @workgroup_size(256)
        fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
            let index = global_id.x + (global_id.y * 65535u * 256u);
            if (index >= arrayLength(&vertices) / 6) {
                return;
            }

            let pos_index = index * 6;
            let position = vec3<f32>(
                vertices[pos_index],
                vertices[pos_index + 1],
                vertices[pos_index + 2]
            );

            // Apply transformations
            var transformed = position;
            transformed = rotatePoint(transformed, transform.rotation);
            transformed = transformed * transform.scale;
            transformed = transformed + transform.translation;

            // Write back transformed position
            vertices[pos_index] = transformed.x;
            vertices[pos_index + 1] = transformed.y;
            vertices[pos_index + 2] = transformed.z;
        }
    `;
        this.vertexShader = `
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
        this.fragmentShader = `
        @fragment
        fn main(@location(0) color: vec3f) -> @location(0) vec4f {
            return vec4f(color, 1.0);
        }
    `;
        this.numPoints = numPoints;
        this.transform = transform || {
            position: vec3.create(),
            rotation: quat.create(),
            scale: vec3.fromValues(1, 1, 1)
        };
        this.vertexBuffer = WGPU_RENDERER.device.createBuffer({
            size: numPoints * 6 * Float32Array.BYTES_PER_ELEMENT, // 3 floats for position, 3 for color
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
            label: 'Point Cloud Vertex Buffer'
        });
        this.transformUniformBuffer = WGPU_RENDERER.device.createBuffer({
            size: 48, // 3 vec3s + padding
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            label: 'Transform Uniform Buffer'
        });
        this.modelMatrixBuffer = WGPU_RENDERER.device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            label: 'Model Matrix Buffer'
        });
        this.transformPipeline = this.createComputePipeline(this.transformKernel);
        this.computeBindGroup = WGPU_RENDERER.device.createBindGroup({
            layout: this.transformPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.vertexBuffer } },
                { binding: 1, resource: { buffer: this.transformUniformBuffer } }
            ]
        });
        this.initializeBuffer();
        this.initRenderPipeline();
        this.updateModelMatrix();
    }
    initRenderPipeline() {
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
            ],
            label: 'PointCloud Bind Group Layout'
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
                topology: 'point-list',
                cullMode: 'back'
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
    createComputePipeline(shader) {
        const bindGroupLayout = WGPU_RENDERER.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage' }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' }
                }
            ],
            label: 'Compute Bind Group Layout'
        });
        return WGPU_RENDERER.device.createComputePipeline({
            layout: WGPU_RENDERER.device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout]
            }),
            compute: {
                module: WGPU_RENDERER.device.createShaderModule({
                    code: shader
                }),
                entryPoint: 'main'
            }
        });
    }
    // Initialize our storage buffer with zeros using the init kernel
    initializeBuffer() {
        const pipeline = this.createComputePipeline(this.initKernel);
        this.compute(pipeline, this.vertexBuffer.size / 4); // Size in floats
    }
    // Perform a compute pass with the given pipeline and number of work items
    compute(pipeline, workItems) {
        const bindGroup = this.computeBindGroup;
        const WORKGROUP_SIZE = 256;
        const totalWorkgroups = Math.ceil(workItems / WORKGROUP_SIZE);
        const xGroups = Math.min(totalWorkgroups, 65535);
        const yGroups = Math.ceil(totalWorkgroups / 65535);
        const commandEncoder = WGPU_RENDERER.device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(pipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(xGroups, yGroups, 1);
        computePass.end();
        WGPU_RENDERER.device.queue.submit([commandEncoder.finish()]);
    }
    // Apply a transformation to the point cloud using a compute shader
    applyTransform(translation, rotation, scale) {
        // Update transform uniform buffer
        const transformData = new Float32Array([
            ...translation, 0.0, // Add padding
            ...rotation, 0.0, // Add padding
            ...scale, 0.0 // Add padding
        ]);
        WGPU_RENDERER.device.queue.writeBuffer(this.transformUniformBuffer, 0, transformData);
        // Create pipeline and bind group for transform
        this.compute(this.transformPipeline, this.numPoints);
    }
    // Update the model matrix buffer with the current transform
    updateModelMatrix() {
        mat4.fromRotationTranslationScale(this.modelMatrix, this.transform.rotation, this.transform.position, this.transform.scale);
        WGPU_RENDERER.device.queue.writeBuffer(this.modelMatrixBuffer, 0, this.modelMatrix);
    }
    render(renderPass) {
        if (!this.renderBindGroup) {
            console.log('Creating bind group');
            this.renderBindGroup = WGPU_RENDERER.device.createBindGroup({
                layout: this.renderPipeline.getBindGroupLayout(0),
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
        renderPass.setPipeline(this.renderPipeline);
        renderPass.setBindGroup(0, this.renderBindGroup);
        renderPass.setVertexBuffer(0, this.vertexBuffer);
        renderPass.draw(this.numPoints, 1, 0, 0);
    }
    translate(x, y, z) {
        this.applyTransform(vec3.fromValues(x, y, z), vec3.create(), vec3.fromValues(1, 1, 1));
    }
    rotate(x, y, z) {
        this.applyTransform(vec3.create(), vec3.fromValues(x, y, z), vec3.fromValues(1, 1, 1));
    }
    scale(x, y, z) {
        this.applyTransform(vec3.create(), vec3.create(), vec3.fromValues(x, y, z));
    }
    setTransform(transform) {
        this.transform = transform;
        this.updateModelMatrix();
    }
    getTransform() {
        return this.transform;
    }
    getNumPoints() {
        return this.numPoints;
    }
}
