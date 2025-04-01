import * as THREE from 'three';
import { CHUNK_SIZE } from './world.js';
import { BlockData } from './blockdata.js';
import { PlayerControls } from './playerControls.js';
import { PlayerInteraction } from './playerInteraction.js';

export const PLAYER_HEIGHT = 1.8;
export const PLAYER_WIDTH = 0.6;
const GRAVITY = 9.8 * 2;
const MAX_STEP_HEIGHT = 0.25;

export class Player {
    constructor(camera, world) {
        this.camera = camera;
        this.world = world;
        this.velocity = new THREE.Vector3();
        this.onGround = false;

        this.camera.position.set(
            CHUNK_SIZE / 2,
            10,
            CHUNK_SIZE / 2
        );

        this.controls = new PlayerControls(this);
        this.interaction = new PlayerInteraction(this.camera, this.world);

        this._addEventListeners();
    }

    _addEventListeners() {
        this.controls.connect(document);
        this.interaction.connect(document);
    }

    _checkCollision(moveDirection) {
        const halfWidth = PLAYER_WIDTH / 2;
        const playerPos = this.camera.position;

        const checkPos = playerPos.clone().add(moveDirection);

        const pointsToCheck = [
            new THREE.Vector3(checkPos.x - halfWidth, checkPos.y - PLAYER_HEIGHT + 0.1, checkPos.z - halfWidth),
            new THREE.Vector3(checkPos.x + halfWidth, checkPos.y - PLAYER_HEIGHT + 0.1, checkPos.z - halfWidth),
            new THREE.Vector3(checkPos.x - halfWidth, checkPos.y - PLAYER_HEIGHT + 0.1, checkPos.z + halfWidth),
            new THREE.Vector3(checkPos.x + halfWidth, checkPos.y - PLAYER_HEIGHT + 0.1, checkPos.z + halfWidth),
            new THREE.Vector3(checkPos.x - halfWidth, checkPos.y - 0.1, checkPos.z - halfWidth),
            new THREE.Vector3(checkPos.x + halfWidth, checkPos.y - 0.1, checkPos.z - halfWidth),
            new THREE.Vector3(checkPos.x - halfWidth, checkPos.y - 0.1, checkPos.z + halfWidth),
            new THREE.Vector3(checkPos.x + halfWidth, checkPos.y - 0.1, checkPos.z + halfWidth),
        ];

        return this._checkCollisionPoints(pointsToCheck);
    }

    _checkCollisionPoints(points) {
        for (const point of points) {
            const blockX = Math.floor(point.x);
            const blockY = Math.floor(point.y);
            const blockZ = Math.floor(point.z);
            const voxel = this.world.getVoxel(blockX, blockY, blockZ);
            if (BlockData.isSolid(voxel)) {
                return true;
            }
        }
        return false;
    }

    update(deltaTime, controls) {
        this.interaction.update(controls);

        const { horizontalMovement, didJump } = this.controls.update(controls, deltaTime);
        if (didJump) {
            this.onGround = false;
        }

        this.velocity.y -= GRAVITY * deltaTime;

        const currentPos = this.camera.position.clone();
        let nextPos = currentPos.clone();

        const moveX = new THREE.Vector3(horizontalMovement.x, 0, 0);
        if (!this._checkCollision(moveX)) {
            nextPos.add(moveX);
        } else {
            this.velocity.x = 0;
        }

        const intermediatePosAfterX = nextPos.clone();
        const moveZ = new THREE.Vector3(0, 0, horizontalMovement.z);
        const checkOffsetZ = moveZ.clone().add(intermediatePosAfterX).sub(currentPos);
        if (!this._checkCollision(checkOffsetZ)) {
            nextPos.add(moveZ);
        } else {
            this.velocity.z = 0;
        }

        const moveY = new THREE.Vector3(0, this.velocity.y * deltaTime, 0);
        const checkPosVertical = nextPos.clone();
        const verticalCheckOffset = moveY.clone().add(checkPosVertical).sub(currentPos);

        if (!this._checkCollision(verticalCheckOffset)) {
            nextPos.add(moveY);
            this.onGround = false;
        } else {
            if (this.velocity.y <= 0) {
                nextPos.y = Math.floor(nextPos.y + moveY.y - PLAYER_HEIGHT + 1) + PLAYER_HEIGHT - 0.001;
                this.onGround = true;
                this.velocity.y = 0;
                this.controls.canJump = true;
            } else {
                nextPos.y = Math.floor(nextPos.y + moveY.y) - 0.001;
                this.velocity.y = 0;
                this.onGround = false;
            }
        }

        this.camera.position.copy(nextPos);
    }
}