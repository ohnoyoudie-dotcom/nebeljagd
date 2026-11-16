import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WALDHAUS_DEFINITION } from './map/waldhaus-definition.js';
import { createWaldhausWindowLight } from './waldhaus-window-light.js';

const palettes = {
  stone: ['#7f8172', '#91917f', '#888b79', '#9a9883', '#7a8171'],
  plaster: ['#c2af91', '#c5b296', '#bcaa8d'],
};
const seeded = () => {
  let state = 87123;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) | 0; return (state >>> 0) / 4294967296; };
};
function surface(kind) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const random = seeded();
  context.fillStyle = kind === 'stone' ? '#d3d0c2' : '#e2d5bd';
  context.fillRect(0, 0, 256, 256);
  if (kind === 'wood' || kind === 'floor') {
    for (let i = 0; i < 90; i++) {
      const x = random() * 256;
      context.strokeStyle = `rgba(47,30,16,${.035 + random() * .09})`;
      context.lineWidth = .45 + random();
      context.beginPath(); context.moveTo(x, -4);
      context.bezierCurveTo(x + 8, 65, x - 10, 180, x + 3, 260); context.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const x = random() * 256, y = random() * 256;
      context.strokeStyle = '#5e432e30'; context.lineWidth = 1;
      for (let ring = 0; ring < 3; ring++) {
        context.beginPath(); context.ellipse(x, y, 2 + ring * 2, 6 + ring * 4, .07, 0, Math.PI * 2); context.stroke();
      }
    }
    if (kind === 'floor') {
      for (let i = 0; i < 24; i++) {
        const x=random()*256, y=random()*256;
        const fade=context.createRadialGradient(x,y,0,x,y,12+random()*20);
        fade.addColorStop(0, i%4 ? '#eadcc52a' : '#473a2422'); fade.addColorStop(1,'#ac967100');
        context.fillStyle=fade;context.fillRect(x-35,y-35,70,70);
      }
      for(let i=0;i<32;i++) {
        context.strokeStyle=i%3?'#eadcc52b':'#59462f24';context.lineWidth=.6;
        const x=random()*256,y=random()*256;
        context.beginPath();context.moveTo(x,y);context.lineTo(x+(random()-.5)*3,y+4+random()*15);context.stroke();
      }
    }
  } else if (kind === 'plaster') {
    for (let i = 0; i < 80; i++) {
      context.fillStyle = `rgba(97,83,61,${random() * .045})`;
      context.beginPath(); context.ellipse(random() * 256, random() * 256, 5 + random() * 24, 3 + random() * 18, random() * 6, 0, Math.PI * 2); context.fill();
    }
  }
  for (let i = 0; i < 2200; i++) {
    context.fillStyle = random() > .5 ? '#fff8df18' : '#342e2514';
    context.fillRect(random() * 256, random() * 256, .6 + random() * 2, .5 + random() * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Architecture only: all footprint, door and window locations belong to the
 * shared collision plan. The wall height is independent of the floor area. */
export function createWaldhausModel({ rotation = 0, worldRotation = 0, sunDirection } = {}) {
  const def = WALDHAUS_DEFINITION, random = seeded(), floor = def.floorHeight;
  const group = new THREE.Group(), outer = new THREE.Group(), roof = new THREE.Group();
  const frontFacade = new THREE.Group(), interior = new THREE.Group();
  group.name = 'Waldhaus'; outer.name = 'Waldhaus · verwittertes Fachwerk';
  roof.name = 'Waldhaus · offener Dachschnitt'; roof.visible = false;
  frontFacade.name = 'Waldhaus · obere Vorderfassade'; interior.name = 'Waldhaus · leerer Dielenboden';
  group.add(outer, roof, frontFacade, interior);
  const textures = new Set(), materials = new Map(), batches = new Map();
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const mat = (id, kind, options = {}) => {
    const map = kind ? surface(kind) : null;
    if (map) textures.add(map);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86, ...(map ? { map } : {}), ...options });
    material.name = 'Waldhaus · ' + id; materials.set(id, material); return material;
  };
  const wood = mat('Holz', 'wood'), stone = mat('Stein', 'stone'), plaster = mat('Kalkputz', 'plaster');
  const floorWood = mat('Abgenutzte Dielen', 'floor', {roughness:.98});
  const foliage = mat('Moos und niedrige Außenpflanzen', null, {side:THREE.DoubleSide});
  const iron = mat('Eisen', null, { metalness: .65, roughness: .55 });
  const glass = mat('Glas', null, { emissive: '#75816b', emissiveIntensity: .12, metalness: .15, roughness: .4 });
  let parts = 0, floorBoards = 0;
  function geometry(parent, material, geo, x, y, z, tint, rotation = [0, 0, 0]) {
    const position = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
    if (uv) for (let i = 0; i < position.count; i++) {
      const ax = Math.abs(normal.getX(i)), ay = Math.abs(normal.getY(i)), az = Math.abs(normal.getZ(i));
      if (ay >= ax && ay >= az) uv.setXY(i, (position.getX(i) + (material === floorWood ? x : 0)) * .65, (position.getZ(i) + (material === floorWood ? z : 0)) * .65);
      else if (ax > az) uv.setXY(i, position.getZ(i) * .65, position.getY(i) * .65);
      else uv.setXY(i, position.getX(i) * .65, position.getY(i) * .65);
    }
    dummy.position.set(x, y, z); dummy.rotation.set(rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0);
    dummy.updateMatrix(); geo.applyMatrix4(dummy.matrix);
    if (geo.index) { const indexed = geo; geo = indexed.toNonIndexed(); indexed.dispose(); }
    color.set(tint);
    const colors = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      let shade=1;
      if(material===floorWood) {
        const px=geo.attributes.position.getX(i/3),pz=geo.attributes.position.getZ(i/3);
        let distance=Infinity;
        for(const wall of def.architecturalWalls) distance=Math.min(distance,Math.hypot(Math.max(wall.minX-px,0,px-wall.maxX),Math.max(wall.minZ-pz,0,pz-wall.maxZ)));
        shade=.83+.17*THREE.MathUtils.smoothstep(distance,.04,.65);
        // Soft continuous wear varies across the room, never along an entire plank.
        shade*=.975+.025*Math.sin(px*.91+pz*.37)*Math.cos(pz*.73-px*.23);
      }
      colors[i] = color.r*shade; colors[i + 1] = color.g*shade; colors[i + 2] = color.b*shade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!batches.has(parent)) batches.set(parent, new Map());
    const byMaterial = batches.get(parent);
    if (!byMaterial.has(material)) byMaterial.set(material, []);
    byMaterial.get(material).push(geo); parts++;
  }
  function box(parent, material, x, y, z, w, h, d, tint, rotation = [0, 0, 0], round = .025) {
    geometry(parent, material, new RoundedBoxGeometry(w, h, d, 1, Math.min(round, w * .2, h * .2, d * .2)), x, y, z, tint, rotation);
  }
  const choose = kind => palettes[kind][Math.floor(random() * palettes[kind].length)];
  const bounds = def.floorBounds, width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ;
  const centerX = (bounds.minX + bounds.maxX) / 2, centerZ = (bounds.minZ + bounds.maxZ) / 2;
  box(outer, stone, centerX, floor * .42, centerZ, width, .12, depth, '#6c7063');
  // Narrow boards have separate, staggered end joints. Close tones keep the
  // grain and joinery readable without the old checkerboard appearance.
  let boardEdge=bounds.minX;
  while (boardEdge < bounds.maxX-.001) {
    let boardWidth=Math.min(bounds.maxX-boardEdge,.29+random()*.13);
    if(bounds.maxX-boardEdge-boardWidth<.18)boardWidth=bounds.maxX-boardEdge;
    const x=boardEdge+boardWidth/2;boardEdge+=boardWidth;
    let edge = bounds.minZ;
    let length = .75 + random() * 2.2;
    while (edge < bounds.maxZ - .001) {
      let end = Math.min(bounds.maxZ, edge + length);
      if (bounds.maxZ - end < .5) end = bounds.maxZ;
      const z = (edge + end) / 2, variation = random();
      const tint = new THREE.Color('#9b805e').lerp(new THREE.Color('#a38966'), variation).getHex();
      box(interior, floorWood, x, floor - .026, z, boardWidth - .007, .052, end - edge - .009, tint, [], .005);
      floorBoards++;
      edge = end; length = 2.2 + random() * 1.8;
    }
  }
  // The shell and room partitions follow the architectural collision boxes.
  for (const wall of def.architecturalWalls) {
    const w = wall.maxX - wall.minX, d = wall.maxZ - wall.minZ;
    const x = (wall.minX + wall.maxX) / 2, z = (wall.minZ + wall.maxZ) / 2;
    const height = wall.maxY - floor, alongX = w > d, length = alongX ? w : d;
    const front = alongX && Math.abs(wall.maxZ - bounds.maxZ) < .01;
    const low = Math.min(.6, height), parent = front ? frontFacade : outer;
    box(outer, stone, x, floor + low / 2, z, w, low, d, '#777c6d');
    box(parent, plaster, x, floor + low + (height - low) / 2, z, alongX ? w : w * .94, height - low, alongX ? d * .94 : d, choose('plaster'));
    box(parent, wood, x, floor + height + .025, z, alongX?w+.025:.44, .14, alongX?.44:d+.025, '#60432f');
    // A pale, inset cut surface makes even edge-on partitions legible from above.
    box(parent, wood, x, floor + height + .099, z, alongX?w-.06:.34,.012,alongX?.34:d-.06,'#b49a71',[],.006);
    box(outer, wood, x, floor + low + .035, z, w + .02, .11, d + .05, '#6b4a32');
    const posts = Math.max(1, Math.ceil(length / 2.35));
    for (let i = 0; i <= posts; i++) {
      const offset = -length / 2 + Math.min(length - .075, Math.max(.075, i * length / posts));
      box(parent, wood, x + (alongX ? offset : 0), floor + height * .5, z + (alongX ? 0 : offset), alongX ? .15 : w + .08, height, alongX ? d + .08 : .15, '#65452e');
    }
    // Both stone courses use irregular widths and offset joints; the masonry
    // stays within the wall ends so no stone protrudes into a doorway.
    for (let row = 0; row < 2; row++) {
      let edge = -length / 2;
      let step = .34 + random() * .55;
      while (edge < length / 2 - .001) {
        let end = Math.min(length / 2, edge + step);
        if (length / 2 - end < .2) end = length / 2;
        const position = (edge + end) / 2;
        box(outer, stone, x + (alongX ? position : 0), floor + .15 + row * .28, z + (alongX ? 0 : position), alongX ? end - edge - .025 : w + .035 + random()*.02, .235+random()*.025, alongX ? d + .035 + random()*.02 : end - edge - .025, choose('stone'), [], .04);
        edge = end; step = .67 + random() * .4;
      }
    }
  }
  function portal(x, z, doorWidth, alongX, parent = outer) {
    for (const side of [-1, 1]) box(parent, wood, x + (alongX ? side * (doorWidth / 2 + .08) : 0), floor + 1.46, z + (alongX ? 0 : side * (doorWidth / 2 + .08)), alongX ? .14 : .38, 2.92, alongX ? .38 : .14, '#725035');
    box(parent, wood, x, floor + 2.91, z, alongX ? doorWidth + .22 : .48, .19, alongX ? .48 : doorWidth + .22, '#a08052');
    // A flush cross-grain sill remains visible when the front cutaway hides the frame.
    box(interior,wood,x,floor+.004,z,alongX?doorWidth:.46,.012,alongX?.46:doorWidth,'#8e7655',[],.005);
    for(const side of [-1,1]) {
      const px=x+(alongX?side*(doorWidth/2+.1):0),pz=z+(alongX?0:side*(doorWidth/2+.1));
      box(parent,wood,px,floor+1.48,pz,alongX?.18:.46,2.78,alongX?.46:.18,'#9b815b',[],.025);
    }
    for(const side of [-1,1]) {
      const px=x+(alongX?side*(doorWidth/2+.10):0),pz=z+(alongX?0:side*(doorWidth/2+.10));
      box(parent,stone,px,floor+.19,pz,alongX?.18:.43,.38,alongX?.43:.18,'#a59f88',[],.04);
      for(const y of [.58,2.45])box(parent,iron,px,floor+y,pz,alongX?.155:.405,.07,alongX?.405:.155,'#4b5149',[],.01);
    }
  }
  for (const entrance of def.entrances) {
    const alongX = entrance.side === 'north' || entrance.side === 'south';
    const wallCenter = (entrance.boundary + entrance.innerBoundary) / 2, doorWidth = entrance.max - entrance.min;
    portal(alongX ? entrance.center : wallCenter, alongX ? wallCenter : entrance.center, doorWidth, alongX, entrance.side === 'south' ? frontFacade : outer);
    const sign = entrance.side === 'north' || entrance.side === 'west' ? -1 : 1;
    for (const step of [{ offset: .31, height: .12, reach: .64, extra: 0 }, { offset: .63, height: .07, reach: .25, extra: .16 }]) {
      box(outer, stone, alongX ? entrance.center : entrance.boundary + sign * step.offset, step.height / 2, alongX ? entrance.boundary + sign * step.offset : entrance.center, alongX ? doorWidth + step.extra : step.reach, step.height, alongX ? step.reach : doorWidth + step.extra, '#918b78');
    }
  }
  for (const doorway of def.interiorDoorways) portal(doorway.x, doorway.z, doorway.width, doorway.axis === 'x', interior);
  function windowPanel(plan) {
    const holder = new THREE.Group(); holder.name = 'Waldhaus · bleiverglastes Fenster'; outer.add(holder);
    holder.position.set(plan.x, 0, plan.z);
    holder.rotation.y = { north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 }[plan.side];
    const w = plan.width ?? 1.38, h = plan.height ?? 1.3, y = floor + (plan.sillHeight ?? 1.27) + h / 2;
    box(holder, wood, 0, y, -.015, w+.16, h+.14, .13, '#42382b');
    box(holder, wood, 0, y, .025, w, h, .16, '#6d5238');
    for(const side of [-1,1])box(holder,wood,side*(w/2-.05),y,.17,.1,h+.05,.15,'#b19564');
    box(holder,wood,0,y+h/2+.06,.15,w+.22,.12,.24,'#9f8456');
    box(holder, glass, 0, y, .135, w - .24, h - .25, .055, '#92a898');
    for (const side of [-1, 0, 1]) box(holder, wood, side * (w / 2 - .12), y, .19, .055, h - .2, .06, '#aa8050');
    box(holder, wood, 0, y, .19, w - .22, .06, .06, '#aa8050');
    for (const side of [-1, 1]) {
      const x = side * (w / 2 + .19);
      box(holder, wood, x, y, .06, .35, h - .08, .1, '#65724b');
      for (const offset of [-.35, .35]) box(holder, iron, x, y + offset * h / 1.3, .125, .31, .055, .035, '#4b4e40');
    }
    box(holder, stone, 0, y - h / 2 - .05, .12, w + .24, .16, .43, '#aaa18a');
  }
  for (const window of def.windows) windowPanel(window);
  // Sparse low planting hugs the outside foundation, away from every doorway.
  // These are shallow architectural dressing, never interior or collision props.
  const plantRandom=seeded();
  for(const side of [-1,1])for(const z of [-4.5,-1.9,2.6,4.8]) {
    if(plantRandom()<.3)continue;
    const x=side*(def.footprint.halfWidth+.11);
    for(let j=0;j<5;j++) {
      const px=x+side*plantRandom()*.12,pz=z+(plantRandom()-.5)*.6;
      const h=.08+plantRandom()*.12,geo=new THREE.SphereGeometry(1,6,3);
      geo.scale(.075+plantRandom()*.06,h,.07+plantRandom()*.09);
      geometry(outer,foliage,geo,px,h*.55,pz,j%2?'#677346':'#7c8451');
    }
    box(outer,stone,x,.035,z,.16,.07,.26,'#747664',[0,plantRandom(),0],.03);
  }
  // Moss appears in small irregular patches on selected low exterior stones.
  for(const side of [-1,1])for(const z of [-3.4,.8,4.1]) {
    const geo=new THREE.SphereGeometry(1,7,4);geo.scale(.018,.055,.14);
    geometry(outer,foliage,geo,side*(def.footprint.halfWidth+.035),.19,z,'#63704c');
  }
  // Window-local transforms are baked into the material batches; only the
  // front cutaway remains separately controllable at runtime.
  group.updateMatrixWorld(true);
  const descendant = (node, ancestor) => { for (let current = node; current; current = current.parent) if (current === ancestor) return true; return false; };
  const consolidated = new Map();
  for (const [parent, byMaterial] of batches) {
    const anchor = descendant(parent, frontFacade) ? frontFacade : descendant(parent, interior) ? interior : outer;
    if (!consolidated.has(anchor)) consolidated.set(anchor, new Map());
    const target = consolidated.get(anchor);
    for (const [material, geometries] of byMaterial) {
      if (!target.has(material)) target.set(material, []);
      for (const geo of geometries) { geo.applyMatrix4(parent.matrixWorld); target.get(material).push(geo); }
    }
  }
  for (const anchor of [outer, interior, frontFacade]) anchor.clear();
  for (const [parent, byMaterial] of consolidated) for (const [material, geometries] of byMaterial) {
    const merged = mergeGeometries(geometries, false); geometries.forEach(geo => geo.dispose());
    const mesh = new THREE.Mesh(merged, material); mesh.name = parent.name + ' · ' + material.name;
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
  }
  const windowLight = createWaldhausWindowLight({ rotation, worldRotation, sunDirection });
  interior.add(windowLight.group);
  let drawCalls = 0, triangles = 0;
  group.traverse(node => { if (node.isMesh) { drawCalls++; triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3; } });
  const stats = { drawCalls, triangles, parts, floorBoards, rooms: def.rooms.length, entrances: def.entrances.length };
  group.userData.waldhaus = { ...stats, style: 'weathered-timber-stone-shell', floorHeight: floor };
  let disposed = false;
  return { group, roof, frontFacade, interior, stats, dispose() {
    if (disposed) return; disposed = true;
    const geometries = new Set(), allMaterials = new Set(materials.values());
    group.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) for (const material of [node.material].flat()) allMaterials.add(material);
    });
    geometries.forEach(geo => geo.dispose()); allMaterials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose()); group.removeFromParent();
  } };
}
