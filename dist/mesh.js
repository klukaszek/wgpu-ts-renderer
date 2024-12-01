// file: mesh.ts
// author: Kyle Lukaszek
// date: 11/29/2024
import { vec3, mat4, quat } from 'gl-matrix';
import { Material } from './material.js';
import { WGPU_RENDERER } from './main.js';
// Abstract class for 3D objects
// Contains position, rotation, scale, modelViewMatrix, and necessary buffers.
export class Mesh {
    // Constructor for a standard 3D primitive
    constructor(transform, material) {
        this.modelViewMatrix = mat4.create();
        this.vertexBuffer = null;
        this.indexBuffer = null;
        this.modelViewBuffer = null;
        this.colorBuffer = null;
        this.normalMatrixBuffer = null;
        this.bindGroup = null;
        this.vertices = null;
        this.indices = null;
        this.defaultMeshVertexShader = `
        struct Uniforms {
            viewMatrix: mat4x4<f32>,
            projectionMatrix: mat4x4<f32>,
            viewPosition: vec4<f32>,
        }

        struct ModelUniform {
            modelMatrix: mat4x4<f32>,
            normalMatrix: mat4x4<f32>
        }

        struct Light {
            position: vec3<f32>,
            padding: f32,
            color: vec4<f32>,
            intensity: f32,
            _padding: vec3<f32>
        }

        struct VertexOutput {
            @builtin(position) position: vec4<f32>,
            @location(0) worldPos: vec3<f32>,
            @location(1) normal: vec3<f32>
        }

        @binding(0) @group(0) var<uniform> uniforms: Uniforms;
        @binding(1) @group(0) var<uniform> model: ModelUniform;
        @binding(3) @group(0) var<storage, read> lights: array<Light>;

        @vertex fn main(
            @location(0) position: vec3<f32>,
            @location(1) normal: vec3<f32>
        ) -> VertexOutput {
            var output: VertexOutput;
            let worldPos = (model.modelMatrix * vec4<f32>(position, 1.0)).xyz;
            output.normal = normalize((model.normalMatrix * vec4<f32>(normal, 0.0)).xyz);
            output.worldPos = worldPos;
            output.position = uniforms.projectionMatrix * uniforms.viewMatrix * vec4<f32>(worldPos, 1.0);
            return output;
        }`;
        this.defaultMeshFragmentShader = `
        struct MaterialUniform {
            color: vec4<f32>,
            ambient: f32,
            diffuse: f32,
            specular: f32,
            shininess: f32,
        }

        struct Light {
            position: vec3<f32>,
            padding: f32,
            color: vec4<f32>,
            intensity: f32,
            _padding: vec3<f32>
        }

        @binding(2) @group(0) var<uniform> material: MaterialUniform;
        @binding(3) @group(0) var<storage, read> lights: array<Light>;
        @binding(4) @group(0) var<uniform> numLights: u32;

        @fragment fn main(
            @location(0) worldPos: vec3<f32>,
            @location(1) normal: vec3<f32>
        ) -> @location(0) vec4<f32> {
            let N = normalize(normal);
            var finalColor = vec3<f32>(0.0);
            
            // Ambient calculation
            finalColor += material.color.rgb * material.ambient;
            
            for(var i = 0u; i < numLights; i++) {
                let L = normalize(lights[i].position - worldPos);
                let V = normalize(-worldPos);
                let H = normalize(L + V);
                
                // Diffuse
                let NdotL = max(dot(N, L), 0.0);
                let diffuse = NdotL * material.diffuse;
                
                // Specular (Blinn-Phong)
                let NdotH = max(dot(N, H), 0.0);
                let specular = pow(NdotH, material.shininess) * material.specular;
                
                // Apply gamma correction
                let lightContribution = material.color.rgb * lights[i].color.rgb * 
                    (diffuse + specular) * lights[i].intensity;
                finalColor += pow(lightContribution, vec3<f32>(2.2));
            }
            
            // Convert back to sRGB space
            finalColor = pow(finalColor, vec3<f32>(1.0/2.2));
            return vec4<f32>(finalColor, material.color.a);
        }`;
        // Create the model view + normal matrix buffer
        this.modelViewBuffer = WGPU_RENDERER.device.createBuffer({
            size: 128, // 2 x (4x4 matrix)
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        // Set the transform if provided, otherwise default to origin
        if (transform !== undefined) {
            const { position, rotation, scale } = transform;
            this.transform = {
                position: position || vec3.create(),
                rotation: rotation || quat.create(),
                scale: scale || vec3.fromValues(1, 1, 1)
            };
            console.log(this.transform);
        }
        else {
            this.transform = {
                position: vec3.create(),
                rotation: quat.create(),
                scale: vec3.fromValues(1, 1, 1)
            };
        }
        this.normalMatrixBuffer = WGPU_RENDERER.device.createBuffer({
            size: 64, // mat4
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        // Update the model matrix buffer for shader use
        this.updateModelMatrixBuffer();
        // Create the color buffer
        this.colorBuffer = WGPU_RENDERER.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        // Set the material if provided, otherwise default to simple red color.
        if (material !== undefined) {
            this.material = material;
        }
        else {
            this.material = new Material();
        }
        this.material.updateMaterialBuffer();
    }
    initPipeline() {
        const vertexBufferLayout = {
            arrayStride: 24,
            attributes: [
                { format: 'float32x3', offset: 0, shaderLocation: 0 }, // position
                { format: 'float32x3', offset: 12, shaderLocation: 1 } // normal
            ]
        };
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
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: 'uniform' }
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: 'read-only-storage' }
                },
                {
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: 'uniform' }
                }
            ]
        });
        const pipelineLayout = WGPU_RENDERER.device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout]
        });
        this.pipeline = WGPU_RENDERER.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: WGPU_RENDERER.device.createShaderModule({
                    code: this.defaultMeshVertexShader,
                }),
                entryPoint: 'main',
                buffers: [vertexBufferLayout]
            },
            fragment: {
                module: WGPU_RENDERER.device.createShaderModule({
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
            },
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: true,
                depthCompare: 'less'
            }
        });
    }
    render(renderPass) {
        this.material.updateMaterialBuffer();
        this.updateModelMatrixBuffer();
        if (!this.bindGroup) {
            this.bindGroup = WGPU_RENDERER.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(0),
                entries: [
                    {
                        binding: 0,
                        resource: { buffer: WGPU_RENDERER.camera.getUniformBuffer() }
                    },
                    {
                        binding: 1,
                        resource: { buffer: this.modelViewBuffer }
                    },
                    {
                        binding: 2,
                        resource: { buffer: this.material.getMaterialBuffer() }
                    },
                    {
                        binding: 3,
                        resource: { buffer: WGPU_RENDERER.sceneLights.getLightsBuffer() }
                    },
                    {
                        binding: 4,
                        resource: { buffer: WGPU_RENDERER.sceneLights.getLightCountBuffer() }
                    }
                ]
            });
        }
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, this.vertexBuffer);
        renderPass.setIndexBuffer(this.indexBuffer, 'uint16');
        renderPass.drawIndexed(this.indices.length);
    }
    // Set the position of the mesh
    setPosition(x, y, z) {
        const { position } = this.transform;
        position[0] = x;
        position[1] = y;
        position[2] = z;
        this.updateModelMatrixBuffer();
    }
    // Set the rotation of the mesh
    setRotation(x, y, z, w) {
        const { rotation } = this.transform;
        quat.set(rotation, x, y, z, w);
        this.updateModelMatrixBuffer();
    }
    // Set the scale of the mesh
    setScale(x, y, z) {
        const { scale } = this.transform;
        scale[0] = x;
        scale[1] = y;
        scale[2] = z;
        this.updateModelMatrixBuffer();
    }
    updateModelMatrixBuffer() {
        const modelMatrix = mat4.create();
        mat4.fromRotationTranslationScale(modelMatrix, this.transform.rotation, this.transform.position, this.transform.scale);
        // Correct normal matrix calculation
        const normalMatrix = mat4.create();
        mat4.invert(normalMatrix, modelMatrix);
        mat4.transpose(normalMatrix, normalMatrix);
        // Scale compensation for non-uniform scaling
        const scale = this.transform.scale;
        const scaleCompensation = 1.0 / Math.sqrt(scale[0] * scale[0] + scale[1] * scale[1] + scale[2] * scale[2]);
        mat4.scale(normalMatrix, normalMatrix, [scaleCompensation, scaleCompensation, scaleCompensation]);
        WGPU_RENDERER.device.queue.writeBuffer(this.modelViewBuffer, 0, modelMatrix);
        WGPU_RENDERER.device.queue.writeBuffer(this.modelViewBuffer, 64, normalMatrix);
    }
    setMaterial(material) {
        this.material = material;
        this.material.updateMaterialBuffer();
    }
    translate(x, y, z) {
        const { position } = this.transform;
        vec3.add(position, position, vec3.fromValues(x, y, z));
        this.updateModelMatrixBuffer();
    }
    rotate(x, y, z) {
        const { rotation } = this.transform;
        quat.rotateX(rotation, rotation, x);
        quat.rotateY(rotation, rotation, y);
        quat.rotateZ(rotation, rotation, z);
        this.updateModelMatrixBuffer();
    }
    scale(x, y, z) {
        const { scale } = this.transform;
        vec3.multiply(scale, scale, vec3.fromValues(x, y, z));
        this.updateModelMatrixBuffer();
    }
    getVertexBuffer() {
        return this.vertexBuffer;
    }
    updateVertexBuffer(vertices) {
        this.vertices = vertices;
        WGPU_RENDERER.device.queue.writeBuffer(this.getVertexBuffer(), 0, vertices);
    }
}
