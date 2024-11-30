// File: input.ts
// Author: Kyle Lukaszek
// Date: 11/29/2024
//
// Description: This file contains the InputManager class which is responsible for handling user input and updating the camera position.
export class InputManager {
    constructor(camera, canvas) {
        this.camera = camera;
        this.canvas = canvas;
        this.keys = new Set();
        this.MOVEMENT_SPEED = 0.1;
        // Camera Control Variables
        this.MOUSE_SENSITIVITY = 0.002;
        this.currentPitch = 0;
        this.MAX_PITCH = Math.PI / 2 - 0.1;
        // Screenshot Variables
        this.lastScreenshotTime = 0;
        this.SCREENSHOT_COOLDOWN = 2000; // 2 seconds cooldown
        this.setupEventListeners();
    }
    setupEventListeners() {
        document.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
        document.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
        // Lock the pointer when the canvas is clicked
        this.canvas.addEventListener('click', () => {
            this.canvas.requestPointerLock();
        });
        // Update camera rotation when the mouse moves
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === this.canvas) {
                const yaw = -e.movementX * this.MOUSE_SENSITIVITY;
                // Clamp pitch to prevent flipping
                const newPitch = this.currentPitch - e.movementY * this.MOUSE_SENSITIVITY;
                if (Math.abs(newPitch) < this.MAX_PITCH) {
                    this.currentPitch = newPitch;
                    this.camera.rotate(yaw, -e.movementY * this.MOUSE_SENSITIVITY);
                }
                else {
                    this.camera.rotate(yaw, 0);
                }
            }
        });
    }
    // Poll for key presses and update the camera position
    // This can be extended to handle more keys and actions
    update() {
        if (this.keys.has('w'))
            this.camera.moveForward(this.MOVEMENT_SPEED);
        if (this.keys.has('s'))
            this.camera.moveForward(-this.MOVEMENT_SPEED);
        if (this.keys.has('d'))
            this.camera.moveRight(this.MOVEMENT_SPEED);
        if (this.keys.has('a'))
            this.camera.moveRight(-this.MOVEMENT_SPEED);
        if (this.keys.has('e'))
            this.camera.moveUp(this.MOVEMENT_SPEED);
        if (this.keys.has('q'))
            this.camera.moveUp(-this.MOVEMENT_SPEED);
        if (this.keys.has('r')) {
            this.camera.reset();
            this.currentPitch = 0;
        }
    }
}
