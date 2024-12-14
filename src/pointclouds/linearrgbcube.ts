import { WGPU_RENDERER } from "../main.js";
import { PPMTexture, Transform } from "../renderer.js";
import { PointCloud } from "./pointcloud.js";

export class LinearRGBCube extends PointCloud {

    private ComputeRGBCube = `
    @group(0) @binding(0) var<storage, read_write> vertices: array<f32>;    

    @compute @workgroup_size(256)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let index = global_id.x + (global_id.y * 65535u * 256u);
        if (index >= arrayLength(&vertices)) {
            return;
        }

        // Generate RGB cube with normalize values between 0 and 1
        let color = vec3<f32>(
            f32(index % 256u) / 255.0,
            f32((index / 256u) % 256u) / 255.0,
            f32((index / 65536u) % 256u) / 255.0
        );

        let pos_index = index * 6;
        
        // 1x1x1 cube centered at origin
        vertices[pos_index] = f32(index % 256u) / 255.0;
        vertices[pos_index + 1] = f32((index / 256u) % 256u) / 255.0;
        vertices[pos_index + 2] = f32((index / 65536u) % 256u) / 255.0;

        vertices[pos_index + 3] = color.r;
        vertices[pos_index + 4] = color.g;
        vertices[pos_index + 5] = color.b;
    }`;

    private RGBCubeFromPPM = `
    @group(0) @binding(0) var<storage, read_write> rgb: array<u32>;
    @group(0) @binding(1) var<storage, read_write> vertices: array<f32>;

    @compute @workgroup_size(256)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let index = global_id.x + (global_id.y * 65535u * 256u);
        if (index >= arrayLength(&vertices)) {
            return;
        }

        // Extract RGB values from input buffer
        let input = rgb[index];
        let r = f32(input & 0xFFu) / 255.0;
        let g = f32((input >> 8u) & 0xFFu) / 255.0;
        let b = f32((input >> 16u) & 0xFFu) / 255.0;
        let a = f32((input >> 24u) & 0xFFu) / 255.0;

        let pos_index = index * 6;

        // 1x1x1 cube centered at origin
        vertices[pos_index] = r;
        vertices[pos_index + 1] = g;
        vertices[pos_index + 2] = b;

        vertices[pos_index + 3] = r;
        vertices[pos_index + 4] = g;
        vertices[pos_index + 5] = b;
    }
`
    
    private rgbComputePipeline: GPUComputePipeline | null = null;
    private rgbBGL: GPUBindGroupLayout;
    private rgbBindGroup: GPUBindGroup | null = null;
    private rgbBuffer: GPUBuffer | null = null;
    private ppmTexture: PPMTexture | null = null;

    constructor(bitDepth: number) {

        let { ppmTexture, buffer } = WGPU_RENDERER.getPPMTextureData();
        
        let numPoints = (2 ** bitDepth) ** 3;
        if (ppmTexture !== undefined) {
            numPoints = ppmTexture.width * ppmTexture.height;
        }

        super(numPoints);
        this.numPoints = numPoints;

        if (ppmTexture !== undefined) {
            this.ppmTexture = ppmTexture;
            this.rgbBuffer = buffer!;

            this.rgbBGL = WGPU_RENDERER.device.createBindGroupLayout({
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'storage' }
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'storage' }
                    }
                ]
            });

            this.rgbBindGroup = WGPU_RENDERER.device.createBindGroup({
                layout: this.rgbBGL,
                entries: [
                    {
                        binding: 0,
                        resource: { buffer: this.rgbBuffer }
                    },
                    {
                        binding: 1,
                        resource: { buffer: this.vertexBuffer }
                    }
                ] as GPUBindGroupEntry[]
            });
            
            this.rgbComputePipeline = this.createComputePipeline(this.RGBCubeFromPPM, [this.rgbBGL], "RGB Kernel");

        } else {

            this.rgbBGL = WGPU_RENDERER.device.createBindGroupLayout({
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'storage' }
                    }
                ]
            });

            this.rgbBindGroup = WGPU_RENDERER.device.createBindGroup({
                layout: this.rgbBGL,
                entries: [
                    {
                        binding: 0,
                        resource: { buffer: this.vertexBuffer }
                    }
                ] as GPUBindGroupEntry[]
            });

            this.rgbComputePipeline = this.createComputePipeline(this.ComputeRGBCube, [this.rgbBGL], "RGB Kernel");
        }
    }

    public async generateCloud(): Promise<void> {
        this.computeBindGroup = this.rgbBindGroup;
        this.compute(this.rgbComputePipeline!, this.numPoints);
    }

}
