import * as THREE from 'three';
import { Chunk } from './chunk.js';

export const CHUNK_SIZE = 16;
export const RENDER_DISTANCE = 4; // Chunks in each direction (total diameter = 2*RENDER_DISTANCE+1)

export class World {
    constructor() {
        this.chunks = {}; // Store chunks by coordinate string "x,y,z"
        this.chunkMeshes = {}; // Store chunk meshes similarly
        this.lastPlayerChunkPos = new THREE.Vector3(Infinity, Infinity, Infinity); // Track player chunk pos
        this.initialLoadComplete = false;
    }

    // Converts world coordinates to chunk coordinates
    worldPosToChunkPos(pos) {
        return new THREE.Vector3(
            Math.floor(pos.x / CHUNK_SIZE),
            Math.floor(pos.y / CHUNK_SIZE),
            Math.floor(pos.z / CHUNK_SIZE)
        );
    }

    // Generates initial flat terrain (Milestone 1) - Replace with noise later
    generate() {
        // For now, let chunk generation happen dynamically on load
        console.log("World generator initialized (dynamic loading).");
    }

    getChunk(chunkX, chunkY, chunkZ) {
        const key = `${chunkX},${chunkY},${chunkZ}`;
        return this.chunks[key];
    }

    setChunk(chunkX, chunkY, chunkZ, chunk) {
        const key = `${chunkX},${chunkY},${chunkZ}`;
        this.chunks[key] = chunk;
    }

    // Get voxel data at world coordinates
    getVoxel(x, y, z) {
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkY = Math.floor(y / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const chunk = this.getChunk(chunkX, chunkY, chunkZ);

        if (chunk) {
            const voxelX = x - chunkX * CHUNK_SIZE;
            const voxelY = y - chunkY * CHUNK_SIZE;
            const voxelZ = z - chunkZ * CHUNK_SIZE;
            return chunk.getVoxel(voxelX, voxelY, voxelZ);
        }
        return 0; // Air if chunk doesn't exist
    }

    // Set voxel data at world coordinates
    setVoxel(x, y, z, value) {
       const chunkX = Math.floor(x / CHUNK_SIZE);
       const chunkY = Math.floor(y / CHUNK_SIZE);
       const chunkZ = Math.floor(z / CHUNK_SIZE);
       const chunk = this.getChunk(chunkX, chunkY, chunkZ);

       if (chunk) {
           const voxelX = x - chunkX * CHUNK_SIZE;
           const voxelY = y - chunkY * CHUNK_SIZE;
           const voxelZ = z - chunkZ * CHUNK_SIZE;
           chunk.setVoxel(voxelX, voxelY, voxelZ, value);
           // Need to update this chunk's mesh and potentially neighbors
           this.updateChunkGeometry(chunkX, chunkY, chunkZ);

            // Update neighboring chunk meshes if the block was on a border
           if (voxelX === 0) this.updateChunkGeometry(chunkX - 1, chunkY, chunkZ);
           if (voxelX === CHUNK_SIZE - 1) this.updateChunkGeometry(chunkX + 1, chunkY, chunkZ);
           if (voxelY === 0) this.updateChunkGeometry(chunkX, chunkY - 1, chunkZ);
           if (voxelY === CHUNK_SIZE - 1) this.updateChunkGeometry(chunkX, chunkY + 1, chunkZ);
           if (voxelZ === 0) this.updateChunkGeometry(chunkX, chunkY, chunkZ - 1);
           if (voxelZ === CHUNK_SIZE - 1) this.updateChunkGeometry(chunkX, chunkY, chunkZ + 1);

           return true; // Successfully set voxel
       }
       return false; // Chunk doesn't exist
    }


     // Add existing chunks to the scene (used initially)
     addToScene(scene) {
        for (const key in this.chunkMeshes) {
             if (this.chunkMeshes.hasOwnProperty(key)) {
                 scene.add(this.chunkMeshes[key]);
             }
         }
     }

    // Load/Unload chunks around the player
    async updateChunksAroundPlayer(playerChunkPos, scene) {
        const chunksToLoad = new Set();
        const currentChunks = new Set(Object.keys(this.chunks)); // Keys are "x,y,z"

        // Determine chunks that should be loaded
        for (let x = -RENDER_DISTANCE; x <= RENDER_DISTANCE; x++) {
            for (let y = -RENDER_DISTANCE; y <= RENDER_DISTANCE; y++) { // Adjust vertical range if needed
                for (let z = -RENDER_DISTANCE; z <= RENDER_DISTANCE; z++) {
                    const chunkX = playerChunkPos.x + x;
                    const chunkY = playerChunkPos.y + y;
                    const chunkZ = playerChunkPos.z + z;
                    const key = `${chunkX},${chunkY},${chunkZ}`;
                    chunksToLoad.add(key);

                    // If chunk doesn't exist, create and generate it
                    if (!this.chunks[key]) {
                        const newChunk = new Chunk(chunkX, chunkY, chunkZ);
                        // *** Placeholder: Simple flat terrain generation ***
                        // Replace with Perlin/Simplex noise later
                        for (let vx = 0; vx < CHUNK_SIZE; vx++) {
                            for (let vz = 0; vz < CHUNK_SIZE; vz++) {
                                const groundHeight = 8; // Simple flat ground at y=8
                                for (let vy = 0; vy < CHUNK_SIZE; vy++) {
                                    const worldY = chunkY * CHUNK_SIZE + vy;
                                    if (worldY < groundHeight) {
                                        newChunk.setVoxel(vx, vy, vz, worldY < groundHeight - 3 ? 3 : (worldY < groundHeight -1 ? 2 : 1)); // 3=Stone, 2=Dirt, 1=Grass
                                    } else {
                                        newChunk.setVoxel(vx, vy, vz, 0); // Air
                                    }
                                }
                            }
                        }
                        this.setChunk(chunkX, chunkY, chunkZ, newChunk);
                        // Generate mesh immediately for simplicity now, use worker later
                        this.updateChunkGeometry(chunkX, chunkY, chunkZ);
                    }

                    // Add mesh to scene if it exists but isn't added yet
                    if (this.chunkMeshes[key] && !this.chunkMeshes[key].parent) {
                         scene.add(this.chunkMeshes[key]);
                    }
                }
            }
        }

        // Determine chunks to unload
        for (const key of currentChunks) {
            if (!chunksToLoad.has(key)) {
                const mesh = this.chunkMeshes[key];
                if (mesh) {
                    scene.remove(mesh);
                    // Dispose geometry/material if needed, but removing from scene is often enough for now
                    // mesh.geometry.dispose();
                    // mesh.material.dispose();
                }
                // Optionally delete chunk data too for memory saving, but keep it for now
                // delete this.chunks[key];
                // delete this.chunkMeshes[key];
                console.log(`Unloaded chunk: ${key}`);
            }
        }

        // Wait for any asynchronous operations if needed (e.g., web workers)
        // For now, generation is synchronous
        return Promise.resolve();
    }

     // Update or create the mesh for a specific chunk
     updateChunkGeometry(chunkX, chunkY, chunkZ) {
        const key = `${chunkX},${chunkY},${chunkZ}`;
        const chunk = this.getChunk(chunkX, chunkY, chunkZ);
        if (!chunk) return; // Chunk doesn't exist, nothing to update

        const { geometry, material } = chunk.createMesh(this); // Pass world for neighbor checks

        // Dispose old geometry if it exists
        if (this.chunkMeshes[key]) {
            this.chunkMeshes[key].geometry.dispose();
            // Material can often be reused
        }

        if (geometry.attributes.position.count > 0) { // Only create mesh if there's geometry
             const mesh = new THREE.Mesh(geometry, material);
             mesh.position.set(chunkX * CHUNK_SIZE, chunkY * CHUNK_SIZE, chunkZ * CHUNK_SIZE);
             mesh.name = `chunk_${key}`; // For debugging

             // If mesh already existed in scene, replace its geometry and material
             if (this.chunkMeshes[key] && this.chunkMeshes[key].parent) {
                 const oldMesh = this.chunkMeshes[key];
                 oldMesh.geometry = geometry;
                 oldMesh.material = material; // Update material if needed
             } else if (this.chunkMeshes[key]) { // Existed but wasn't in scene
                 this.chunkMeshes[key].geometry = geometry;
                 this.chunkMeshes[key].material = material;
                 // Don't add to scene here, updateChunksAroundPlayer handles adding/removing
             } else { // New mesh
                 this.chunkMeshes[key] = mesh;
                 // Don't add to scene here, updateChunksAroundPlayer handles adding/removing
             }
        } else {
             // No visible faces, remove mesh if it exists
             if (this.chunkMeshes[key] && this.chunkMeshes[key].parent) {
                 this.chunkMeshes[key].parent.remove(this.chunkMeshes[key]);
             }
             if (this.chunkMeshes[key]) {
                 this.chunkMeshes[key].geometry.dispose(); // Dispose geometry
             }
             delete this.chunkMeshes[key]; // Remove reference
        }
     }
}

