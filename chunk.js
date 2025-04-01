import * as THREE from 'three';
import { CHUNK_SIZE } from './world.js';
import { BlockData } from './blockdata.js';

// Simple Texture Atlas Setup
const material = new THREE.MeshLambertMaterial({
    map: BlockData.texture, // Assign the generated texture atlas
    side: THREE.DoubleSide, // DEBUG: Render both sides to spot issues easily. Remove for production.
    alphaTest: 0.1, // Needed if using transparency later
    // transparent: true, // Needed if using transparency later
    // vertexColors: false, // Explicitly false, map takes precedence
});

export class Chunk {
    constructor(chunkX, chunkY, chunkZ) {
        this.chunkX = chunkX;
        this.chunkY = chunkY;
        this.chunkZ = chunkZ;
        // Use a flat array for voxel data for efficiency
        this.voxels = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE).fill(0); // 0 = air
        // this.mesh = null; // Mesh is stored in world.chunkMeshes
    }

    // Get voxel at local chunk coordinates
    getVoxel(x, y, z) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) {
            // Correctly delegate to world for out-of-bounds checks during mesh generation
            // If called internally for non-meshing logic, this might need adjustment.
            // But for meshing, returning 0 (air) is usually incorrect. Let world handle it.
            // For now, return 0 as meshing logic calls getVoxelData -> world.getVoxel anyway.
            return 0;
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
        // let indexOffset = 0; // Not needed if using ndx directly

        // Helper to get voxel data, checking neighbors via world object
        const getVoxelData = (x, y, z) => {
            // Check if coords are within this chunk
            if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
                const index = y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
                return this.voxels[index];
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
                    const voxelType = this.voxels[y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x]; // Direct access faster

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
                             // UV order needs to match corner order: BL, BR, TL, TR
                             // BlockFaceUVs returns: [u0, v0, u1, v0, u0, v1, u1, v1]
                             // We need to push them individually: u0,v0, u1,v0, u0,v1, u1,v1
                             uvs.push(faceUVs[0], faceUVs[1]); // BL
                             uvs.push(faceUVs[2], faceUVs[3]); // BR
                             uvs.push(faceUVs[4], faceUVs[5]); // TL
                             uvs.push(faceUVs[6], faceUVs[7]); // TR


                            // Add indices for the two triangles of the quad
                            indices.push(
                                ndx, ndx + 1, ndx + 2, // First triangle (BL, BR, TL)
                                ndx + 2, ndx + 1, ndx + 3  // Second triangle (TL, BR, TR)
                            );
                           // indexOffset += 6; // Not needed
                        }
                    }
                }
            }
        }

        const geometry = new THREE.BufferGeometry();
        if (positions.length > 0) {
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geometry.setIndex(indices);
            geometry.computeBoundingSphere(); // Important for frustum culling
        }

        // Return geometry and the shared material
        return { geometry, material };
    }
}