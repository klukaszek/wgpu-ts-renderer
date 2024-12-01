// File: input.ts
// Author: Kyle Lukaszek
// Date: 11/29/2024
//
// Description: This file contains the InputManager class which is responsible for handling user input and updating the camera position.
import { WGPU_RENDERER } from './main.js';
export class InputManager {
    constructor(camera, canvas) {
        this.camera = camera;
        this.canvas = canvas;
        this.keys = new Set();
        this.MOVEMENT_SPEED = 0.01;
        // Camera Control Variables
        this.MOUSE_SENSITIVITY = 0.002;
        this.currentPitch = 0;
        this.MAX_PITCH = Math.PI / 2 - 0.1;
        this.setupEventListeners();
        console.log(`Controls:
        - W: Move Forward
        - S: Move Backward
        - A: Move Left
        - D: Move Right
        - Space: Move Up
        - C: Move Down
        - R: Reset Camera
        - Z: Move to 0.3, 0, 0
        - X: Move to 0, 0, 0
        - P: Toggle Rotation`);
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
        if (this.keys.has(' '))
            this.camera.moveUp(this.MOVEMENT_SPEED);
        if (this.keys.has('c'))
            this.camera.moveUp(-this.MOVEMENT_SPEED);
        if (this.keys.has('r')) {
            this.camera.reset();
            this.currentPitch = 0;
        }
        if (this.keys.has('z')) {
            this.camera.setPosition(0, 0.3, 0);
        }
        if (this.keys.has('x')) {
            this.camera.setPosition(0, 0, 0);
        }
        if (this.keys.has('p')) {
            WGPU_RENDERER.animateRotation = !WGPU_RENDERER.animateRotation;
        }
    }
}
