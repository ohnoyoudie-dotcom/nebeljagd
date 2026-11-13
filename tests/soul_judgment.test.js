import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../src/combat.js';
import { createSoulJudgment } from '../src/soul-judgment.js';

function fixture() {
  const defeats = [];
  const combat = createCombat({ onDefeat: result => defeats.push(result) });
  const target = combat.addTarget({ id: 'enemy', position: { x: 0, y: 0, z: 3 }, maxHealth: 500 });
  return { combat, target, defeats, judgment: createSoulJudgment(combat) };
}
test('three hits by one caster execute after two seconds regardless of remaining health', () => {
  const { target, judgment, defeats } = fixture();
  judgment.addHit(target, 'player'); judgment.addHit(target, 'player');
  judgment.update(1); assert.equal(target.health, 500);
  judgment.addHit(target, 'player'); judgment.update(1.99);
  assert.equal(target.health, 500);
  judgment.addHit(target, 'player'); // extra hits do not postpone the judgment
  judgment.update(.01); assert.equal(target.health, 0);
  judgment.update(20); assert.equal(defeats.length, 1);
  assert.equal(defeats[0].sourceId, 'player');
});
test('marks expire, belong to their caster, ignore scenery and clear on reset', () => {
  const { target, judgment } = fixture();
  judgment.addHit(target, 'one'); judgment.addHit(target, 'two'); judgment.addHit(target, 'one');
  assert.deepEqual(judgment.marks.map(m => m.count), [2, 1]);
  judgment.update(8); assert.equal(judgment.marks.length, 0);
  assert.equal(judgment.addHit({ ...target, destructible: true }, 'one'), null);
  assert.equal(judgment.addHit(target, target.id), null);
  judgment.addHit(target, 'one'); judgment.reset(); judgment.update(10);
  assert.equal(target.health, 500); assert.equal(judgment.marks.length, 0);
});
test('pause preserves countdown and normal death cannot award a second defeat', () => {
  const { target, judgment, combat, defeats } = fixture();
  for (let i = 0; i < 3; i++) judgment.addHit(target, 'one');
  judgment.update(0); judgment.update(NaN); judgment.update(-1);
  assert.equal(judgment.marks[0].remaining, 2);
  combat.hit(target, { damage: 500, sourceId: 'two' }); judgment.update(3);
  assert.equal(defeats.length, 1); assert.equal(defeats[0].sourceId, 'two');
  assert.equal(judgment.marks.length, 0);
});
