import * as THREE from 'three';
import { createHouses } from './houses.js';
import { createVegetation } from './vegetation.js';
import { createVillageDetails } from './village-details.js';
import { createTerrainArt } from './terrain-art.js';
import { createCollisionIndex } from './collision.js';
import { createWeatheredStone } from './stone-art.js';
import { createRiverWater } from './water.js';
import { createImportedGarden, reserveImportedGarden } from './imported-garden.js';

const RADIUS = 44;
const BRIDGE_Z = 5.5;
const RIVER_HALF_WIDTH = 2.3;

function randomFactory(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function cloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  for (const [x, y, r] of [[35, 68, 32], [63, 54, 40], [87, 66, 28], [61, 80, 28]]) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, 'rgba(0,0,0,0.7)');
    gradient.addColorStop(0.5, 'rgba(0,0,0,0.4)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return new THREE.CanvasTexture(canvas);
}

function makeGrassGeometry(tall = false) {
  const positions = [];
  const indices = [];
  const tallAttribute = [];
  for (let plane = 0; plane < (tall ? 2 : 1); plane++) {
    const offset = positions.length / 3;
    for (let row = 0; row <= 3; row++) {
      const t = row / 3;
      const width = (1 - t) * (tall ? 0.14 : 0.075);
      const bend = t * t * 0.08;
      if (plane === 0) positions.push(-width + bend, t, 0, width + bend, t, 0);
      else positions.push(0, t, -width + bend, 0, t, width + bend);
      tallAttribute.push(tall ? 1 : 0, tall ? 1 : 0);
      if (row < 3) {
        const a = offset + row * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aTall', new THREE.Float32BufferAttribute(tallAttribute, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Procedural, reusable world assets; no network assets or additional runtime dependencies. */
export async function createWorld(scene, { quality = 'high' } = {}) {
  const random = randomFactory(271026);
  const root = new THREE.Group();
  root.name = 'Nebelwald island';
  const visualScale = 0.84;
  root.scale.setScalar(visualScale);
  scene.add(root);
  const collisions = [];
  const object = new THREE.Object3D();
  const color = new THREE.Color();
  const timeUniform = { value: 0 };
  const playerUniform = { value: new THREE.Vector3(-8, 0, 8) };
  const riverAt = z => 9 + 4 * Math.sin(z * 0.085);
  const onBridge = (x, z) => Math.abs(z - BRIDGE_Z) < 1.35 && Math.abs(x - riverAt(BRIDGE_Z)) < 4.8;
  const isWater = (x, z) => Math.abs(x - riverAt(z)) < RIVER_HALF_WIDTH + 0.22 && !onBridge(x, z);
  const surface = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.95, flatShading: true, ...extra });
  const buildingWalls = [];
  const tallGrassPatches = [
    { x: -2, z: 13, radius: 2.25, aspect: .75, yaw: .35 },
    { x: -1, z: 21, radius: 4.2, aspect: .72, yaw: -.55 },
    { x: -8, z: 32, radius: 2.7, aspect: .70, yaw: .8 },
    { x: -27, z: -20, radius: 3.4, aspect: .75, yaw: .4 },
    { x: -32, z: -12, radius: 1.5, aspect: .65, yaw: -.4 },
    { x: -8, z: -29, radius: 2.1, aspect: 1.2, yaw: .7 },
    { x: 0, z: -32, radius: 3.5, aspect: .58, yaw: .8 },
    { x: 28, z: -1, radius: 1.9, aspect: .7, yaw: -.3 },
    { x: 32, z: 15, radius: 3.2, aspect: .78, yaw: -.6 },
    { x: 20, z: 21, radius: 1.6, aspect: 1.2, yaw: .5 },
    { x: 20, z: 31, radius: 2.5, aspect: .7, yaw: .3 },
    { x: -29, z: 9, radius: 1.45, aspect: .9, yaw: -.7 },
  ];
  const grassArea = tallGrassPatches.reduce((sum, patch) => sum + patch.radius ** 2 * patch.aspect, 0);
  const houseSites = [
    { x: -13, z: -5, name: 'Mooswinkel' },
    { x: 21, z: -18, name: 'Mondhain' },
    { x: -19, z: 21, name: 'Wildheide' },
  ];
  const smooth = (a, b, value) => { const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const groundHeight = (x, z) => {
    const hill = .85 * Math.exp(-((x + 31) ** 2 / 65 + (z + 22) ** 2 / 90))
      + 1.05 * Math.exp(-((x - 31) ** 2 / 90 + (z - 25) ** 2 / 80));
    let flat = smooth(3.2, 6, Math.abs(x - riverAt(z)));
    for (const h of houseSites) flat *= smooth(.5, 3, Math.max(Math.abs(x - h.x) - 8, Math.abs(z - h.z) - 7));
    return hill * flat;
  };
  const patchCoverage = (p, x, z) => {
    const dx = x - p.x, dz = z - p.z;
    const localX = Math.cos(p.yaw) * dx + Math.sin(p.yaw) * dz;
    const localZ = (-Math.sin(p.yaw) * dx + Math.cos(p.yaw) * dz) / p.aspect;
    const angle = Math.atan2(localZ, localX);
    const edge = p.radius * (1 + .10 * Math.sin(angle * 3 + p.x) + .075 * Math.cos(angle * 5 + p.z));
    return 1 - Math.hypot(localX, localZ) / edge;
  };
  const insideTallPatch = (x, z) => tallGrassPatches.some(p => patchCoverage(p, x, z) > .02);
  const pickupClearings = [[-5, 5], [-12, 2], [0, 9], [-4, -15], [-30, 14], [22, -8], [-26, -5], [-10.5, 12], [-1.5, 0], [-18, 5], [4.5, 15], [19, 3]];
  const nearPickup = (x, z) => pickupClearings.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.8);

  // Softly faceted terrain has actual thickness and a sun-warmed sandy shoreline.
  const vertices = [];
  const colors = [];
  const terrainUVs = [];
  const indices = [];
  const rings = 36;
  const segments = 120;
  for (let ring = 0; ring <= rings; ring++) {
    for (let i = 0; i <= segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const edge = 1 + 0.025 * Math.sin(angle * 5) + 0.012 * Math.cos(angle * 9);
      const r = ring / rings * RADIUS * edge;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      vertices.push(x, groundHeight(x, z), z);
      terrainUVs.push(x / 92 + .5, z / 92 + .5);
      const noise = Math.sin(x * 0.17 + z * 0.11) * 0.027 + Math.cos(z * 0.25) * 0.025;
      color.setHSL(0.255 + Math.sin(z * 0.09) * 0.012, 0.36, 0.39 + noise + random() * 0.022, THREE.SRGBColorSpace);
      colors.push(color.r, color.g, color.b);
      if (ring < rings && i < segments) {
        const a = ring * (segments + 1) + i;
        const b = a + segments + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const terrainGeometry = new THREE.BufferGeometry();
  terrainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  terrainGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(terrainUVs, 2));
  terrainGeometry.setIndex(indices);
  terrainGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeometry, surface(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
  terrain.receiveShadow = true;
  root.add(terrain);

  const shoreVertices = [];
  const shoreIndices = [];
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI * 2;
    const edge = 1 + 0.025 * Math.sin(angle * 5) + 0.012 * Math.cos(angle * 9);
    for (const [extra, y] of [[0, -0.01], [1.0, -0.65], [1.5, -2.8]]) {
      const r = RADIUS * edge + extra;
      shoreVertices.push(Math.cos(angle) * r, y, Math.sin(angle) * r);
    }
    if (i < segments) {
      const a = i * 3;
      shoreIndices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const shoreGeometry = new THREE.BufferGeometry();
  shoreGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shoreVertices, 3));
  shoreGeometry.setIndex(shoreIndices);
  shoreGeometry.computeVertexNormals();
  const shore = new THREE.Mesh(shoreGeometry, surface(0xb8ac7a, { side: THREE.DoubleSide }));
  shore.receiveShadow = true;
  root.add(shore);

  const sea = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), surface(0x488b8e, { roughness: 0.5, metalness: 0.05 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -1.0;
  root.add(sea);

  const riverPoints = Array.from({ length: 181 }, (_, i) => {
    const z = -43 + i / 180 * 86;
    return new THREE.Vector3(riverAt(z), 0, z);
  });

  const river = createRiverWater(root, { riverPoints, riverAt, halfWidth: RIVER_HALF_WIDTH, timeUniform, quality });
  river.mesh.renderOrder = 1;

  // A readable old trail leads from the forest clearing to the river crossing.
  const pathCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-26, 0, -33), new THREE.Vector3(-20, 0, -19),
    new THREE.Vector3(-14, 0, -6), new THREE.Vector3(-10, 0, 5),
    new THREE.Vector3(-5, 0, 8), new THREE.Vector3(3, 0, 7),
    new THREE.Vector3(riverAt(BRIDGE_Z), 0, BRIDGE_Z),
    new THREE.Vector3(22, 0, 3), new THREE.Vector3(32, 0, -8),
  ]);
  const pathPoints = pathCurve.getPoints(90);
  const pathDistance = (x, z) => {
    let nearest = Infinity;
    for (const point of pathPoints) nearest = Math.min(nearest, Math.hypot(point.x - x, point.z - z));
    return nearest;
  };

  // Warm wooden footbridge, with individually worn boards and strong stone footings.
  const bridge = new THREE.Group();
  bridge.position.set(riverAt(BRIDGE_Z), 0, BRIDGE_Z);
  root.add(bridge);
  const wood = [surface(0x947249), surface(0xa18351), surface(0x8d6944)];
  const darkWood = surface(0x645744);
  const stoneMaterial = surface(0x91a19a);
  const box = (width, height, depth, material, x, y, z, parent = root) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  for (let i = 0; i < 20; i++) {
    const board = box(0.42, 0.22, 2.55, wood[i % 3], -4.3 + i * 0.45, 0.16 + Math.sin(i / 19 * Math.PI) * 0.055, 0, bridge);
    board.rotation.z = (random() - 0.5) * 0.018;
  }
  for (const z of [-1.37, 1.37]) {
    box(9.1, 0.16, 0.16, darkWood, 0, 1.14, z, bridge);
    for (const x of [-4.2, -1.4, 1.4, 4.2]) box(0.22, 1.2, 0.22, wood[0], x, 0.58, z, bridge);
  }
  for (const x of [-4.15, 4.15]) box(1, 0.7, 2.9, stoneMaterial, x, -0.12, 0, bridge);

  const houseAssembly = createHouses(root, houseSites);
  const houses = houseAssembly.houses;
  buildingWalls.push(...houseAssembly.walls.map(wall => ({ ...wall, minY: 0, maxY: 4, type: 'house' })));
  const clearOfHouse = (x, z, margin = 0) => houses.every(house =>
    Math.abs(x - house.x) > house.halfWidth + 0.7 + margin
    || Math.abs(z - house.z) > house.halfDepth + 0.7 + margin);
  const details = createVillageDetails(root, { houses, riverAt, isWater, pathDistance, clearOfHouse, quality });
  buildingWalls.push(...details.walls);
  collisions.push(...details.collisions);
  const clearOfDetails = (x, z, margin = 1) => details.collisions.every(c => Math.hypot(x - c.x, z - c.z) > c.radius + margin)
    && details.walls.every(w => Math.hypot(x - THREE.MathUtils.clamp(x, w.minX, w.maxX), z - THREE.MathUtils.clamp(z, w.minZ, w.maxZ)) > margin);

  // Tree assets share geometry and materials and are rendered in a handful of draw calls.
  const treeLocations = [];
  // Identical tactical obstacles in both quality modes; LOD changes only visuals.
  const targetTrees = 32; // Two curated uploaded trees keep the total at 34.
  const fightingClearings = [
    { x: -4, z: 5, rx: 10, rz: 7.5 }, { x: 0, z: -14, rx: 7, rz: 6 },
    { x: 24, z: 5, rx: 7, rz: 6 }, { x: -4, z: 29, rx: 5.5, rz: 5 },
  ];
  for (let attempt = 0; treeLocations.length < targetTrees && attempt < 3000; attempt++) {
    const x = (random() - 0.5) * 78;
    const z = (random() - 0.5) * 78;
    if (Math.hypot(x, z) > 39 || Math.abs(x - riverAt(z)) < 4.3) continue;
    if (fightingClearings.some(c => ((x - c.x) / c.rx) ** 2 + ((z - c.z) / c.rz) ** 2 < 1.2)) continue;
    if (Math.hypot(x + 8, z - 8) < 7 || pathDistance(x, z) < 4.0 || nearPickup(x, z)) continue;
    if (Math.hypot(x + 30, z + 3) < 5.2) continue;
    if (insideTallPatch(x, z) || !clearOfHouse(x, z, 1.8) || !clearOfDetails(x, z, 1.8)) continue;
    if (reserveImportedGarden(x, z, 1.8)) continue;
    if (treeLocations.some(t => Math.hypot(t.x - x, t.z - z) < 5.2)) continue;
    treeLocations.push({ x, z, y: groundHeight(x, z), scale: 0.83 + random() * 0.29, fir: random() < 0.26 });
  }
  const vegetation = createVegetation(root, treeLocations, { quality });
  treeLocations.forEach(tree => collisions.push({ x: tree.x, z: tree.z, radius: .34 * tree.scale,
    minY: tree.y, maxY: tree.y + 8 * tree.scale, type: 'tree' }));
  terrain.material.dispose();
  terrain.material = createTerrainArt(pathPoints, riverAt, houses, treeLocations, quality);

  const rockPositions = [];
  for (let i = 0; i < 68; i++) {
    const z = -37 + random() * 74;
    const bank = i % 2 ? 1 : -1;
    const x = riverAt(z) + bank * (3.1 + random() * 0.8);
    if (Math.abs(z - BRIDGE_Z) < 3 || nearPickup(x, z)) continue;
    rockPositions.push({ x, z, s: 0.24 + random() * 0.52 });
  }
  for (let i = 0; i < 24; i++) {
    const x = (random() - 0.5) * 75;
    const z = (random() - 0.5) * 75;
    if (Math.hypot(x, z) > 37 || Math.hypot(x + 8, z - 8) < 4 || Math.hypot(x + 30, z + 3) < 5
      || isWater(x, z) || pathDistance(x, z) < 2 || nearPickup(x, z) || !clearOfHouse(x, z, 1) || !clearOfDetails(x, z)
      || reserveImportedGarden(x, z, .8)) continue;
    rockPositions.push({ x, z, s: 0.55 + random() * 0.9 });
  }
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), createWeatheredStone(0xffffff), rockPositions.length);
  rockPositions.forEach((rock, i) => {
    object.position.set(rock.x, groundHeight(rock.x, rock.z) + rock.s * 0.35, rock.z);
    object.rotation.set(random(), random() * 5, random());
    object.scale.set(rock.s * 1.2, rock.s * 0.85, rock.s);
    object.updateMatrix();
    rocks.setMatrixAt(i, object.matrix);
    color.setHSL(0.39 + random() * 0.07, 0.07, 0.4 + random() * 0.17, THREE.SRGBColorSpace);
    rocks.setColorAt(i, color);
    if (rock.s > 0.5) collisions.push({ x: rock.x, z: rock.z, radius: rock.s * 0.82,
      minY: groundHeight(rock.x, rock.z), maxY: groundHeight(rock.x, rock.z) + rock.s * 1.2, type: 'rock' });
  });
  rocks.castShadow = rocks.receiveShadow = true;
  root.add(rocks);

  // Weathered arch and broken masonry retain the original world's fantasy landmark.
  const ruin = new THREE.Group();
  ruin.position.set(-30, 0, -3);
  ruin.rotation.y = -0.22;
  root.add(ruin);
  const ruinStone = [0xa5afa3, 0x8d9b8f, 0x748a77].map(createWeatheredStone);
  for (const x of [-1.8, 1.8]) {
    box(1.4, 0.35, 1.3, ruinStone[1], x, 0.18, 0, ruin);
    for (let level = 0; level < 4; level++) box(1.0 - level * 0.045, 0.8, 1.0, ruinStone[level % 3], x, 0.75 + level * 0.79, 0, ruin);
    collisions.push({ x: -30 + x * Math.cos(-0.22), z: -3 - x * Math.sin(-0.22), radius: 0.72,
      minY: 0, maxY: 4.1, type: 'ruin' });
  }
  for (let segment = 0; segment < 7; segment++) {
    const angle = segment / 6 * Math.PI;
    const stone = box(0.8, 0.85, 1.0, ruinStone[segment % 2], Math.cos(angle) * 1.8, 3.1 + Math.sin(angle) * 1.55, 0, ruin);
    stone.rotation.z = angle - Math.PI / 2;
  }
  for (let i = 0; i < 7; i++) {
    const block = box(0.6 + random(), 0.4 + random() * 0.4, 0.6, ruinStone[i % 3], -3.4 + random() * 7, 0.25, 1.9 + random() * 1.5, ruin);
    block.rotation.y = random() * 4;
  }

  // Grass blades bend in the vertex shader: no per-blade work in the animation loop.
  const grassMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide });
  grassMaterial.onBeforeCompile = shader => {
    shader.uniforms.uWorldTime = timeUniform;
    shader.uniforms.uPlayer = playerUniform;
    shader.vertexShader = `attribute float aTall; uniform float uWorldTime; uniform vec3 uPlayer; varying float vBladeT; varying float vTall;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vBladeT = position.y;
      vTall = aTall;
      vec3 bladeOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float wind = sin(uWorldTime * 1.8 + bladeOrigin.x * 0.42 + bladeOrigin.z * 0.61);
      transformed.x += wind * 0.19 * position.y * position.y;
      transformed.z += cos(uWorldTime * 1.2 + bladeOrigin.x * 0.3) * 0.09 * position.y * position.y;
      vec2 delta = bladeOrigin.xz - uPlayer.xz;
      float influence = 1.0 - smoothstep(0.3, mix(1.8, 2.7, aTall), length(delta));
      vec2 away = normalize(delta + vec2(0.001));
      vec2 localX = normalize(instanceMatrix[0].xz);
      vec2 localZ = normalize(instanceMatrix[2].xz);
      transformed.x += dot(away, localX) * influence * (1.0 - aTall) * 0.9 * position.y * position.y;
      transformed.z += dot(away, localZ) * influence * (1.0 - aTall) * 0.9 * position.y * position.y;
      transformed.y *= 1.0 - influence * (1.0 - aTall) * 0.52 * position.y;
    `);
    shader.fragmentShader = `varying float vBladeT; varying float vTall;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      diffuseColor.rgb *= mix(vec3(0.52, 0.66, 0.47), vec3(1.13, 1.14, 0.85), vBladeT);
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.43, 0.64, 0.47), vTall);
    `);
  };
  const grassCount = quality === 'low' ? 9000 : 16000;
  const grass = new THREE.InstancedMesh(makeGrassGeometry(), grassMaterial, grassCount);
  for (let i = 0; i < grassCount;) {
    const x = (random() - 0.5) * 82;
    const z = (random() - 0.5) * 82;
    if (Math.hypot(x, z) > 41 || Math.abs(x - riverAt(z)) < 3.05 || pathDistance(x, z) < 1.6 || insideTallPatch(x, z) || !clearOfHouse(x, z, 0.1)) continue;
    const patch = Math.sin(x * 0.47) + Math.cos(z * 0.39) + Math.sin(x * 0.16 + z * 0.27);
    if (patch < 0.25 && random() > 0.13) continue;
    const height = 0.18 + random() * 0.32 + Math.max(0, patch - 1.1) * 0.1;
    object.position.set(x, groundHeight(x, z) + 0.025, z);
    object.rotation.set(0, random() * Math.PI * 2, 0);
    object.scale.set(0.8 + random() * 0.7, height, 1);
    object.updateMatrix();
    grass.setMatrixAt(i, object.matrix);
    color.setHSL(0.22 + random() * 0.045, 0.25 + random() * 0.12, 0.30 + random() * 0.12, THREE.SRGBColorSpace);
    grass.setColorAt(i++, color);
  }
  grass.receiveShadow = true;
  grass.frustumCulled = false;
  grass.name = 'Wind and player-reactive meadow grass';
  root.add(grass);

  // Real crossed blades keep depth occlusion while the local character fades to a silhouette.
  const tallCount = quality === 'low' ? 6500 : 12000;
  const tallGrass = new THREE.InstancedMesh(makeGrassGeometry(true), grassMaterial, tallCount);
  for (let i = 0; i < tallCount;) {
    let selection = random() * grassArea;
    const patch = tallGrassPatches.find(p => (selection -= p.radius ** 2 * p.aspect) <= 0) ?? tallGrassPatches.at(-1);
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * patch.radius * 1.2;
    const localX = Math.cos(angle) * distance, localZ = Math.sin(angle) * distance * patch.aspect;
    const x = patch.x + Math.cos(patch.yaw) * localX - Math.sin(patch.yaw) * localZ;
    const z = patch.z + Math.sin(patch.yaw) * localX + Math.cos(patch.yaw) * localZ;
    const coverage = patchCoverage(patch, x, z);
    if (coverage < .02) continue;
    if (Math.hypot(x, z) > 40 || Math.abs(x - riverAt(z)) < 3.5 || !clearOfHouse(x, z, 0.25)) continue;
    object.position.set(x, groundHeight(x, z) + 0.035, z);
    object.rotation.set(0, random() * Math.PI, 0);
    const fringe = smooth(.02, .32, coverage);
    object.scale.set(0.9 + random() * 0.55, .45 + fringe * 1.35 + random() * .38, 1);
    object.updateMatrix();
    tallGrass.setMatrixAt(i, object.matrix);
    color.setHSL(0.255 + random() * 0.04, 0.46 + random() * 0.13, 0.23 + random() * 0.11, THREE.SRGBColorSpace);
    tallGrass.setColorAt(i++, color);
  }
  tallGrass.castShadow = false;
  tallGrass.receiveShadow = false;
  tallGrass.frustumCulled = false;
  tallGrass.name = 'High meadow grass — conceals other players completely';
  root.add(tallGrass);

  const flowerCount = quality === 'low' ? 110 : 210;
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.11, 0), surface(0xffffff), flowerCount);
  const flowerColors = [0xe9d993, 0xd6cde2, 0xf1e5bb, 0xbca7ce];
  for (let i = 0; i < flowerCount;) {
    const x = (random() - 0.5) * 70;
    const z = (random() - 0.5) * 70;
    if (Math.hypot(x, z) > 36 || Math.abs(x - riverAt(z)) < 3.4 || pathDistance(x, z) < 1.8) continue;
    object.position.set(x, groundHeight(x, z) + 0.3 + random() * 0.15, z);
    object.rotation.set(random(), random(), random());
    object.scale.set(1, 0.55, 1);
    object.updateMatrix();
    flowers.setMatrixAt(i, object.matrix);
    flowers.setColorAt(i, color.setHex(flowerColors[i % flowerColors.length]));
    i++;
  }
  root.add(flowers);

  // Broad cloud silhouettes drift slowly across the meadow and the river surface.
  const shadowTexture = cloudTexture();
  const cloudShadows = [];
  for (let i = 0; i < 7; i++) {
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(24 + random() * 9, 15 + random() * 6), new THREE.MeshBasicMaterial({
      map: shadowTexture, color: 0x1b302d, transparent: true, opacity: 0.21,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
    }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.rotation.z = random() * 3;
    shadow.position.set(-38 + i * 12, 0.09, -25 + random() * 50);
    shadow.renderOrder = 2;
    root.add(shadow);
    cloudShadows.push({ mesh: shadow, x: shadow.position.x, z: shadow.position.z, speed: 0.21 + random() * 0.16 });
  }

  const moteCount = quality === 'low' ? 30 : 55;
  const motePositions = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    motePositions[i * 3] = -30 + random() * 55;
    motePositions[i * 3 + 1] = 0.5 + random() * 3;
    motePositions[i * 3 + 2] = -25 + random() * 55;
  }
  const motesGeometry = new THREE.BufferGeometry();
  motesGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  const motes = new THREE.Points(motesGeometry, new THREE.PointsMaterial({ color: 0xf6e4a5, size: 0.065, transparent: true, opacity: 0.65, depthWrite: false }));
  root.add(motes);

  const importedGarden = await createImportedGarden(root, { heightAt: groundHeight, quality });
  collisions.push(...importedGarden.collisions);

  // Tint every world surface outside the zone, including roofs and high tree crowns.
  const radiusUniform = { value: 32 * visualScale };
  const tintedMaterials = new Set();
  root.traverse(part => {
    for (const material of part.material ? (Array.isArray(part.material) ? part.material : [part.material]) : []) {
      if (!material.isMeshStandardMaterial || tintedMaterials.has(material)) continue;
      tintedMaterials.add(material);
      const previousCompile = material.onBeforeCompile;
      const previousKey = material.customProgramCacheKey();
      material.onBeforeCompile = shader => {
        previousCompile.call(material, shader);
        shader.uniforms.uVillageRadius = radiusUniform;
        shader.vertexShader = `varying vec3 vVillageWorld;\n${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
          vec4 villagePosition=vec4(transformed,1.0);
          #ifdef USE_INSTANCING
            villagePosition=instanceMatrix*villagePosition;
          #endif
          vVillageWorld=(modelMatrix*villagePosition).xyz;
          #include <project_vertex>
        `);
        shader.fragmentShader = `varying vec3 vVillageWorld; uniform float uVillageRadius;\n${shader.fragmentShader}`;
        shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
          #include <dithering_fragment>
          float villageDanger=smoothstep(uVillageRadius+.5,uVillageRadius+11.,length(vVillageWorld.xz));
          gl_FragColor.rgb*=mix(vec3(1.),vec3(.43,.38,.56),villageDanger);
        `);
      };
      material.customProgramCacheKey = () => `${previousKey}|village-zone-v1`;
    }
  });

  const collisionIndex = createCollisionIndex(collisions, buildingWalls);

  function resolveMovement(position, radius = 0.45) {
    const length = Math.hypot(position.x, position.z);
    const edge = RADIUS - 2.5 - radius;
    if (length > edge) {
      position.x *= edge / length;
      position.z *= edge / length;
    }
    collisionIndex.resolve(position, radius);
    const riverX = riverAt(position.z);
    if (!onBridge(position.x, position.z) && Math.abs(position.x - riverX) < RIVER_HALF_WIDTH + radius) {
      position.x = riverX + Math.sign(position.x - riverX || -1) * (RIVER_HALF_WIDTH + radius);
    }
    // The wooden railing is solid while the two ends remain open for crossing.
    if (Math.abs(position.x - riverAt(BRIDGE_Z)) < 4.55 && Math.abs(position.z - BRIDGE_Z) < 1.7) {
      if (onBridge(position.x, position.z)) position.z = THREE.MathUtils.clamp(position.z, BRIDGE_Z - 1.1 + radius * 0.35, BRIDGE_Z + 1.1 - radius * 0.35);
    }
    return position;
  }

  let activeHouse = null;
  return {
    root,
    visualScale,
    spawn: { x: -8, z: 8 },
    bounds: RADIUS,
    riverAt,
    isWater,
    heightAt: (x, z) => {
      if (onBridge(x, z)) return 0.28;
      const house = houses.find(h => Math.abs(x - h.x) < h.halfWidth - 0.12
        && Math.abs(z - h.z) < h.halfDepth + 0.12);
      return house?.floorHeight ?? groundHeight(x, z);
    },
    resolveMovement,
    traceProjectile: (start, end, radius = .06) => collisionIndex.traceSegment(start, end, radius),
    trees: [...treeLocations.map(({ x, y, z, scale }) => ({ x, y, z, radius: .34 * scale })), ...importedGarden.trees],
    importedAssets: importedGarden.stats,
    grassPatches: tallGrassPatches.map(p => ({ ...p })),
    projectileObstacles: [...collisions, ...buildingWalls].map(body => ({ ...body })),
    setQuality(next) {
      const low = next === 'low';
      grass.count = Math.min(grassCount, low ? 9000 : 16000);
      tallGrass.count = Math.min(tallCount, low ? 6500 : 12000);
      vegetation.setQuality?.(next);
    },
    update(dt, time, playerPosition, zoneRadius = 32) {
      timeUniform.value = time;
      radiusUniform.value = zoneRadius * visualScale;
      river.setZoneRadius(zoneRadius);
      playerUniform.value.copy(playerPosition).multiplyScalar(visualScale);
      vegetation.update(time, playerPosition);
      details.update?.(time);
      importedGarden.update?.(dt, time, playerPosition);
      activeHouse = houses.find(house =>
        Math.abs(playerPosition.x - house.x) < house.halfWidth - 0.45
        && playerPosition.z > house.z - house.halfDepth + 0.55
        && playerPosition.z < house.z + house.halfDepth - 0.3) ?? null;
      for (const house of houses) {
        const inside = house === activeHouse;
        house.roof.visible = !inside;
        house.interior.visible = inside;
        if (house.frontFacade) house.frontFacade.visible = !inside;
      }
      for (const cloud of cloudShadows) {
        cloud.mesh.position.x = ((cloud.x + time * cloud.speed + 54) % 108) - 54;
        cloud.mesh.position.z = cloud.z + Math.sin(time * 0.025 + cloud.x) * 3;
      }
      motes.position.x = Math.sin(time * 0.08) * 0.7;
      motes.position.y = Math.sin(time * 0.35) * 0.17;
      motes.material.opacity = 0.5 + Math.sin(time * 0.7) * 0.12;
    },
    get shelter() { return activeHouse?.name ?? null; },
    houses: houses.map(({ name, x, z, halfWidth, halfDepth }) => ({ name, x, z, halfWidth, halfDepth })),
    concealmentAt(x, z) {
      let coverage = 0;
      for (const patch of tallGrassPatches) coverage = Math.max(coverage, smooth(.13, .29, patchCoverage(patch, x, z)));
      return coverage;
    },
    dispose() {
      const geometries = new Set();
      const materials = new Set();
      root.traverse(child => {
        if (child.geometry) geometries.add(child.geometry);
        if (child.material) materials.add(child.material);
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      shadowTexture.dispose();
      scene.remove(root);
    },
  };
}
