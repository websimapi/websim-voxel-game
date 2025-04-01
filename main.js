import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { World } from './world.js';
import { Player } from './player.js';
import { BlockData } from './blockdata.js'; // Import BlockData

// Basic Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Set background color explicitly
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// World
const world = new World();
// world.generate(); // Generation happens dynamically now
// world.addToScene(scene); // Chunks added dynamically

// Make world accessible globally for now (needed for player block interaction)
window.world = world; // TODO: Refactor this later to avoid global scope pollution

// Player
const player = new Player(camera);
// scene.add(player.camera); // Camera is already added via controls.getObject()

// Controls
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

// Add listener for pointer lock activation
const menu = document.getElementById('menu');
const blocker = document.getElementById('blocker');

controls.addEventListener('lock', function () {
    menu.style.display = 'none';
    blocker.style.display = 'none';
    console.log('Pointer locked');
});

controls.addEventListener('unlock', function () {
    blocker.style.display = 'block';
    menu.style.display = ''; // Re-enable display (uses default CSS)
    console.log('Pointer unlocked');
});

// Handle click to lock pointer
blocker.addEventListener('click', function () {
    controls.lock();
});


// Lighting
const ambientLight = new THREE.AmbientLight(0xcccccc, 0.8); // Increased ambient light a bit
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
directionalLight.position.set(1, 1, 0.5).normalize();
scene.add(directionalLight);

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);

// -- DEBUG CUBE --
// Add a simple cube to verify basic rendering
const testGeo = new THREE.BoxGeometry(1, 1, 1);
const testMat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Bright red, no lighting needed
const testCube = new THREE.Mesh(testGeo, testMat);
testCube.position.set(5, 11, 5); // Place it near the player start, slightly above ground
scene.add(testCube);
console.log("Added debug cube to scene at (5, 11, 5)");
// --- END DEBUG CUBE ---


// Game Loop
let lastTime = performance.now();
// const clock = new THREE.Clock(); // Clock is defined here (but not used currently)
const loadingElement = document.getElementById('loading'); // Get loading element


function animate() {
    requestAnimationFrame(animate);

    const currentTime = performance.now();
    const deltaTime = Math.min(0.05, (currentTime - lastTime) / 1000); // Clamp delta time
    lastTime = currentTime;

    // Update player only if controls are locked
    if (controls.isLocked === true) {
        player.update(deltaTime, world, controls);
    }


    // Check for chunk loading/unloading based on player position
    const playerChunkPos = world.worldPosToChunkPos(player.camera.position);
    // Check if chunk position changed OR initial load isn't complete yet
    if ((!playerChunkPos.equals(world.lastPlayerChunkPos) || !world.initialLoadComplete) && world.initialLoadComplete) { // Only trigger updates after initial load finishes
        // Prevent spamming updates if player moves quickly across chunk boundaries
        // A small delay or checking a flag could be added here if needed.
        // For now, we rely on the async nature and the check at the start.
        loadingElement.style.display = 'block';
        loadingElement.innerText = 'Loading chunks...';

        // Use setTimeout to allow the loading message to render before potentially blocking thread
        // (though async/await helps mitigate blocking)
        setTimeout(() => {
            world.updateChunksAroundPlayer(playerChunkPos, scene)
                .then(() => {
                    console.log(`Chunk update around ${playerChunkPos.x},${playerChunkPos.y},${playerChunkPos.z} complete.`);
                    world.lastPlayerChunkPos.copy(playerChunkPos);
                    // Hiding the loading message might happen too quickly if updates are fast,
                    // but let's hide it on success for now.
                    loadingElement.style.display = 'none';
                })
                .catch(error => {
                    console.error("Error updating chunks:", error);
                    loadingElement.innerText = 'Error loading chunks!';
                    loadingElement.style.display = 'block'; // Keep showing error
                    // Potentially stop trying to update for a bit?
                });
        }, 10); // Short delay
    } else if (loadingElement.style.display !== 'none' && world.initialLoadComplete) { // Hide if not updating and initial load done
        loadingElement.style.display = 'none';
    }


    renderer.render(scene, camera);
}

// Initial chunk loading before starting animation loop
const initialPlayerChunkPos = world.worldPosToChunkPos(player.camera.position);
console.log("Starting initial chunk load...");
loadingElement.innerText = 'Loading initial world...';
loadingElement.style.display = 'block';

world.updateChunksAroundPlayer(initialPlayerChunkPos, scene)
    .then(() => {
        console.log("Initial chunk load complete.");
        loadingElement.style.display = 'none';
        world.initialLoadComplete = true;
        world.lastPlayerChunkPos.copy(initialPlayerChunkPos);
        // Ensure player starts on ground after initial terrain is loaded
        player.camera.position.y = 10.5; // Start slightly higher to avoid immediate ground collision issues
        player.velocity.set(0, 0, 0);
        player.onGround = false; // Force ground check on first frame
        player.canJump = true; // Allow jumping right away if on ground
        animate(); // Start the game loop after initial load
    })
    .catch(error => {
        console.error("Initial chunk loading failed:", error);
        loadingElement.innerText = 'FATAL: Error loading world!';
        // Optionally display the error to the user more permanently
    });
