import { getHouseMaterialColors } from './map/house-colors.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WALDHAUS_DEFINITION } from './map/waldhaus-definition.js';
import { getHouseAppearance } from './map/house-builder.js';
import { createWaldhausWindowLight } from './waldhaus-window-light.js';
import { createWaldhausSurface } from './waldhaus-materials.js';
import { createWaldhausStoneSegment, WALDHAUS_STONE_LENGTH } from './waldhaus-stone.js';

const palettes = {
  plaster: ['#d4c7a9', '#cebea0', '#d7c9ad'],
};
const seeded = (seed = 87123) => {
  let state = seed;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) | 0; return (state >>> 0) / 4294967296; };
};
/** Architecture only: all footprint, door and window locations belong to the
 * shared collision plan. The wall height is independent of the floor area. */
export function createWaldhausModel({ rotation = 0, worldRotation = 0, sunDirection, stoneMaterial,
  definition = WALDHAUS_DEFINITION, houseStyle, houseSeed, houseStoneColor, houseWallColor } = {}) {
  const def = definition, appearance = getHouseAppearance({houseStyle,houseSeed});
  const materialColors = getHouseMaterialColors({houseStoneColor,houseWallColor});
  const random = seeded(appearance.seed), floor = def.floorHeight;
  const facadeRandom = seeded(appearance.seed ^ 0x5e371);
  const legacy = appearance.seed === 87123;
  const variation = legacy ? 0 : facadeRandom();
  const woodTone = new THREE.Color(appearance.woodTint);
  const plasterTone = new THREE.Color(appearance.plasterTint);
  const floorTone = new THREE.Color(appearance.floorTint);
  if (!legacy) {
    woodTone.multiplyScalar(.74 + variation * .25);
    plasterTone.lerp(new THREE.Color(['#e5d3ac','#c9d5c3','#eedfc5'][Math.floor(facadeRandom()*3)]), .22 + facadeRandom()*.2);
    floorTone.multiplyScalar(.86 + facadeRandom()*.13);
  }
  const group = new THREE.Group(), outer = new THREE.Group(), roof = new THREE.Group();
  const frontFacade = new THREE.Group(), interior = new THREE.Group();
  group.name = def.label; outer.name = 'Waldhaus · verwittertes Fachwerk';
  roof.name = 'Waldhaus · offener Dachschnitt'; roof.visible = false;
  frontFacade.name = 'Waldhaus · obere Vorderfassade'; interior.name = 'Waldhaus · leerer Dielenboden';
  group.add(outer, roof, frontFacade, interior);
  const textures = new Set(), materials = new Map(), batches = new Map();
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const mat = (id, kind, options = {}) => {
    const { map, bumpMap } = kind ? createWaldhausSurface(kind) : {};
    if (map) textures.add(map);
    if (bumpMap) textures.add(bumpMap);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9,
      ...(map ? { map, bumpMap, bumpScale: {wood:.055,floor:.022,plaster:.035,stone:.065}[kind] } : {}), ...options });
    material.name = 'Waldhaus · ' + id; materials.set(id, material); return material;
  };
  const wood = mat('Holz', 'wood'), stone = mat('Stein', 'stone'), plaster = mat('Kalkputz', 'plaster');
  // Original Tripo maps belong to the loaded scenery kit. This model owns only
  // its material clone; disposing one house must not release the shared maps.
  const wallStone = stoneMaterial?.clone() ?? new THREE.MeshStandardMaterial({ color:'#a49a82', roughness:.95 });
  wallStone.vertexColors = true;
  wallStone.color.multiply(new THREE.Color(materialColors.stone.color));
  wallStone.name = 'Waldhaus · originale verwitterte Tripo-Steine';
  materials.set('Tripo-Sockel', wallStone);
  const floorWood = mat('Abgenutzte Dielen', 'floor', {roughness:.98});
  const foliage = mat('Moos und niedrige Außenpflanzen', null, {side:THREE.DoubleSide});
  const iron = mat('Eisen', null, { metalness: .65, roughness: .55 });
  const glass = mat('Glas', null, { emissive: '#75816b', emissiveIntensity: .12, metalness: .15, roughness: .4 });
  let parts = 0, floorBoards = 0;
  function geometry(parent, material, geo, x, y, z, tint, rotation = [0, 0, 0], grainAxis = 'y', preserveUV = false) {
    const position = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
    if (uv && !preserveUV) for (let i = 0; i < position.count; i++) {
      const ax = Math.abs(normal.getX(i)), ay = Math.abs(normal.getY(i)), az = Math.abs(normal.getZ(i));
      if (ay >= ax && ay >= az) {
        const u=position.getX(i)+(material===floorWood?x:0), v=position.getZ(i)+(material===floorWood?z:0);
        uv.setXY(i, (grainAxis==='x'?v:u)*.65, (grainAxis==='x'?u:v)*.65);
      }
      else if (ax > az) uv.setXY(i, position.getZ(i) * .65, position.getY(i) * .65);
      else uv.setXY(i, (grainAxis==='x'?position.getY(i):position.getX(i))*.65, (grainAxis==='x'?position.getX(i):position.getY(i))*.65);
    }
    dummy.position.set(x, y, z); dummy.rotation.set(rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0);
    dummy.updateMatrix(); geo.applyMatrix4(dummy.matrix);
    if (geo.index) { const indexed = geo; geo = indexed.toNonIndexed(); indexed.dispose(); }
    color.set(tint);
    if (material === wood) color.multiply(woodTone);
    if (material === plaster) {
      color.multiply(plasterTone);
      if (appearance.style === 'lime') color.lerp(new THREE.Color('#eee5cf'), .43);
      if (materialColors.wall.color) color.lerp(new THREE.Color(materialColors.wall.color), .88);
    }
    if (material === floorWood) color.multiply(floorTone);
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
      if(material===plaster) {
        // Broad ambient shading at the masonry and timber joins, visible at game zoom.
        const py=geo.attributes.position.getY(i/3)-floor;
        shade*=.76+.24*THREE.MathUtils.smoothstep(py,.55,1.3);
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
    const geo=new RoundedBoxGeometry(w,h,d,1,Math.min(round,w*.2,h*.2,d*.2));
    const axis=w>h&&w>d?'x':d>h?'z':'y';
    if(material===wood||material===stone) {
      // A continuous deformation keeps shared vertices together: no cracks or
      // hard random noise, just a subtly hewn silhouette and softened corners.
      const p=geo.attributes.position, extent={x:w,y:h,z:d}[axis];
      const amount=material===wood?.009:.013;
      const seed=x*1.37+y*2.13+z*.83;
      for(let i=0;i<p.count;i++) {
        const px=p.getX(i),py=p.getY(i),pz=p.getZ(i);
        const along=(axis==='x'?px:axis==='y'?py:pz)/Math.max(.01,extent);
        const swell=Math.sin(along*7+seed)*Math.cos(along*3-seed*.71)*amount;
        p.setXYZ(i,px+(axis==='x'?0:px/(w*.5)*swell),py+(axis==='y'?0:py/(h*.5)*swell*.5),pz+(axis==='z'?0:pz/(d*.5)*swell));
      }
      geo.computeVertexNormals();
    }
    geometry(parent,material,geo,x,y,z,tint,rotation,axis);
  }
  const choose = kind => palettes[kind][Math.floor(random() * palettes[kind].length)];
  const bounds = def.floorBounds, width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ;
  const centerX = (bounds.minX + bounds.maxX) / 2, centerZ = (bounds.minZ + bounds.maxZ) / 2;
  for (const area of def.floorAreas ?? [bounds]) box(outer, stone, (area.minX+area.maxX)/2, floor * .42, (area.minZ+area.maxZ)/2, area.maxX-area.minX, .12, area.maxZ-area.minZ, '#6c7063');
  // The two smaller rooms have their own transverse floor laying. The quiet
  // palette stays shared, while the direction change makes each room legible.
  const floorAreas=def.floorAreas ?? [
    {minX:bounds.minX,maxX:2.2,minZ:bounds.minZ,maxZ:bounds.maxZ,alongZ:true},
    {minX:2.2,maxX:bounds.maxX,minZ:bounds.minZ,maxZ:0,alongZ:false},
    {minX:2.2,maxX:bounds.maxX,minZ:0,maxZ:bounds.maxZ,alongZ:false},
  ];
  for(const area of floorAreas) {
    const acrossMin=area.alongZ?area.minX:area.minZ,acrossMax=area.alongZ?area.maxX:area.maxZ;
    const alongMin=area.alongZ?area.minZ:area.minX,alongMax=area.alongZ?area.maxZ:area.maxX;
    let boardEdge=acrossMin;
    while(boardEdge<acrossMax-.001) {
      let boardWidth=Math.min(acrossMax-boardEdge,.34+random()*.13);
      if(acrossMax-boardEdge-boardWidth<.18)boardWidth=acrossMax-boardEdge;
      const across=boardEdge+boardWidth/2;boardEdge+=boardWidth;
      let edge=alongMin,length=.8+random()*2.3;
      while(edge<alongMax-.001) {
        let end=Math.min(alongMax,edge+length);
        if(alongMax-end<.5)end=alongMax;
        const along=(edge+end)/2;
        const tint=new THREE.Color('#977851').lerp(new THREE.Color('#a78a62'),random()).getHex();
        box(interior,floorWood,area.alongZ?across:along,floor-.026,area.alongZ?along:across,
          area.alongZ?boardWidth-.008:end-edge-.01,.052,area.alongZ?end-edge-.01:boardWidth-.008,tint,[],.006);
        floorBoards++;edge=end;length=2.1+random()*1.7;
      }
    }
  }
  // The shell and room partitions follow the architectural collision boxes.
  for (const wall of def.architecturalWalls) {
    const w = wall.maxX - wall.minX, d = wall.maxZ - wall.minZ;
    const x = (wall.minX + wall.maxX) / 2, z = (wall.minZ + wall.maxZ) / 2;
    const height = wall.maxY - floor, alongX = w > d, length = alongX ? w : d;
    const front = alongX && Math.abs(wall.maxZ - bounds.maxZ) < .01;
    const low = Math.min(.6, height), parent = front ? frontFacade : outer;
    // A recessed mortar core closes hidden cuts without poking through the
    // original sculpted stone recesses. Visible stones keep their X/Y scale.
    box(outer, stone, x, floor + low / 2, z, alongX?w:.1, low, alongX?.1:d, '#625d50');
    for(let offset=0;offset<length-.001;offset+=WALDHAUS_STONE_LENGTH) {
      const segmentLength=Math.min(WALDHAUS_STONE_LENGTH,length-offset);
      const center=-length/2+offset+WALDHAUS_STONE_LENGTH/2;
      geometry(outer,wallStone,createWaldhausStoneSegment(segmentLength),
        x+(alongX?center:0),floor,z+(alongX?0:center),'#ffffff',
        alongX?[]:[0,-Math.PI/2,0],'y',true);
    }
    box(parent, plaster, x, floor + low + (height - low) / 2, z, alongX ? w : w * .94, height - low, alongX ? d * .94 : d, choose('plaster'));
    box(parent, wood, x, floor + height + .025, z, alongX?w+.025:.46, .14, alongX?.46:d+.025, '#65452f',[],.04);
    // A pale, inset cut surface makes even edge-on partitions legible from above.
    box(parent, wood, x, floor + height + .099, z, alongX?w-.08:.33,.012,alongX?.33:d-.08,'#a1845e',[],.006);
    box(outer, wood, x, floor + low + .035, z, w + .02, .16, d + .08, '#6b4a32',[],.03);
    const posts = Math.max(1, Math.ceil(length / 2.35));
    for (let i = 0; i <= posts; i++) {
      const offset = -length / 2 + Math.min(length - .075, Math.max(.075, i * length / posts));
      box(parent, wood, x + (alongX ? offset : 0), floor + height * .5, z + (alongX ? 0 : offset), alongX ? .21 : w + .1, height, alongX ? d + .1 : .21, i%2?'#705036':'#67472f',[],.04);
    }
    // Short diagonal timber braces give the shell the same heavy joinery as
    // the Tripo inn. Leave every glazed opening and every doorway unobscured.
    const external=wall.external ?? (Math.abs(x)>7.6||Math.abs(z)>5.6);
    if(external) for(let i=0;i<posts;i++) {
      const a=-length/2+Math.max(.075,i*length/posts), b=-length/2+Math.min(length-.075,(i+1)*length/posts);
      const run=Math.min(1.1,b-a-.36);
      if(run<.5)continue;
      const sign=i%2?-1:1;
      const offset=(sign>0?a:b)+sign*run/2,px=x+(alongX?offset:0),pz=z+(alongX?0:offset);
      if(def.windows.some(window=>Math.abs((alongX?window.z:window.x)-(alongX?z:x))<.5&&Math.abs((alongX?window.x:window.z)-(alongX?px:pz))<window.width/2+run/2+.22))continue;
      const rise=.98,tilt=sign*Math.atan2(run,rise),span=Math.hypot(run,rise);
      box(parent,wood,px,floor+2.49,pz,alongX?.16:w+.065,span,alongX?d+.065:.16,'#79583b',alongX?[0,0,-tilt]:[tilt,0,0],.028);
    }
  }
  function portal(x, z, doorWidth, alongX, parent = outer, openTop = false) {
    // Interior cutaways deliberately have no beam over the opening: the gap
    // must read as a passage from above, independently of lighting or shadows.
    if(!openTop)box(parent,wood,x,floor+2.91,z,alongX?doorWidth+.34:.52,.22,alongX?.52:doorWidth+.34,'#78583b',[],.045);
    const sillRotation=alongX?[0,Math.PI/2,0]:[];
    box(interior,wood,x,floor+.004,z,.72,.016,doorWidth,'#b39a70',sillRotation,.005);
    for(const side of [-1,1]) {
      const px=x+(alongX?side*(doorWidth/2+.18):0),pz=z+(alongX?0:side*(doorWidth/2+.18));
      box(parent,wood,px,floor+1.47,pz,alongX?.3:.54,2.94,alongX?.54:.3,'#78563a',[],.04);
      box(parent,wood,px,floor+2.99,pz,alongX?.32:.56,.1,alongX?.56:.32,'#b09871',[],.02);
      // Worn raised arris on the jamb, kept entirely outside the clear opening.
      box(parent,wood,px,floor+1.49,pz,alongX?.23:.565,2.73,alongX?.565:.23,'#94734f',[],.035);
    }
    for(const side of [-1,1]) {
      const px=x+(alongX?side*(doorWidth/2+.18):0),pz=z+(alongX?0:side*(doorWidth/2+.18));
      box(parent,stone,px,floor+.19,pz,alongX?.32:.55,.38,alongX?.55:.32,'#a7a18c',[],.05);
      for(const y of [.58,2.45])box(parent,iron,px,floor+y,pz,alongX?.31:.57,.075,alongX?.57:.31,'#4c493c',[],.015);
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
  for (const doorway of def.interiorDoorways) portal(doorway.x, doorway.z, doorway.width, doorway.axis === 'x', interior, true);
  function windowPanel(plan) {
    const holder = new THREE.Group(); holder.name = 'Waldhaus · bleiverglastes Fenster'; outer.add(holder);
    holder.position.set(plan.x, 0, plan.z);
    holder.rotation.y = { north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 }[plan.side];
    const w = plan.width ?? 1.38, h = plan.height ?? 1.3, y = floor + (plan.sillHeight ?? 1.27) + h / 2;
    box(holder, wood, 0, y, -.015, w+.16, h+.14, .13, '#42382b');
    box(holder, wood, 0, y, .025, w, h, .16, '#6d5238');
    for(const side of [-1,1])box(holder,wood,side*(w/2-.05),y,.17,.13,h+.05,.17,'#9e7c50',[],.025);
    box(holder,wood,0,y+h/2+.06,.15,w+.24,.16,.28,'#937048',[],.035);
    box(holder, glass, 0, y, .135, w - .24, h - .25, .055, '#82968b');
    for (const side of [-1, 0, 1]) box(holder, wood, side * (w / 2 - .12), y, .19, .055, h - .2, .06, '#977348');
    box(holder, wood, 0, y, .19, w - .22, .06, .06, '#977348');
    for (const side of [-1, 1]) {
      const x = side * (w / 2 + .19);
      box(holder, wood, x, y, .035, .36, h - .08, .1, '#48533a');
      for(let plank=0;plank<3;plank++)box(holder,wood,x+(plank-1)*.11,y,.09,.103,h-.12,.065,plank===1?'#70764e':'#647047',[],.016);
      for (const offset of [-.35, .35]) box(holder, iron, x, y + offset * h / 1.3, .14, .31, .055, .035, '#44483b');
    }
    box(holder, stone, 0, y - h / 2 - .05, .12, w + .26, .18, .45, '#b1a58b',[],.04);
  }
  for (const window of def.windows) windowPanel(window);
  // Sparse low planting hugs the outside foundation, away from every doorway.
  // These are shallow architectural dressing, never interior or collision props.
  const plantRandom=seeded(appearance.seed);
  for(const side of [-1,1])for(const fraction of [-.75,-1.9/6,2.6/6,.8]) {
    const z=fraction*def.footprint.halfDepth;
    if(def.footprintAreas && !def.footprintAreas.some(a=>side*def.footprint.halfWidth>=a.minX && side*def.footprint.halfWidth<=a.maxX && z>=a.minZ && z<=a.maxZ))continue;
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
  for(const side of [-1,1])for(const fraction of [-3.4/6,.8/6,4.1/6]) {
    const z=fraction*def.footprint.halfDepth;
    if(def.footprintAreas && !def.footprintAreas.some(a=>side*def.footprint.halfWidth>=a.minX && side*def.footprint.halfWidth<=a.maxX && z>=a.minZ && z<=a.maxZ))continue;
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
  const windowLight = createWaldhausWindowLight({ rotation, worldRotation, sunDirection, definition: def });
  interior.add(windowLight.group);
  let drawCalls = 0, triangles = 0;
  group.traverse(node => { if (node.isMesh) { drawCalls++; triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3; } });
  const stats = { drawCalls, triangles, parts, floorBoards, rooms: def.roomCount ?? def.rooms.length, entrances: def.entrances.length };
  group.userData.waldhaus = { ...stats, style: 'weathered-timber-stone-shell', floorHeight: floor,
    stoneSource: stoneMaterial ? 'tripo-wall' : 'untextured-preview', variant: def.variant, houseStyle: appearance.style, houseSeed: appearance.seed,
    houseStoneColor: materialColors.stone.id, houseWallColor: materialColors.wall.id };
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
