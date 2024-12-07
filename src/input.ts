// File: input.ts
// Author: Kyle Lukaszek
// Date: 11/29/2024
//
// Description: This file contains the InputManager class which is responsible for handling user input and updating the camera position.

import { Camera } from './camera.js';
import { WGPU_RENDERER, WGPU_SIDEBAR } from './main.js';

export interface InputAction {
    key: string;
    description: string;
    func: () => void;
}

export class InputManager {
    private keys: Set<string> = new Set();

    private readonly MOVEMENT_SPEED = 0.01;

    // Camera Control Variables
    private readonly MOUSE_SENSITIVITY = 0.002;
    private currentPitch = 0;
    private readonly MAX_PITCH = Math.PI / 2 - 0.1;

    private canInput: boolean = document.pointerLockElement === this.canvas;

    // It is obviously better to use a hashmap for this 
    // but for the sake of ease of access, I'm using an array.
    // This can be easily converted to a hashmap if needed.
    private inputList: InputAction[] = [
        {
            key: 'W',
            description: 'Move Forward',
            func: () => this.camera.moveForward(this.MOVEMENT_SPEED)
        },
        {
            key: 'S',
            description: 'Move Backward',
            func: () => this.camera.moveForward(-this.MOVEMENT_SPEED)
        },
        {
            key: 'A',
            description: 'Move Left',
            func: () => this.camera.moveRight(-this.MOVEMENT_SPEED)
        },
        {
            key: 'D',
            description: 'Move Right',
            func: () => this.camera.moveRight(this.MOVEMENT_SPEED)
        },
        {
            key: ' ',
            description: 'Move Up',
            func: () => this.camera.moveUp(this.MOVEMENT_SPEED)
        },
        {
            key: 'C',
            description: 'Move Down',
            func: () => this.camera.moveUp(-this.MOVEMENT_SPEED)
        },
        {
            key: 'R',
            description: 'Reset Camera',
            func: () => { this.camera.reset(); this.currentPitch = 0; }
        },
        {
            key: 'Z',
            description: 'Move to (0.3, 0, 0)',
            func: () => { this.camera.setPosition(0.3, 0, 0); this.currentPitch = 0; }
        },
        {
            key: 'X',
            description: 'Move to (0, 0, 0)',
            func: () => { this.camera.setPosition(0, 0, 0); this.currentPitch = 0; }
        },
        {
            key: 'P',
            description: 'Toggle Rotation',
            func: () => {
                WGPU_RENDERER.animateRotation = !WGPU_RENDERER.animateRotation;
                this.keys.delete('P');
            },
        },
        {
            key: 'M',
            description: 'Toggle Sidebar',
            func: () => {
                WGPU_SIDEBAR.toggle();
                this.keys.delete('M');
            }
        }
    ];

    // Efficiently map keys to InputActions, this allows for O(1) lookup
    private keyMap: Map<string, InputAction> = new Map();

    constructor(
        private camera: Camera,
        private canvas: HTMLCanvasElement
    ) {
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

    private setupEventListeners(): void {
        document.addEventListener('keydown', (e) => this.keys.add(e.key.toUpperCase()));
        document.addEventListener('keyup', (e) => this.keys.delete(e.key.toUpperCase()));

        // Build a hashmap of keys to an InputAction
        this.inputList.forEach((action) => {
            this.keyMap.set(action.key, action);
        });

        // Lock the pointer when the canvas is clicked
        this.canvas.addEventListener('click', () => {
            this.canvas.requestPointerLock();
        });

        // Update the canInput variable when the pointer lock changes
        document.addEventListener('pointerlockchange', () => {
            this.canInput = document.pointerLockElement === this.canvas;
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
                } else {
                    this.camera.rotate(yaw, 0);
                }
            }
        });
    }

    // Poll for key presses and update the camera position
    // This can be extended to handle more keys and actions
    update(): void {
        if (this.canInput) {

            this.keys.forEach((key) => {
                const action = this.keyMap.get(key);
                if (action) {
                    action.func();
                }
            });

            // Toggle the sidebar when 'M' is pressed
            // The user should be able to toggle the sidebar even when the app doesn't have focus
        } else {
            if (this.keys.has('M')) {
                WGPU_SIDEBAR.toggle();
                this.keys.delete('M');
            }
        }
    }

    public getControlList(): InputAction[] {
        return this.inputList;
    }
}
