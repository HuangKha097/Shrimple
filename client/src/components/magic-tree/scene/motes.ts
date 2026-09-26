import * as THREE from 'three';
import { makeRng } from './rng';
import type { QrMatrix } from './qr';
import type { Palette, SeasonId } from './palette';

const COUNT = 90;
const RAIN_COUNT = 340;

export interface Motes {
  group: THREE.Group;
  points: THREE.InstancedMesh;
  rainMesh: THREE.InstancedMesh;
  update: (dt: number, time: number, visibility: number) => void;
  applyPalette: (p: Palette) => void;
  dispose: () => void;
}

/** Drifting petals/leaves and autumn rain streaks. */
export function buildMotes(qr: QrMatrix, palette: Palette): Motes {
  const group = new THREE.Group();
  const rng = makeRng(0xfa11);
  const spread = qr.plot * 0.5;
  const ceiling = qr.plot * 0.75;
  let currentSeason: SeasonId = palette.id;

  // ---- 1. Drifting Petals / Leaves -------------------------------------
  const geo = new THREE.BoxGeometry(0.34, 0.1, 0.26);
  const mat = new THREE.MeshLambertMaterial({ transparent: true });
  const points = new THREE.InstancedMesh(geo, mat, COUNT);
  points.frustumCulled = false;
  group.add(points);

  const state = new Float32Array(COUNT * 6); // x, y, z, fallSpeed, swirl, phase

  for (let i = 0; i < COUNT; i++) {
    state[i * 6] = (rng() - 0.5) * spread * 1.6;
    state[i * 6 + 1] = rng() * ceiling;
    state[i * 6 + 2] = (rng() - 0.5) * spread * 1.6;
    state[i * 6 + 3] = 0.8 + rng() * 1.5;
    state[i * 6 + 4] = 0.3 + rng() * 0.9;
    state[i * 6 + 5] = rng() * Math.PI * 2;
  }

  // ---- 2. Autumn Rain System -------------------------------------------
  const rainGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.25, 4);
  rainGeo.translate(0, 0.625, 0);
  const rainMat = new THREE.MeshBasicMaterial({
    color: 0xb5d3f2,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const rainMesh = new THREE.InstancedMesh(rainGeo, rainMat, RAIN_COUNT);
  rainMesh.frustumCulled = false;
  rainMesh.visible = false;
  group.add(rainMesh);

  const rainSpread = qr.plot * 0.75;
  const rainCeiling = qr.plot * 1.15;
  const rainState = new Float32Array(RAIN_COUNT * 6); // x, y, z, speed, length, phase

  const rainRng = makeRng(0x7a11);
  for (let i = 0; i < RAIN_COUNT; i++) {
    rainState[i * 6] = (rainRng() - 0.5) * rainSpread * 2.2;
    rainState[i * 6 + 1] = rainRng() * rainCeiling + 1;
    rainState[i * 6 + 2] = (rainRng() - 0.5) * rainSpread * 2.2;
    rainState[i * 6 + 3] = 30 + rainRng() * 24; // Fast fall speed
    rainState[i * 6 + 4] = 0.75 + rainRng() * 0.55;
    rainState[i * 6 + 5] = rainRng() * Math.PI * 2;
  }

  const applyPalette = (p: Palette) => {
    currentSeason = p.id;
    const rngC = makeRng(0xbeef);
    const pool = p.leaf.map((c) => new THREE.Color(c));
    for (let i = 0; i < COUNT; i++) {
      points.setColorAt(i, pool[Math.floor(rngC() * pool.length)]);
    }
    if (points.instanceColor) points.instanceColor.needsUpdate = true;
  };

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();

  const rM = new THREE.Matrix4();
  const rPos = new THREE.Vector3();
  const rScl = new THREE.Vector3();
  const rQuat = new THREE.Quaternion();
  const rEuler = new THREE.Euler();

  const update = (dt: number, time: number, visibility: number) => {
    // 1. Drifting motes
    mat.opacity = visibility;
    points.visible = visibility > 0.02;
    if (points.visible) {
      for (let i = 0; i < COUNT; i++) {
        const o = i * 6;
        state[o + 1] -= state[o + 3] * dt;
        if (state[o + 1] < 0.2) {
          state[o + 1] = ceiling;
          state[o] = (rng() - 0.5) * spread * 1.6;
          state[o + 2] = (rng() - 0.5) * spread * 1.6;
        }

        const swirl = state[o + 4];
        pos.set(
          state[o] + Math.sin(time * swirl + state[o + 5]) * 0.9,
          state[o + 1],
          state[o + 2] + Math.cos(time * swirl * 0.8 + state[o + 5]) * 0.9,
        );
        euler.set(time * swirl, time * swirl * 0.7, state[o + 5]);
        quat.setFromEuler(euler);
        scl.setScalar(1);
        m.compose(pos, quat, scl);
        points.setMatrixAt(i, m);
      }
      points.instanceMatrix.needsUpdate = true;
    }

    // 2. Autumn Rain Effect
    const isAutumn = currentSeason === 'autumn';
    if (isAutumn && visibility > 0.02) {
      rainMesh.visible = true;
      rainMat.opacity = visibility * 0.58;

      // Diagonally wind-blown rain angle
      const windTiltZ = -0.22;
      const windTiltX = 0.12;

      for (let i = 0; i < RAIN_COUNT; i++) {
        const o = i * 6;
        // Fall down fast
        rainState[o + 1] -= rainState[o + 3] * dt;
        // Drift with wind
        rainState[o] += 6.5 * dt;
        rainState[o + 2] += 2.5 * dt;

        // Reset if hitting ground
        if (rainState[o + 1] < -0.1) {
          rainState[o + 1] = rainCeiling + rainRng() * 5;
          rainState[o] = (rainRng() - 0.5) * rainSpread * 2.2 - 6; // start upwind
          rainState[o + 2] = (rainRng() - 0.5) * rainSpread * 2.2 - 3;
        }

        rPos.set(rainState[o], rainState[o + 1], rainState[o + 2]);
        rEuler.set(windTiltX, 0, windTiltZ);
        rQuat.setFromEuler(rEuler);
        rScl.set(1, rainState[o + 4], 1);
        rM.compose(rPos, rQuat, rScl);
        rainMesh.setMatrixAt(i, rM);
      }
      rainMesh.instanceMatrix.needsUpdate = true;
    } else {
      rainMesh.visible = false;
    }
  };

  applyPalette(palette);

  return {
    group,
    points,
    rainMesh,
    update,
    applyPalette,
    dispose: () => {
      geo.dispose();
      mat.dispose();
      rainGeo.dispose();
      rainMat.dispose();
    },
  };
}
