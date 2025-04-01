import * as THREE from 'three';
import { CHUNK_SIZE } from './world.js';
import { BlockData } from './blockdata.js';

const PLAYER_HEIGHT = 1.8;
const PLAYER_WIDTH = 0.6;
const PLAYER_SPEED = 5.0;
const GRAVITY = 9.8 * 2; // Adjusted gravity
const JUMP_VELOCITY = 8.0;
const MAX_STEP_HEIGHT = 0.25; // How high the player can step up automatically
const REACH_DISTANCE = 5; // How far the player can reach to interact with blocks

// Use a Raycaster instance internally
const raycaster = new THREE.Raycaster();
raycaster.far = REACH_DISTANCE; // Set reach distance

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

        // Mining state
        this.isMining = false;
        this.miningStartTime = 0;
        this.miningTargetBlockPos = new THREE.Vector3();
        this.miningTargetBlockType = BlockData.types.AIR;
        this.miningTimeRequired = Infinity;

        this._addEventListeners();
    }

    _addEventListeners() {
        document.addEventListener('keydown', (event) => this._onKeyDown(event));
        document.addEventListener('keyup', (event) => this._onKeyUp(event));
        document.addEventListener('mousedown', (event) => this._onMouseDown(event));
        document.addEventListener('mouseup', (event) => this._onMouseUp(event)); // Add mouseup listener
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

    // Function to find the block being looked at
    _getLookedAtBlock() {
        if (!window.world || !Object.keys(window.world.chunkMeshes).length) {
            return null; // World or meshes not ready
        }
        raycaster.setFromCamera({ x: 0, y: 0 }, this.camera); // Center of screen
        const intersects = raycaster.intersectObjects(Object.values(window.world.chunkMeshes), false); // Don't intersect children recursively

        if (intersects.length > 0) {
            const intersection = intersects[0];
            // Ensure intersection is within reach (already handled by raycaster.far)
            // if (intersection.distance > REACH_DISTANCE) return null;

            const point = intersection.point;
            const normal = intersection.face.normal;

            // Calculate block position for breaking (slightly inside the clicked face)
            const breakBlockPos = point.clone().add(normal.clone().multiplyScalar(-0.01)).floor();
            // Calculate block position for placing (slightly outside the clicked face)
            const placeBlockPos = point.clone().add(normal.clone().multiplyScalar(0.01)).floor();

            const blockType = window.world.getVoxel(breakBlockPos.x, breakBlockPos.y, breakBlockPos.z);

            return {
                intersection,
                breakBlockPos,
                placeBlockPos,
                blockType,
                distance: intersection.distance
            };
        }
        return null; // No block intersected within reach
    }


    _onMouseDown(event) {
        if (!document.pointerLockElement) return; // Only act if pointer is locked

        const lookedAt = this._getLookedAtBlock();
        if (!lookedAt) return; // Didn't click on a block

        const { breakBlockPos, placeBlockPos, blockType } = lookedAt;

        if (event.button === 0) { // Left click: Start or continue mining
            if (BlockData.isSolid(blockType) && !this.isMining) {
                this.isMining = true;
                this.miningStartTime = performance.now();
                this.miningTargetBlockPos.copy(breakBlockPos);
                this.miningTargetBlockType = blockType;
                this.miningTimeRequired = BlockData.getHardness(blockType) * 1000; // Convert s to ms
                console.log(`Started mining block at: ${breakBlockPos.x}, ${breakBlockPos.y}, ${breakBlockPos.z} (Type: ${blockType}, Time: ${this.miningTimeRequired}ms)`);
                // Optionally add visual feedback start here
            }

        } else if (event.button === 2) { // Right click: Place block immediately
            console.log(`Attempting place block at: ${placeBlockPos.x}, ${placeBlockPos.y}, ${placeBlockPos.z}`);
             // Basic check to prevent placing inside player (more robust check needed)
             // Check feet and head level bounding box corners
             const playerFeetY = this.camera.position.y - PLAYER_HEIGHT + 0.1;
             const playerHeadY = this.camera.position.y - 0.1;
             const halfWidth = PLAYER_WIDTH / 2;
             const playerBB = new THREE.Box3(
                new THREE.Vector3(this.camera.position.x - halfWidth, playerFeetY, this.camera.position.z - halfWidth),
                new THREE.Vector3(this.camera.position.x + halfWidth, playerHeadY, this.camera.position.z + halfWidth)
             );
             const placeBlockBox = new THREE.Box3().setFromCenterAndSize(
                placeBlockPos.clone().addScalar(0.5), // Center of block
                new THREE.Vector3(1, 1, 1)
             );


             if (!playerBB.intersectsBox(placeBlockBox)) {
                 // Check if the target placement spot is currently air
                 if (window.world.getVoxel(placeBlockPos.x, placeBlockPos.y, placeBlockPos.z) === BlockData.types.AIR) {
                    window.world.setVoxel(placeBlockPos.x, placeBlockPos.y, placeBlockPos.z, BlockData.types.STONE); // Place STONE for now
                    console.log(`Placed block at: ${placeBlockPos.x}, ${placeBlockPos.y}, ${placeBlockPos.z}`);
                 } else {
                     console.log("Cannot place block: Spot not empty.");
                 }
             } else {
                  console.log("Cannot place block inside player.");
             }
        }
    }

     _onMouseUp(event) {
         if (event.button === 0) { // Left click released
             if (this.isMining) {
                 console.log("Stopped mining.");
                 this.isMining = false;
                 // Optionally add visual feedback stop here
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

        // Handle mining progress
        if (this.isMining) {
            const lookedAt = this._getLookedAtBlock();

            // Check if still looking at the same block
            if (!lookedAt || !lookedAt.breakBlockPos.equals(this.miningTargetBlockPos)) {
                // console.log("Looked away, stopping mining.");
                this.isMining = false;
                 // Optionally add visual feedback stop here
            } else {
                const elapsedTime = performance.now() - this.miningStartTime;
                // TODO: Add visual indicator update here based on elapsedTime / miningTimeRequired

                if (elapsedTime >= this.miningTimeRequired) {
                    console.log(`Finished mining block at: ${this.miningTargetBlockPos.x}, ${this.miningTargetBlockPos.y}, ${this.miningTargetBlockPos.z}`);
                    world.setVoxel(this.miningTargetBlockPos.x, this.miningTargetBlockPos.y, this.miningTargetBlockPos.z, BlockData.types.AIR);
                    this.isMining = false;
                    // Optionally add visual feedback completion/stop here
                }
            }
        }


        // Apply gravity
        this.velocity.y -= GRAVITY * deltaTime;

        // Movement direction based on camera orientation
        const moveDirection = new THREE.Vector3();
        const rightDirection = new THREE.Vector3();

        controls.getDirection(moveDirection); // Get camera forward direction

        // Calculate right vector using correct cross product order (forward x up)
        rightDirection.crossVectors(this.camera.up, moveDirection).normalize(); // Corrected order for right vector

        let deltaX = 0;
        let deltaZ = 0;

        if (this.moveForward) {
            deltaZ += speed; // Positive Z is forward relative to camera
        }
        if (this.moveBackward) {
            deltaZ -= speed;
        }
        if (this.moveLeft) {
            deltaX -= speed; // Negative X is left relative to camera
        }
        if (this.moveRight) {
            deltaX += speed; // Positive X is right relative to camera
        }

         // Calculate final movement vector based on camera direction
         const movement = new THREE.Vector3();
         // Apply forward/backward movement along camera's direction
         movement.add(moveDirection.clone().multiplyScalar(deltaZ));
         // Apply left/right movement using the calculated rightDirection
         movement.add(rightDirection.clone().multiplyScalar(deltaX));
         movement.y = 0; // Horizontal movement only


         // Normalize and scale if there is movement to maintain consistent speed
         const horizontalSpeed = movement.length();
         if (horizontalSpeed > 1e-4) { // Small threshold
             movement.normalize().multiplyScalar(speed);
         } else {
             movement.set(0, 0, 0); // No horizontal movement if below threshold
         }


        // --- Collision Detection and Resolution ---
        const currentPos = this.camera.position.clone();
        let nextPos = currentPos.clone();

        // Check X movement component
        let moveX = new THREE.Vector3(movement.x, 0, 0);
        if (!this._checkCollision(world, moveX)) {
             nextPos.add(moveX);
        } else {
             this.velocity.x = 0; // Stop horizontal velocity if colliding
        }


        // Check Z movement component (from potentially updated X position)
        let moveZ = new THREE.Vector3(0, 0, movement.z);
         // Check collision from the position *after* potential X move
        if (!this._checkCollision(world, moveZ.clone().add(new THREE.Vector3(nextPos.x - currentPos.x, 0, 0)))) {
             nextPos.add(moveZ);
        } else {
             this.velocity.z = 0; // Stop horizontal velocity if colliding
        }

        // Check Y movement (gravity/jump)
        let moveY = new THREE.Vector3(0, this.velocity.y * deltaTime, 0);
        let verticalMoveAttempt = moveY.clone();
        const combinedHorizontalMove = nextPos.clone().sub(currentPos); // Total XZ displacement this frame


        // Check collision below first (landing/walking)
        if (this.velocity.y <= 0) { // Moving down or stopped vertically
             // Check points slightly below the final horizontal position + vertical attempt
            let feetCheckBase = currentPos.clone().add(combinedHorizontalMove).add(verticalMoveAttempt);
            let feetCollisionPoints = [
                new THREE.Vector3(feetCheckBase.x - PLAYER_WIDTH/2, feetCheckBase.y - PLAYER_HEIGHT + 0.01, feetCheckBase.z - PLAYER_WIDTH/2),
                new THREE.Vector3(feetCheckBase.x + PLAYER_WIDTH/2, feetCheckBase.y - PLAYER_HEIGHT + 0.01, feetCheckBase.z - PLAYER_WIDTH/2),
                new THREE.Vector3(feetCheckBase.x - PLAYER_WIDTH/2, feetCheckBase.y - PLAYER_HEIGHT + 0.01, feetCheckBase.z + PLAYER_WIDTH/2),
                new THREE.Vector3(feetCheckBase.x + PLAYER_WIDTH/2, feetCheckBase.y - PLAYER_HEIGHT + 0.01, feetCheckBase.z + PLAYER_WIDTH/2),
            ];

            if (this._checkCollisionPoints(world, feetCollisionPoints)) {
                 // Landed on something
                 // Snap feet to just above the collision surface
                 nextPos.y = Math.floor(feetCheckBase.y - PLAYER_HEIGHT) + PLAYER_HEIGHT; // Align bottom of player BB with top of block
                 this.velocity.y = 0;
                 this.onGround = true;
                 // Don't reset canJump here, it's reset on keyup
            } else {
                 // Still falling
                 nextPos.add(verticalMoveAttempt);
                 this.onGround = false;
            }
        } else { // Moving up (jumping)
              // Check points slightly below the head at the final horizontal position + vertical attempt
             let headCheckBase = currentPos.clone().add(combinedHorizontalMove).add(verticalMoveAttempt);
             let headCollisionPoints = [
                 new THREE.Vector3(headCheckBase.x - PLAYER_WIDTH/2, headCheckBase.y - 0.01, headCheckBase.z - PLAYER_WIDTH/2),
                 new THREE.Vector3(headCheckBase.x + PLAYER_WIDTH/2, headCheckBase.y - 0.01, headCheckBase.z - PLAYER_WIDTH/2),
                 new THREE.Vector3(headCheckBase.x - PLAYER_WIDTH/2, headCheckBase.y - 0.01, headCheckBase.z + PLAYER_WIDTH/2),
                 new THREE.Vector3(headCheckBase.x + PLAYER_WIDTH/2, headCheckBase.y - 0.01, headCheckBase.z + PLAYER_WIDTH/2),
             ];

             if (this._checkCollisionPoints(world, headCollisionPoints)) {
                 // Hit ceiling
                  // Snap head slightly below ceiling
                 nextPos.y = Math.ceil(headCheckBase.y) - 0.01;
                 this.velocity.y = 0;
                 this.onGround = false; // Technically not on ground if hitting ceiling
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