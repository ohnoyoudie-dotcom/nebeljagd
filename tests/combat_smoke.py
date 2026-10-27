"""Focused bow draw, front sword swing and swept-projectile browser checks.

Run after npm run build with a Vite preview on NEBELJAGD_URL (default 4173).
Only explicit ?inspect=1 places the player; E/F/Escape remain actual keyboard
events. Frozen attack screenshots hide only the pause modal for a clear view of
the real rendered pose, then resume normal game simulation.
"""
import json
import math
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4173').rstrip('/')
OUT = Path('test-results'); OUT.mkdir(exist_ok=True)
checks, errors, images = [], [], []


def state(page):
    return page.evaluate('window.nebeljagdTestState()')


def check(name, evidence):
    checks.append({'name': name, 'evidence': evidence})
    print('PASS:', name, flush=True)


def inspect(page, x, z, direction=0):
    page.evaluate('p => window.nebeljagdInspect(p)', {'x': x, 'z': z, 'elapsed': 0, 'health': 100, 'direction': direction})
    page.wait_for_function('window.nebeljagdTestState().elapsed > .04')


def capture(page, name):
    page.screenshot(path=str(OUT / name)); images.append(name)
    print('CAPTURE:', name, flush=True)


def frozen_capture(page, name):
    page.keyboard.press('Escape')
    page.wait_for_function("window.nebeljagdTestState().phase === 'paused'")
    page.locator('#pauseScreen').evaluate("element => element.style.opacity = '0'")
    capture(page, name)
    page.locator('#pauseScreen').evaluate("element => element.style.removeProperty('opacity')")
    page.keyboard.press('Escape')
    page.wait_for_function("window.nebeljagdTestState().phase === 'playing'")


def collect(page):
    page.evaluate('''() => {
      window.__combatSamples = []; window.__collectCombat = true;
      const sample = () => {
        if (!window.__collectCombat) return;
        window.__combatSamples.push(structuredClone(window.nebeljagdTestState().combat));
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }''')


def samples(page):
    return page.evaluate('() => { window.__collectCombat = false; return window.__combatSamples; }')


def settle_projectiles(page):
    page.wait_for_function('window.nebeljagdTestState().attackCooldown === 0 && window.nebeljagdTestState().combat.arrowsActive === 0')


def fire_and_wait_impact(page, expected_type, screenshot):
    before = state(page)['combat']
    page.keyboard.press('f')
    page.wait_for_function('n => window.nebeljagdTestState().combat.impacts > n', arg=before['impacts'])
    impact = state(page)['combat']
    assert impact['shotsFired'] == before['shotsFired'] + 1, impact
    assert impact['lastImpact']['type'] == expected_type, impact
    assert impact['arrowsFlying'] == 0 and impact['arrowsActive'] > 0, impact
    frozen_capture(page, screenshot)
    settle_projectiles(page)
    return impact


report = {'status': 'running', 'checks': checks, 'javascript_or_shader_errors': errors, 'screenshots': images}
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
        page.set_default_timeout(90000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
        page.goto(f'{URL}/?inspect=1&quality=low', wait_until='domcontentloaded')
        page.wait_for_function('window.nebeljagdTestState && window.nebeljagdInspect && window.nebeljagdTestState().rendering.calls > 0')
        page.locator('#startBtn').click()
        inspect(page, -8, 8)
        world = state(page)['world']
        assert world['treeCount'] == 34 and len(world['grassPatches']) == 12, world
        check('Updated world exposes sparse trees and varied hiding patches', {
            'treeCount': world['treeCount'], 'grassPatchCount': len(world['grassPatches']),
            'grassPatchSizes': [[g['radius'], g.get('aspect', 1)] for g in world['grassPatches']]})
        capture(page, 'combat-village-current.png')

        inspect(page, -4, 11)
        page.keyboard.press('e')
        page.wait_for_function("window.nebeljagdTestState().equippedWeapon === 'bow'")
        expect(page.locator('#weaponName')).to_have_text('Bogen')
        inspect(page, -8, 8, 0)
        collect(page)
        shots_before = state(page)['combat']['shotsFired']
        page.keyboard.press('f')
        page.wait_for_function("window.nebeljagdTestState().combat.attackPhase === 'draw' && window.nebeljagdTestState().combat.bowDraw > .05")
        draw = state(page)['combat']
        assert draw['shotsFired'] == shots_before, draw
        assert -.12 < draw['heldPose']['bow']['z'] < 1.0 and .7 < draw['heldPose']['bow']['y'] < 1.9, draw
        frozen_capture(page, 'combat-bow-draw.png')
        page.wait_for_function('n => window.nebeljagdTestState().combat.shotsFired === n + 1', arg=shots_before)
        page.wait_for_function('window.nebeljagdTestState().attackCooldown === 0')
        bow_samples = samples(page)
        assert {'draw', 'release'}.issubset({s['attackPhase'] for s in bow_samples}), bow_samples
        settle_projectiles(page)
        check('E equips bow in front of body; F visibly draws string before one released arrow', {
            'drawPose': draw, 'maxDraw': max(s['bowDraw'] for s in bow_samples),
            'phases': list(dict.fromkeys(s['attackPhase'] for s in bow_samples))})

        inspect(page, -8, 8, 0)
        shots_before = state(page)['combat']['shotsFired']
        page.keyboard.press('f')
        page.keyboard.press('Space')
        page.wait_for_function('window.nebeljagdTestState().rollCooldown > 0')
        page.wait_for_function('window.nebeljagdTestState().rollRemaining === 0 && window.nebeljagdTestState().attackCooldown === 0')
        cancelled = state(page)['combat']
        assert cancelled['shotsFired'] == shots_before and cancelled['attackPhase'] == 'idle', cancelled
        check('Rolling during the bow windup cancels the pending arrow', cancelled)

        inspect(page, -8, 6, math.pi)
        house_impact = fire_and_wait_impact(page, 'house', 'combat-house-impact.png')
        assert 1.85 < house_impact['lastImpact']['point']['z'] < 2.5, house_impact
        assert house_impact['lastImpact']['normal']['z'] > .8, house_impact
        check('Arrow sweeps into solid Mooswinkel wall and becomes a bouncing/falling projectile', house_impact)

        trees = sorted(state(page)['world']['trees'], key=lambda t: math.hypot(t['x'], t['z']))
        houses = state(page)['houses']
        chosen = None
        for tree in trees:
            for direction in [0, math.pi, math.pi / 2, -math.pi / 2]:
                x, z = tree['x'] - math.sin(direction) * 1.6, tree['z'] - math.cos(direction) * 1.6
                if math.hypot(x, z) > 38 or abs(x - (9 + 4 * math.sin(z * .085))) < 3.1:
                    continue
                if any(abs(x - h['x']) < h['halfWidth'] + .6 and abs(z - h['z']) < h['halfDepth'] + .6 for h in houses):
                    continue
                inspect(page, x, z, direction)
                actual = state(page)['position']
                if math.hypot(x - actual['x'], z - actual['z']) > .12:
                    continue
                chosen = {'tree': tree, 'origin': actual, 'direction': direction}
                break
            if chosen:
                break
        assert chosen, 'No clear close-range tree shooting position'
        tree_impact = fire_and_wait_impact(page, 'tree', 'combat-tree-impact.png')
        point, tree = tree_impact['lastImpact']['point'], chosen['tree']
        distance = math.hypot(point['x'] - tree['x'], point['z'] - tree['z'])
        assert abs(distance - tree['radius'] - .055) < .12, (chosen, tree_impact)
        check('Arrow hits actual visible tree trunk at its cylinder boundary and bounces', {'target': chosen, 'impact': tree_impact})

        chosen_rock = None
        rocks = sorted([body for body in state(page)['world']['projectileObstacles'] if body.get('type') == 'rock'],
                       key=lambda body: body.get('maxY', 0) - body.get('minY', 0), reverse=True)
        for rock in rocks:
            for direction in [0, math.pi, math.pi / 2, -math.pi / 2]:
                distance = rock['radius'] + 1.5
                x, z = rock['x'] - math.sin(direction) * distance, rock['z'] - math.cos(direction) * distance
                if math.hypot(x, z) > 38 or abs(x - (9 + 4 * math.sin(z * .085))) < 3.1:
                    continue
                if any(abs(x - h['x']) < h['halfWidth'] + .6 and abs(z - h['z']) < h['halfDepth'] + .6 for h in houses):
                    continue
                inspect(page, x, z, direction)
                current = state(page)
                if math.hypot(x - current['position']['x'], z - current['position']['z']) > .12:
                    continue
                estimated_arrow_y = current['position']['y'] + current['combat']['heldPose']['bow']['y'] * 1.2
                if rock.get('maxY', 0) < estimated_arrow_y + .04:
                    continue
                chosen_rock = {'rock': rock, 'origin': current['position'], 'direction': direction, 'estimatedArrowY': estimated_arrow_y}
                break
            if chosen_rock:
                break
        if chosen_rock:
            rock_impact = fire_and_wait_impact(page, 'rock', 'combat-rock-impact.png')
            check('A sufficiently tall rock blocks and deflects the arrow at weapon height', {'target': chosen_rock, 'impact': rock_impact})
        else:
            report['rock_fixture'] = 'No unobstructed rock high enough for the horizontal bow trajectory; height-range cases covered by Node projectile tests.'

        inspect(page, -11, 6)
        page.keyboard.press('e')
        page.wait_for_function("window.nebeljagdTestState().equippedWeapon === 'sword'")
        expect(page.locator('#weaponName')).to_have_text('Schwert')
        inspect(page, -8, 8, math.pi / 2)
        collect(page)
        page.keyboard.press('f')
        page.wait_for_function("window.nebeljagdTestState().combat.attackPhase === 'strike'")
        strike = state(page)['combat']
        frozen_capture(page, 'combat-sword-strike.png')
        page.wait_for_function('window.nebeljagdTestState().attackCooldown === 0')
        sword_samples = samples(page)
        active = [s for s in sword_samples if s['attackPhase'] != 'idle']
        assert {'windup', 'strike', 'follow-through'}.issubset({s['attackPhase'] for s in active}), active
        sweeps = [s['swordSweep'] for s in active]
        assert max(sweeps) - min(sweeps) > 1.2, sweeps
        assert min(s['heldPose']['swordTip']['z'] for s in active) > .4, active
        check('Sword follows a broad physical arc in front of the body, with windup/strike/follow-through', {
            'strike': strike, 'minSweep': min(sweeps), 'maxSweep': max(sweeps),
            'minimumForwardTip': min(s['heldPose']['swordTip']['z'] for s in active),
            'phases': list(dict.fromkeys(s['attackPhase'] for s in active))})

        grass = state(page)['world']['grassPatches'][0]
        inspect(page, grass['x'], grass['z'])
        page.wait_for_function('window.nebeljagdTestState().hiddenInGrass && Math.abs(window.nebeljagdTestState().character.opacity - .45) < .015')
        capture(page, 'combat-grass-current.png')
        check('Relocated irregular grass patch preserves 45% local concealment', {
            'patch': grass, 'opacity': state(page)['character']['opacity']})
        inspect(page, 0, -14, 0)
        capture(page, 'combat-clearing-current.png')
        inspect(page, 7, 5.5, math.pi / 2)
        capture(page, 'combat-river-current.png')
        report['rendering'] = state(page)['rendering']
        page.close(); browser.close()
        assert not errors, errors
        report['status'] = 'passed'
except BaseException as error:
    report['status'] = 'interrupted' if isinstance(error, KeyboardInterrupt) else 'failed'
    report['failure'] = str(error)
    raise
finally:
    (OUT / 'combat-smoke.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
