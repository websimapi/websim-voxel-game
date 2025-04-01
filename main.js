import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { World } from './world.js';
import { Player } from './player.js';

// Basic Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// World
const world = new World();
// Make world accessible globally FOR NOW (needed for interaction module)
// TODO: Pass world reference properly instead of relying on global
window.world = world;

// Player (Pass camera and world)
const player = new Player(camera, world);
// Player constructor now handles setting initial camera position

// Controls
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject()); // Add the controls object (which contains the camera) to the scene

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
    menu.style.display = '';
    console.log('Pointer unlocked');
    // Stop player breaking action if pointer is unlocked
    player.interaction._stopBreaking(); // Access the interaction module's stop function
});

// Handle click to lock pointer
blocker.addEventListener('click', function () {
    controls.lock();
});

// Lighting
const ambientLight = new THREE.AmbientLight(0xcccccc, 0.8);
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

// Remove DEBUG CUBE if no longer needed
const testCube = scene.getObjectByName("debug_cube"); // Assuming we named it before
if (testCube) {
    scene.remove(testCube);
    testCube.geometry.dispose();
    testCube.material.dispose();
    console.log("Removed debug cube.");
}
// --- END DEBUG CUBE ---


// Game Loop
let lastTime = performance.now();
const loadingElement = document.getElementById('loading');

function animate() {
    requestAnimationFrame(animate);

    const currentTime = performance.now();
    const deltaTime = Math.min(0.05, (currentTime - lastTime) / 1000); // Clamp delta time
    lastTime = currentTime;

    // Update player only if controls are locked
    // The Player.update method now orchestrates controls, interaction, and physics
    if (controls.isLocked === true) {
        player.update(deltaTime, controls); // Pass controls object
    }

    // Check for chunk loading/unloading based on player position
    // Convert world position directly from camera as player object holds it
    const playerChunkPos = world.worldPosToChunkPos(player.camera.position);

    if ((!playerChunkPos.equals(world.lastPlayerChunkPos) || !world.initialLoadComplete) && world.initialLoadComplete) {
        loadingElement.style.display = 'block';
        loadingElement.innerText = 'Loading chunks...';

        setTimeout(() => {
            world.updateChunksAroundPlayer(playerChunkPos, scene)
                .then(() => {
                    world.lastPlayerChunkPos.copy(playerChunkPos);
                    loadingElement.style.display = 'none';
                })
                .catch(error => {
                    console.error("Error updating chunks:", error);
                    loadingElement.innerText = 'Error loading chunks!';
                    loadingElement.style.display = 'block';
                });
        }, 10);
    } else if (loadingElement.style.display !== 'none' && world.initialLoadComplete) {
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
        // Player constructor now sets initial position, but we ensure ground state after load
        player.velocity.set(0, 0, 0);
        player.onGround = false; // Force ground check on first proper update
        player.controls.canJump = true; // Ensure jump is possible if starting on ground
        // We might need a small delay or a single physics step here to ensure player snaps to ground
        // before the first render if they start slightly above. Or adjust start Y pos carefully.
        player.update(0.01, controls); // Run a tiny update step to potentially snap to ground

        animate(); // Start the game loop after initial load
    })
    .catch(error => {
        console.error("Initial chunk loading failed:", error);
        loadingElement.innerText = 'FATAL: Error loading world!';
    });