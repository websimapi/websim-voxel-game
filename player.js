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
        // Make sure the raycaster starts exactly at the camera position
        raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
        // Use the global world for chunkMeshes for now
        const chunkMeshesArray = Object.values(window.world.chunkMeshes).filter(mesh => mesh.parent); // Ensure mesh is added to scene

        if (chunkMeshesArray.length === 0) {
            console.log("No chunk meshes found for raycasting.");
            return; // Nothing to intersect with
        }

        const intersects = raycaster.intersectObjects(chunkMeshesArray, false); // false = don't check descendants

        if (intersects.length > 0) {
            const intersection = intersects[0];

            // Ensure we have face data (should always be true for BufferGeometry)
            if (!intersection.face) {
                 console.warn("Intersection missing face data.");
                 return;
            }

            const point = intersection.point;
            // The normal needs to be oriented correctly in world space.
            // intersectObjects already returns the world-space normal.
            const normal = intersection.face.normal;

            let blockPos;
            const epsilon = 0.01; // Small offset to push into/out of the block face

            if (event.button === 0) { // Left click: Destroy block
                // Calculate the position slightly *inside* the clicked face
                blockPos = point.clone().sub(normal.clone().multiplyScalar(epsilon)).floor();
                console.log(`Attempting to destroy block at: ${blockPos.x}, ${blockPos.y}, ${blockPos.z} (Ray hit: ${point.x.toFixed(2)},${point.y.toFixed(2)},${point.z.toFixed(2)}, Normal: ${normal.x.toFixed(2)},${normal.y.toFixed(2)},${normal.z.toFixed(2)})`);
                // Check if the block being destroyed is actually solid (prevents destroying air)
                const currentBlock = window.world.getVoxel(blockPos.x, blockPos.y, blockPos.z);
                 if (BlockData.isSolid(currentBlock)) {
                     window.world.setVoxel(blockPos.x, blockPos.y, blockPos.z, BlockData.types.AIR); // Set to air
                 } else {
                      console.log(`Clicked on air or non-solid block at ${blockPos.x}, ${blockPos.y}, ${blockPos.z}, cannot destroy.`);
                 }

            } else if (event.button === 2) { // Right click: Place block
                // Calculate the position slightly *outside* the clicked face (in the adjacent air block)
                blockPos = point.clone().add(normal.clone().multiplyScalar(epsilon)).floor();
                console.log(`Attempting to place block at: ${blockPos.x}, ${blockPos.y}, ${blockPos.z} (Ray hit: ${point.x.toFixed(2)},${point.y.toFixed(2)},${point.z.toFixed(2)}, Normal: ${normal.x.toFixed(2)},${normal.y.toFixed(2)},${normal.z.toFixed(2)})`);

                 // Check if the target placement spot is currently air
                 const targetBlock = window.world.getVoxel(blockPos.x, blockPos.y, blockPos.z);
                 if (!BlockData.isSolid(targetBlock)) {
                     // More robust check to prevent placing inside player BBox
                     const playerBBox = new THREE.Box3().setFromCenterAndSize(
                         this.camera.position,
                         new THREE.Vector3(PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_WIDTH)
                     );
                     // Shift player box down slightly as camera is at head level
                     playerBBox.min.y -= (PLAYER_HEIGHT - 0.1); // Adjust bbox based on player height origin
                     playerBBox.max.y -= (PLAYER_HEIGHT - 0.1);

                     const blockBBox = new THREE.Box3().setFromCenterAndSize(
                         blockPos.clone().addScalar(0.5), // Center of the block voxel
                         new THREE.Vector3(1, 1, 1)
                     );

                     if (!playerBBox.intersectsBox(blockBBox)) {
                         window.world.setVoxel(blockPos.x, blockPos.y, blockPos.z, BlockData.types.STONE); // Place Stone for now
                     } else {
                         console.log("Cannot place block: intersects player bounding box.");
                     }
                 } else {
                     console.log("Cannot place block: target position is already solid.");
                 }
            }
        } else {
            console.log("Raycast did not hit any chunk meshes.");
        }
    }

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