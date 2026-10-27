import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocomotionController } from '../src/locomotion.js';

function advance(controller, seconds, input, fps = 60) {
  let result;
  let yaw = input.currentYaw ?? input.direction ?? 0;
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) {
    result = controller.update(1 / fps, { ...input, currentYaw: yaw });
    yaw = result.yaw;
  }
  return result;
}

test('walk blends in with real speed and keeps feet moving while fading back to idle', () => {
  const controller = createLocomotionController();
  const first = controller.update(1 / 60, { moving: true, speed: 5.6 });
  assert.ok(first.walkWeight > 0 && first.walkWeight < .1, 'starting has no hard animation cut');
  const running = advance(controller, .5, { moving: true, speed: 5.6 });
  assert.ok(running.walkWeight > .98);
  assert.ok(running.playbackSpeed > .98 && running.playbackSpeed <= 1);
  const releasing = controller.update(1 / 60, { moving: false, speed: 0 });
  assert.ok(releasing.walkWeight > .7 && releasing.walkWeight < running.walkWeight);
  assert.ok(releasing.playbackSpeed > .7, 'the lifted foot does not freeze at input release');
  const idle = advance(controller, .6, { moving: false });
  assert.equal(idle.walkWeight, 0);
  assert.ok(idle.forwardLean < .001);
});

test('shortest turn crosses the angle boundary smoothly without spinning the long way', () => {
  const controller = createLocomotionController();
  const start = Math.PI - .08, target = -Math.PI + .08;
  const first = controller.update(1 / 60, { moving: true, speed: 5.6, currentYaw: start, direction: target });
  assert.ok(first.yaw > start && first.yaw - start < .16);
  const settled = advance(controller, .35, { moving: true, speed: 5.6, currentYaw: first.yaw, direction: target });
  assert.ok(Math.abs(Math.atan2(Math.sin(target - settled.yaw), Math.cos(target - settled.yaw))) < .001);
  assert.ok(Math.abs(settled.sideLean) < .055);
});

test('locomotion presentation is stable across frame rates and pauses without advancing', () => {
  const run = fps => {
    const controller = createLocomotionController();
    return advance(controller, .4, { moving: true, speed: 3.1, direction: 1.3, currentYaw: 0 }, fps);
  };
  const slow = run(30), fast = run(120);
  assert.ok(Math.abs(slow.walkWeight - fast.walkWeight) < .02);
  assert.ok(Math.abs(slow.speed - fast.speed) < .001);
  assert.ok(Math.abs(slow.yaw - fast.yaw) < .001);
  const controller = createLocomotionController();
  const before = advance(controller, .4, { moving: true, speed: 5.6 });
  const paused = controller.update(0, { moving: false, currentYaw: before.yaw, direction: 2 });
  assert.equal(paused.walkWeight, before.walkWeight);
  assert.equal(paused.speed, before.speed);
  assert.equal(paused.yaw, before.yaw);
  controller.reset();
  assert.equal(controller.update(0).walkWeight, 0);
});
