import { makeWorldObject } from './map/objects.js';

/** A fresh, self-contained practice document. It never reads or saves the
 * editor document, so joining a class cannot replace an imported world. */
export function createLobbyMap() {
  const boundary = [[-60, -60], [60, -60], [60, 60], [-60, 60]];
  const objects = [];
  const add = (kind, variant, position, options = {}) => objects.push(makeWorldObject(kind, position, {
    id: `lobby-${kind}-${objects.length + 1}`, variant, ...options,
  }));

  // The three imported models are within a few steps of the starting point.
  add('sword', 'kit-tripo-sword', [-4, -17]);
  add('iceStaff', 'kit-tripo-crystal-staff', [0, -18]);
  add('fireStaff', 'kit-tripo-lava-staff', [4, -17]);
  add('bow', 'wood', [8, -17]);
  for (const [index, rarity] of ['uncommon', 'rare', 'legendary'].entries()) {
    const x = -15 + index * 15;
    add('sword', 'kit-tripo-sword', [x - 3, -29], { rarity });
    add('iceStaff', 'kit-tripo-crystal-staff', [x, -29], { rarity });
    add('fireStaff', 'kit-tripo-lava-staff', [x + 3, -29], { rarity });
  }
  for (const position of [[-12, -8], [-16, 5], [18, 8], [5, 20], [30, -20], [30, 22]]) {
    add('chest', 'kit-tripo-chest', position);
  }
  for (const position of [[-8, -23], [8, -23], [-20, 13], [20, 13], [0, 26]]) {
    add('heart', 'healing', position);
  }
  for (const [index, position] of [[-17, 22], [-14, 22], [-11, 22], [11, 27], [14, 27], [17, 27]].entries()) {
    add('barrel', 'kit-tripo-barrel', position, { rotation: index * .4 });
  }
  add('wagon', 'kit-tripo-wagon', [-28, -18], { rotation: Math.PI / 3 });
  add('wagon', 'kit-tripo-wagon', [29, 36], { rotation: -Math.PI / 4 });
  add('well', 'kit-tripo-well', [27, -1]);
  for (const [index, position] of [[-35, 0], [-32, 8], [-37, 17], [36, -32], [40, -24], [36, -14]].entries()) {
    add('rock', `kit-tripo-0${index % 3 + 1}`, position, { rotation: index * .7 });
  }
  add('grass', 'short', [-27, 30], { radius: 8 });
  add('grass', 'short', [29, -39], { radius: 7 });
  add('grass', 'tall', [-30, -35], { radius: 7 });

  return {
    schemaVersion: 1,
    id: 'nebeljagd-practice-lobby',
    name: 'Übungswiese',
    description: 'Eine große grüne Wiese zum Bewegen, Sammeln und Ausprobieren der Waffen an lokalen Übungsgegnern.',
    coordinateSystem: { units: 'meters', horizontalAxes: ['x', 'z'], north: '-z', metersPerUnit: 1 },
    bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
    gameplay: { targetPlayers: 1, walkSpeedMetersPerSecond: 5.6, spawnPosition: [0, -14] },
    island: { id: 'lobby-island', name: 'Übungswiese', points: boundary.map(point => [...point]) },
    regions: [{ id: 'lobby-meadow', name: 'Grüne Wiese', biome: 'meadow', color: '#69a656',
      label: [0, 0], points: boundary.map(point => [...point]) }],
    paths: [], rivers: [], places: [],
    spawnAreas: [{ id: 'lobby-start', name: 'Willkommen auf der Wiese', position: [0, -14], radius: 2, capacity: 1 }],
    // The shared document contract requires a zone phase. Both radii cover
    // the whole meadow; the lobby runtime disables the visual zone and clock.
    zone: { center: [0, 0], initialRadius: 100, damagePerSecond: 0,
      phases: [{ id: 'lobby-zone', name: 'Freies Üben', holdSeconds: 7200, shrinkSeconds: 7200, radius: 99 }] },
    objects,
  };
}
