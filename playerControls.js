import * as THREE from 'three';

// --- Constants related to controls/movement ---
const PLAYER_SPEED = 5.0;
const JUMP_VELOCITY = 8.0;

export class PlayerControls {
    constructor(player) {
        this.player = player; // Reference to the main Player object for velocity/state

        // Movement state flags
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.canJump = true; // Tracks if jump key is released

        // Bound event handlers
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
    }

    connect(element) {
        element.addEventListener('keydown', this._onKeyDown);
        element.addEventListener('keyup', this._onKeyUp);
    }

    disconnect(element) {
        element.removeEventListener('keydown', this._onKeyDown);
        element.removeEventListener('keyup', this._onKeyUp);
    }

    _onKeyDown(event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW': this.moveForward = true; break;
            case 'ArrowLeft':
            case 'KeyA': this.moveLeft = true; break;
            case 'ArrowDown':
            case 'KeyS': this.moveBackward = true; break;
            case 'ArrowRight':
            case 'KeyD': this.moveRight = true; break;
            case 'Space':
                if (this.canJump && this.player.onGround) {
                    this.player.velocity.y = JUMP_VELOCITY;
                    // this.player.onGround = false; // Player class handles this based on physics
                    this.canJump = false; // Prevent holding space to multi-jump
                }
                break;
        }
    }

    _onKeyUp(event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW': this.moveForward = false; break;
            case 'ArrowLeft':
            case 'KeyA': this.moveLeft = false; break;
            case 'ArrowDown':
            case 'KeyS': this.moveBackward = false; break;
            case 'ArrowRight':
            case 'KeyD': this.moveRight = false; break;
             case 'Space': this.canJump = true; break; // Allow jumping again when space is released
        }
    }

    update(pointerLockControls, deltaTime) {
        const speed = PLAYER_SPEED * deltaTime;
        let didJump = !this.canJump && this.player.velocity.y > 0; // Detect if jump was just initiated

        // Movement direction based on camera orientation using PointerLockControls
        const moveDirection = new THREE.Vector3();
        const rightDirection = new THREE.Vector3();

        pointerLockControls.getDirection(moveDirection); // Get camera forward direction (points negative Z)

        // Calculate right vector (forward x up)
        rightDirection.crossVectors(pointerLockControls.getObject().up, moveDirection).normalize(); // Use camera's up vector

        let deltaX = 0;
        let deltaZ = 0;

        // Calculate intended displacement based on input flags
        if (this.moveForward) deltaZ += 1;
        if (this.moveBackward) deltaZ -= 1;
        if (this.moveLeft) deltaX -= 1;   // Corrected: Left is negative X relative to camera right
        if (this.moveRight) deltaX += 1;  // Corrected: Right is positive X relative to camera right

        // Calculate final horizontal movement vector based on camera direction
        const horizontalMovement = new THREE.Vector3();
        // Apply forward/backward movement along the camera's view direction
        horizontalMovement.add(moveDirection.clone().multiplyScalar(deltaZ));
        // Apply left/right movement along the calculated right direction
        horizontalMovement.add(rightDirection.clone().multiplyScalar(deltaX));
        horizontalMovement.y = 0; // Ensure horizontal movement only

        // Normalize if moving diagonally, then scale by speed
        if (horizontalMovement.lengthSq() > 1e-6) { // Check if there's any movement
            horizontalMovement.normalize().multiplyScalar(speed);
        } else {
            horizontalMovement.set(0, 0, 0); // No input, no horizontal movement
        }


        return { horizontalMovement, didJump };
    }
}