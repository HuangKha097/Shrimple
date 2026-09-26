import * as THREE from 'three';
import { growTree, branchMatrix, type TreeModel } from './tree';
import { type QrMatrix } from './qr';
import { leafTarget, leafCountFor } from './moduleLayout';
import { LEAVES_PER_MODULE } from './constants';
import { hashString, makeRng, clamp01 } from './rng';
import type { Palette } from './palette';
import type { Species } from './species';

export interface Canopy {
  group: THREE.Group;
  leaves: THREE.InstancedMesh;
  branches: THREE.InstancedMesh;
  model: TreeModel;
  leafCount: number;
  /** 0 = grown tree, 1 = settled into the code. */
  setMorph: (t: number, time: number) => void;
  applyPalette: (p: Palette) => void;
  dispose: () => void;
}

/**
 * Builds the tree and, for every leaf, the module cell it flies down to.
 * Leaf count is derived from the code so each dark module ends up evenly packed.
 */
export function buildCanopy(qr: QrMatrix, palette: Palette, species: Species): Canopy {
  const seed = hashString(qr.text);
  const rng = makeRng(seed ^ 0x9e3779b9);

  const darkCells = qr.darkCells;
  const leafCount = leafCountFor(qr);
  const treeHeight = qr.plot * species.heightFactor;

  const model = growTree(seed, { height: treeHeight, leafCount, species });

  const group = new THREE.Group();

  // ---- branches --------------------------------------------------------
  const branchGeo = new THREE.CylinderGeometry(0.42, 1, 1, 6, 1);
  const branchMat = new THREE.MeshLambertMaterial();
  const branches = new THREE.InstancedMesh(branchGeo, branchMat, model.branches.length);
  branches.castShadow = true;

  const m = new THREE.Matrix4();
  model.branches.forEach((b, i) => branches.setMatrixAt(i, branchMatrix(b, m)));
  branches.instanceMatrix.needsUpdate = true;
  branches.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(branches);

  // ---- leaves ----------------------------------------------------------
  const leafGeo = new THREE.DodecahedronGeometry(0.66, 0);
  leafGeo.scale(1.0, 0.85, 1.0);
  const leafMat = new THREE.MeshLambertMaterial();
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, leafCount);
  leaves.castShadow = true;
  leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // Explicitly allocate instanceColor attribute so colors can be written directly
  const leafColorArray = new Float32Array(leafCount * 3);
  leaves.instanceColor = new THREE.InstancedBufferAttribute(leafColorArray, 3);
  leaves.instanceColor.setUsage(THREE.DynamicDrawUsage);
  group.add(leaves);

  const treePos = new Float32Array(leafCount * 3);
  const qrPos = new Float32Array(leafCount * 3);
  const treeScale = new Float32Array(leafCount);
  const qrScale = new Float32Array(leafCount * 3);
  const phase = new Float32Array(leafCount);
  const delay = new Float32Array(leafCount);
  const spin = new Float32Array(leafCount * 3);

  // Each dark module receives LEAVES_PER_MODULE leaves in a 2 x 2 x N stack.
  for (let i = 0; i < leafCount; i++) {
    const src = model.leaves[i];
    treePos[i * 3] = src.x;
    treePos[i * 3 + 1] = src.y;
    treePos[i * 3 + 2] = src.z;
    treeScale[i] = model.leafScales[i];
    phase[i] = rng() * Math.PI * 2;
    spin[i * 3] = rng() * Math.PI;
    spin[i * 3 + 1] = rng() * Math.PI;
    spin[i * 3 + 2] = rng() * Math.PI;

    const target = leafTarget(qr, i);
    qrPos[i * 3] = target.x;
    qrPos[i * 3 + 1] = target.y;
    qrPos[i * 3 + 2] = target.z;
    qrScale[i * 3] = target.sx;
    qrScale[i * 3 + 1] = target.sy;
    qrScale[i * 3 + 2] = target.sz;

    delay[i] = clamp01(0.0001 + rng() * 0.18);
  }

  const treeColors = new Float32Array(leafCount * 3);
  const qrColors = new Float32Array(leafCount * 3);
  let currentMorphT = 0;
  let paintedFor = -1;

  const paintLeaves = (t: number) => {
    currentMorphT = t;
    const cArr = leaves.instanceColor!.array as Float32Array;
    for (let i = 0; i < leafCount; i++) {
      const d = delay[i];
      const local = clamp01((t - d) / (1 - d));
      const e = local < 0.5 ? 4 * local ** 3 : 1 - (-2 * local + 2) ** 3 / 2;
      const i3 = i * 3;
      cArr[i3] = treeColors[i3] + (qrColors[i3] - treeColors[i3]) * e;
      cArr[i3 + 1] = treeColors[i3 + 1] + (qrColors[i3 + 1] - treeColors[i3 + 1]) * e;
      cArr[i3 + 2] = treeColors[i3 + 2] + (qrColors[i3 + 2] - treeColors[i3 + 2]) * e;
    }
    leaves.instanceColor!.needsUpdate = true;
    paintedFor = t;
  };

  const applyPalette = (p: Palette) => {
    const rngC = makeRng(seed ^ 0x1234abcd);
    const leafPool = p.leaf.map((c) => new THREE.Color(c));
    const qrPool = p.qrLeaf.map((c) => new THREE.Color(c));

    // One tone per module, shared by all its leaves, so each block is flat.
    const rngM = makeRng(seed ^ 0x77aa33);
    const moduleTone = Array.from(
      { length: darkCells.length },
      () => qrPool[Math.floor(rngM() * qrPool.length)],
    );

    for (let i = 0; i < leafCount; i++) {
      const a = leafPool[Math.floor(rngC() * leafPool.length)];
      const b = moduleTone[Math.floor(i / LEAVES_PER_MODULE)];
      treeColors[i * 3] = a.r; treeColors[i * 3 + 1] = a.g; treeColors[i * 3 + 2] = a.b;
      qrColors[i * 3] = b.r; qrColors[i * 3 + 1] = b.g; qrColors[i * 3 + 2] = b.b;
    }
    const bark = new THREE.Color(species.bark?.bark ?? p.bark);
    const barkDark = new THREE.Color(species.bark?.barkDark ?? p.barkDark);
    model.branches.forEach((b, i) =>
      branches.setColorAt(i, b.depth <= 1 ? barkDark : bark),
    );
    if (branches.instanceColor) branches.instanceColor.needsUpdate = true;

    // Immediately repaint leaf colors for the current morph state
    paintLeaves(currentMorphT);
  };

  const mat4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();

  // Cached branch transforms, so retracting them each frame is just a rescale.
  const bMid = new Float32Array(model.branches.length * 3);
  const bQuat = new Float32Array(model.branches.length * 4);
  const bLen = new Float32Array(model.branches.length);
  const bRad = new Float32Array(model.branches.length);
  {
    const dir = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    model.branches.forEach((b, i) => {
      dir.copy(b.end).sub(b.start);
      const len = dir.length();
      bLen[i] = len;
      bRad[i] = b.radius;
      bMid[i * 3] = b.start.x + dir.x * 0.5;
      bMid[i * 3 + 1] = b.start.y + dir.y * 0.5;
      bMid[i * 3 + 2] = b.start.z + dir.z * 0.5;
      q.setFromUnitVectors(up, dir.normalize());
      bQuat[i * 4] = q.x; bQuat[i * 4 + 1] = q.y; bQuat[i * 4 + 2] = q.z; bQuat[i * 4 + 3] = q.w;
    });
  }
  let branchesAt = -1;

  /**
   * Withdraws the woody skeleton into the plot as the code resolves.
   */
  const setBranchRetraction = (t: number) => {
    if (branchesAt === t) return;
    branchesAt = t;

    const progress = clamp01(t / 0.85);
    const globalK = 1 - (progress * progress * (3 - 2 * progress));
    branches.visible = globalK > 0.01;
    if (!branches.visible) return;

    for (let i = 0; i < model.branches.length; i++) {
      const depth = model.branches[i].depth;
      const stagger = (depth / Math.max(1, species.maxDepth || 4)) * 0.16;
      const bProgress = clamp01((t - stagger * 0.25) / (0.85 - stagger * 0.25));
      const bK = 1 - (bProgress * bProgress * (3 - 2 * progress));

      pos.set(bMid[i * 3] * bK, bMid[i * 3 + 1] * bK, bMid[i * 3 + 2] * bK);
      quat.set(bQuat[i * 4], bQuat[i * 4 + 1], bQuat[i * 4 + 2], bQuat[i * 4 + 3]);
      scl.set(bRad[i] * bK, bLen[i] * bK, bRad[i] * bK);
      mat4.compose(pos, quat, scl);
      branches.setMatrixAt(i, mat4);
    }
    branches.instanceMatrix.needsUpdate = true;
  };

  const setMorph = (t: number, time: number) => {
    // Smoothly damp wind vibrations during flight so leaves glide without buzzing or jittering
    const morphWindDamp = Math.max(0, 1 - t * 3.5);

    for (let i = 0; i < leafCount; i++) {
      // Stagger: each leaf runs its own eased sub-window of the global morph.
      const d = delay[i];
      const local = clamp01((t - d) / (1 - d));
      const e = local < 0.5 ? 4 * local ** 3 : 1 - (-2 * local + 2) ** 3 / 2;

      // Natural organic wind breeze and leaf flutter (active in tree mode, smoothly damped in morph)
      const heightNorm = clamp01(treePos[i * 3 + 1] / Math.max(1, model.canopyTop));
      const windFactor = (0.55 + 0.65 * heightNorm) * morphWindDamp;

      // Realistic multi-wave wind sway in X, Y, Z
      const windMain = Math.sin(time * 1.8 + phase[i] * 1.5) * 0.35 * windFactor;
      const windGust = Math.cos(time * 3.2 + phase[i] * 2.4) * 0.15 * windFactor;
      const swayX = windMain + windGust;
      const swayZ = Math.cos(time * 1.5 + phase[i] * 1.2) * 0.32 * windFactor;
      const swayY = Math.sin(time * 2.4 + phase[i] * 2.0) * 0.16 * windFactor;

      // Leaves arc upward before dropping into place.
      const lift = Math.sin(e * Math.PI) * 1.15;

      pos.set(
        treePos[i * 3] + (qrPos[i * 3] - treePos[i * 3]) * e + swayX,
        treePos[i * 3 + 1] + (qrPos[i * 3 + 1] - treePos[i * 3 + 1]) * e + lift + swayY,
        treePos[i * 3 + 2] + (qrPos[i * 3 + 2] - treePos[i * 3 + 2]) * e + swayZ,
      );

      const ts = treeScale[i];
      scl.set(
        ts + (qrScale[i * 3] - ts) * e,
        ts + (qrScale[i * 3 + 1] - ts) * e,
        ts + (qrScale[i * 3 + 2] - ts) * e,
      );

      // Organic leaf fluttering in rotation while in tree mode
      const flutterPitch = Math.sin(time * 3.4 + phase[i] * 2.8) * 0.24 * windFactor;
      const flutterYaw = Math.cos(time * 2.6 + phase[i] * 2.1) * 0.26 * windFactor;
      const flutterRoll = Math.sin(time * 4.0 + phase[i] * 1.7) * 0.20 * windFactor;

      // Tumble in flight, then snap square so the modules stay crisp.
      const spinAmt = Math.sin(e * Math.PI) * 1.2;
      euler.set(
        spin[i * 3] * (1 - e) + spinAmt + flutterPitch,
        spin[i * 3 + 1] * (1 - e) + spinAmt + flutterYaw,
        spin[i * 3 + 2] * (1 - e) + flutterRoll,
      );
      quat.setFromEuler(euler);

      mat4.compose(pos, quat, scl);
      leaves.setMatrixAt(i, mat4);
    }
    leaves.instanceMatrix.needsUpdate = true;

    if (paintedFor !== t) {
      paintLeaves(t);
    }

    setBranchRetraction(t);
  };

  const dispose = () => {
    branchGeo.dispose();
    branchMat.dispose();
    leafGeo.dispose();
    leafMat.dispose();
  };

  applyPalette(palette);

  return { group, leaves, branches, model, leafCount, setMorph, applyPalette, dispose };
}
