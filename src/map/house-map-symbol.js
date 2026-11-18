import { getHouseMaterialColors } from './house-colors.js';
import { getCastleMaterialColors } from './castle-colors.js';
import { getHouseDefinition, isBuilderHouse } from './house-builder.js';

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
const number = value => Math.round(value * 1000) / 1000;
const shade = (hex, factor) => '#'+[1,3,5].map(i=>Math.min(255,Math.max(0,Math.round(parseInt(hex.slice(i,i+2),16)*factor))).toString(16).padStart(2,'0')).join('');
const rect = (minX, minZ, maxX, maxZ, attrs) => `<rect x="${number(minX)}" y="${number(minZ)}" width="${number(maxX-minX)}" height="${number(maxZ-minZ)}" ${attrs}/>`;
const colors = {
  natural: {wall:'#e2d1a4', timber:'#4e3c2b', floor:['#b49160','#a78a61','#9c865e']},
  lime: {wall:'#e7e0c9', timber:'#64503e', floor:['#bc9e72','#b49b76','#aa936e']},
  ochre: {wall:'#c8a56b', timber:'#58402c', floor:['#ab8457','#a27f55','#96774f']},
  dark: {wall:'#a5a399', timber:'#3d3731', floor:['#887966','#827361','#796c5b']},
};
function appearance(object) {
  const style = object.variant==='schlossanlage'&&object.houseStyle==='sandstone'?'sandstone':Object.hasOwn(colors, object.houseStyle) ? object.houseStyle : 'natural';
  const seed = Number.isInteger(object.houseSeed) && object.houseSeed >= 0 && object.houseSeed <= 2147483647 ? object.houseSeed : 87123;
  return {style, seed, colors:colors[style]??colors.natural};
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
  const castleColors = getCastleMaterialColors(object);
  const stonePalette = [.95,1,1.04].map(value=>shade(castleColors.floor,value));
  const wallFill = castle ? castleColors.wall : wallColor.color ?? palette.wall;
  const floorAreas = house.footprintAreas ?? [house.floorBounds];
  const pieces = [`<g id="world-object-${key}">`];
  const pavingPattern = `castle-paving-${key}`, courtyardPattern = `castle-court-paving-${key}`;
  if(castle) {
    pieces.push(`<defs><pattern id="${pavingPattern}" width="4.8" height="3.4" patternUnits="userSpaceOnUse"><path d="M0,0H4.8M0,1.7H4.8M0,0V1.7M2.4,0V1.7M1.2,1.7V3.4M3.6,1.7V3.4" stroke="${castleColors.iron}" stroke-opacity=".35" stroke-width=".065" fill="none"/></pattern><pattern id="${courtyardPattern}" width="1.6" height="1" patternUnits="userSpaceOnUse"><path d="M0,0H1.6M0,.5H1.6M0,0V.5M.8,0V.5M.4,.5V1M1.2,.5V1" stroke="${castleColors.iron}" stroke-opacity=".25" stroke-width=".05" fill="none"/></pattern></defs>`);
    for(const court of house.courtyards ?? []) {
      pieces.push(rect(court.minX,court.minZ,court.maxX,court.maxZ,`data-castle-courtyard="true" data-castle-ground="terrain" fill="none"`));
    }
    for(const area of house.courtyardPavingAreas ?? []) {
      pieces.push(rect(area.minX,area.minZ,area.maxX,area.maxZ,`data-castle-court-edge="true" fill="${shade(castleColors.floor,.87)}"`));
      pieces.push(rect(area.minX,area.minZ,area.maxX,area.maxZ,`fill="url(#${courtyardPattern})"`));
    }
  }
  for (const area of floorAreas) pieces.push(rect(area.minX,area.minZ,area.maxX,area.maxZ,`${castle ? 'data-house-foundation="true" ' : ''}fill="${castle ? castleColors.floor : '#74583b'}"`));
  const roomIds = [...new Set(house.rooms.map((room,index) => room.roomId ?? index))];
  for (const [index,room] of house.rooms.entries()) {
    const logicalIndex = roomIds.indexOf(room.roomId ?? index);
    const stoneFloor = castle;
    const floorPalette = stoneFloor ? stonePalette : palette.floor;
    const tint = floorPalette[(logicalIndex + (object.houseSeed === undefined ? 0 : seed % 3)) % floorPalette.length];
    pieces.push(rect(room.minX,room.minZ,room.maxX,room.maxZ,`data-waldhaus-room="${escape(room.name)}" fill="${tint}"`));
    if (stoneFloor) {
      pieces.push(rect(room.minX,room.minZ,room.maxX,room.maxZ,`data-castle-floor-joints="true" fill="url(#${pavingPattern})"`));
      continue;
    }
    const alongX = logicalIndex % 2 === 0;
    const spacing = .60 + (seed % 7) * .025;
    if (alongX) for(let z=room.roomId === undefined ? room.minZ+spacing : Math.ceil(room.minZ/spacing)*spacing;z<room.maxZ;z+=spacing) pieces.push(`<path d="M${number(room.minX)},${number(z)}H${number(room.maxX)}" stroke="${palette.timber}" stroke-opacity=".32" stroke-width=".045"/>`);
    else for(let x=room.roomId === undefined ? room.minX+spacing : Math.ceil(room.minX/spacing)*spacing;x<room.maxX;x+=spacing) pieces.push(`<path d="M${number(x)},${number(room.minZ)}V${number(room.maxZ)}" stroke="${palette.timber}" stroke-opacity=".32" stroke-width=".045"/>`);
  }
  if(castle) for(const tower of house.towers??[]) {
    const points=tower.footprintPoints.map(([x,z])=>`${number(x)},${number(z)}`).join(' ');
    // An open outline describes the octagonal upper tower without concealing
    // the ground-floor room or its highlighted passage beneath it.
    pieces.push(`<polygon data-castle-tower="${escape(tower.id)}" points="${points}" fill="none" stroke="${castleColors.trim}" stroke-width=".85"/>`);
    pieces.push(`<polygon points="${points}" fill="none" stroke="${castleColors.iron}" stroke-width=".13" stroke-dasharray=".95 .45"/>`);
  }
  for(const entrance of house.entrances) {
    const horizontal = ['north','south'].includes(entrance.side), min = Math.min(entrance.boundary,entrance.innerBoundary), max=Math.max(entrance.boundary,entrance.innerBoundary);
    pieces.push(rect(horizontal?entrance.min:min,horizontal?min:entrance.min,horizontal?entrance.max:max,horizontal?max:entrance.max,`data-waldhaus-entrance="${escape(entrance.name)}" fill="${castle ? castleColors.trim : '#d0bb8d'}"`));
  }
  if(castle) for(const doorway of house.interiorDoorways) {
    const horizontal = doorway.axis === 'x';
    const halfX = horizontal ? doorway.width/2 : .6, halfZ = horizontal ? .6 : doorway.width/2;
    pieces.push(rect(doorway.x-halfX,doorway.z-halfZ,doorway.x+halfX,doorway.z+halfZ,`data-castle-doorway="true" fill="${castleColors.trim}"`));
  }
  for(const wall of house.architecturalWalls) {
    if (object.houseStoneColor !== undefined) {
      // A thin masonry edge remains visible around the plaster cut surface.
      const tint = castle ? castleColors.trim : stone.id === 'natural' ? '#817b68' : stone.color;
      pieces.push(rect(wall.minX-.065,wall.minZ-.065,wall.maxX+.065,wall.maxZ+.065,
        `data-house-stone-color="${stone.id}" fill="${tint}" stroke="${palette.timber}" stroke-width=".035"`));
    }
    pieces.push(rect(wall.minX,wall.minZ,wall.maxX,wall.maxZ,`data-waldhaus-wall="true" fill="${wallFill}" stroke="${castle ? castleColors.iron : palette.timber}" stroke-width="${castle ? '.12' : '.075'}"`));
  }
  for(const window of house.windows) {
    const horizontal=['north','south'].includes(window.side), x=horizontal?window.center:window.boundary,z=horizontal?window.boundary:window.center;
    const hw=horizontal?window.width/2:.09,hd=horizontal?.09:window.width/2;
    if(castle) {
      const depth=window.wallThickness??house.wallThickness??.7, outward=['north','west'].includes(window.side)?-1:1;
      const halfDepth=depth*.5, wx=x+(horizontal?0:outward*halfDepth), wz=z+(horizontal?outward*halfDepth:0);
      pieces.push(rect(horizontal?wx-hw:wx-halfDepth,horizontal?wz-halfDepth:wz-hd,horizontal?wx+hw:wx+halfDepth,horizontal?wz+halfDepth:wz+hd,
        `data-waldhaus-window="${escape(window.name)}" data-castle-window="barred" fill="#29332f" stroke="${castleColors.trim}" stroke-width=".1"`));
      const bars=[];
      for(let offset=-window.width/2+.25;offset<window.width/2;offset+=.4) bars.push(horizontal?
        `M${number(wx+offset)},${number(wz-halfDepth)}V${number(wz+halfDepth)}`:
        `M${number(wx-halfDepth)},${number(wz+offset)}H${number(wx+halfDepth)}`);
      pieces.push(`<path data-castle-grille="true" d="${bars.join('')}" stroke="${castleColors.trim}" stroke-width=".07"/>`);
    } else {
      pieces.push(rect(x-hw,z-hd,x+hw,z+hd,`data-waldhaus-window="${escape(window.name)}" fill="#a2c6c3" stroke="${palette.timber}" stroke-width=".06"`));
      const mullion=horizontal?`M${number(x)},${number(z-hd)}V${number(z+hd)}`:`M${number(x-hw)},${number(z)}H${number(x+hw)}`;
      pieces.push(`<path d="${mullion}" stroke="${palette.timber}" stroke-width=".05"/>`);
    }
  }
  if(castle) for(const torch of house.torches??[]) {
    pieces.push(`<circle data-castle-torch="true" cx="${number(torch.x)}" cy="${number(torch.z)}" r=".32" fill="#dca85d" stroke="#50422d" stroke-width=".09"/>`);
  }
  pieces.push('</g>');return pieces.join('');
}

export function getBuilderHousePreviewSvg(object) {
  if (!object || !isBuilderHouse(object.variant)) return '';
  const house=getHouseDefinition(object), b=house.floorBounds, margin=1.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.minX-margin} ${b.minZ-margin} ${b.maxX-b.minX+margin*2} ${b.maxZ-b.minZ+margin*2}" role="img" aria-label="${escape(house.label)} · Grundriss">${builderHouseMapSymbol(object)}</svg>`;
}
