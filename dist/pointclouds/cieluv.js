import { PointCloud } from "./pointcloud.js";
import { WGPU_RENDERER } from "../main.js";
export class CIELUVPointCloud extends PointCloud {
    constructor(gridSize) {
        let numPoints = gridSize * gridSize * gridSize;
        // Will be undefined if no PPM texture has been provided to the renderer
        let { ppmTexture, buffer } = WGPU_RENDERER.getPPMTextureData();
        // If a PPM texture is attached to the renderer, use it to generate the point cloud
        if (ppmTexture !== undefined) {
            numPoints = ppmTexture.width * ppmTexture.height;
            console.log("PPM Texture provided. Using " + numPoints + " points.");
        }
        super(numPoints);
        this.luvBGL = WGPU_RENDERER.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "read-only-storage"
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
        this.luvBindGroup = null;
        this.luvPipeline = null;
        // PPM file will contain RGB values for each pixel
        this.rgbToLUVKernel = `
    @group(0) @binding(0) var<storage, read> input_buffer: array<u32>;
    @group(0) @binding(1) var<storage, read_write> vertices: array<f32>;

    // Constants for the D65 reference white point
    const u_n: f32 = 0.1978; // u' for D65
    const v_n: f32 = 0.4683; // v' for D65

    @compute @workgroup_size(256)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let index = global_id.x + (global_id.y * 65535u * 256u);
        
        if (index >= arrayLength(&input_buffer) || index >= arrayLength(&vertices) / 6) {
            return;
        }

        // Extract RGB values from input buffer
        let input = input_buffer[index];
        let r = f32(input & 0xFFu) / 255.0;
        let g = f32((input >> 8u) & 0xFFu) / 255.0;
        let b = f32((input >> 16u) & 0xFFu) / 255.0;
        let a = f32((input >> 24u) & 0xFFu) / 255.0;
        
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
        
        // Convert LUV back to RGB
        let srgb = luv_to_rgb(luv);
        
        // Store original RGB as color
        vertices[pos_index + 3] = srgb.r;
        vertices[pos_index + 4] = srgb.g;
        vertices[pos_index + 5] = srgb.b;
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
    }

    fn luv_to_xyz(luv: vec3<f32>) -> vec3<f32> {
        let l = luv.x;
        let u = luv.y;
        let v = luv.z;

        var Y: f32;
        if (l > 8.0) {
            Y = pow((l + 16.0) / 116.0, 3.0);
        } else {
            Y = l / 903.3;
        }

        var u_prime = 0.0;
        if (l != 0.0) { u_prime = (u + 13.0 * l * u_n) / (13.0 * l); }
        
        var v_prime = 0.0;
        if (l != 0.0) { v_prime = (v + 13.0 * l * v_n) / (13.0 * l); };
        
        var X = 0.0;
        if (v_prime != 0.0) { X = Y * (9.0 * u_prime / (4.0 * v_prime)); }
        
        var Z = 0.0; 
        if (v_prime != 0.0) { Z = Y * (12.0 - 3.0 * u_prime - 20.0 * v_prime) / (4.0 * v_prime); }

        return vec3<f32>(X, Y, Z);
    }

    fn xyz_to_rgb(xyz: vec3<f32>) -> vec3<f32> {
        let x = xyz.x;
        let y = xyz.y;
        let z = xyz.z;

        let r =  3.2406 * x - 1.5372 * y - 0.4986 * z;
        let g = -0.9689 * x + 1.8758 * y + 0.0415 * z;
        let b =  0.0557 * x - 0.2040 * y + 1.0570 * z;

        return vec3<f32>(r, g, b);
    }

    // Wrapper function for LUV -> RGB
    fn luv_to_rgb(luv: vec3<f32>) -> vec3<f32> {
        let xyz = luv_to_xyz(luv);
        return xyz_to_rgb(xyz);
    }`;
        // LUV Point Cloud Kernel
        this.luvKernel = `
    @group(0) @binding(0) var<storage, read_write> vertices: array<f32>;

    // Constants for the D65 reference white point
    const u_n: f32 = 0.1978; // u' for D65
    const v_n: f32 = 0.4683; // v' for D65

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

        // Convert LUV back to RGB
        let srgb = luv_to_rgb(luv);

        // Store original RGB as color
        vertices[pos_index + 3] = srgb.r;
        vertices[pos_index + 4] = srgb.g;
        vertices[pos_index + 5] = srgb.b;
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
    }

    fn luv_to_xyz(luv: vec3<f32>) -> vec3<f32> {
        let l = luv.x;
        let u = luv.y;
        let v = luv.z;

        var Y: f32;
        if (l > 8.0) {
            Y = pow((l + 16.0) / 116.0, 3.0);
        } else {
            Y = l / 903.3;
        }

        var u_prime = 0.0;
        if (l != 0.0) { u_prime = (u + 13.0 * l * u_n) / (13.0 * l); }
        
        var v_prime = 0.0;
        if (l != 0.0) { v_prime = (v + 13.0 * l * v_n) / (13.0 * l); };
        
        var X = 0.0;
        if (v_prime != 0.0) { X = Y * (9.0 * u_prime / (4.0 * v_prime)); }
        
        var Z = 0.0; 
        if (v_prime != 0.0) { Z = Y * (12.0 - 3.0 * u_prime - 20.0 * v_prime) / (4.0 * v_prime); }

        return vec3<f32>(X, Y, Z);
    }

    fn xyz_to_rgb(xyz: vec3<f32>) -> vec3<f32> {
        let x = xyz.x;
        let y = xyz.y;
        let z = xyz.z;

        let r =  3.2406 * x - 1.5372 * y - 0.4986 * z;
        let g = -0.9689 * x + 1.8758 * y + 0.0415 * z;
        let b =  0.0557 * x - 0.2040 * y + 1.0570 * z;

        return vec3<f32>(r, g, b);
    }

    // Wrapper function for LUV -> RGB
    fn luv_to_rgb(luv: vec3<f32>) -> vec3<f32> {
        let xyz = luv_to_xyz(luv);
        return xyz_to_rgb(xyz);
    }`;
        this.numPoints = numPoints;
        // Generate LUV point cloud from PPM texture
        if (ppmTexture !== undefined) {
            // Store it just for potential future use, we really only need the buffer
            this.ppmTexture = ppmTexture;
            this.ppmBuffer = buffer;
            this.luvPipeline = this.createComputePipeline(this.rgbToLUVKernel, [this.luvBGL], "PPM Pipeline");
            this.luvBindGroup = WGPU_RENDERER.device.createBindGroup({
                layout: this.luvBGL,
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
                            buffer: this.vertexBuffer
                        }
                    }
                ],
                label: "PPM Bind Group"
            });
            // Generate LUV point cloud from scratch
        }
        else {
            this.luvPipeline = this.createComputePipeline(this.luvKernel, [this.transformBGLayout], "LUV Kernel");
            this.luvBindGroup = this.transformBindGroup;
        }
    }
    async generateCloud() {
        this.computeBindGroup = this.luvBindGroup;
        //Compute the point cloud based on the kernel.
        this.compute(this.luvPipeline, this.numPoints);
        // The point cloud will technically be oriented incorrectly. Lets orient L along Y, u along X, and v along Z.
        this.rotate(0, 0, Math.PI / 2);
    }
}
