import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { World } from './world.js';
import { Player } from './player.js';

// Basic Scene Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const loadingElement = document.getElementById('loading');

// Lighting
const ambientLight = new THREE.AmbientLight(0xcccccc, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
directionalLight.position.set(1, 1, 0.5).normalize();
scene.add(directionalLight);

// World
const world = new World();
world.generate(); // Generate initial flat terrain
world.addToScene(scene); // Add initial chunks to the scene

// Player
const player = new Player(camera);
scene.add(player.camera); // Add camera to scene

// Controls
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

document.addEventListener('click', () => {
    controls.lock();
});

controls.addEventListener('lock', () => {
    console.log('Pointer locked');
});

controls.addEventListener('unlock', () => {
    console.log('Pointer unlocked');
});

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);

// Game Loop
let lastTime = performance.now();
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const currentTime = performance.now();
    const deltaTime = (currentTime - lastTime) / 1000; // delta time in seconds
    lastTime = currentTime;

    // Update player (movement, collision) - Basic movement for now
    player.update(deltaTime, world, controls);

    // Check for chunk loading/unloading based on player position
    const playerChunkPos = world.worldPosToChunkPos(player.camera.position);
    if (!playerChunkPos.equals(world.lastPlayerChunkPos)) {
         loadingElement.style.display = 'block';
         world.updateChunksAroundPlayer(playerChunkPos, scene)
            .then(() => {
                loadingElement.style.display = 'none';
                world.lastPlayerChunkPos.copy(playerChunkPos);
            })
            .catch(error => {
                 console.error("Error updating chunks:", error);
                 loadingElement.innerText = 'Error loading chunks!';
            });
    } else if (loadingElement.style.display !== 'none' && world.initialLoadComplete) {
         loadingElement.style.display = 'none'; // Hide loading if it was showing but not needed
    }


    renderer.render(scene, camera);
}

// Initial chunk loading before starting animation loop
const initialPlayerChunkPos = world.worldPosToChunkPos(player.camera.position);
world.updateChunksAroundPlayer(initialPlayerChunkPos, scene)
    .then(() => {
        loadingElement.style.display = 'none';
        world.initialLoadComplete = true;
        world.lastPlayerChunkPos.copy(initialPlayerChunkPos);
        animate(); // Start the game loop after initial load
    })
    .catch(error => {
        console.error("Initial chunk loading failed:", error);
        loadingElement.innerText = 'Error loading world!';
    });

// ... existing imports ...
import { World } from './world.js';
import { Player } from './player.js';
import { BlockData } from './blockdata.js'; // Import BlockData

// ... existing scene setup ...

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
// ... existing controls setup ...

// ... existing lighting ...

// ... existing resize handler ...

// Game Loop
// ... existing game loop variables ...

function animate() {
    // ... existing animate logic ...

    // Check for chunk loading/unloading based on player position
    const playerChunkPos = world.worldPosToChunkPos(player.camera.position);
    if (!playerChunkPos.equals(world.lastPlayerChunkPos) && world.initialLoadComplete) { // Only update after initial load
         loadingElement.style.display = 'block';
         // Use setTimeout to allow the loading message to render before blocking thread
         setTimeout(() => {
             world.updateChunksAroundPlayer(playerChunkPos, scene)
                .then(() => {
                    loadingElement.style.display = 'none';
                    world.lastPlayerChunkPos.copy(playerChunkPos);
                })
                .catch(error => {
                     console.error("Error updating chunks:", error);
                     loadingElement.innerText = 'Error loading chunks!';
                     loadingElement.style.display = 'block'; // Keep showing error
                });
         }, 10); // Short delay
    } else if (loadingElement.style.display !== 'none' && world.initialLoadComplete && !world.isUpdatingChunks) { // Hide if not updating
         // Added check for isUpdatingChunks if using workers later
         loadingElement.style.display = 'none';
    }


    renderer.render(scene, camera);
}

// Initial chunk loading before starting animation loop
const initialPlayerChunkPos = world.worldPosToChunkPos(player.camera.position);
world.updateChunksAroundPlayer(initialPlayerChunkPos, scene)
    .then(() => {
        loadingElement.style.display = 'none';
        world.initialLoadComplete = true;
        world.lastPlayerChunkPos.copy(initialPlayerChunkPos);
        // Ensure player starts on ground after initial terrain is loaded
        player.camera.position.y = 10; // Reset height just in case
        player.velocity.set(0,0,0);
        player.onGround = false; // Force ground check on first frame
        player.canJump = true;
        animate(); // Start the game loop after initial load
    })
    .catch(error => {
        console.error("Initial chunk loading failed:", error);
        loadingElement.innerText = 'Error loading world!';
    });

