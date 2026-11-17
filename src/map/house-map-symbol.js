import { getHouseMaterialColors } from './house-colors.js';
import { getHouseDefinition, isBuilderHouse } from './house-builder.js';

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
const number = value => Math.round(value * 1000) / 1000;
const rect = (minX, minZ, maxX, maxZ, attrs) => `<rect x="${number(minX)}" y="${number(minZ)}" width="${number(maxX-minX)}" height="${number(maxZ-minZ)}" ${attrs}/>`;
const colors = {
  natural: {wall:'#e2d1a4', timber:'#4e3c2b', floor:['#b49160','#a78a61','#9c865e']},
  lime: {wall:'#e7e0c9', timber:'#64503e', floor:['#bc9e72','#b49b76','#aa936e']},
  ochre: {wall:'#c8a56b', timber:'#58402c', floor:['#ab8457','#a27f55','#96774f']},
  dark: {wall:'#a5a399', timber:'#3d3731', floor:['#887966','#827361','#796c5b']},
};
function appearance(object) {
  const style = Object.hasOwn(colors, object.houseStyle) ? object.houseStyle : 'natural';
  const seed = Number.isInteger(object.houseSeed) && object.houseSeed >= 0 && object.houseSeed <= 2147483647 ? object.houseSeed : 87123;
  return {style, seed, colors:colors[style]};
}
/** IDs contain only fixed variant/style enums and bounded numeric seeds. */
export function builderHouseSymbolKey(object) {
  if (!isBuilderHouse(object.variant)) return '';
  const extras = ['houseRooms', 'houseLayout', 'houseStoneColor', 'houseWallColor'];
  const custom = extras.some(key => object[key] !== undefined);
  if (!custom && object.variant === 'waldhaus' && object.houseStyle === undefined && object.houseSeed === undefined && object.houseEntrances === undefined) return 'house-waldhaus';
  const {style,seed} = appearance(object);
  const definition = getHouseDefinition(object);
  const base = `house-${object.variant}-${style}-${seed}-${definition.fixedLayout ? 'fixed' : definition.entrances.length === 1 ? 'single' : 'double'}`;
  if (!custom) return base;
  const {stone,wall} = getHouseMaterialColors(object);
  const rooms = Number.isInteger(object.houseRooms) && object.houseRooms >= 1 && object.houseRooms <= 3 ? object.houseRooms : 'auto';
  const layout = Number.isInteger(object.houseLayout) && object.houseLayout >= 0 && object.houseLayout <= 2 ? object.houseLayout : 0;
  return `${base}-r${rooms}-l${layout}-s${stone.id}-w${wall.id}`;
}

/** Architectural plan generated from the same solid walls and openings as 3D. */
export function builderHouseMapSymbol(object) {
  const key = builderHouseSymbolKey(object);
  if (!key) return '';
  const house = getHouseDefinition(object), {colors: palette, seed} = appearance(object);
  const castle = house.architecture === 'castle';
  const {stone,wall:wallColor} = getHouseMaterialColors(object);
  const stonePalette = {natural:['#a49c84','#96937f','#ada48c'],sand:['#b6a071','#a59372','#c1ac83'],slate:['#838e90','#737f83','#939c9c'],moss:['#90967e','#828c73','#a1a68d']}[stone.id];
  const wallFill = castle ? stonePalette[2] : wallColor.color ?? palette.wall;
  const floorAreas = house.footprintAreas ?? [house.floorBounds];
  const pieces = [`<g id="world-object-${key}">`];
  for (const area of floorAreas) pieces.push(rect(area.minX,area.minZ,area.maxX,area.maxZ,`fill="${castle ? '#827e6d' : '#74583b'}"`));
  const roomIds = [...new Set(house.rooms.map((room,index) => room.roomId ?? index))];
  for (const [index,room] of house.rooms.entries()) {
    const logicalIndex = roomIds.indexOf(room.roomId ?? index);
    const stoneFloor = castle && room.material !== 'wood';
    const floorPalette = stoneFloor ? stonePalette : palette.floor;
    const tint = floorPalette[(logicalIndex + (object.houseSeed === undefined ? 0 : seed % 3)) % floorPalette.length];
    pieces.push(rect(room.minX,room.minZ,room.maxX,room.maxZ,`data-waldhaus-room="${escape(room.name)}" fill="${tint}"`));
    if (stoneFloor) {
      const joints = [], spacing = 1.7, blockWidth = 2.5;
      let row = 0;
      for(let z=room.minZ;z<room.maxZ;z+=spacing,row++) {
        const end = Math.min(room.maxZ,z+spacing);
        if(row) joints.push(`M${number(room.minX)},${number(z)}H${number(room.maxX)}`);
        for(let x=room.minX+(row%2?blockWidth/2:blockWidth);x<room.maxX;x+=blockWidth) joints.push(`M${number(x)},${number(z)}V${number(end)}`);
      }
      pieces.push(`<path d="${joints.join('')}" stroke="#585d53" stroke-opacity=".32" stroke-width=".07" fill="none"/>`);
      continue;
    }
    const alongX = logicalIndex % 2 === 0;
    const spacing = .60 + (seed % 7) * .025;
    if (alongX) for(let z=room.roomId === undefined ? room.minZ+spacing : Math.ceil(room.minZ/spacing)*spacing;z<room.maxZ;z+=spacing) pieces.push(`<path d="M${number(room.minX)},${number(z)}H${number(room.maxX)}" stroke="${palette.timber}" stroke-opacity=".32" stroke-width=".045"/>`);
    else for(let x=room.roomId === undefined ? room.minX+spacing : Math.ceil(room.minX/spacing)*spacing;x<room.maxX;x+=spacing) pieces.push(`<path d="M${number(x)},${number(room.minZ)}V${number(room.maxZ)}" stroke="${palette.timber}" stroke-opacity=".32" stroke-width=".045"/>`);
  }
  for(const entrance of house.entrances) {
    const horizontal = ['north','south'].includes(entrance.side), min = Math.min(entrance.boundary,entrance.innerBoundary), max=Math.max(entrance.boundary,entrance.innerBoundary);
    pieces.push(rect(horizontal?entrance.min:min,horizontal?min:entrance.min,horizontal?entrance.max:max,horizontal?max:entrance.max,`data-waldhaus-entrance="${escape(entrance.name)}" fill="#d0bb8d"`));
  }
  if(castle) for(const doorway of house.interiorDoorways) {
    const horizontal = doorway.axis === 'x';
    const halfX = horizontal ? doorway.width/2 : .6, halfZ = horizontal ? .6 : doorway.width/2;
    pieces.push(rect(doorway.x-halfX,doorway.z-halfZ,doorway.x+halfX,doorway.z+halfZ,'data-castle-doorway="true" fill="#c9bea0"'));
  }
  for(const wall of house.architecturalWalls) {
    if (object.houseStoneColor !== undefined) {
      // A thin masonry edge remains visible around the plaster cut surface.
      const tint = stone.id === 'natural' ? '#817b68' : stone.color;
      pieces.push(rect(wall.minX-.065,wall.minZ-.065,wall.maxX+.065,wall.maxZ+.065,
        `data-house-stone-color="${stone.id}" fill="${tint}" stroke="${palette.timber}" stroke-width=".035"`));
    }
    pieces.push(rect(wall.minX,wall.minZ,wall.maxX,wall.maxZ,`data-waldhaus-wall="true" fill="${wallFill}" stroke="${castle ? '#555b50' : palette.timber}" stroke-width="${castle ? '.12' : '.075'}"`));
  }
  // The castle's limewash is a lining on the timber-floored chamber faces,
  // not the exposed masonry cap. Match the actual model's panel locations.
  if(castle) for(const area of house.floorAreas.filter(area=>area.material==='wood')) for(const wall of house.architecturalWalls) {
    const alongX=wall.maxX-wall.minX>wall.maxZ-wall.minZ;
    const from=alongX?Math.max(wall.minX,area.minX+.1):Math.max(wall.minZ,area.minZ+.1);
    const to=alongX?Math.min(wall.maxX,area.maxX-.1):Math.min(wall.maxZ,area.maxZ-.1);
    if(to-from<1.8)continue;
    const fixed=alongX?(wall.minZ+wall.maxZ)/2:(wall.minX+wall.maxX)/2;
    const min=alongX?area.minZ:area.minX,max=alongX?area.maxZ:area.maxX;
    const sign=Math.abs(fixed-min)<.6?1:Math.abs(fixed-max)<.6?-1:0;
    if(!sign)continue;
    const depth=alongX?wall.maxZ-wall.minZ:wall.maxX-wall.minX;
    const face=fixed+sign*(depth/2+.015),edge=face+sign*.28;
    pieces.push(rect(alongX?from+.09:Math.min(face,edge),alongX?Math.min(face,edge):from+.09,
      alongX?to-.09:Math.max(face,edge),alongX?Math.max(face,edge):to-.09,
      `data-castle-plaster="true" fill="${wallColor.color??palette.wall}"`));
  }
  for(const window of house.windows) {
    const horizontal=['north','south'].includes(window.side), x=horizontal?window.center:window.boundary,z=horizontal?window.boundary:window.center;
    const hw=horizontal?window.width/2:.09,hd=horizontal?.09:window.width/2;
    pieces.push(rect(x-hw,z-hd,x+hw,z+hd,`data-waldhaus-window="${escape(window.name)}" fill="#a2c6c3" stroke="${palette.timber}" stroke-width=".06"`));
    const mullion=horizontal?`M${number(x)},${number(z-hd)}V${number(z+hd)}`:`M${number(x-hw)},${number(z)}H${number(x+hw)}`;
    pieces.push(`<path d="${mullion}" stroke="${palette.timber}" stroke-width=".05"/>`);
  }
  pieces.push('</g>');return pieces.join('');
}

export function getBuilderHousePreviewSvg(object) {
  if (!object || !isBuilderHouse(object.variant)) return '';
  const house=getHouseDefinition(object), b=house.floorBounds, margin=1.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.minX-margin} ${b.minZ-margin} ${b.maxX-b.minX+margin*2} ${b.maxZ-b.minZ+margin*2}" role="img" aria-label="${escape(house.label)} · Grundriss">${builderHouseMapSymbol(object)}</svg>`;
}
