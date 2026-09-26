import * as THREE from 'three';
import { buildQr, moduleToWorld, QUIET_ZONE, type QrMatrix } from './qr';
import { CELL, HEDGE_RING } from './constants';
import { makeRng } from './rng';
import type { Palette } from './palette';

export interface PlotMeshes {
  group: THREE.Group;
  tiles: THREE.InstancedMesh;
  hedge: THREE.InstancedMesh;
  slab: THREE.Mesh;
  applyPalette: (p: Palette) => void;
  setMorph: (t: number, time: number) => void;
  dispose: () => void;
}

const HEDGE_BLADES = 1800;

/**
 * The ground plot: every module is a tile resting on the base slab,
 * bordered by the original grass hedge on the outer rim.
 * Completely free of overlapping geometry to eliminate all flickering.
 */
export function buildPlot(qr: QrMatrix, palette: Palette): PlotMeshes {
  const group = new THREE.Group();
  const plotUnits = qr.plot * CELL;
  const rimUnits = plotUnits + HEDGE_RING * 2 * CELL;

  // ---- 1. Base slab ----------------------------------------------------
  const slabGeo = new THREE.BoxGeometry(rimUnits, 0.9, rimUnits);
  const slabMat = new THREE.MeshLambertMaterial({ color: palette.slab });
  const slab = new THREE.Mesh(slabGeo, slabMat);
  slab.position.y = -0.45;
  slab.receiveShadow = true;
  group.add(slab);

  // ---- 2. Module tiles -------------------------------------------------
  const tileGeo = new THREE.BoxGeometry(CELL, 0.3, CELL);
  const tileMat = new THREE.MeshLambertMaterial();
  const total = qr.plot * qr.plot;
  const tiles = new THREE.InstancedMesh(tileGeo, tileMat, total);
  tiles.receiveShadow = true;
  tiles.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const m = new THREE.Matrix4();
  const darkFlags: boolean[] = new Array(total);
  let i = 0;

  for (let py = 0; py < qr.plot; py++) {
    for (let px = 0; px < qr.plot; px++) {
      const qx = px - QUIET_ZONE;
      const qy = py - QUIET_ZONE;
      const inside = qx >= 0 && qy >= 0 && qx < qr.size && qy < qr.size;
      const dark = inside ? qr.dark[qy * qr.size + qx] : false;
      darkFlags[i] = dark;

      const { x, z } = moduleToWorld(px, py, qr.plot, CELL);
      m.makeTranslation(x, dark ? -0.06 : -0.14, z);
      tiles.setMatrixAt(i, m);
      i++;
    }
  }
  tiles.instanceMatrix.needsUpdate = true;
  group.add(tiles);

  // ---- 3. Outer Hedge Rim ----------------------------------------------
  const hedge = buildHedge(plotUnits, rimUnits, palette);
  group.add(hedge);

  const setMorph = (_t: number, _time: number) => {};

  const applyPalette = (p: Palette) => {
    slabMat.color.set(p.slab);

    const dark = new THREE.Color(p.moduleDark);
    const light = new THREE.Color(p.moduleLight);
    for (let k = 0; k < total; k++) {
      tiles.setColorAt(k, darkFlags[k] ? dark : light);
    }
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;

    paintHedge(hedge, p);
  };

  applyPalette(palette);

  const dispose = () => {
    slabGeo.dispose();
    slabMat.dispose();
    tileGeo.dispose();
    tileMat.dispose();
    tiles.dispose();
    hedge.geometry.dispose();
    (hedge.material as THREE.Material).dispose();
    hedge.dispose();
  };

  return { group, tiles, hedge, slab, applyPalette, setMorph, dispose };
}

function buildHedge(plotUnits: number, rimUnits: number, palette: Palette) {
  const rng = makeRng(0x5eed1eaf);
  const geo = new THREE.BoxGeometry(0.16, 1, 0.16);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(geo, mat, HEDGE_BLADES);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const inner = plotUnits / 2 - 0.25;
  const outer = rimUnits / 2;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  for (let k = 0; k < HEDGE_BLADES; k++) {
    const side = k % 4;
    const along = rng() * rimUnits - outer;
    const depth = inner + rng() * (outer - inner);

    if (side === 0) pos.set(along, -0.28, -depth);
    else if (side === 1) pos.set(along, -0.28, depth);
    else if (side === 2) pos.set(-depth, -0.28, along);
    else pos.set(depth, -0.28, along);

    e.set((rng() - 0.5) * 0.4, rng() * Math.PI, (rng() - 0.5) * 0.4);
    q.setFromEuler(e);
    scl.set(1, 0.65 + rng() * 0.9, 1);
    m.compose(pos, q, scl);
    mesh.setMatrixAt(k, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  paintHedge(mesh, palette);
  return mesh;
}

function paintHedge(mesh: THREE.InstancedMesh, palette: Palette) {
  const rng = makeRng(0xc0ffee);
  const colors = palette.hedge.map((c) => new THREE.Color(c));
  for (let k = 0; k < mesh.count; k++) {
    mesh.setColorAt(k, colors[Math.floor(rng() * colors.length)]);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export { buildQr };
