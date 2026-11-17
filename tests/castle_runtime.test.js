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

const castle = () => {
  const definition = getHouseDefinition('schlossanlage');
  assert.ok(definition, 'The editor castle is registered in the shared runtime definition catalogue');
  return definition;
};

test('Castle foundations exclude only covered wings from ground vegetation at arbitrary rotation and scale', () => {
  const definition = castle();
  assert.equal(getEnvironmentKitDefinition('house', 'schlossanlage'), definition);
  for (const [rotation, scale] of [[0, 1], [Math.PI / 2, 1.1], [Math.PI / 3, .8]]) {
    const map = createLobbyMap();
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
    const [cx, cz] = definition.qaRoutes.courtyard;
    for (const [x, z] of [[cx,cz], [cx-3,cz+3], [cx+3,cz-3]]) {
      assert.equal(houseFloorFactorAt(x, z, definition.floorBounds, definition.interior, definition.entrances, definition.footprintAreas), null, 'The courtyard has no invisible floor');
      assert.equal(excluded(...world(x, z)), false, 'The outdoor courtyard can keep its grass');
      assert.equal(guard.reason(world(x, z), .1, 'grass'), null, 'The courtyard remains editable with the landscape brush');
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

test('Castle stone walls stop movement and low projectiles without invisible overhead obstruction', () => {
  const definition = castle();
  for (const wall of definition.walls) {
    assert.equal(wall.type,'house-wall');
    const index = createCollisionIndex([], [wall]);
    const position = {x:(wall.minX+wall.maxX)/2, y:1, z:(wall.minZ+wall.maxZ)/2};
    const before = {...position};
    index.resolve(position,.42);
    assert.ok(Math.hypot(position.x-before.x,position.z-before.z)>.42,wall.name);
    const axis = wall.maxX-wall.minX > wall.maxZ-wall.minZ ? 'z' : 'x';
    const start = {...before,[axis]:wall[axis==='z'?'minZ':'minX']-1};
    const end = {...before,[axis]:wall[axis==='z'?'maxZ':'maxX']+1};
    assert.ok(index.traceSegment(start,end,.06),wall.name);
    assert.equal(index.traceSegment({...start,y:wall.maxY+.2},{...end,y:wall.maxY+.2},.06),null,wall.name);
  }
});
