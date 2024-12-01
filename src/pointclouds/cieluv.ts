import { PointCloud } from "./pointcloud.js";

export class CIELUVPointCloud extends PointCloud {
    // RGB Grid Generation Kernel
    private rgbGridKernel = `
    @group(0) @binding(0) var<storage, read_write> vertices: array<f32>;

    @compute @workgroup_size(64)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let index = global_id.x + (global_id.y * 65535u * 64u);
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

    constructor(gridSize: number) {
        const numPoints = gridSize * gridSize * gridSize;
        super(numPoints);
    }

    public generateCloud(): void {
        const pipeline = this.createComputePipeline(this.rgbGridKernel);
        this.compute(pipeline, this.numPoints);

        // The point cloud will technically be oriented incorrectly. Lets orient L along Y, u along X, and v along Z.
        this.rotate(0, 0, Math.PI / 2);
    }
}
