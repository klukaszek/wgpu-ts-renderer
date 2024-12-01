import { PointCloud } from "./pointcloud.js";
export class FibonacciLattice extends PointCloud {
    constructor() {
        super(...arguments);
        // Fibonacci lattice distribution kernel
        this.fibLatticeKernel = `
        @group(0) @binding(0) var<storage, read_write> vertices: array<f32>;

        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
            let index = global_id.x + (global_id.y * 65535u * 64u);
            if (index >= arrayLength(&vertices) / 6) {
                return;
            }
            
            // Rest of the fibonacci lattice computation remains the same
            let phi = acos(1.0 - 2.0 * f32(index) / f32(arrayLength(&vertices) / 6));
            let theta = 3.14159 * (1.0 + sqrt(5.0)) * f32(index);
            let pos_index = index * 6;
            
            // Position calculation
            vertices[pos_index] = 2.0 * sin(phi) * cos(theta);
            vertices[pos_index + 1] = 2.0 * sin(phi) * sin(theta);
            vertices[pos_index + 2] = 2.0 * cos(phi);
            
            // Color calculation remains unchanged
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
    }
    generateCloud() {
        const pipeline = this.createComputePipeline(this.fibLatticeKernel);
        this.compute(pipeline, this.numPoints);
    }
}
