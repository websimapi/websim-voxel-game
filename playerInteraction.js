import * as THREE from 'three';
import { BlockData } from './blockdata.js';

// --- Constants related to interaction ---
const REACH_DISTANCE = 5; // How far the player can interact with blocks

export class PlayerInteraction {
    constructor(camera, world) {
        this.camera = camera;
        this.world = world;
        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = REACH_DISTANCE;

        // Block breaking state
        this.isBreaking = false;
        this.breakingBlockInfo = null; // { position: THREE.Vector3, startTime: number, duration: number, type: number }
        this.blockBreakProgress = 0; // Value between 0 and 1

        // TODO: Block breaking visual indicator (e.g., crack texture overlay)
        // this.breakIndicator = null;

        // Bound event handlers
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
    }

    connect(element) {
        element.addEventListener('mousedown', this._onMouseDown);
        element.addEventListener('mouseup', this._onMouseUp);
    }

    disconnect(element) {
        element.removeEventListener('mousedown', this._onMouseDown);
        element.removeEventListener('mouseup', this._onMouseUp);
    }

    // Helper to get the block position based on intersection point and normal
    // Uses a slightly larger offset when breaking to ensure it targets the correct block from any face
    _getBlockPositionFromIntersection(point, normal, isPlacement) {
        const epsilon = 0.01; // Small offset for placement checks
        const breakOffset = 0.5; // Larger offset for breaking to ensure we are inside the block
        const adjustedPoint = point.clone();

        if (isPlacement) {
            // Move slightly along the normal (outward from the hit face)
            adjustedPoint.addScaledVector(normal, epsilon);
        } else {
             // Move significantly against the normal (inward from the hit face)
            adjustedPoint.addScaledVector(normal, -breakOffset); // Use addScaledVector with negative scale
        }

        // Floor the coordinates to get the block's origin
        return adjustedPoint.floor();
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
            this.blockBreakProgress = 0;
            console.log(`Started breaking block at: ${blockPos.x}, ${blockPos.y}, ${blockPos.z} (Type: ${blockType}, Duration: ${duration}ms)`);
            // TODO: Add visual breaking indicator start (e.g., create/show crack mesh/overlay)
        } else {
            console.log(`Cannot break block type ${blockType} at: ${blockPos.x}, ${blockPos.y}, ${blockPos.z}`);
        }
    }

    _stopBreaking() {
        if (this.isBreaking) {
            console.log("Stopped breaking.");
            // TODO: Remove/hide visual breaking indicator
        }
        this.isBreaking = false;
        this.breakingBlockInfo = null;
        this.blockBreakProgress = 0;
    }

     _onMouseDown(event) {
        if (!document.pointerLockElement) {
             this._stopBreaking(); // Ensure breaking stops if pointer isn't locked
             return;
        }

        // Raycast from camera center
        this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
        // Ensure chunkMeshes are correctly accessed from the world object
        const intersects = this.raycaster.intersectObjects(Object.values(this.world.chunkMeshes), false);

        if (intersects.length > 0) {
            const intersection = intersects[0];
            // Double check distance (though raycaster.far should handle this)
            if (intersection.distance > REACH_DISTANCE) {
                 this._stopBreaking();
                 return;
            }

            const point = intersection.point;
            // Ensure the normal is correctly pointing outwards from the hit face
            const normal = intersection.face.normal.clone(); //.normalize(); - It should already be normalized?

             console.log(`Intersection Point: (${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`);
             console.log(`Intersection Normal: (${normal.x.toFixed(2)}, ${normal.y.toFixed(2)}, ${normal.z.toFixed(2)})`);


            if (event.button === 0) { // Left click: Start or continue breaking block
                const blockPos = this._getBlockPositionFromIntersection(point, normal, false);
                const blockType = this.world.getVoxel(blockPos.x, blockPos.y, blockPos.z);
                console.log(`Calculated Break Target Block: (${blockPos.x}, ${blockPos.y}, ${blockPos.z}), Type: ${blockType}`); // Debug log

                if (BlockData.isSolid(blockType)) {
                    // Start breaking only if not already breaking this exact block
                    if (!this.isBreaking || !this.breakingBlockInfo.position.equals(blockPos)) {
                        this._startBreaking(blockPos, blockType);
                    }
                    // If already breaking this block, the update loop handles progress.
                } else {
                    console.log("Clicked on non-solid block or air, stopping break.");
                    this._stopBreaking(); // Clicked on air or non-solid
                }

            } else if (event.button === 2) { // Right click: Place block
                 this._stopBreaking(); // Stop breaking if right-clicking

                 const placePos = this._getBlockPositionFromIntersection(point, normal, true);
                 console.log(`Attempting to place block at: ${placePos.x}, ${placePos.y}, ${placePos.z}`);

                 // Basic check to prevent placing inside player BBox
                 // Use constants from Player class (need access or pass them) - Let's recalculate here for simplicity
                 const playerHeight = 1.8; // Hardcode or pass from Player
                 const playerWidth = 0.6; // Hardcode or pass from Player
                 const playerPos = this.camera.position;
                 const playerMin = playerPos.clone().sub(new THREE.Vector3(playerWidth / 2, playerHeight, playerWidth / 2));
                 const playerMax = playerPos.clone().add(new THREE.Vector3(playerWidth / 2, 0, playerWidth / 2)); // Max Y is at feet level? No, should be head.
                 // Correct Player BBox: Min Y is feet, Max Y is head
                 const playerMinCorrect = playerPos.clone().sub(new THREE.Vector3(playerWidth / 2, playerHeight, playerWidth / 2));
                 const playerMaxCorrect = playerPos.clone(); // Max is at camera height (eye level)
                 const playerBoundingBox = new THREE.Box3(playerMinCorrect, playerMaxCorrect);


                 const placeBoundingBox = new THREE.Box3(placePos, placePos.clone().addScalar(1)); // Voxel cube BBox

                 if (!placeBoundingBox.intersectsBox(playerBoundingBox)) {
                     // Check if the target placement spot is currently air
                     if (this.world.getVoxel(placePos.x, placePos.y, placePos.z) === BlockData.types.AIR) {
                        // TODO: Use selected block type from inventory/hotbar
                        const blockToPlace = BlockData.types.WOOD; // Place Wood for now
                        const success = this.world.setVoxel(
                            placePos.x,
                            placePos.y,
                            placePos.z,
                            blockToPlace
                        );
                        if (success) {
                            console.log(`Placed block ${blockToPlace} at (${placePos.x}, ${placePos.y}, ${placePos.z})`);
                            // Optional: Play placement sound
                        } else {
                            console.warn(`Failed to place block at (${placePos.x}, ${placePos.y}, ${placePos.z}) - setVoxel failed.`);
                        }
                     } else {
                         console.log("Target placement spot is occupied.");
                     }

                 } else {
                      console.log("Cannot place block overlapping player.");
                 }
            }
        } else {
             // Clicked on nothing within reach
             console.log("Clicked on empty space, stopping break.");
             this._stopBreaking();
        }
    }

    _onMouseUp(event) {
        if (event.button === 0) { // Left mouse button released
            this._stopBreaking();
        }
    }

    update(controls) { // Receive PointerLockControls instance
         // --- Handle Breaking Progress ---
         if (this.isBreaking && this.breakingBlockInfo) {
            // Check if pointer is still locked (game active)
            if (!controls.isLocked) {
                 this._stopBreaking();
                 return;
            }

            // Raycast again to check if still looking at the same block
            this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
            const intersects = this.raycaster.intersectObjects(Object.values(this.world.chunkMeshes), false);

            let stillLookingAtTargetBlock = false;
            if (intersects.length > 0 && intersects[0].distance <= REACH_DISTANCE) {
                const intersection = intersects[0];
                // Crucially, use the same logic to determine the block position as when starting the break
                const currentTargetPos = this._getBlockPositionFromIntersection(
                    intersection.point,
                    intersection.face.normal.clone(),
                    false // Use break logic offset
                );

                // Compare calculated target position with the stored breaking position
                if (this.breakingBlockInfo.position.equals(currentTargetPos)) {
                    stillLookingAtTargetBlock = true;
                     // Still looking at the same block, check time
                     const elapsedTime = performance.now() - this.breakingBlockInfo.startTime;
                     this.blockBreakProgress = Math.min(1, elapsedTime / this.breakingBlockInfo.duration);

                     // TODO: Update visual breaking indicator (progress)
                     // console.log(`Breaking progress: ${(this.blockBreakProgress * 100).toFixed(0)}%`); // Optional debug

                     if (elapsedTime >= this.breakingBlockInfo.duration) {
                         // Break the block
                         console.log(`Breaking block at: ${this.breakingBlockInfo.position.x}, ${this.breakingBlockInfo.position.y}, ${this.breakingBlockInfo.position.z}`);
                         const success = this.world.setVoxel(
                             this.breakingBlockInfo.position.x,
                             this.breakingBlockInfo.position.y,
                             this.breakingBlockInfo.position.z,
                             BlockData.types.AIR // 0 is air
                         );
                          if (success) {
                              // Optional: Add block breaking sound/particles
                          } else {
                                console.warn(`Failed to break block at (${this.breakingBlockInfo.position.x}, ${this.breakingBlockInfo.position.y}, ${this.breakingBlockInfo.position.z}) - setVoxel failed.`);
                          }
                         this._stopBreaking(); // Reset state AFTER successful break
                     }
                }
            }

            // If raycast hit nothing, or hit something else, or hit too far, stop breaking
            if (!stillLookingAtTargetBlock) {
                // console.log("Looked away from breaking block."); // Debug log
                this._stopBreaking();
            }
        } else if (this.isBreaking) {
             // This case should ideally not happen if state is managed correctly, but as a safeguard:
             console.warn("Interaction state: isBreaking is true but breakingBlockInfo is null. Resetting.");
             this._stopBreaking();
        }
    }
}