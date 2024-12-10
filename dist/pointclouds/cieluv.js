import { PointCloud } from "./pointcloud.js";
import { WGPU_RENDERER } from "../main.js";
export class CIELUVPointCloud extends PointCloud {
    constructor(gridSize, ppmTexture) {
        let numPoints = gridSize * gridSize * gridSize;
        if (ppmTexture !== undefined) {
            numPoints = ppmTexture.data.byteLength / 3;
        }
        super(numPoints);
        this.ppmBGL = WGPU_RENDERER.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "storage"
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "storage"
                    }
                }
            ],
            label: "PPM Bind Group Layout"
        });
        this.rgbToXYZKernel = `
    @group(0) @binding(0) var<storage, read_write> rgb: array<f32>;
    @group(0) @binding(1) var<storage, read_write> xyz: array<f32>;
    
    @compute @workgroup_size(256)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let index = global_id.x + (global_id.y * 65535u * 256u);
        let grid_size = u32(pow(f32(arrayLength(&rgb) / 3), 1.0/3.0));
        if (index >= arrayLength(&rgb) / 3) {
            return;
        }

        // Get RGB values
        var r = rgb[index];
        var g = rgb[index + 1];
        var b = rgb[index + 2];

        // sRGB gamma correction
        if (r <= 0.04045) {
            r = r / 12.92;
        } else {
            r = pow((r + 0.055) / 1.055, 2.4);
        }
        
        if (g <= 0.04045) {
            g = g / 12.92;
        } else {
            g = pow((g + 0.055) / 1.055, 2.4);
        }

        if (b <= 0.04045) {
            b = b / 12.92;
        } else {
            b = pow((b + 0.055) / 1.055, 2.4);
        }

        // RGB to XYZ matrix transformation
        let x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
        let y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
        let z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;

        // Store XYZ values
        let pos_index = index * 3;
        xyz[pos_index] = x;
        xyz[pos_index + 1] = y;
        xyz[pos_index + 2] = z;
    }`;
        this.xyzToLUVKernel = `
    @group(0) @binding(0) var<storage, read> rgb: array<f32>;
    @group(0) @binding(1) var<storage, read> xyz: array<f32>;
    @group(0) @binding(2) var<storage, read_write> luv: array<f32>;
    
    @compute @workgroup_size(256)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let index = global_id.x + (global_id.y * 65535u * 256u);
        let grid_size = u32(pow(f32(arrayLength(&xyz) / 3), 1.0/3.0);
        if (index >= arrayLength(&xyz) / 3) {
            return;
        }

        let Xn = 0.95047;
        let Yn = 1.00000;
        let Zn = 1.08883;

        let u_prime_ref_white = (4.0 * Xn) / (Xn + 15.0 * Yn + 3.0 * Zn);
        let v_prime_ref_white = (9.0 * Yn) / (Xn + 15.0 * Yn + 3.0 * Zn);

        let denominator = xyz[index * 3] + 15.0 * xyz[index * 3 + 1] + 3.0 * xyz[index * 3 + 2];
        var u_prime: f32;
        var v_prime: f32;

        if (denominator > 0.0) {
            u_prime = (4.0 * xyz[index * 3]) / denominator;
            v_prime = (9.0 * xyz[index * 3 + 1]) / denominator;
        } else {
            u_prime = u_prime_ref_white;
            v_prime = v_prime_ref_white;
        }
        
        let y_normalized = xyz[index * 3 + 1] / Yn;
        var L_star: f32;
        
        if (y_normalized > pow(6.0/29.0, 3.0)) {
            L_star = 116.0 * pow(y_normalized, 1.0/3.0) - 16.0;
        } else {
            L_star = 903.3 * y_normalized;
        }

        let u_star = 13.0 * L_star * (u_prime - u_prime_ref_white);

        let v_star = 13.0 * L_star * (v_prime - v_prime_ref_white);

        // Store LUV values as coordinates
        let pos_index = index * 6;
        luv[pos_index] = L_star;
        luv[pos_index + 1] = u_star;
        luv[pos_index + 2] = v_star;
        
        // Store original RGB as vertex color attribute
        luv[pos_index + 3] = rgb[index * 3];
        luv[pos_index + 4] = rgb[index * 3 + 1];
        luv[pos_index + 5] = rgb[index * 3 + 2];
    }`;
        // LUV Point Cloud Kernel
        this.luvKernel = `
    @group(0) @binding(0) var<storage, read_write> vertices: array<f32>;

    @compute @workgroup_size(256)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let index = global_id.x + (global_id.y * 65535u * 256u);
        let grid_size = u32(pow(f32(arrayLength(&vertices) / 6), 1.0/3.0));
        if (index >= arrayLength(&vertices) / 6) {
            return;
        }

        // Calculate RGB values from grid position
        let r = f32(index % grid_size) / f32(grid_size - 1);
        let g = f32((index / grid_size) % grid_size) / f32(grid_size - 1);
        let b = f32(index / (grid_size * grid_size)) / f32(grid_size - 1);

        // Convert RGB to XYZ
        let rgb = vec3<f32>(r, g, b);
        let xyz = rgb_to_xyz(rgb);
        
        // Convert XYZ to CIELUV
        let luv = xyz_to_luv(xyz);

        // Store position (using LUV as coordinates)
        let pos_index = index * 6;
        vertices[pos_index] = luv.x * 0.01;     // Scale L to reasonable range
        vertices[pos_index + 1] = luv.y * 0.01; // Scale u to reasonable range
        vertices[pos_index + 2] = luv.z * 0.01; // Scale v to reasonable range

        // Store original RGB as color
        vertices[pos_index + 3] = r;
        vertices[pos_index + 4] = g;
        vertices[pos_index + 5] = b;
    }

    fn rgb_to_xyz(rgb: vec3<f32>) -> vec3<f32> {
        var r = rgb.r;
        var g = rgb.g;
        var b = rgb.b;

        // sRGB gamma correction
        if (r <= 0.04045) {
            r = r / 12.92;
        } else {
            r = pow((r + 0.055) / 1.055, 2.4);
        }

        if (g <= 0.04045) {
            g = g / 12.92;
        } else {
            g = pow((g + 0.055) / 1.055, 2.4);
        }

        if (b <= 0.04045) {
            b = b / 12.92;
        } else {
            b = pow((b + 0.055) / 1.055, 2.4);
        }

        // RGB to XYZ matrix transformation
        return vec3<f32>(
            0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
            0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
            0.0193339 * r + 0.1191920 * g + 0.9503041 * b
        );
    }

    fn xyz_to_luv(xyz: vec3<f32>) -> vec3<f32> {
        let Xn = 0.95047;
        let Yn = 1.00000;
        let Zn = 1.08883;

        let u_prime_ref_white = (4.0 * Xn) / (Xn + 15.0 * Yn + 3.0 * Zn);
        let v_prime_ref_white = (9.0 * Yn) / (Xn + 15.0 * Yn + 3.0 * Zn);

        let denominator = xyz.x + 15.0 * xyz.y + 3.0 * xyz.z;
        var u_prime: f32;
        var v_prime: f32;

        if (denominator > 0.0) {
            u_prime = (4.0 * xyz.x) / denominator;
            v_prime = (9.0 * xyz.y) / denominator;
        } else {
            u_prime = u_prime_ref_white;
            v_prime = v_prime_ref_white;
        }

        let y_normalized = xyz.y / Yn;
        var L_star: f32;

        if (y_normalized > pow(6.0/29.0, 3.0)) {
            L_star = 116.0 * pow(y_normalized, 1.0/3.0) - 16.0;
        } else {
            L_star = 903.3 * y_normalized;
        }

        let u_star = 13.0 * L_star * (u_prime - u_prime_ref_white);
        let v_star = 13.0 * L_star * (v_prime - v_prime_ref_white);

        return vec3<f32>(L_star, u_star, v_star);
    }`;
        if (ppmTexture !== undefined) {
            this.ppmBuffer = WGPU_RENDERER.createGPUBuffer(ppmTexture.data, ppmTexture.data.length * Float32Array.BYTES_PER_ELEMENT, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, "ppmBuffer");
            this.xyzBuffer = WGPU_RENDERER.createGPUBuffer(null, this.ppmBuffer.size, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, "xyzBuffer");
            this.luvBuffer = WGPU_RENDERER.createGPUBuffer(null, this.vertexBuffer.size, GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX, "luvBuffer");
        }
    }
    async generateCloud() {
        if (this.ppmBuffer !== undefined) {
            console.log("Generating CIELUV Point Cloud");
            const xyzPipeline = this.createComputePipeline(this.rgbToXYZKernel, [this.ppmBGL], "RGB to XYZ Kernel");
            const ppmBindgroup = WGPU_RENDERER.device.createBindGroup({
                layout: xyzPipeline.getBindGroupLayout(0),
                entries: [
                    {
                        binding: 0,
                        resource: {
                            buffer: this.ppmBuffer
                        }
                    },
                    {
                        binding: 1,
                        resource: {
                            buffer: this.xyzBuffer
                        }
                    },
                ],
                label: "PPM Bind Group"
            });
            this.computeBindGroup = ppmBindgroup;
            this.compute(xyzPipeline, this.numPoints);
            const encoder = WGPU_RENDERER.device.createCommandEncoder();
            const stagingBuffer = WGPU_RENDERER.createGPUBuffer(null, this.xyzBuffer.size, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ, "stagingBuffer");
            encoder.copyBufferToBuffer(this.xyzBuffer, 0, stagingBuffer, 0, this.xyzBuffer.size);
            // Read from the xyz buffer and write back to cpu
            await stagingBuffer.mapAsync(GPUMapMode.READ, 0, this.xyzBuffer.size);
            const copyData = stagingBuffer.getMappedRange().slice(0);
            stagingBuffer.unmap();
            console.log(copyData);
            //const tmp = this.vertexBuffer;
            //this.vertexBuffer = this.luvBuffer;
            //WGPU_RENDERER.markGPUBufferForDeletion(tmp);
            // Ensure to reset our computeBindGroup to our transformBindGroup
            //this.computeBindGroup = this.transformBindGroup;
        }
        console.log("Converting RGB to LUV");
        const pipeline = this.createComputePipeline(this.luvKernel, [this.transformBGLayout], "LUV Kernel");
        this.computeBindGroup = this.transformBindGroup;
        // Compute the point cloud based on the kernel.
        this.compute(pipeline, this.numPoints);
        // The point cloud will technically be oriented incorrectly. Lets orient L along Y, u along X, and v along Z.
        this.rotate(0, 0, Math.PI / 2);
    }
}
