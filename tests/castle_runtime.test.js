import test from 'node:test';
import assert from 'node:assert/strict';
import { getHouseDefinition } from '../src/map/house-builder.js';
import { getEnvironmentKitDefinition } from '../src/map/environment-kit-definitions.js';
import { houseFloorFactorAt } from '../src/map/house-floor.js';
import { createGroundGrassExclusion } from '../src/meadow-ground.js';
import { createLandscapePlacementGuard } from '../src/map/landscape-brush.js';
import { createWorldSpatialModel } from '../src/generated-spatial.js';
import { createLobbyMap } from '../src/lobby-map.js';
import { makeWorldObject } from '../src/map/objects.js';
import { createCollisionIndex } from '../src/collision.js';
import { createSightModel } from '../src/visibility-model.js';

const castle = () => {
  const definition = getHouseDefinition('schlossanlage');
  assert.ok(definition, 'The editor castle is registered in the shared runtime definition catalogue');
  return definition;
};

test('Castle wings and stone court borders exclude vegetation while green court centres remain outdoors', () => {
  const definition = castle();
  assert.equal(getEnvironmentKitDefinition('house', 'schlossanlage'), definition);
  for (const [rotation, scale] of [[0, 1], [Math.PI / 2, 1.1], [Math.PI / 3, .8]]) {
    const map = createLobbyMap();
    const boundary=[[-220,-220],[220,-220],[220,220],[-220,220]];
    map.bounds={minX:-220,maxX:220,minZ:-220,maxZ:220};
    map.island.points=boundary;map.regions[0].points=structuredClone(boundary);
    map.objects = [makeWorldObject('house', [4, -3], {variant:'schlossanlage', rotation, scale})];
    const snapshot = structuredClone(map);
    const excluded = createGroundGrassExclusion(map, {padding:0});
    const guard = createLandscapePlacementGuard(map);
    const spatial = createWorldSpatialModel(map);
    const c = Math.cos(rotation), s = Math.sin(rotation);
    const world = (x, z) => [4 + scale * (c * x + s * z), -3 + scale * (-s * x + c * z)];
    const plateau = spatial.groundAt(4, -3);
    for (const room of definition.rooms) {
      const x = (room.minX + room.maxX) / 2, z = (room.minZ + room.maxZ) / 2;
      assert.equal(houseFloorFactorAt(x, z, definition.floorBounds, definition.interior, definition.entrances, definition.footprintAreas), 1, room.name);
      assert.equal(excluded(...world(x, z)), true, room.name);
      assert.equal(guard.reason(world(x, z), .1, 'grass'), 'structure', room.name);
      assert.ok(Math.abs(spatial.groundAt(...world(x, z)) - plateau) < 1e-8, room.name);
    }
    assert.equal(definition.courtyards.length,2,'The expanded compound has two separate outdoor courts');
    for (const court of definition.courtyards) {
      const cx=(court.minX+court.maxX)/2,cz=(court.minZ+court.maxZ)/2;
      for (const [x, z] of [[cx,cz], [cx-3,cz+3], [cx+3,cz-3]]) {
        assert.equal(houseFloorFactorAt(x, z, definition.floorBounds, definition.interior, definition.entrances, definition.footprintAreas), null, 'The courtyard has no invisible indoor floor');
        assert.equal(excluded(...world(x, z)), false, 'Green courtyard centres allow ordinary ground vegetation');
        assert.equal(guard.reason(world(x, z), .1, 'grass'), null, 'The landscape brush can plant grass inside a court');
      }
    }
    for(const border of definition.courtyardPavingAreas) {
      const x=(border.minX+border.maxX)/2,z=(border.minZ+border.maxZ)/2;
      assert.equal(excluded(...world(x,z)),true,'Narrow stone borders exclude grass');
      assert.equal(guard.reason(world(x,z),.1,'grass'),'structure','Brush vegetation does not cross the stone border');
    }
    assert.deepEqual(map, snapshot, 'Runtime queries must not alter the authored map');
  }
});

test('Castle exterior and courtyard thresholds have a continuous floor-height ramp', () => {
  const definition = castle();
  const factor = (x,z) => houseFloorFactorAt(x,z,definition.floorBounds,definition.interior,definition.entrances,definition.footprintAreas);
  assert.ok(definition.entrances.some(e => e.courtyard), 'Courtyard accesses need ramps as well as exterior gates');
  for (const entrance of definition.entrances) {
    const horizontal = ['north','south'].includes(entrance.side), sign = ['north','west'].includes(entrance.side) ? -1 : 1;
    let previous = 0;
    for (let i=1; i<=20; i++) {
      const along = entrance.boundary + sign * entrance.depth * (1-i/20);
      const value = factor(horizontal ? entrance.center : along, horizontal ? along : entrance.center);
      assert.ok(value !== null && value >= previous-1e-8 && value <= 1, entrance.name);
      previous = value;
    }
    assert.equal(previous,1,entrance.name);
    const along = entrance.boundary + sign * entrance.depth * .5;
    assert.ok(Math.abs(factor(horizontal ? entrance.center : along, horizontal ? along : entrance.center)-.5)<1e-8, entrance.name);
  }
});

test('Castle physical masonry retains its authored height independently of the visual cutaway', () => {
  const definition = castle();
  for (const wall of definition.walls) {
    assert.equal(wall.type,'house-wall');
    const index = createCollisionIndex([], [wall]);
    const movement = createCollisionIndex([],wall.projectileOnly?[]:[wall]);
    const position = {x:(wall.minX+wall.maxX)/2, y:(wall.minY+wall.maxY)/2, z:(wall.minZ+wall.maxZ)/2};
    const before = {...position};
    movement.resolve(position,.42);
    if(wall.projectileOnly)assert.deepEqual(position,before,`${wall.name}: upper architecture never blocks the ground floor`);
    else assert.ok(Math.hypot(position.x-before.x,position.z-before.z)>.42,wall.name);
    const axis = wall.maxX-wall.minX > wall.maxZ-wall.minZ ? 'z' : 'x';
    const start = {...before,[axis]:wall[axis==='z'?'minZ':'minX']-1};
    const end = {...before,[axis]:wall[axis==='z'?'maxZ':'maxX']+1};
    assert.ok(index.traceSegment(start,end,.06),wall.name);
    assert.equal(index.traceSegment({...start,y:wall.maxY+.2},{...end,y:wall.maxY+.2},.06),null,wall.name);
  }
});

test('High exterior stone and overhead gate cover stop airborne shots without closing the ground passage',()=>{
  const definition=castle(),outer=definition.walls.find(w=>w.outerPerimeter&&!w.projectileOnly&&w.maxY>7);
  assert.ok(outer,'The exterior uses full physical wall height');
  const axis=outer.maxX-outer.minX>outer.maxZ-outer.minZ?'z':'x';
  const base={x:(outer.minX+outer.maxX)/2,z:(outer.minZ+outer.maxZ)/2,y:definition.floorHeight+4.5};
  const start={...base,[axis]:outer[axis==='z'?'minZ':'minX']-1},end={...base,[axis]:outer[axis==='z'?'maxZ':'maxX']+1};
  assert.ok(createCollisionIndex([], [outer]).traceSegment(start,end,.06),'A shot above cutaway height still hits the real outer wall');
  const arches=definition.walls.filter(w=>w.projectileOnly&&w.minY>3&&w.name.toLowerCase().includes('tor'));
  assert.ok(arches.length,'The grand gateway has physical overhead stone');
  for(const arch of arches) {
    const alongZ=arch.maxX-arch.minX>arch.maxZ-arch.minZ;
    const center={x:(arch.minX+arch.maxX)/2,y:definition.floorHeight,z:(arch.minZ+arch.maxZ)/2};
    const a={...center,[alongZ?'z':'x']:arch[alongZ?'minZ':'minX']-1};
    const b={...center,[alongZ?'z':'x']:arch[alongZ?'maxZ':'maxX']+1};
    const index=createCollisionIndex([],[arch]);
    assert.equal(index.traceSegment({...a,y:definition.floorHeight+1.7},{...b,y:definition.floorHeight+1.7},.06),null,'Projectiles at player height clear the gateway');
    const height=(arch.minY+arch.maxY)/2;
    assert.ok(index.traceSegment({...a,y:height},{...b,y:height},.06),'High projectiles hit the overhead arch');
    const sight=createSightModel({obstacles:[arch],radius:20});sight.update(a);
    assert.equal(sight.isVisible(b),true,'An overhead arch does not cast an invisible tactical wall across the entrance');
  }
});
