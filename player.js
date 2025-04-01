import * as THREE from 'three';
import { CHUNK_SIZE } from './world.js';
import { BlockData } from './blockdata.js';

const PLAYER_HEIGHT = 1.8;
const PLAYER_WIDTH = 0.6;
const PLAYER_SPEED = 5.0;
const GRAVITY = 9.8 * 2; // Adjusted gravity
const JUMP_VELOCITY = 8.0;
const MAX_STEP_HEIGHT = 0.25; // How high the player can step up automatically

export class Player {
    constructor(camera) {
        this.camera = camera;
        this.velocity = new THREE.Vector3();
        this.onGround = false;

        // Player position starts slightly above the center ground
        this.camera.position.set(
            CHUNK_SIZE / 2,
            10, // Start slightly above the initial flat ground
            CHUNK_SIZE / 2
        );

        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.canJump = false;

        this._addEventListeners();
    }

    _addEventListeners() {
        document.addEventListener('keydown', (event) => this._onKeyDown(event));
        document.addEventListener('keyup', (event) => this._onKeyUp(event));
        document.addEventListener('mousedown', (event) => this._onMouseDown(event));
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
                if (this.canJump && this.onGround) {
                    this.velocity.y = JUMP_VELOCITY;
                    this.onGround = false;
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

    _onMouseDown(event) {
        if (!document.pointerLockElement) return; // Only act if pointer is locked

        // Raycast to find intersected block
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera({ x: 0, y: 0 }, this.camera); // Center of screen
        const intersects = raycaster.intersectObjects(Object.values(window.world.chunkMeshes), false); // Use global world for now, check children: false

        if (intersects.length > 0) {
            const intersection = intersects[0];
             // Ensure we have face data, which BufferGeometry provides
             if (!intersection.face || !intersection.face.normal) {
                console.warn("Intersection missing face or normal data.");
                return;
            }

            const point = intersection.point;
            // The intersection normal is in world space, pointing OUT from the face that was hit.
            const normal = intersection.face.normal.clone();

            // Use a small epsilon to push the point slightly off the face boundary.
            // This helps ensure flooring gives the correct voxel coordinate.
            const epsilon = 0.01; // A small value is usually sufficient

            // Calculate the coordinates of the block being clicked ON (for breaking)
            // Move slightly *into* the block from the intersection point along the normal.
            const breakBlockPos = point.clone().addScaledVector(normal, -epsilon).floor();

            // Calculate the coordinates where a *new* block would be placed (adjacent to the clicked face)
            // Move slightly *out* from the intersection point along the normal.
            const placeBlockPos = point.clone().addScaledVector(normal, epsilon).floor();

            if (event.button === 0) { // Left click: Destroy block
                // Use the calculated breakBlockPos
                 console.log(`Attempting destroy at: ${breakBlockPos.x}, ${breakBlockPos.y}, ${breakBlockPos.z}`);
                 if (window.world && typeof window.world.setVoxel === 'function') {
                     window.world.setVoxel(breakBlockPos.x, breakBlockPos.y, breakBlockPos.z, BlockData.types.AIR); // Use AIR type
                 } else {
                     console.error("World reference is invalid or setVoxel is not a function.");
                 }

            } else if (event.button === 2) { // Right click: Place block
                 // Use the calculated placeBlockPos
                 console.log(`Attempting place at: ${placeBlockPos.x}, ${placeBlockPos.y}, ${placeBlockPos.z}`);

                 // --- Player Collision Check ---
                 // Define the player's bounding box (AABB)
                 // Feet are at camera.y - PLAYER_HEIGHT, Head is at camera.y
                 const playerMin = this.camera.position.clone().sub(new THREE.Vector3(PLAYER_WIDTH / 2, PLAYER_HEIGHT, PLAYER_WIDTH / 2));
                 const playerMax = this.camera.position.clone().add(new THREE.Vector3(PLAYER_WIDTH / 2, 0, PLAYER_WIDTH / 2));

                 // Define the bounding box of the block to be placed (voxel coords are min corner)
                 const placeBlockMin = placeBlockPos.clone();
                 const placeBlockMax = placeBlockPos.clone().addScalar(1); // Voxel size is 1x1x1

                 // Check for AABB overlap
                 const overlaps = (
                     placeBlockMax.x > playerMin.x && placeBlockMin.x < playerMax.x &&
                     placeBlockMax.y > playerMin.y && placeBlockMin.y < playerMax.y &&
                     placeBlockMax.z > playerMin.z && placeBlockMin.z < playerMax.z
                 );

                 if (overlaps) {
                     console.log("Cannot place block: Overlaps player.");
                 } else {
                     // Make sure the world reference is still valid
                     if (window.world && typeof window.world.setVoxel === 'function') {
                         // TODO: Use selected block type from inventory later
                         window.world.setVoxel(placeBlockPos.x, placeBlockPos.y, placeBlockPos.z, BlockData.types.STONE); // Place Stone for now
                     } else {
                          console.error("World reference is invalid or setVoxel is not a function.");
                     }
                 }
            }
        }
    }

    // Basic AABB collision detection
    _checkCollision(world, moveDirection) {
        const halfWidth = PLAYER_WIDTH / 2;
        const playerPos = this.camera.position;

        // Define player bounding box corners relative to playerPos
        // We check slightly ahead in the move direction
        const checkPos = playerPos.clone().add(moveDirection);

        const pointsToCheck = [
            // Feet level
            new THREE.Vector3(checkPos.x - halfWidth, checkPos.y - PLAYER_HEIGHT + 0.1, checkPos.z - halfWidth), // Front-left bottom
            new THREE.Vector3(checkPos.x + halfWidth, checkPos.y - PLAYER_HEIGHT + 0.1, checkPos.z - halfWidth), // Front-right bottom
            new THREE.Vector3(checkPos.x - halfWidth, checkPos.y - PLAYER_HEIGHT + 0.1, checkPos.z + halfWidth), // Back-left bottom
            new THREE.Vector3(checkPos.x + halfWidth, checkPos.y - PLAYER_HEIGHT + 0.1, checkPos.z + halfWidth), // Back-right bottom
             // Head level (approx)
            new THREE.Vector3(checkPos.x - halfWidth, checkPos.y - 0.1, checkPos.z - halfWidth), // Front-left top
            new THREE.Vector3(checkPos.x + halfWidth, checkPos.y - 0.1, checkPos.z - halfWidth), // Front-right top
            new THREE.Vector3(checkPos.x - halfWidth, checkPos.y - 0.1, checkPos.z + halfWidth), // Back-left top
            new THREE.Vector3(checkPos.x + halfWidth, checkPos.y - 0.1, checkPos.z + halfWidth), // Back-right top
        ];

        for (const point of pointsToCheck) {
            const voxel = world.getVoxel(Math.floor(point.x), Math.floor(point.y), Math.floor(point.z));
            if (BlockData.isSolid(voxel)) {
                return true; // Collision detected
            }
        }
        return false; // No collision
    }

    update(deltaTime, world, controls) {
        const speed = PLAYER_SPEED * deltaTime;

        // Apply gravity
        this.velocity.y -= GRAVITY * deltaTime;

        // Movement direction based on camera orientation
        const moveDirection = new THREE.Vector3();
        const rightDirection = new THREE.Vector3();

        controls.getDirection(moveDirection); // Get camera forward direction

        // Calculate right vector using correct cross product order (forward x up)
        // Previous order (up x forward) resulted in the left vector.
        rightDirection.crossVectors(moveDirection, this.camera.up).normalize();

        let deltaX = 0;
        let deltaZ = 0;

        if (this.moveForward) {
            deltaZ -= speed; // Movement is negated later when applying to moveDirection
        }
        if (this.moveBackward) {
            deltaZ += speed;
        }
        if (this.moveLeft) {
            deltaX -= speed; // Negative deltaX for left
        }
        if (this.moveRight) {
            deltaX += speed; // Positive deltaX for right
        }

         // Calculate final movement vector based on camera direction
         const movement = new THREE.Vector3();
         // Apply forward/backward movement (inverted Z because getDirection points negative Z)
         movement.add(moveDirection.clone().multiplyScalar(-deltaZ));
         // Apply left/right movement using the calculated rightDirection
         movement.add(rightDirection.clone().multiplyScalar(deltaX));
         movement.y = 0; // Horizontal movement only

         // Check if there is significant horizontal movement before normalizing and applying speed
         // This prevents tiny movements when only gravity is acting
         const horizontalSpeed = movement.length();
         if (horizontalSpeed > 1e-4) { // Small threshold
             movement.normalize().multiplyScalar(speed); // Ensure consistent speed regardless of direction combination
         } else {
             movement.set(0, 0, 0); // No horizontal movement
         }


        // --- Collision Detection and Resolution ---
        const currentPos = this.camera.position.clone();
        let nextPos = currentPos.clone();

        // Check X movement
        let moveX = new THREE.Vector3(movement.x, 0, 0);
        if (!this._checkCollision(world, moveX)) {
             nextPos.add(moveX);
        } else {
             this.velocity.x = 0;
        }


        // Check Z movement (from potentially updated X position)
        let moveZ = new THREE.Vector3(0, 0, movement.z);
        if (!this._checkCollision(world, moveZ.clone().add(new THREE.Vector3(nextPos.x - currentPos.x, 0, 0)))) { // Check from new X pos
             nextPos.add(moveZ);
        } else {
             this.velocity.z = 0;
        }

        // Check Y movement (gravity/jump)
        let moveY = new THREE.Vector3(0, this.velocity.y * deltaTime, 0);
        let verticalMoveAttempt = moveY.clone();

        // Check collision below first (landing/walking)
        if (this.velocity.y <= 0) { // Moving down or stopped vertically
            let feetCheckPos = nextPos.clone().add(verticalMoveAttempt);
            let feetCollisionPoint = new THREE.Vector3(feetCheckPos.x, feetCheckPos.y - PLAYER_HEIGHT, feetCheckPos.z);

            if (this._checkCollisionPoints(world, [
                feetCollisionPoint.clone().add(new THREE.Vector3(-PLAYER_WIDTH/2, 0, -PLAYER_WIDTH/2)),
                feetCollisionPoint.clone().add(new THREE.Vector3(PLAYER_WIDTH/2, 0, -PLAYER_WIDTH/2)),
                feetCollisionPoint.clone().add(new THREE.Vector3(-PLAYER_WIDTH/2, 0, PLAYER_WIDTH/2)),
                feetCollisionPoint.clone().add(new THREE.Vector3(PLAYER_WIDTH/2, 0, PLAYER_WIDTH/2)),
            ])) {
                 // Landed on something
                 nextPos.y = Math.floor(nextPos.y + verticalMoveAttempt.y - PLAYER_HEIGHT + 1) + PLAYER_HEIGHT - 0.01; // Snap to ground + epsilon
                 this.velocity.y = 0;
                 this.onGround = true;
                 this.canJump = true; // Allow jump initiation
            } else {
                 // Still falling
                 nextPos.add(verticalMoveAttempt);
                 this.onGround = false;
            }
        } else { // Moving up (jumping)
             let headCheckPos = nextPos.clone().add(verticalMoveAttempt);
             let headCollisionPoint = new THREE.Vector3(headCheckPos.x, headCheckPos.y, headCheckPos.z); // Head level

             if (this._checkCollisionPoints(world, [
                 headCollisionPoint.clone().add(new THREE.Vector3(-PLAYER_WIDTH/2, 0, -PLAYER_WIDTH/2)),
                 headCollisionPoint.clone().add(new THREE.Vector3(PLAYER_WIDTH/2, 0, -PLAYER_WIDTH/2)),
                 headCollisionPoint.clone().add(new THREE.Vector3(-PLAYER_WIDTH/2, 0, PLAYER_WIDTH/2)),
                 headCollisionPoint.clone().add(new THREE.Vector3(PLAYER_WIDTH/2, 0, PLAYER_WIDTH/2)),
             ])) {
                 // Hit ceiling
                 this.velocity.y = 0;
                 // Adjust position slightly below ceiling if needed (optional)
             } else {
                  // Still ascending
                  nextPos.add(verticalMoveAttempt);
                  this.onGround = false;
             }
        }


        // Update camera position
        this.camera.position.copy(nextPos);
    }

     // Helper to check multiple specific points for collision
     _checkCollisionPoints(world, points) {
         for (const point of points) {
             const voxel = world.getVoxel(Math.floor(point.x), Math.floor(point.y), Math.floor(point.z));
             if (BlockData.isSolid(voxel)) {
                 return true; // Collision detected at one of the points
             }
         }
         return false; // No collision at any point
     }
}