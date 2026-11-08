import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSnowFootprints } from '../src/snow-footprints.js';

function world(snow = true) {
  return {
    heightAt: () => 2,
    biomeAt: () => snow ? 'snow' : 'meadow',
    biomeWeightsAt: () => [{ biome: snow ? 'snow' : 'meadow', weight: 1 }],
  };
}

test('snow footprints use one instanced pool and fade out after ten seconds', () => {
  const root = new THREE.Group(), footprints = createSnowFootprints(root, world(true));
  footprints.update(0, [{ id:'player', x:0, z:0, direction:0, moving:true, speed:4 }]);
  assert.equal(footprints.inspect().count, 0, 'first sample establishes stride origin');
  footprints.update(.2, [{ id:'player', x:0, z:.7, direction:0, moving:true, speed:4 }]);
  assert.equal(footprints.inspect().count, 1);
  assert.equal(footprints.inspect().singleInstancedDraw, true);
  assert.equal(footprints.inspect().alignedToVisualSnowSurface, true);
  assert.equal(footprints.inspect().trackColor, '#cfdadd');
  assert.equal(footprints.inspect().footprintFacingOffsetRadians, Math.PI);
  assert.equal(footprints.inspect().footprintRotationJitterRadians, .04);
  assert.deepEqual(footprints.inspect().footprintScaleVariation, [.96, 1.04]);
  assert.deepEqual(footprints.inspect().footprintIntensityVariation, [.90, 1.08]);
  assert.equal(footprints.inspect().footprintLateralJitterMeters, .016);
  assert.equal(footprints.inspect().recommendedVisualSinkMeters, .22);
  assert.equal(footprints.inspect().wadingMounds, 0, 'no travelling snow ridge is created');
  assert.equal(footprints.inspect().wadingStyle, 'removed');
  assert.equal(footprints.inspect().particlesPerStep, 5);
  assert.equal(footprints.inspect().particleDirection, 'sideways-and-backward');
  assert.ok(footprints.inspect().activeStepParticles > 0, 'a step emits short-lived powder particles');
  assert.ok(footprints.inspect().particleBursts > 0);
  assert.equal(footprints.inspect().fadeStartSeconds, 6);
  assert.equal(footprints.inspect().lifetimeSeconds, 10);
  footprints.update(.3, [{ id:'player', x:0, z:.7, direction:0, moving:false, speed:0 }]);
  assert.equal(footprints.inspect().wadingMounds, 0, 'standing never creates a snow ring');
  footprints.update(7, []);
  assert.equal(footprints.inspect().count, 1, 'print remains while fading');
  assert.equal(footprints.inspect().activeStepParticles, 0, 'powder particles expire quickly');
  assert.ok(footprints.inspect().averageFade > .70 && footprints.inspect().averageFade < .90, 'fade and subtle per-print strength remain bounded');
  footprints.update(10.21, []);
  assert.equal(footprints.inspect().count, 0, 'expired print is removed');
  footprints.dispose();
  assert.equal(root.children.length, 0);
});

test('footprints are not emitted outside snow', () => {
  const root = new THREE.Group(), footprints = createSnowFootprints(root, world(false));
  footprints.update(0, [{ id:'player', x:0, z:0, direction:0, moving:true }]);
  footprints.update(.2, [{ id:'player', x:0, z:.8, direction:0, moving:true }]);
  assert.equal(footprints.inspect().count, 0);
  assert.equal(footprints.inspect().wadingMounds, 0);
  assert.equal(footprints.inspect().activeStepParticles, 0);
  assert.equal(footprints.inspect().particleBursts, 0);
  assert.equal(footprints.weightAt(0, 0), 0);
  footprints.dispose();
});

function rollRun(tracks, { rate = 60, startTime = 0, startZ = 0, duration = .72 } = {}) {
  const sample = (time, rolling = true) => ({ id: 'player', x: 0, z: startZ + 8.8 * Math.min(time, duration),
    direction: 0, moving: true, rolling, speed: rolling ? 8.8 : 4 });
  tracks.update(startTime, [sample(0)]);
  for (let frame = 1; frame < duration * rate; frame++) tracks.update(startTime + frame / rate, [sample(frame / rate)]);
  tracks.update(startTime + duration, [sample(duration)]);
  tracks.update(startTime + duration + .01, [sample(duration, false)]);
  return tracks.inspect();
}

test('rolling begins after the airborne phase and leaves separate rounded body contacts without soles', () => {
  const root = new THREE.Group(), tracks = createSnowFootprints(root, world(true));
  tracks.update(0, [{ id: 'player', x: 0, z: 0, moving: true, rolling: true }]);
  tracks.update(.10, [{ id: 'player', x: 0, z: .88, moving: true, rolling: true }]);
  assert.equal(tracks.inspect().activeRollSegments, 0, 'airborne start cannot paint the snow');
  tracks.reset();
  const roll = rollRun(tracks);
  assert.equal(roll.footprintsCreated, 0);
  assert.ok(roll.activeRollSegments >= 8 && roll.activeRollSegments < 32);
  assert.equal(roll.singleInstancedDraw, true);
  const intervals = [...new Map(roll.activeTracks.map(track => [track.contactStart, [track.contactStart, track.contactEnd]])).values()];
  assert.ok(intervals.length >= 3, 'shoulder, back and recovery leave distinct contact patches');
  assert.ok(intervals.every(([start,end]) => end - start >= .20), 'ending a roll cannot stamp a thin isolated stripe');
  assert.ok(intervals[0][0] >= .9 && roll.activeTracks.every(track => track.born >= .14));
  for (let i = 1; i < intervals.length; i++) assert.ok(intervals[i][0] - intervals[i-1][1] >= .149,
    'there are real unpainted gaps between the contact geometries');
  const mesh = root.children.find(part => part.name === 'Schneespuren'), matrix = new THREE.Matrix4();
  const bounds = mesh.geometry.attributes.instanceRollBounds;
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    assert.ok(Math.abs(matrix.elements[12]) < 1e-6);
    assert.ok(Math.abs(matrix.elements[0]) * .38 > .95, 'wide body contacts are retained');
    const first = i === 0 || bounds.getX(i) !== bounds.getX(i-1);
    const last = i === mesh.count-1 || bounds.getX(i) !== bounds.getX(i+1);
    assert.equal(mesh.geometry.attributes.instanceTrackCaps.getX(i), Number(first) + Number(last) * 2);
  }
  tracks.update(1, [{ id: 'player', x: 0, z: 7.1, moving: true, rolling: false, speed: 4 }]);
  assert.equal(tracks.inspect().footprintsCreated, 1, 'walking resumes ordinary soles');
  assert.equal(tracks.inspect().activeRollSegments, roll.activeRollSegments);
  tracks.dispose();
});

test('contact placement, lengths and profile seeds do not change with rendering frame rate', () => {
  function capture(rate) {
    const root = new THREE.Group(), tracks = createSnowFootprints(root, world(true));
    const state = rollRun(tracks, { rate });
    const bounds = root.children.find(part => part.name === 'Schneespuren').geometry.attributes.instanceRollBounds;
    const result = state.activeTracks.map((track, index) => [track.x, track.z, track.rollDistance, track.rollLength,
      track.contactStart, track.contactEnd, bounds.getZ(index), bounds.getW(index)]);
    tracks.dispose(); return result;
  }
  const expected = capture(60);
  for (const rate of [20, 30, 144]) {
    const actual = capture(rate); assert.equal(actual.length, expected.length, `same segment count at ${rate} fps`);
    actual.forEach((values, index) => values.forEach((value, component) =>
      assert.ok(Math.abs(value - expected[index][component]) < 1e-6, `stable patch at ${rate} fps`)));
  }
});

test('snow gaps and later rolls cannot extend an earlier contact patch', () => {
  const root = new THREE.Group(), tracks = createSnowFootprints(root, {
    ...world(true), biomeWeightsAt: (x,z) => [{ biome: z >= 1.8 && z < 3.4 ? 'meadow' : 'snow', weight: 1 }],
  });
  const first = rollRun(tracks);
  assert.ok(first.activeTracks.length > 0);
  assert.ok(first.activeTracks.every(track => track.z < 1.8 || track.z >= 3.4));
  const firstContact = first.activeTracks[0];
  assert.ok(firstContact.contactEnd < 1.9);
  rollRun(tracks, { startTime: 1, startZ: 6.4 });
  const after = tracks.inspect();
  assert.equal(after.activeTracks.find(track => track.id === firstContact.id).contactEnd, firstContact.contactEnd);
  assert.ok(after.activeTracks.some(track => track.z > 7.5 && track.rollDistance < 2),
    'a later roll starts a new local travel coordinate after its own jump');
  tracks.reset(); assert.equal(tracks.inspect().activeRollSegments, 0); tracks.dispose();
});

test('adjoining contact segments share edge heights on slopes; gaps remain intentionally open', () => {
  const root = new THREE.Group(), tracks = createSnowFootprints(root, {
    ...world(true), snowSurfaceAt: (x,z) => 2 + z * .15 + Math.sin(z) * .05,
  });
  rollRun(tracks);
  const mesh = root.children.find(part => part.name === 'Schneespuren');
  const bounds = mesh.geometry.attributes.instanceRollBounds;
  const a = new THREE.Matrix4(), b = new THREE.Matrix4(); let seams = 0;
  for (let i = 1; i < mesh.count; i++) {
    if (bounds.getX(i) !== bounds.getX(i-1)) continue;
    mesh.getMatrixAt(i-1,a); mesh.getMatrixAt(i,b);
    for (const x of [-.19,.19]) assert.ok(new THREE.Vector3(x,0,-.32).applyMatrix4(a)
      .distanceTo(new THREE.Vector3(x,0,.32).applyMatrix4(b)) < 1e-6);
    seams++;
  }
  assert.ok(seams > 4, 'test actually compares contact seams'); tracks.dispose();
});

test('thirty seconds of running preserve each mark until its own age-based fade finishes', () => {
  const tracks = createSnowFootprints(new THREE.Group(), world(true));
  let previous = new Map(), peak = 0, checkedFades = 0;
  for (let frame = 0; frame <= 36 * 60; frame++) {
    const time = frame / 60;
    tracks.update(time, [{ id: 'player', x: 0, z: 5.6 * time, moving: true, speed: 5.6, stepDistance: .58 }]);
    if (frame % 6) continue;
    const state = tracks.inspect(), current = new Map(state.activeTracks.map(track => [track.id, track]));
    for (const [id, before] of previous) {
      const after = current.get(id);
      if (!after) assert.ok(time - before.born >= 10 - 1e-8, 'running cannot evict a live mark');
      else { assert.ok(after.fade <= before.fade + 1e-6); if (after.age > 6) checkedFades++; }
    }
    previous = current; peak = Math.max(peak, state.count);
    assert.equal(state.capacitySkipped, 0);
  }
  assert.ok(peak >= 80 && checkedFades > 100);
  assert.ok(tracks.inspect().expiredCount > 100);
  tracks.dispose();
});

test('four simultaneous sources with repeated rolls keep opaque and fading trails beyond the old 96-slot limit', () => {
  const tracks = createSnowFootprints(new THREE.Group(), world(true));
  let position = 0, previous = new Map(), peak = 0;
  for (let frame = 0; frame <= 22 * 60; frame++) {
    const time = frame / 60, rolling = time % 2.5 < .72;
    if (frame) position += (rolling ? 8.8 : 5.6) / 60;
    tracks.update(time, [{ id: 'player', x: 0, z: position, moving: true, rolling, speed: rolling ? 8.8 : 5.6, stepDistance: .58 },
      ...[1,2,3].map(id => ({ id: `practice-${id}`, x: id * 2, z: time * 2.4, moving: true, speed: 2.4, stepDistance: .68 }))]);
    if (frame % 6) continue;
    const state = tracks.inspect(), current = new Map(state.activeTracks.map(track => [track.id,track]));
    for (const [id, before] of previous) {
      const after = current.get(id);
      if (!after) assert.ok(time - before.born >= 10 - 1e-8, 'other actors and roll patches cannot erase a live sole');
      else assert.ok(after.fade <= before.fade + 1e-6);
    }
    previous = current; peak = Math.max(peak, state.count);
    assert.equal(state.capacitySkipped, 0); assert.equal(state.sourceCapacitySkipped, 0);
  }
  assert.ok(peak > 180 && tracks.inspect().activeRollSegments > 0);
  const beforePause = tracks.inspect();
  tracks.update(22, [{ id: 'player', x: 0, z: position, moving: false, rolling: false }]);
  assert.deepEqual(tracks.inspect(), beforePause, 'a frozen game clock changes neither fade nor contact history');
  tracks.update(32.1, []); assert.equal(tracks.inspect().count, 0);
  tracks.reset(); assert.equal(tracks.inspect().capacitySkipped, 0); tracks.dispose();
});

test('overload rejects new marks instead of cutting old trails, then expired slots are reclaimed before admission', () => {
  const tracks = createSnowFootprints(new THREE.Group(), world(true));
  const sources = frame => Array.from({ length: 40 }, (_,index) => ({ id: `load-${index}`, x: index * 2,
    z: frame * .7, moving: true, speed: 35, stepDistance: .58 }));
  tracks.update(0, sources(0)); tracks.update(.02, sources(1));
  const first = tracks.inspect().activeTracks[0];
  for (let frame = 2; frame <= 225; frame++) tracks.update(frame * .02, sources(frame));
  const full = tracks.inspect();
  assert.equal(full.count, full.maximum); assert.ok(full.capacitySkipped > 0);
  const retained = full.activeTracks.find(track => track.id === first.id);
  assert.ok(retained && retained.age < 6); assert.equal(retained.fade, first.fade, 'an opaque mark survives overload unchanged');
  tracks.update(10.021, sources(226));
  const recycled = tracks.inspect();
  assert.equal(recycled.capacitySkipped, full.capacitySkipped, 'expired slots were freed before new marks were sampled');
  assert.ok(recycled.expiredCount >= 40); assert.equal(recycled.count, recycled.maximum);
  assert.ok(!recycled.activeTracks.some(track => track.id === first.id));
  tracks.dispose();
});

test('the derived pool covers twelve continuous full-speed roll sources for their entire lifetime', () => {
  const tracks = createSnowFootprints(new THREE.Group(), world(true));
  for (let frame = 0; frame <= 599; frame++) {
    const time = frame / 60;
    tracks.update(time, Array.from({ length: 12 }, (_,index) => ({ id: `rolling-${index}`,
      x: index * 2, z: time * 8.8, moving: true, rolling: true, speed: 8.8 })));
  }
  const state = tracks.inspect();
  assert.equal(state.capacitySkipped, 0); assert.equal(state.sourceCapacitySkipped, 0);
  assert.ok(state.count > 2000 && state.count < state.maximum);
  assert.equal(state.count, state.created, 'no mark has yet reached ten seconds, so none may be removed');
  assert.equal(state.expiredCount, 0);
  tracks.dispose();
});
