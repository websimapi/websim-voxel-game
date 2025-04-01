import * as THREE from 'three';

// Define block types and their properties
const BlockTypes = {
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
    // Add more blocks here...
};

const TILE_SIZE = 16; // Pixels per tile in the atlas
const ATLAS_WIDTH_TILES = 4; // How many tiles wide is the atlas
const ATLAS_HEIGHT_TILES = 4; // How many tiles high is the atlas
const ATLAS_TEXTURE_WIDTH = TILE_SIZE * ATLAS_WIDTH_TILES;
const ATLAS_TEXTURE_HEIGHT = TILE_SIZE * ATLAS_HEIGHT_TILES;
const TILE_UV_WIDTH = 1 / ATLAS_WIDTH_TILES;
const TILE_UV_HEIGHT = 1 / ATLAS_HEIGHT_TILES;

// Placeholder: UV coordinates for different blocks/faces
// These assume a specific layout in the texture atlas
// Example: 4x4 atlas (Grass Top, Side, Bottom, Dirt, Stone)
const UVs = {
    [BlockTypes.GRASS]: {
        top: [0, 0], // Top-left tile
        side: [1, 0], // Second tile on top row
        bottom: [2, 0], // Third tile on top row
    },
    [BlockTypes.DIRT]: {
        all: [2, 0], // Use dirt texture for all sides
    },
    [BlockTypes.STONE]: {
         all: [3, 0], // Fourth tile on top row
    },
    // Define UVs for other blocks...
};

// Function to get UV coordinates for a specific tile [col, row]
function getUVsForTile(col, row) {
    const u = col * TILE_UV_WIDTH;
    const v = 1.0 - (row + 1) * TILE_UV_HEIGHT; // V is inverted in texture coords (0 is bottom)

    // Return UVs for the 4 corners of a quad [bottom-left, bottom-right, top-left, top-right]
    return [
        u, v,                         // Bottom-left
        u + TILE_UV_WIDTH, v,          // Bottom-right
        u, v + TILE_UV_HEIGHT,        // Top-left
        u + TILE_UV_WIDTH, v + TILE_UV_HEIGHT, // Top-right
    ];
}

// Precompute UVs for all blocks and faces
const BlockFaceUVs = {};
for (const type in BlockTypes) {
    const typeId = BlockTypes[type];
    if (typeId === BlockTypes.AIR) continue;

    BlockFaceUVs[typeId] = {};
    const uvData = UVs[typeId];

    if (uvData.all) {
        const uvs = getUVsForTile(...uvData.all);
        BlockFaceUVs[typeId].top = uvs;
        BlockFaceUVs[typeId].bottom = uvs;
        BlockFaceUVs[typeId].side = uvs;
    } else {
        BlockFaceUVs[typeId].top = getUVsForTile(...uvData.top);
        BlockFaceUVs[typeId].bottom = getUVsForTile(...uvData.bottom);
        BlockFaceUVs[typeId].side = getUVsForTile(...uvData.side);
    }
}


// Create a placeholder texture atlas using Canvas
function createTextureAtlas() {
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_TEXTURE_WIDTH;
    canvas.height = ATLAS_TEXTURE_HEIGHT;
    const context = canvas.getContext('2d');

    // Fill background (optional, for debugging)
    context.fillStyle = 'rgba(100, 100, 255, 0.5)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const drawTile = (col, row, color, text) => {
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        context.fillStyle = color;
        context.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        context.strokeStyle = 'black';
        context.strokeRect(x+0.5, y+0.5, TILE_SIZE-1, TILE_SIZE-1);
         // Add text label (for debugging)
         context.fillStyle = 'black';
         context.font = `${TILE_SIZE*0.5}px sans-serif`;
         context.textAlign = 'center';
         context.textBaseline = 'middle';
         context.fillText(text, x + TILE_SIZE / 2, y + TILE_SIZE / 2);
    };

    // Draw placeholder textures based on UVs definitions
    drawTile(0, 0, '#38a138', 'G T'); // Grass Top
    drawTile(1, 0, '#8a5a2b', 'G S'); // Grass Side
    drawTile(2, 0, '#5e3a1d', 'Dirt'); // Dirt (Grass Bottom)
    drawTile(3, 0, '#808080', 'Ston'); // Stone

    // Add more tiles as needed...


    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter; // Pixelated look
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true; // Ensure THREE uses the updated canvas
    return texture;
}


export const BlockData = {
    types: BlockTypes,
    texture: createTextureAtlas(), // Generate and assign the texture

    // Define geometry for a standard cube face (adjust winding order if needed)
    // Order: Bottom-left, Bottom-right, Top-left, Top-right relative to face normal
    faces: [
        // Right face (+X)
        { dir: [ 1,  0,  0], corners: [[1, 0, 0], [1, 0, 1], [1, 1, 0], [1, 1, 1]], uvIndex: 'side' },
        // Left face (-X)
        { dir: [-1,  0,  0], corners: [[0, 0, 1], [0, 0, 0], [0, 1, 1], [0, 1, 0]], uvIndex: 'side' },
        // Top face (+Y)
        { dir: [ 0,  1,  0], corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]], uvIndex: 'top' },
        // Bottom face (-Y)
        { dir: [ 0, -1,  0], corners: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]], uvIndex: 'bottom' },
        // Back face (+Z)
        { dir: [ 0,  0,  1], corners: [[1, 0, 1], [0, 0, 1], [1, 1, 1], [0, 1, 1]], uvIndex: 'side' },
        // Front face (-Z)
        { dir: [ 0,  0, -1], corners: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]], uvIndex: 'side' },
    ],

    isSolid: (voxelType) => {
        return voxelType !== BlockTypes.AIR;
    },

    // Returns the 8 UV coordinates (4 pairs) for a given block type and face type ('top', 'bottom', 'side')
    getFaceUVs: (blockType, faceTypeKey) => {
         const blockUVs = BlockFaceUVs[blockType];
         if (!blockUVs) return [0, 0, 1, 0, 0, 1, 1, 1]; // Default: full texture if block unknown
         const faceUVData = blockUVs[faceTypeKey] || blockUVs.side; // Default to side if specific face not found
         return faceUVData;
    }
};

// Make world accessible globally for mouse click events (temporary solution)
window.BlockData = BlockData;

