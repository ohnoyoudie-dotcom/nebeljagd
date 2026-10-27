import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// All silhouettes, bark and leaf textures are authored here; no downloaded assets.
function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let v = Math.imul(seed ^ seed >>> 15, 1 | seed);
    v = v + Math.imul(v ^ v >>> 7, 61 | v) ^ v;
    return ((v ^ v >>> 14) >>> 0) / 4294967296;
  };
}

function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function barkTexture(birch = false) {
  return canvasTexture(256, 512, (ctx, w, h) => {
    const random = rng(birch ? 818 : 771);
    ctx.fillStyle = birch ? '#b8b7a2' : '#766953'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 340; i++) {
      const x = random() * w, y = random() * h;
      const wide = birch ? 8 + random() * 35 : 1 + random() * 5;
      const tall = birch ? 1 + random() * 6 : 20 + random() * 110;
      ctx.fillStyle = birch ? `rgba(35,40,34,${.15 + random() * .4})` : `rgba(29,30,22,${.08 + random() * .24})`;
      ctx.fillRect(x, y, wide, tall);
      if (!birch) {
        ctx.strokeStyle = '#a4967040'; ctx.lineWidth = .7;
        ctx.beginPath(); ctx.moveTo(x + 2, y); ctx.bezierCurveTo(x - 3, y + 20, x + 8, y + 47, x + 1, y + tall); ctx.stroke();
      }
    }
    for (let i = 0; i < 48; i++) {
      ctx.fillStyle = i % 2 ? '#8d9b7040' : '#c2b78b28';
      ctx.beginPath(); ctx.ellipse(random() * w, random() * h, 2 + random() * 8, 2 + random() * 10, random() * 3, 0, Math.PI * 2); ctx.fill();
    }
  });
}

function foliageTexture(pine = false) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#b9b790'; ctx.lineCap = 'round'; ctx.lineWidth = pine ? 3 : 4;
    ctx.beginPath(); ctx.moveTo(127, 239); ctx.bezierCurveTo(114, 174, 143, 113, 129, 20); ctx.stroke();
    if (pine) {
      for (let row = 0; row < 12; row++) {
        const y = 35 + row * 15;
        for (const side of [-1, 1]) for (let needle = 0; needle < 4; needle++) {
          ctx.strokeStyle = ['#718766', '#80936c', '#62795c', '#94a17a'][needle];
          ctx.lineWidth = 4.7;
          ctx.beginPath(); ctx.moveTo(128, y + 11); ctx.quadraticCurveTo(128 + side * (25 + needle * 7), y - 6, 128 + side * (33 + needle * 8), y - 16 + needle * 3); ctx.stroke();
        }
      }
    } else {
      const random = rng(279);
      for (let row = 0; row < 4; row++) for (const side of [-1, 1]) {
        const y = 48 + row * 44;
        const tipX = 128 + side * (46 + random() * 24);
        const tipY = y - 25 - random() * 14;
        ctx.strokeStyle = '#8c9b7133'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(129, y + 9); ctx.lineTo(tipX, tipY); ctx.stroke();
        const gradient = ctx.createLinearGradient(128, y, tipX, tipY);
        gradient.addColorStop(0, '#526d45'); gradient.addColorStop(.5, '#82985f'); gradient.addColorStop(1, '#a5b47c');
        ctx.fillStyle = gradient;
        ctx.beginPath(); ctx.moveTo(127, y + 7);
        ctx.bezierCurveTo(128 + side * 52, y + 34, tipX + side * 23, tipY + 20, tipX, tipY);
        ctx.bezierCurveTo(tipX - side * 16, tipY - 26, 131 + side * 5, y - 26, 127, y + 7); ctx.fill();
        ctx.strokeStyle = '#e3e1b04f'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(129, y + 4); ctx.lineTo(tipX, tipY); ctx.stroke();
      }
      ctx.fillStyle = '#93a56e'; ctx.beginPath(); ctx.ellipse(129, 28, 20, 27, -.12, 0, Math.PI * 2); ctx.fill();
    }
  });
}

function treeModel(species, sparse = false) {
  const random = rng(991 + species * 613);
  const trunkPieces = [];
  const clusters = [];
  const isPine = species === 2;
  const isBirch = species === 1;
  const height = isPine ? 7.2 : isBirch ? 6.8 : 6.0;
  const direction = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  function branch(a, b, baseRadius, tipRadius) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    direction.subVectors(end, start);
    const piece = new THREE.CylinderGeometry(tipRadius, baseRadius, direction.length(), 8, 2);
    rotation.setFromUnitVectors(up, direction.normalize());
    piece.applyQuaternion(rotation); piece.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    trunkPieces.push(piece);
  }
  const lean = isBirch ? .36 : -.13;
  branch([0, 0, 0], [lean, height * .7, -.1], isBirch ? .21 : .34, isBirch ? .08 : .12);
  branch([lean, height * .7, -.1], [lean * 1.7, height, .05], .11, .025);
  // Visible buttress roots embed the trunk naturally into the ground.
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * .4 + species;
    branch([Math.cos(a) * .68, .025, Math.sin(a) * .68], [0, .65, 0], .045, .15);
  }
  const rings = isPine ? 7 : 3;
  for (let ring = 0; ring < rings; ring++) {
    const y = isPine ? 1.65 + ring * .76 : 2.75 + ring * .85;
    const count = isPine ? 6 : isBirch ? 4 : 5;
    const radius = isPine ? 2.55 - ring * .30 : (isBirch ? 1.9 : 2.35) - ring * .26;
    for (let limb = 0; limb < count; limb++) {
      const angle = limb / count * Math.PI * 2 + ring * 1.77 + random() * .37;
      const reach = radius * (.83 + random() * .3);
      const x = Math.cos(angle) * reach, z = Math.sin(angle) * reach;
      const middle = [x * .52 + lean, y + (isPine ? -.06 : .38), z * .52];
      const tip = [x + lean, y + (isPine ? -.26 : .75), z];
      branch([lean * .5, y - .15, 0], middle, isPine ? .095 : .13, .055);
      branch(middle, tip, .055, .018);
      clusters.push({ x: tip[0], y: tip[1] + .23, z: tip[2], rx: isPine ? .99 : 1.22, ry: isPine ? .46 : .94, rz: isPine ? .82 : 1.14 });
      if (!isPine) {
        const sideAngle = angle + .57;
        const fork = [x * .7 + Math.cos(sideAngle) * .7, y + 1.2, z * .7 + Math.sin(sideAngle) * .7];
        branch(middle, fork, .045, .012);
        clusters.push({ x: fork[0], y: fork[1] + .05, z: fork[2], rx: .87, ry: .9, rz: .83 });
      }
    }
  }
  clusters.push({ x: lean, y: height - .25, z: .05, rx: isPine ? .7 : 1.2, ry: .85, rz: isPine ? .7 : 1.15 });
  const barkGeometry = mergeGeometries(trunkPieces);
  trunkPieces.forEach(geometry => geometry.dispose());
  const positions = [], normals = [], uvs = [], colors = [], indices = [];
  const density = sparse ? 12 : isPine ? 19 : 24;
  const center = new THREE.Vector3();
  const normal = new THREE.Vector3(), axisX = new THREE.Vector3(), axisY = new THREE.Vector3();
  const local = new THREE.Vector3();
  const leafColor = new THREE.Color();
  for (const c of clusters) for (let leaf = 0; leaf < density; leaf++) {
    const azimuth = random() * Math.PI * 2, latitude = Math.acos(2 * random() - 1);
    const radius = .32 + Math.pow(random(), .32) * .72;
    center.set(c.x + Math.cos(azimuth) * Math.sin(latitude) * c.rx * radius,
      c.y + Math.cos(latitude) * c.ry * radius, c.z + Math.sin(azimuth) * Math.sin(latitude) * c.rz * radius);
    normal.set(Math.cos(azimuth) * Math.sin(latitude), .3 + Math.abs(Math.cos(latitude)) * .7, Math.sin(azimuth) * Math.sin(latitude)).normalize();
    // Leaf planes are independently oriented in 3D; no camera-facing billboards.
    axisX.crossVectors(normal, up).normalize();
    if (axisX.lengthSq() < .01) axisX.set(1, 0, 0);
    axisY.crossVectors(normal, axisX).normalize();
    const twist = random() * Math.PI * 2;
    axisX.applyAxisAngle(normal, twist); axisY.applyAxisAngle(normal, twist);
    const width = (isPine ? .79 : .67) * (sparse ? 1.20 : 1) * (.8 + random() * .45);
    const length = width * (isPine ? 1.35 : 1.1);
    const shade = .72 + random() * .4;
    leafColor.setRGB(shade, shade, shade * (.9 + random() * .12));
    const first = positions.length / 3;
    for (let row = 0; row <= 2; row++) for (let side = 0; side < 2; side++) {
      const u = side, v = row / 2;
      local.copy(center).addScaledVector(axisX, (u - .5) * width).addScaledVector(axisY, (v - .5) * length).addScaledVector(normal, Math.sin(v * Math.PI) * .10);
      positions.push(local.x, local.y, local.z); normals.push(normal.x, normal.y, normal.z); uvs.push(u, v); colors.push(leafColor.r, leafColor.g, leafColor.b);
    }
    for (let row = 0; row < 2; row++) {
      const a = first + row * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const foliageGeometry = new THREE.BufferGeometry();
  foliageGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  foliageGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  foliageGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  foliageGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  foliageGeometry.setIndex(indices);
  foliageGeometry.computeBoundingSphere();
  return { barkGeometry, foliageGeometry };
}

/** Spatial branch-and-leaf canopies with shared materials, instancing and distance LOD. */
export function createVegetation(root, treeLocations, { quality = 'high' } = {}) {
  const group = new THREE.Group(); group.name = 'Eichen, Birken und Waldkiefern'; root.add(group);
  const playerUniform = { value: new THREE.Vector3(-8, 0, 8) };
  const timeUniform = { value: 0 };
  let mode = quality;
  const barkMaps = [barkTexture(false), barkTexture(true)];
  const leafMaps = [foliageTexture(false), foliageTexture(true)];
  const random = rng(11667);
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  const meshes = [];
  const trees = treeLocations.map((tree, index) => ({ ...tree,
    species: tree.fir ? 2 : index % 3 === 1 ? 1 : 0,
    yaw: random() * Math.PI * 2,
    stretchX: .88 + random() * .24, stretchY: .92 + random() * .18,
    amber: !tree.fir && index % 11 === 0,
    near: false,
  }));
  for (let species = 0; species < 3; species++) {
    const list = trees.filter(tree => tree.species === species);
    if (!list.length) continue;
    const full = treeModel(species), sparse = treeModel(species, true);
    sparse.barkGeometry.dispose();
    const barkMat = new THREE.MeshStandardMaterial({ map: barkMaps[species === 1 ? 1 : 0], color: species === 1 ? '#e1dfc5' : '#99836a', roughness: .96 });
    const leafMat = new THREE.MeshStandardMaterial({ map: leafMaps[species === 2 ? 1 : 0], color: '#d9ddc0', vertexColors: true,
      alphaTest: .45, side: THREE.DoubleSide, roughness: .93, forceSinglePass: true });
    leafMat.onBeforeCompile = shader => {
      shader.uniforms.uCanopyPlayer = playerUniform; shader.uniforms.uCanopyTime = timeUniform;
      shader.vertexShader = `uniform float uCanopyTime; varying vec3 vCanopyOrigin;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vCanopyOrigin = (instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
        float sway = sin(uCanopyTime * .73 + vCanopyOrigin.x * .37 + position.y * .6);
        transformed.x += sway * .035 * smoothstep(2.0, 6.0, position.y);
        transformed.z += sin(uCanopyTime * .62 + position.x) * .023 * smoothstep(2.0, 6.0, position.y);
      `);
      shader.fragmentShader = `uniform vec3 uCanopyPlayer; varying vec3 vCanopyOrigin;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
        #include <alphatest_fragment>
        float canopyDistance = distance(vCanopyOrigin.xz, uCanopyPlayer.xz);
        float canopyCoverage = mix(.35, 1., smoothstep(1.5, 3.5, canopyDistance));
        float screenPattern = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
        if(screenPattern > canopyCoverage) discard;
      `);
    };
    const bark = new THREE.InstancedMesh(full.barkGeometry, barkMat, list.length);
    const near = new THREE.InstancedMesh(full.foliageGeometry, leafMat, list.length);
    const far = new THREE.InstancedMesh(sparse.foliageGeometry, leafMat, list.length);
    bark.name = ['Eichenstämme und verzweigte Äste', 'Birkenstämme und feine Äste', 'Kiefernstämme und Astkränze'][species];
    near.name = ['Eichenlaub', 'Birkenlaub', 'Kiefernnadeln'][species] + ' · Nahstufe';
    far.name = near.name.replace('Nahstufe', 'Fernstufe');
    bark.castShadow = bark.receiveShadow = true;
    near.castShadow = true; near.receiveShadow = true;
    far.castShadow = quality !== 'low'; far.receiveShadow = false;
    near.instanceMatrix.setUsage(THREE.DynamicDrawUsage); far.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    near.frustumCulled = far.frustumCulled = false;
    group.add(bark, near, far);
    list.forEach((tree, index) => {
      transform.position.set(tree.x, (tree.y || 0) - .015, tree.z); transform.rotation.set(0, tree.yaw, 0);
      transform.scale.set(tree.scale * tree.stretchX, tree.scale * tree.stretchY, tree.scale / tree.stretchX);
      transform.updateMatrix(); bark.setMatrixAt(index, transform.matrix);
      tree.matrix = transform.matrix.clone();
      if (tree.amber) color.setHSL(.15, .35, .65);
      else if (species === 1) color.setHSL(.22 + random() * .025, .22, .53 + random() * .05);
      else if (species === 2) color.setHSL(.29 + random() * .025, .24, .42 + random() * .07);
      else color.setHSL(.24 + random() * .03, .28, .49 + random() * .07);
      tree.color = color.clone();
    });
    bark.instanceMatrix.needsUpdate = true;
    meshes.push({ list, bark, near, far });
  }
  let lastLOD = -10;
  function update(time, playerPosition) {
    timeUniform.value = time;
    if (playerPosition) playerUniform.value.copy(playerPosition);
    if (time - lastLOD < .5) return;
    lastLOD = time;
    const range = mode === 'low' ? 18 : 26;
    for (const { list, near, far } of meshes) {
      let nearIndex = 0, farIndex = 0;
      for (const tree of list) {
        const distance = Math.hypot(tree.x - playerUniform.value.x, tree.z - playerUniform.value.z);
        tree.near = distance < range + (tree.near ? 2 : -2);
        const mesh = tree.near ? near : far;
        const index = tree.near ? nearIndex++ : farIndex++;
        mesh.setMatrixAt(index, tree.matrix); mesh.setColorAt(index, tree.color);
      }
      near.count = nearIndex; far.count = farIndex;
      near.instanceMatrix.needsUpdate = far.instanceMatrix.needsUpdate = true;
      if (near.instanceColor) near.instanceColor.needsUpdate = true;
      if (far.instanceColor) far.instanceColor.needsUpdate = true;
    }
  }
  update(0, playerUniform.value);
  return {
    group, update,
    setQuality(value) { mode = value === 'low' ? 'low' : 'high'; for (const { far } of meshes) far.castShadow = mode !== 'low'; lastLOD = -10; },
    get stats() { return { trees: trees.length, species: 3, drawCalls: meshes.length * 3,
      nearTrees: trees.filter(tree => tree.near).length, farTrees: trees.filter(tree => !tree.near).length }; },
  };
}
