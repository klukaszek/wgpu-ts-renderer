import { vec3, quat, mat4 } from 'gl-matrix';

export class Camera {
    private position: vec3;
    private rotation: quat;
    private viewMatrix: mat4;
    private projectionMatrix: mat4;
    private uniformBuffer: GPUBuffer;

    constructor(
        private device: GPUDevice,
        initialPosition: vec3,
        private fov: number,
        private aspect: number,
        private near: number,
        private far: number
    ) {
        this.position = initialPosition;
        this.rotation = quat.create();
        this.viewMatrix = mat4.create();
        this.projectionMatrix = mat4.create();

        // Create uniform buffer
        this.uniformBuffer = device.createBuffer({
            size: 144,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.updateViewMatrix();
        this.updateProjectionMatrix();
    }

    private updateViewMatrix(): void {
        // Create view matrix from position and rotation
        mat4.fromRotationTranslation(
            this.viewMatrix,
            this.rotation,
            this.position
        );
        mat4.invert(this.viewMatrix, this.viewMatrix);

        // Update GPU buffer
        this.device.queue.writeBuffer(
            this.uniformBuffer,
            0,
            this.viewMatrix as Float32Array
        );

        this.updateViewPosition();
    }

    private updateProjectionMatrix(): void {
        mat4.perspective(
            this.projectionMatrix,
            this.fov,
            this.aspect,
            this.near,
            this.far
        );

        // Update GPU buffer
        this.device.queue.writeBuffer(
            this.uniformBuffer,
            64,
            this.projectionMatrix as Float32Array
        );
    }

    updateViewPosition(): void {
        this.device.queue.writeBuffer(
            this.uniformBuffer,
            128,
            this.position as Float32Array
        );
    }


    updateAspectRatio(aspect: number): void {
        this.aspect = aspect;
        this.updateProjectionMatrix();
    }

    moveForward(distance: number): void {
        const forward = vec3.transformQuat(
            vec3.create(),
            [0, 0, -1],
            this.rotation
        );
        vec3.scaleAndAdd(this.position, this.position, forward, distance);
        this.updateViewMatrix();
    }

    moveRight(distance: number): void {
        const right = vec3.transformQuat(
            vec3.create(),
            [1, 0, 0],
            this.rotation
        );
        vec3.scaleAndAdd(this.position, this.position, right, distance);
        this.updateViewMatrix();
    }

    moveUp(distance: number): void {
        const up = vec3.transformQuat(
            vec3.create(),
            [0, 1, 0],
            this.rotation
        );
        vec3.scaleAndAdd(this.position, this.position, up, distance);
        this.updateViewMatrix();
    }

    // Rotation using Euler angles (in radians)
    rotate(yaw: number, pitch: number): void {
        // Create quaternion for yaw rotation around Y axis
        const yawQuat = quat.setAxisAngle(
            quat.create(),
            [0, 1, 0],
            yaw
        );

        // Create quaternion for pitch rotation around X axis
        const pitchQuat = quat.setAxisAngle(
            quat.create(),
            [1, 0, 0],
            pitch
        );

        // Apply rotations in correct order
        quat.multiply(this.rotation, yawQuat, this.rotation);
        quat.multiply(this.rotation, this.rotation, pitchQuat);

        // Normalize to prevent accumulation of rounding errors
        quat.normalize(this.rotation, this.rotation);

        this.updateViewMatrix();
    }

    setPosition(x: number, y: number, z: number): void {
        vec3.set(this.position, x, y, z);
        this.updateViewMatrix();
    }

    getUniformBuffer(): GPUBuffer {
        return this.uniformBuffer;
    }

    reset(): void {
        this.position = vec3.fromValues(0, 0, 5);
        this.rotation = quat.create();
        this.viewMatrix = mat4.create();
        this.projectionMatrix = mat4.create();

        this.updateViewMatrix();
    }
}
