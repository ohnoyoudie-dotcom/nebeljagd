import * as THREE from 'three';

const PALETTES = {
  // Muted grass, olive and moss tones. Still honour the edited biome colour.
  meadow: ['#4c6945', .52],
  forest: ['#354b3d', .55],
  marsh: ['#4d6358', .35],
};

/** Keep the editor's chosen regional colours, with a woodland material tint for
 * the green biomes. Snow, heath, ash and sand retain their authored palettes. */
export function terrainPalette(biome, sourceColor, target = new THREE.Color()) {
  target.set(sourceColor);
  const palette = PALETTES[biome];
  if (palette) target.lerp(new THREE.Color(palette[0]), palette[1]);
  return target;
}

const randomSource = seed => () => {
  seed = Math.imul(seed, 1664525) + 1013904223 | 0;
  return (seed >>> 0) / 4294967296;
};

/** Shared join offset closes the inner wedge between two path segments. */
export function pathVergeOffset(points, index, width) {
  const normal=(a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz)||1;return [dz/length,-dx/length];};
  const before=normal(points[Math.max(0,index-1)],points[index===0?1:index]);
  const after=normal(points[index===points.length-1?index-1:index],points[Math.min(points.length-1,index+1)]);
  const dot=before[0]*after[0]+before[1]*after[1];
  if(dot<-.5)return after.map(v=>v*width/2);
  return [(before[0]+after[0])*width/(2*(1+dot)),(before[1]+after[1])*width/(2*(1+dot))];
}

/** One seamless repeated patch of irregular paving. Polygon data is kept pure
 * so the artwork can be checked without starting a renderer. */
export function cobbleCells(seed = 71402, grid = 5) {
  const random = randomSource(seed), cells = [];
  for (let row = 0; row < grid; row++) for (let column = 0; column < grid; column++) {
    const cx = ((column + .5 + (row % 2 ? .5 : 0) + (random() - .5) * .6) / grid + 1) % 1;
    const cy = (row + .5 + (random() - .5) * .6) / grid;
    cells.push({ cx, cy, tint: .79 + random() * .23 });
  }
  // Periodic Voronoi cells create close-fitting, uneven flagstones. This avoids
  // circular pebbles in a conspicuous repeating grid and stays one small map.
  for (const cell of cells) {
    let polygon = [[cell.cx - 1, cell.cy - 1], [cell.cx + 1, cell.cy - 1], [cell.cx + 1, cell.cy + 1], [cell.cx - 1, cell.cy + 1]];
    for (const other of cells) for (const ox of [-1, 0, 1]) for (const oy of [-1, 0, 1]) {
      if (other === cell && ox === 0 && oy === 0) continue;
      const dx = other.cx + ox - cell.cx, dy = other.cy + oy - cell.cy;
      const limit = dx * (cell.cx + dx / 2) + dy * (cell.cy + dy / 2);
      const next = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        const da = a[0] * dx + a[1] * dy - limit, db = b[0] * dx + b[1] * dy - limit;
        if (da <= 0) next.push(a);
        if ((da <= 0) !== (db <= 0)) {
          const t = da / (da - db); next.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      polygon = next;
    }
    const inset = .86 + random() * .055;
    cell.points = polygon.map(([x, y]) => [cell.cx + (x - cell.cx) * inset, cell.cy + (y - cell.cy) * inset]);
  }
  return cells;
}

function canvas(size) {
  const result = document.createElement('canvas'); result.width = result.height = size;
  return result;
}

function texture(image, color = true) {
  const result = new THREE.CanvasTexture(image);
  result.wrapS = result.wrapT = THREE.RepeatWrapping;
  if (color) result.colorSpace = THREE.SRGBColorSpace;
  result.anisotropy = 4;
  return result;
}

let cached;
/** Original small Canvas artwork: a mottled mineral/earth substrate, earth and grey
 * stones. No additional world meshes or downloaded textures are required. */
export function createTerrainArtwork() {
  if (cached) return cached;
  const size = 512, ground = canvas(size), earth = canvas(size), paving = canvas(size), relief = canvas(size), centers = canvas(size);
  const g = ground.getContext('2d'), e = earth.getContext('2d'), p = paving.getContext('2d'), h = relief.getContext('2d');
  const centerContext = centers.getContext('2d');
  const random = randomSource(21112);
  g.fillStyle = '#eef0e8'; g.fillRect(0, 0, size, size);
  e.fillStyle = '#786650'; e.fillRect(0, 0, size, size);
  // Periodic multi-scale pigment fields: small organic washes rather than
  // Voronoi paving on the lawn. Raster detail stays independent of mesh size.
  const fields = [11,27,73].map(grid => ({grid,values:Array.from({length:grid*grid},()=>random())}));
  const noise = (u,v,field) => {
    const {grid,values}=field,x=u*grid,y=v*grid,ix=Math.floor(x),iy=Math.floor(y);
    let fx=x-ix,fy=y-iy; fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
    const at=(a,b)=>values[(b%grid)*grid+(a%grid)];
    return (at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;
  };
  const gd=g.createImageData(size,size),ed=e.createImageData(size,size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,i=(y*size+x)*4;
    const n=noise(u,v,fields[0])*.56+noise(u,v,fields[1])*.33+noise(u,v,fields[2])*.11;
    const t=THREE.MathUtils.smoothstep(n,.28,.72),grain=(noise(u,v,fields[2])-.5)*7;
    // An olive highlight and a slightly cooler moss shade, without black spots.
    for(let k=0;k<3;k++)gd.data[i+k]=[196,208,182][k]+t*[25,13,12][k]+grain;
    for(let k=0;k<3;k++)ed.data[i+k]=[125,108,82][k]+t*18+grain;
    gd.data[i+3]=ed.data[i+3]=255;
  }
  g.putImageData(gd,0,0);e.putImageData(ed,0,0);
  for (let i = 0; i < 1450; i++) {
    const x = random() * size, y = random() * size;
    g.fillStyle = i % 3 ? '#655c4c10' : '#ffffec18';
    g.beginPath(); g.ellipse(x, y, .5 + random() * 2.2, .4 + random() * 1.2, random() * 6, 0, Math.PI * 2); g.fill();
    e.fillStyle = i % 4 ? '#30281f19' : '#dbc5a021';
    e.beginPath(); e.ellipse(x, y, .4 + random() * 2.1, .4 + random() * 1.4, random() * 6, 0, Math.PI * 2); e.fill();
  }
  // Short worn strokes and grit in the earth; the separate transparent atlas
  // lets path shaders place individual stones only along their irregular verge.
  for(let i=0;i<190;i++) {
    const x=random()*size,y=random()*size;
    e.strokeStyle=i%3?'#e0c99c15':'#51473018';e.lineWidth=.6+random()*1.4;
    e.beginPath();e.moveTo(x,y);e.lineTo(x+2+random()*5,y+5+random()*18);e.stroke();
  }
  p.clearRect(0,0,size,size);
  h.fillStyle = '#404040'; h.fillRect(0, 0, size, size);
  const trace = (ctx, points, ox, oy, shift = 0) => {
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const previous = points[(i + points.length - 1) % points.length], current = points[i], next = points[(i + 1) % points.length];
      const mid = [current[0] + (previous[0] - current[0]) * .28, current[1] + (previous[1] - current[1]) * .28];
      if (!i) ctx.moveTo(mid[0] * size + ox, mid[1] * size + oy + shift);
      else ctx.lineTo(mid[0] * size + ox, mid[1] * size + oy + shift);
      ctx.quadraticCurveTo(current[0] * size + ox, current[1] * size + oy + shift,
        (current[0] + (next[0] - current[0]) * .28) * size + ox, (current[1] + (next[1] - current[1]) * .28) * size + oy + shift);
    }
    ctx.closePath();
  };
  for (const cell of cobbleCells(71402, 7)) for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
    if (cell.tint < .85) continue;
    const points=cell.points.map(([x,y])=>[cell.cx+(x-cell.cx)*.68,cell.cy+(y-cell.cy)*.68]);
    trace(p, points, ox, oy, 2); p.fillStyle = '#514b3d55'; p.fill();
    const value = Math.round(170 * cell.tint);
    const gradient = p.createLinearGradient(0, cell.cy * size + oy - 35, 0, cell.cy * size + oy + 35);
    gradient.addColorStop(0, `rgb(${value + 12},${value + 14},${value + 11})`);
    gradient.addColorStop(1, `rgb(${value - 8},${value - 6},${value - 8})`);
    trace(p, points, ox, oy); p.fillStyle = gradient; p.fill();
    trace(centerContext,points,ox,oy);
    centerContext.fillStyle=`rgb(${Math.round(cell.cx*255)},${Math.round(cell.cy*255)},0)`;
    centerContext.fill();
    p.strokeStyle='#d7d0b73c';p.lineWidth=1.3;p.stroke();
    trace(h, points, ox, oy); h.fillStyle = '#c0c0c0'; h.fill();
    h.strokeStyle = '#858585'; h.lineWidth = 2.5; h.stroke();
  }
  const soil = canvas(size), sc = soil.getContext('2d');
  sc.drawImage(earth,0,0); const samples=sc.getImageData(0,0,size,size);
  for(let i=0;i<samples.data.length;i+=4){
    const value=Math.min(255,Math.round((samples.data[i]+samples.data[i+1]+samples.data[i+2])/3*1.9));
    samples.data[i]=samples.data[i+1]=samples.data[i+2]=value;
  }
  sc.putImageData(samples,0,0);
  cached = { soilDetail: texture(soil), ground: texture(ground), earth: texture(earth), paving: texture(paving), pavingBump: texture(relief, false), stoneCenters: texture(centers,false) };
  cached.stoneCenters.minFilter=cached.stoneCenters.magFilter=THREE.NearestFilter;
  cached.stoneCenters.generateMipmaps=false;
  cached.ground.name = 'Magebrawl · gemalter Naturboden ohne Grashalme';
  cached.paving.name = 'Magebrawl · einzelne verwitterte Randsteine';
  cached.earth.name = 'Magebrawl · erdiger Wegsaum';
  return cached;
}
