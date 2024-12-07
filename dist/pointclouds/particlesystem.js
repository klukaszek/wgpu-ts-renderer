import { WGPU_RENDERER } from "../main.js";
import { PointCloud } from "./pointcloud.js";
import { vec3 } from "gl-matrix";
const particleInitKernel = `
    @group(0) @binding(0) var<storage, read_write> particles: array<f32>;
    @group(0) @binding(1) var<uniform> params: SimParams;

    // Hash function for pseudo-random numbers
    fn hash(p: vec3<f32>) -> f32 {
        var p3 = fract(vec3<f32>(p.x, p.y, p.z) * vec3<f32>(0.1031, 0.1030, 0.0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }

    // Generates a random point in a sphere
    fn random_sphere_point(index: u32) -> vec3<f32> {
        let seed = vec3<f32>(
            f32(index) * 0.1,
            f32(index) * 0.2,
            f32(index) * 0.3
        );
        
        let theta = hash(seed) * 6.283185; // 2pi
        let phi = hash(seed.yzx) * 3.141592; // pi
        let r = pow(hash(seed.zxy), 0.333333); // cube root for uniform distribution
        
        let sin_phi = sin(phi);
        return vec3<f32>(
            r * sin_phi * cos(theta),
            r * sin_phi * sin(theta),
            r * cos(phi)
        ) * 10.0; // Scale factor for initial spread
    }

    @compute @workgroup_size(256)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let index = global_id.x;
        if (index >= params.maxParticles) {
            return;
        }

        let stride = 12u; // position(3) + velocity(3) + color(3) + life(1) + mass_size(2)
        let base_index = index * stride;

        // Generate random position
        let position = random_sphere_point(index);
        particles[base_index] = position.x;
        particles[base_index + 1] = position.y;
        particles[base_index + 2] = position.z;

        // Generate random initial velocity
        let velocity = random_sphere_point(index + params.maxParticles) * 0.1;
        particles[base_index + 3] = velocity.x;
        particles[base_index + 4] = velocity.y;
        particles[base_index + 5] = velocity.z;

        // Generate random color based on position
        let color_seed = hash(position);
        particles[base_index + 6] = hash(position + 1.0);       // r
        particles[base_index + 7] = hash(position + 2.0);       // g
        particles[base_index + 8] = hash(position + 3.0);       // b

        // Set initial life
        particles[base_index + 9] = mix(
            params.lifespanMin,
            params.lifespanMax,
            hash(position + 4.0)
        );

        // Set mass and size
        particles[base_index + 10] = 1.0 + hash(position + 5.0);  // mass
        particles[base_index + 11] = 1.0;                         // size
    }
`;
// Define the particle compute shader as a constant
const PARTICLE_COMPUTE_SHADER = `
    // Particle data structures
    struct Particle {
        position: vec3<f32>,
        velocity: vec3<f32>,
        color: vec3<f32>,
        life: f32,
        mass_and_size: vec2<f32> // mass in x, size in y
    };

    struct SimParams {
        deltaTime: f32,
        maxParticles: u32,
        emitterPosition: vec3<f32>,
        gravity: vec3<f32>,
        
        // Simulation bounds
        boundMin: vec3<f32>,
        boundMax: vec3<f32>,
        
        // Force field parameters
        vortexStrength: f32,
        vortexAxis: vec3<f32>,
        turbulenceScale: f32,
        turbulenceStrength: f32,
        
        // Particle parameters
        dragCoefficient: f32,
        restitution: f32,
        lifespanMin: f32,
        lifespanMax: f32,
    };

    // Bindings
    @group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
    @group(0) @binding(1) var<uniform> params: SimParams;

    // Shared memory for particle processing
    var<workgroup> shared_particles: array<Particle, 256>;
    var<workgroup> shared_forces: array<vec3<f32>, 256>;

    // Noise functions for turbulence
    fn hash(p: vec3<f32>) -> f32 {
        var p3 = fract(vec3<f32>(p.x, p.y, p.z) * 0.13);
        p3 += dot(p3, p3.yzx + 3.333);
        return fract((p3.x + p3.y) * p3.z);
    }

    fn noise(p: vec3<f32>) -> f32 {
        let i = floor(p);
        let f = fract(p);
        
        // Cubic interpolation
        let u = f * f * (3.0 - 2.0 * f);
        
        return mix(
            mix(
                mix(hash(i + vec3<f32>(0.0, 0.0, 0.0)), 
                    hash(i + vec3<f32>(1.0, 0.0, 0.0)), u.x),
                mix(hash(i + vec3<f32>(0.0, 1.0, 0.0)),
                    hash(i + vec3<f32>(1.0, 1.0, 0.0)), u.x),
                u.y),
            mix(
                mix(hash(i + vec3<f32>(0.0, 0.0, 1.0)),
                    hash(i + vec3<f32>(1.0, 0.0, 1.0)), u.x),
                mix(hash(i + vec3<f32>(0.0, 1.0, 1.0)),
                    hash(i + vec3<f32>(1.0, 1.0, 1.0)), u.x),
                u.y),
            u.z
        );
    }

    // Force calculation functions
    fn calculateVortexForce(position: vec3<f32>) -> vec3<f32> {
        let toParticle = position - params.emitterPosition;
        let distance = length(toParticle);
        let direction = normalize(toParticle);
        let perpendicular = normalize(cross(params.vortexAxis, direction));
        return perpendicular * (params.vortexStrength / max(distance, 0.1));
    }

    fn calculateTurbulence(position: vec3<f32>) -> vec3<f32> {
        let scaledPos = position * params.turbulenceScale;
        return vec3<f32>(
            noise(scaledPos + vec3<f32>(0.0, 1.234, 5.678)),
            noise(scaledPos + vec3<f32>(4.321, 0.0, 8.765)),
            noise(scaledPos + vec3<f32>(7.890, 3.456, 0.0))
        ) * 2.0 - 1.0;
    }

    fn calculateDrag(velocity: vec3<f32>) -> vec3<f32> {
        let speed = length(velocity);
        return -normalize(velocity) * speed * speed * params.dragCoefficient;
    }

    @compute @workgroup_size(256)
    fn main(
        @builtin(local_invocation_id) local_id: vec3<u32>,
        @builtin(workgroup_id) group_id: vec3<u32>,
        @builtin(global_invocation_id) global_id: vec3<u32>
    ) {
        let particle_index = global_id.x;
        let local_index = local_id.x;
        
        // Load particle into shared memory
        var particle: Particle;
        if (particle_index < params.maxParticles) {
            particle = particles[particle_index];
            shared_particles[local_index] = particle;
        }
        
        workgroupBarrier();
        
        if (particle_index < params.maxParticles) {
            particle = shared_particles[local_index];
            
            // Update particle life
            particle.life -= params.deltaTime;
            
            // Respawn dead particles
            if (particle.life <= 0.0) {
                // Reset position to emitter
                particle.position = params.emitterPosition;
                
                // Random initial velocity (in a cone)
                let theta = hash(vec3<f32>(f32(particle_index), particle.life, 0.0)) * 6.283185;
                let phi = hash(vec3<f32>(f32(particle_index), particle.life, 1.0)) * 0.3;
                let r = hash(vec3<f32>(f32(particle_index), particle.life, 2.0)) * 2.0;
                
                particle.velocity = vec3<f32>(
                    r * sin(phi) * cos(theta),
                    r * cos(phi),
                    r * sin(phi) * sin(theta)
                );
                
                // Reset life and properties
                particle.life = mix(
                    params.lifespanMin,
                    params.lifespanMax,
                    hash(vec3<f32>(f32(particle_index), particle.life, 3.0))
                );
                
                // Set initial mass and size
                particle.mass_and_size = vec2<f32>(1.0, 1.0);
                
                // Randomize color based on life
                let life_factor = particle.life / params.lifespanMax;
                particle.color = mix(
                    vec3<f32>(1.0, 0.2, 0.1), // End color (red)
                    vec3<f32>(0.1, 0.8, 1.0), // Start color (blue)
                    life_factor
                );
            }
            
            // Calculate forces
            var total_force = vec3<f32>(0.0);
            
            // Add gravity
            total_force += params.gravity * particle.mass_and_size.x;
            
            // Add vortex force
            total_force += calculateVortexForce(particle.position);
            
            // Add turbulence
            total_force += calculateTurbulence(particle.position) * params.turbulenceStrength;
            
            // Add drag
            total_force += calculateDrag(particle.velocity);
            
            shared_forces[local_index] = total_force;
        }
        
        workgroupBarrier();
        
        if (particle_index < params.maxParticles) {
            // Update velocity and position
            let force = shared_forces[local_index];
            particle.velocity += (force / particle.mass_and_size.x) * params.deltaTime;
            particle.position += particle.velocity * params.deltaTime;
            
            // Boundary collision handling
            for (var i = 0; i < 3; i++) {
                if (particle.position[i] < params.boundMin[i]) {
                    particle.position[i] = params.boundMin[i];
                    particle.velocity[i] = abs(particle.velocity[i]) * params.restitution;
                } else if (particle.position[i] > params.boundMax[i]) {
                    particle.position[i] = params.boundMax[i];
                    particle.velocity[i] = -abs(particle.velocity[i]) * params.restitution;
                }
            }
            
            // Update size based on life
            particle.mass_and_size.y = mix(0.1, 1.0, particle.life / params.lifespanMax);
            
            // Write back to global memory
            particles[particle_index] = particle;
        }    
}
    `;
export class ParticleSystem extends PointCloud {
    constructor(numParticles, transform) {
        super(numParticles, transform);
        this.simParams = {
            deltaTime: 0.0,
            maxParticles: 0,
            emitterPosition: vec3.fromValues(0, 0, 0),
            gravity: vec3.fromValues(0, -9.81, 0),
            boundMin: vec3.fromValues(-10, -10, -10),
            boundMax: vec3.fromValues(10, 10, 10),
            vortexStrength: 40.0,
            vortexAxis: vec3.fromValues(0, 1, 0),
            turbulenceScale: 0.1,
            turbulenceStrength: 0.5,
            dragCoefficient: 0.1,
            restitution: 0.6,
            lifespanMin: 2.0,
            lifespanMax: 5.0
        };
        this.currentBuffer = 0;
        this.computePipeline = null;
        this.computeBindgroups = [null, null];
        this.simParamsBuffer = WGPU_RENDERER.device.createBuffer({
            size: 128,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            label: 'Simulation Parameters'
        });
        this.initializeComputePipelines();
        this.computeBindgroups = [
            WGPU_RENDERER.device.createBindGroup({
                layout: this.computePipeline.getBindGroupLayout(0),
                entries: [
                    {
                        binding: 0,
                        resource: { buffer: this.vertexBuffer }
                    },
                    {
                        binding: 1,
                        resource: { buffer: this.simParamsBuffer }
                    }
                ]
            }),
            WGPU_RENDERER.device.createBindGroup({
                layout: this.computePipeline.getBindGroupLayout(0),
                entries: [
                    {
                        binding: 0,
                        resource: { buffer: this.vertexBuffer }
                    },
                    {
                        binding: 1,
                        resource: { buffer: this.simParamsBuffer }
                    }
                ]
            })
        ];
    }
    // Implement the abstract method from PointCloud
    generateCloud() {
        //// Initialize particles with random positions and velocities
    }
    initializeComputePipelines() {
        const computeBindGroupLayout = WGPU_RENDERER.device.createBindGroupLayout({
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
            ]
        });
        this.computePipeline = WGPU_RENDERER.device.createComputePipeline({
            layout: WGPU_RENDERER.device.createPipelineLayout({
                bindGroupLayouts: [computeBindGroupLayout]
            }),
            compute: {
                module: WGPU_RENDERER.device.createShaderModule({
                    code: PARTICLE_COMPUTE_SHADER
                }),
                entryPoint: 'main'
            }
        });
    }
    update(deltaTime) {
        // Update simulation parameters
        const paramData = new Float32Array([
            deltaTime, // deltaTime (4 bytes)
            this.numPoints, // maxParticles (4 bytes)
            0, 0, // padding (8 bytes)
            // emitterPosition (vec3 + padding)
            this.simParams.emitterPosition[0],
            this.simParams.emitterPosition[1],
            this.simParams.emitterPosition[2],
            0.0, // padding
            // gravity (vec3 + padding)
            this.simParams.gravity[0],
            this.simParams.gravity[1],
            this.simParams.gravity[2],
            0.0, // padding
            // boundMin (vec3 + padding)
            this.simParams.boundMin[0],
            this.simParams.boundMin[1],
            this.simParams.boundMin[2],
            0.0, // padding
            // boundMax (vec3 + padding)
            this.simParams.boundMax[0],
            this.simParams.boundMax[1],
            this.simParams.boundMax[2],
            0.0, // padding
            // Additional parameters
            this.simParams.vortexStrength,
            this.simParams.vortexAxis[0],
            this.simParams.vortexAxis[1],
            this.simParams.vortexAxis[2],
            this.simParams.turbulenceScale,
            this.simParams.turbulenceStrength,
            this.simParams.dragCoefficient,
            this.simParams.restitution,
            this.simParams.lifespanMin,
            this.simParams.lifespanMax,
            0.0, 0.0 // padding to maintain 16-byte alignment
        ]);
        WGPU_RENDERER.device.queue.writeBuffer(this.simParamsBuffer, 0, paramData);
        const commandEncoder = WGPU_RENDERER.device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.computePipeline);
        // Create bind group for current frame
        const currentBindGroup = this.computeBindgroups[this.currentBuffer];
        computePass.setBindGroup(0, currentBindGroup);
        // Dispatch workgroups
        const WORKGROUP_SIZE = 256;
        const numWorkgroups = Math.ceil(this.numPoints / WORKGROUP_SIZE);
        computePass.dispatchWorkgroups(numWorkgroups, 1, 1);
        computePass.end();
        WGPU_RENDERER.device.queue.submit([commandEncoder.finish()]);
        // Swap buffers
        this.currentBuffer = (this.currentBuffer + 1) % 2;
    }
    render(renderPass) {
        if (!this.renderBindGroup) {
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
    // Additional utility methods for particle system control
    setForce(x, y, z) {
        const forceData = new Float32Array([x, y, z, 0.0]); // Include padding
        WGPU_RENDERER.device.queue.writeBuffer(this.simParamsBuffer, 24, // Offset to forces in SimParams
        forceData);
    }
    resetParticles() {
        this.generateCloud();
    }
    setParticleLife(life) {
        // Implementation to modify particle life
        const commandEncoder = WGPU_RENDERER.device.createCommandEncoder();
        // ... implement particle life modification logic
        WGPU_RENDERER.device.queue.submit([commandEncoder.finish()]);
    }
    // Clean up resources when destroying the particle system
    destroy() {
        this.simParamsBuffer.destroy();
    }
    setEmitterPosition(position) {
        vec3.copy(this.simParams.emitterPosition, position);
    }
    setGravity(gravity) {
        vec3.copy(this.simParams.gravity, gravity);
    }
    setBounds(min, max) {
        vec3.copy(this.simParams.boundMin, min);
        vec3.copy(this.simParams.boundMax, max);
    }
    setVortex(strength, axis) {
        this.simParams.vortexStrength = strength;
        vec3.copy(this.simParams.vortexAxis, axis);
    }
    setTurbulence(scale, strength) {
        this.simParams.turbulenceScale = scale;
        this.simParams.turbulenceStrength = strength;
    }
    setParticleProperties(drag, restitution) {
        this.simParams.dragCoefficient = drag;
        this.simParams.restitution = restitution;
    }
    setLifespan(min, max) {
        this.simParams.lifespanMin = min;
        this.simParams.lifespanMax = max;
    }
}
