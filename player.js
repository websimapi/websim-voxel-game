import * as THREE from 'three';
import { CHUNK_SIZE } from './world.js';
import { BlockData } from './blockdata.js';

const PLAYER_HEIGHT = 1.8;
const PLAYER_WIDTH = 0.6;
const PLAYER_SPEED = 5.0;
const GRAVITY = 9.8 * 2; // Adjusted gravity
const JUMP_VELOCITY = 8.0;
const MAX_STEP_HEIGHT = 0.25; // How high the player can step up automatically
const REACH_DISTANCE = 5; // How far the player can interact with blocks

export class Player {
    constructor(camera) {
        this.camera = camera;
        this.velocity = new THREE.Vector3();
        this.onGround = false;
        this.raycaster = new THREE.Raycaster(); // Reusable raycaster
        this.raycaster.far = REACH_DISTANCE; // Set max reach

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

        // Block breaking state
        this.isBreaking = false;
        this.breakingBlockInfo = null; // { position: THREE.Vector3, startTime: number, duration: number, type: number }

        this._addEventListeners();
    }

    _addEventListeners() {
        document.addEventListener('keydown', (event) => this._onKeyDown(event));
        document.addEventListener('keyup', (event) => this._onKeyUp(event));
        document.addEventListener('mousedown', (event) => this._onMouseDown(event));
        document.addEventListener('mouseup', (event) => this._onMouseUp(event)); // Listen for mouse release
        // Add listener for mouse movement to cancel breaking if pointer moves off block (handled in update)
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

    // Helper to get the block position based on intersection point and normal
    _getBlockPositionFromIntersection(point, normal, isPlacement) {
        const offset = isPlacement ? 0.5 : -0.5;
        return point.clone().addScaledVector(normal, offset).floor();
    }

    _startBreaking(blockPos, blockType) {
        const duration = BlockData.getBlockDurability(blockType);
        if (duration > 0) { // Only break blocks with durability
             this.isBreaking = true;
             this.breakingBlockInfo = {
                 position: blockPos.clone(),
                 startTime: performance.now(),
                 duration: duration,
                 type: blockType // Store type to ensure we don't break air later
             };
             console.log(`Started breaking block at: ${blockPos.x}, ${blockPos.y}, ${blockPos.z} (Duration: ${duration}ms)`);
             // TODO: Add visual breaking indicator start
        } else {
             console.log(`Cannot break block type ${blockType} at: ${blockPos.x}, ${blockPos.y}, ${blockPos.z}`);
        }
    }

    _stopBreaking() {
        if (this.isBreaking) {
            console.log("Stopped breaking.");
            // TODO: Remove visual breaking indicator
        }
        this.isBreaking = false;
        this.breakingBlockInfo = null;
    }

    _onMouseDown(event) {
        if (!document.pointerLockElement) return; // Only act if pointer is locked

        // Raycast to find intersected block
        this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera); // Center of screen
        const intersects = this.raycaster.intersectObjects(Object.values(window.world.chunkMeshes), false); // Don't intersect recursively

        if (intersects.length > 0) {
            const intersection = intersects[0];
            // Ignore intersections further than reach distance (double check)
            if (intersection.distance > REACH_DISTANCE) {
                 this._stopBreaking(); // Stop breaking if target out of reach
                 return;
            }

            const point = intersection.point;
            // Use the face normal for precision, especially at edges
            const normal = intersection.face.normal;


            if (event.button === 0) { // Left click: Start or continue breaking block
                 const blockPos = this._getBlockPositionFromIntersection(point, normal, false);
                 const blockType = window.world.getVoxel(blockPos.x, blockPos.y, blockPos.z);

                 if (BlockData.isSolid(blockType)) {
                     // If already breaking this block, do nothing (handled in update)
                     // Otherwise, start breaking
                     if (!this.isBreaking || !this.breakingBlockInfo.position.equals(blockPos)) {
                          this._startBreaking(blockPos, blockType);
                     }
                 } else {
                      this._stopBreaking(); // Clicked on air or non-solid
                 }

            } else if (event.button === 2) { // Right click: Place block
                 this._stopBreaking(); // Stop breaking if right-clicking

                 const blockPos = this._getBlockPositionFromIntersection(point, normal, true);
                 console.log(`Attempting to place block at: ${blockPos.x}, ${blockPos.y}, ${blockPos.z}`);

                 // Basic check to prevent placing inside player
                 const playerMin = this.camera.position.clone().sub(new THREE.Vector3(PLAYER_WIDTH / 2, PLAYER_HEIGHT, PLAYER_WIDTH / 2));
                 const playerMax = this.camera.position.clone().add(new THREE.Vector3(PLAYER_WIDTH / 2, 0, PLAYER_WIDTH / 2));
                 const placeBoundingBox = new THREE.Box3(blockPos, blockPos.clone().addScalar(1));
                 const playerBoundingBox = new THREE.Box3(playerMin, playerMax);

                 if (!placeBoundingBox.intersectsBox(playerBoundingBox)) {
                     // Check if the target placement spot is currently air
                     if (window.world.getVoxel(blockPos.x, blockPos.y, blockPos.z) === BlockData.types.AIR) {
                        // TODO: Use selected block type from inventory/hotbar
                        window.world.setVoxel(blockPos.x, blockPos.y, blockPos.z, BlockData.types.WOOD); // Place Wood for now
                     } else {
                         console.log("Target placement spot is occupied.");
                     }

                 } else {
                      console.log("Cannot place block inside player.");
                 }
            }
        } else {
             // Clicked on nothing within reach
             this._stopBreaking();
        }
    }

    _onMouseUp(event) {
        if (event.button === 0) { // Left mouse button released
            this._stopBreaking();
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

        // --- Handle Breaking ---
        if (this.isBreaking && this.breakingBlockInfo) {
            // Raycast again to check if still looking at the same block
            this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
            const intersects = this.raycaster.intersectObjects(Object.values(world.chunkMeshes), false);

            let stillLookingAtBlock = false;
            if (intersects.length > 0 && intersects[0].distance <= REACH_DISTANCE) {
                const intersection = intersects[0];
                const currentBlockPos = this._getBlockPositionFromIntersection(intersection.point, intersection.face.normal, false);

                if (this.breakingBlockInfo.position.equals(currentBlockPos)) {
                     // Still looking at the same block, check time
                     const elapsedTime = performance.now() - this.breakingBlockInfo.startTime;
                     const progress = elapsedTime / this.breakingBlockInfo.duration;

                     // TODO: Update visual breaking indicator (progress)

                     if (elapsedTime >= this.breakingBlockInfo.duration) {
                         // Break the block
                         console.log(`Breaking block at: ${this.breakingBlockInfo.position.x}, ${this.breakingBlockInfo.position.y}, ${this.breakingBlockInfo.position.z}`);
                         world.setVoxel(this.breakingBlockInfo.position.x, this.breakingBlockInfo.position.y, this.breakingBlockInfo.position.z, 0); // 0 is air
                         this._stopBreaking(); // Reset state
                         // TODO: Add block breaking sound/particles
                         stillLookingAtBlock = true; // Prevent immediate stopBreaking below
                     } else {
                          stillLookingAtBlock = true; // Still looking and breaking
                     }
                }
            }

            // If not still looking at the block, cancel breaking
            if (!stillLookingAtBlock) {
                this._stopBreaking();
            }
        }

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