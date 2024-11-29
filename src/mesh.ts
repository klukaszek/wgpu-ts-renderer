import { vec3, mat4, quat } from 'gl-matrix';
import { Renderer } from './renderer';

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

export interface Material {
    color: Color;

    // Later: textures, normals, etc.
}

// Abstract class for 3D objects
// Contains position, rotation, scale, modelViewMatrix, and necessary buffers.

export abstract class Mesh3D {
    protected device: GPUDevice;
    protected renderer: Renderer;

    public transform: Transform | undefined;
    public material: Material | undefined;
    protected modelViewMatrix: mat4 = mat4.create();

    protected vertexBuffer: GPUBuffer | null = null;
    protected indexBuffer: GPUBuffer | null = null;
    protected modelViewBuffer: GPUBuffer | null = null;
    protected colorBuffer: GPUBuffer | null = null;

    protected bindGroup: GPUBindGroup | null = null;
    protected vertices: Float32Array | null = null;
    protected indices: Uint16Array | null = null;

    protected pipeline!: GPURenderPipeline;

    protected defaultMeshVertexShader = `
            struct Uniforms {
                viewMatrix: mat4x4<f32>,
                projectionMatrix: mat4x4<f32>,
            }

            struct ModelUniform {
                modelMatrix: mat4x4<f32>
            }

            @binding(0) @group(0) var<uniform> uniforms: Uniforms;
            @binding(1) @group(0) var<uniform> model: ModelUniform;

            @vertex
            fn main(
                @location(0) position: vec3<f32>,
                @location(1) color: vec3<f32>
            ) -> @builtin(position) vec4<f32> {
                return uniforms.projectionMatrix * uniforms.viewMatrix * model.modelMatrix * vec4<f32>(position, 1.0);
            }
        `;

    protected defaultMeshFragmentShader = `
            struct ColorUniform {
                color: vec4<f32>
            }
            @binding(2) @group(0) var<uniform> colorUniform: ColorUniform;

            @fragment
            fn main() -> @location(0) vec4<f32> {
                return colorUniform.color;
            }
        `;

    // Constructor for a standard 3D primitive
    constructor(renderer: Renderer, transform?: Transform, material?: Material) {
        
        this.device = renderer.device;
        this.renderer = renderer;
        
        // Create the model view buffer
        this.modelViewBuffer = this.device.createBuffer({
            size: 64, // 4x4 matrix
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Set the transform if provided, otherwise default to origin
        if (transform !== undefined) {
            const { position, rotation, scale } = transform;
            this.transform = {
                position: position! || vec3.create(),
                rotation: rotation! || quat.create(),
                scale: scale! || vec3.fromValues(1, 1, 1)
            };

            console.log(this.transform);
        } else {
            this.transform = {
                position: vec3.create(),
                rotation: quat.create(),
                scale: vec3.fromValues(1, 1, 1)
            };
        }

        // Update the model matrix buffer for shader use
        this.updateModelMatrixBuffer();

        // Create the color buffer
        this.colorBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Set the material if provided, otherwise default to simple red color.
        if (material !== undefined) {
            this.material = material;
        } else {
            this.material = {
                color: { r: 1, g: 0, b: 0, a: 1 }
            };
        }

        this.updateColorBuffer();
    }

    protected abstract initBuffers(): void;
    protected abstract initPipeline(): void;
    abstract render(renderPass: GPURenderPassEncoder): void;
    
    // Set the position of the mesh
    public setPosition(x: number, y: number, z: number): void {
        const { position } = this.transform!;
        position![0] = x;
        position![1] = y;
        position![2] = z;
        this.updateModelMatrixBuffer();
    }

    // Set the rotation of the mesh
    public setRotation(x: number, y: number, z: number, w: number): void {
        const { rotation } = this.transform!;
        quat.set(rotation!, x, y, z, w);
        this.updateModelMatrixBuffer();
    }

    // Set the scale of the mesh
    public setScale(x: number, y: number, z: number): void {
        const { scale } = this.transform!;
        scale![0] = x;
        scale![1] = y;
        scale![2] = z;
        this.updateModelMatrixBuffer();
    }

    protected updateModelMatrixBuffer(): void {
        const modelMatrix = mat4.create();
        mat4.translate(modelMatrix, modelMatrix, this.transform!.position!);

        mat4.rotateZ(modelMatrix, modelMatrix, this.transform!.rotation![2]);
        mat4.rotateY(modelMatrix, modelMatrix, this.transform!.rotation![1]);
        mat4.rotateX(modelMatrix, modelMatrix, this.transform!.rotation![0]);

        mat4.scale(modelMatrix, modelMatrix, this.transform!.scale!);

        this.modelViewMatrix = modelMatrix;
        this.device.queue.writeBuffer(this.modelViewBuffer!, 0, this.modelViewMatrix as Float32Array);
    }
    
    // Update the mesh's color
    public setColor(color: Color): void {
        this.material!.color = color;
        this.updateColorBuffer();
    }

    protected updateColorBuffer(): void {
        const { material } = this;
        const { color } = material!;
        this.device.queue.writeBuffer(this.colorBuffer!, 0, new Float32Array([
            color.r,
            color.g,
            color.b,
            color.a
        ]));
    }

    public translate(x: number, y: number, z: number): void {
        const { position } = this.transform!;
        vec3.add(position!, position!, vec3.fromValues(x, y, z));
        this.updateModelMatrixBuffer();
    }

    public rotate(x: number, y: number, z: number): void {
        const { rotation } = this.transform!;

        quat.rotateX(rotation!, rotation!, x);
        quat.rotateY(rotation!, rotation!, y);
        quat.rotateZ(rotation!, rotation!, z);

        this.updateModelMatrixBuffer();
    }

    public scale(x: number, y: number, z: number): void {
        const { scale } = this.transform!;
        vec3.multiply(scale!, scale!, vec3.fromValues(x, y, z));
        this.updateModelMatrixBuffer();
    }
}
