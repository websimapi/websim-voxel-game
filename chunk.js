import * as THREE from 'three';
import { CHUNK_SIZE } from './world.js';
import { BlockData } from './blockdata.js';

// Simple Texture Atlas Setup (replace with actual texture later)
const textureLoader = new THREE.TextureLoader();
// For now, use colors per block type - load a proper atlas later
// We need a material that supports vertex colors for now
const material = new THREE.MeshLambertMaterial({
    vertexColors: true, // Use vertex colors until texture atlas is ready
    // map: textureLoader.load('texture_atlas.png'), // Replace with actual atlas path
    // side: THREE.DoubleSide, // Useful for debugging, remove for performance
    // alphaTest: 0.1, // Needed if using transparency
    // transparent: true, // Needed if using transparency
});

material.map = BlockData.texture; // Assign loaded texture


export class Chunk {
    constructor(chunkX, chunkY, chunkZ) {
        this.chunkX = chunkX;
        this.chunkY = chunkY;
        this.chunkZ = chunkZ;
        // Use a flat array for voxel data for efficiency
        this.voxels = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE).fill(0); // 0 = air
        this.mesh = null;
    }

    // Get voxel at local chunk coordinates
    getVoxel(x, y, z) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) {
            return 0; // Out of bounds is treated as air for local lookups
        }
        const index = y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
        return this.voxels[index];
    }

    // Set voxel at local chunk coordinates
    setVoxel(x, y, z, value) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) {
            console.warn(`Attempted to set voxel outside chunk bounds: ${x},${y},${z}`);
            return; // Out of bounds
        }
        const index = y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
        this.voxels[index] = value;
    }

    // Create mesh using Greedy Meshing (Simplified Version)
    createMesh(world) {
        const positions = [];
        const normals = [];
        const uvs = [];
        const indices = [];
        let indexOffset = 0;

        // Helper to get voxel data, checking neighbors via world object
        const getVoxelData = (x, y, z) => {
            // Check if coords are within this chunk
            if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
                return this.getVoxel(x, y, z);
            } else {
                // If outside, ask the world for the voxel data
                const worldX = this.chunkX * CHUNK_SIZE + x;
                const worldY = this.chunkY * CHUNK_SIZE + y;
                const worldZ = this.chunkZ * CHUNK_SIZE + z;
                return world.getVoxel(worldX, worldY, worldZ);
            }
        };

        // Iterate through each voxel in the chunk
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                for (let x = 0; x < CHUNK_SIZE; x++) {
                    const voxelType = this.getVoxel(x, y, z);

                    if (!BlockData.isSolid(voxelType)) {
                        continue; // Skip air blocks
                    }

                    // Check each face
                    for (const { dir, corners, uvIndex } of BlockData.faces) {
                        const neighborX = x + dir[0];
                        const neighborY = y + dir[1];
                        const neighborZ = z + dir[2];
                        const neighborType = getVoxelData(neighborX, neighborY, neighborZ);

                        // If neighbor is air or transparent, add this face
                        if (!BlockData.isSolid(neighborType)) {
                            const ndx = positions.length / 3; // Base index for vertices

                             // Add vertices for this face
                             for (const pos of corners) {
                                positions.push(pos[0] + x, pos[1] + y, pos[2] + z);
                                normals.push(...dir);
                             }

                             // Add UVs for this face from block data
                             const faceUVs = BlockData.getFaceUVs(voxelType, uvIndex);
                             uvs.push(...faceUVs);


                            // Add indices for the two triangles of the quad
                            indices.push(
                                ndx, ndx + 1, ndx + 2, // First triangle
                                ndx + 2, ndx + 1, ndx + 3  // Second triangle (ensure correct winding order based on corners)
                            );
                            indexOffset += 6;
                        }
                    }
                }
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere(); // Important for frustum culling

        // Return geometry and the shared material
        return { geometry, material };
    }
}

