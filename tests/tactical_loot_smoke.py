"""Exercise tactical sight, chests and all four weapon types through real controls.

NEBELJAGD_URL=http://127.0.0.1:4174 python tests/tactical_loot_smoke.py
The public inspect hook only places the local character; hits, loot and resets
use the same keyboard/buttons as a player. Timings follow simulation time.
"""
import json
import hashlib
import math
import os
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4174').rstrip('/')
GAME = os.environ.get('NEBELJAGD_GAME_PATH', '/nebeljagd.html')
SHOTS = ROOT / 'docs/screenshots'
SHOTS.mkdir(exist_ok=True)
checks, errors, screenshots = [], [], []
report = {'status': 'running', 'url': URL + GAME, 'checks': checks,
          'javascript_or_shader_errors': errors, 'screenshots': screenshots}


def passed(name, evidence):
    checks.append({'name': name, 'evidence': evidence})
    print('PASS:', name, flush=True)


def state(page):
    return page.evaluate('''() => {
      const s = window.nebeljagdTestState();
      s.world = { stats:s.world.stats, source:s.world.source };
      return s;
    }''')


def wait_sim(page, seconds):
    start = page.evaluate('window.nebeljagdTestState().elapsed')
    page.wait_for_function('t => window.nebeljagdTestState().elapsed >= t', arg=start + seconds)


def inspect(page, x, z, direction=0, health=100):
    page.evaluate('p => window.nebeljagdInspect(p)', {'x': x, 'z': z, 'direction': direction, 'health': health})
    wait_sim(page, .12)


def capture(page, name):
    path = SHOTS / f'tactical-loot-{name}.png'
    page.screenshot(path=str(path))
    screenshots.append(str(path.relative_to(ROOT)))


def reset(page):
    if state(page)['phase'] == 'playing':
        page.keyboard.press('Escape')
    expect(page.locator('#restartBtn')).to_be_visible()
    page.locator('#restartBtn').click()
    page.wait_for_function("window.nebeljagdTestState().phase === 'playing'")
    wait_sim(page, .12)


def equip(page, weapon_type):
    drop = next(d for d in state(page)['weaponDrops'] if d['id'] == f'obj-{weapon_type}-start')
    inspect(page, drop['x'], drop['z'])
    page.keyboard.press('e')
    page.wait_for_function('type => window.nebeljagdTestState().equippedWeapon === type', arg=weapon_type)
    wait_sim(page, .12)
    expect(page.locator('#weaponStatus')).to_have_attribute('data-rarity', drop['rarity'])
    return state(page)['equippedItem']


def attack_target(page, target_id, distance=3):
    # Target 1/3 patrol along X; approach on the same line, so normal movement
    # during the wind-up does not require predictive target mutation.
    along_x = target_id != 'practice-2'
    page.evaluate('''p => {
      const actor = window.nebeljagdTestState().practiceActors.find(a=>a.id===p.id);
      window.nebeljagdInspect({x:actor.position.x-(p.alongX?p.distance:0),
        z:actor.position.z-(p.alongX?0:p.distance), direction:p.alongX?Math.PI/2:0});
    }''', {'id': target_id, 'distance': distance, 'alongX': along_x})
    wait_sim(page, .12)
    before = state(page)
    page.keyboard.press('f')
    page.wait_for_function('n => window.nebeljagdTestState().combat.damageHits > n', arg=before['combat']['damageHits'])
    wait_sim(page, .12)  # Let the next actor/bar update observe this frame's hit.
    after = state(page)
    assert after['combat']['lastDamage']['targetId'] == target_id, after['combat']
    return before, after


def run(browser):
    page = browser.new_page(viewport={'width': 960, 'height': 640}, device_scale_factor=1)
    page.set_default_timeout(120000)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    response = page.goto(URL + GAME + '?inspect=1&quality=low', wait_until='domcontentloaded')
    report['served_html_sha256'] = hashlib.sha256(response.body()).hexdigest()
    page.wait_for_function('window.nebeljagdTestState && window.nebeljagdTestState().rendering.calls > 0')
    expect(page.locator('#errorScreen')).to_be_hidden()
    page.locator('#startBtn').click()
    wait_sim(page, .15)
    initial = state(page)
    assert len(initial['houses']) == 31
    assert all(not house['roofVisible'] and house['interiorVisible'] for house in initial['houses'])
    assert initial['vision']['radius'] == 18 and initial['vision']['blockerCount'] > 0
    assert len(initial['practiceActors']) == 3
    assert len(initial['healthBars']) == 4 and all(bar['visible'] for bar in initial['healthBars'])
    assert all(drop['type'] != 'crystal' for drop in initial['pickups'])
    assert initial['gold'] == 0
    capture(page, 'start')
    passed('Roofless furnished buildings, local 18m sight and above-head bars load without shader errors', {
        'houses': len(initial['houses']), 'vision': initial['vision'], 'healthBars': initial['healthBars'],
        'chests': len(initial['chests']), 'weapons': len(initial['weaponDrops'])})

    chest = next(c for c in initial['chests'] if c['id'] == 'obj-chest-start')
    inspect(page, chest['x'], chest['z'] - 1.8)
    page.wait_for_function("window.nebeljagdTestState().nearChest === 'obj-chest-start'")
    expect(page.locator('#pickupPrompt')).to_contain_text('öffnen')
    page.keyboard.press('e')
    page.wait_for_function("window.nebeljagdTestState().chests.find(c=>c.id==='obj-chest-start').opened")
    page.wait_for_function("window.nebeljagdTestState().weaponDrops.some(d=>d.id==='obj-chest-start-weapon')")
    popping = state(page)
    coins = [p for p in popping['pickups'] if p['id'].startswith('obj-chest-start-gold')]
    assert len(coins) == 2 and all(p['type'] == 'gold' for p in coins)
    assert len(popping['weaponDrops']) == len(initial['weaponDrops']) + 1
    capture(page, 'chest-pop')
    wait_sim(page, 1.0)
    for coin in coins:
        inspect(page, coin['x'], coin['z'])
        page.wait_for_function('id => window.nebeljagdTestState().pickups.find(p=>p.id===id).collected', arg=coin['id'])
    collected = state(page)
    assert collected['gold'] > 0
    expect(page.locator('#goldCount')).to_have_text(str(collected['gold']))
    inspect(page, chest['x'], chest['z'] - 1.8)
    page.keyboard.press('e')
    wait_sim(page, .35)
    again = state(page)
    assert again['gold'] == collected['gold']
    assert len([p for p in again['pickups'] if p['id'].startswith('obj-chest-start-gold')]) == 2
    assert len([p for p in again['weaponDrops'] if p['id'] == 'obj-chest-start-weapon']) == 1
    passed('E opens a chest once, launches two coin piles and one weapon; collected gold updates the HUD', {
        'chest': chest['id'], 'gold': collected['gold'], 'drop': next(d for d in popping['weaponDrops'] if d['id'] == 'obj-chest-start-weapon')})

    reset(page)
    clean = state(page)
    assert clean['gold'] == 0 and all(not c['opened'] for c in clean['chests'])
    assert len(clean['weaponDrops']) == len(initial['weaponDrops'])
    assert len(clean['pickups']) == len(initial['pickups'])
    assert all(a['health'] == a['maxHealth'] for a in clean['practiceActors'])
    passed('Restart resets chests, gold, target health and removes dynamic chest drops', {
        'gold': clean['gold'], 'weaponDrops': len(clean['weaponDrops']), 'pickups': len(clean['pickups'])})

    for weapon_type, target_id, distance in [('bow', 'practice-1', 3), ('sword', 'practice-2', 1.3),
                                             ('fireStaff', 'practice-3', 3), ('iceStaff', 'practice-1', 3)]:
        if weapon_type != 'bow':
            reset(page)
        equipped = equip(page, weapon_type)
        before, after = attack_target(page, target_id, distance)
        actor = next(a for a in after['practiceActors'] if a['id'] == target_id)
        bar = next(b for b in after['healthBars'] if b['id'] == target_id)
        assert actor['health'] < actor['maxHealth']
        assert after['combat']['lastDamage']['damage'] == equipped['damage']
        assert abs(bar['health'] - actor['health']) < .01 and bar['visible']
        evidence = {'weapon': equipped, 'hit': after['combat']['lastDamage'], 'actor': actor, 'bar': bar}
        if weapon_type == 'fireStaff':
            assert actor['burnRemaining'] > 0
            wait_sim(page, .7)
            burning = next(a for a in state(page)['practiceActors'] if a['id'] == target_id)
            assert burning['health'] < actor['health'] - 2 and burning['burnRemaining'] < actor['burnRemaining']
            evidence['continuingBurn'] = burning
            capture(page, 'fire')
        if weapon_type == 'iceStaff':
            assert actor['slowRemaining'] > 0 and actor['speedMultiplier'] == .5
            wait_sim(page, .65)
            slow = next(a for a in state(page)['practiceActors'] if a['id'] == target_id)
            assert 0 < slow['travelled'] - actor['travelled'] < .4, slow
            evidence['slowedTravel'] = slow['travelled'] - actor['travelled']
            capture(page, 'ice')
            wait_sim(page, 2.3)
            recovered = next(a for a in state(page)['practiceActors'] if a['id'] == target_id)
            assert recovered['speedMultiplier'] == 1 and recovered['slowRemaining'] == 0
            evidence['recovered'] = recovered['speedMultiplier']
        passed(f'{weapon_type} equips with its rarity and deals real damage' + (' with continuing burn' if weapon_type == 'fireStaff' else ' and temporary movement slow' if weapon_type == 'iceStaff' else ''), evidence)

    reset(page)
    inspect(page, 30, -75, health=47)
    distant = state(page)
    assert all(not actor['visible'] for actor in distant['practiceActors'])
    assert all(not bar['visible'] for bar in distant['healthBars'] if not bar['local'])
    local = next(bar for bar in distant['healthBars'] if bar['local'])
    assert local['visible'] and local['health'] == 47
    passed('Out-of-radius actors and their health bars are hidden; the local 47/100 bar remains visible', {
        'position': distant['position'], 'actors': distant['practiceActors'], 'bars': distant['healthBars']})

    # Find an actual furnished room separated from a nearby practice figure by
    # a wall. A hidden actor strictly inside the 18m radius proves occlusion.
    current = state(page)
    candidates = []
    for house in current['houses']:
        if math.hypot(house['x'] - 42, house['z'] + 38) < 30:
            angle, scale = house['rotation'], house['scale']
            for lx, lz in [(-5, 0), (5, 0), (-5, 4), (5, 4), (0, -4)]:
                candidates.append((house['x'] + (math.cos(angle) * lx + math.sin(angle) * lz) * scale,
                                   house['z'] + (-math.sin(angle) * lx + math.cos(angle) * lz) * scale))
    blocked = None
    for x, z in candidates:
        inspect(page, x, z)
        s = state(page)
        for actor in s['practiceActors']:
            distance = math.hypot(actor['position']['x'] - s['position']['x'], actor['position']['z'] - s['position']['z'])
            if 2 < distance < 17 and not actor['visible'] and s['shelter']:
                bar = next(b for b in s['healthBars'] if b['id'] == actor['id'])
                assert not bar['visible']
                assert not page.evaluate('p => window.nebeljagdInspectVisibility(p)', actor['position'])
                blocked = {'room': s['shelter'], 'player': s['position'], 'actor': actor, 'distance': distance, 'bar': bar}
                break
        if blocked:
            break
    assert blocked, 'No actual house-wall occlusion fixture found'
    capture(page, 'room-shadow')
    passed('A house wall hides a real practice actor and its bar even within the 18m radius', blocked)

    inspect(page, 10, -30, health=61)
    page.wait_for_function('window.nebeljagdTestState().hiddenInGrass')
    hidden = state(page)
    assert next(bar for bar in hidden['healthBars'] if bar['local'])['visible']
    assert hidden['hiddenFromOtherPlayers']
    capture(page, 'grass')
    passed('Tall grass retains concealment while preserving the local health bar', {
        'concealed': hidden['hiddenInGrass'], 'bar': next(bar for bar in hidden['healthBars'] if bar['local'])})

    assert not errors, errors
    page.close()


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        run(browser)
        browser.close()
    report['status'] = 'passed'
except BaseException as error:
    report['status'] = 'interrupted' if isinstance(error, KeyboardInterrupt) else 'failed'
    report['failure'] = str(error)
    raise
finally:
    (ROOT / 'docs/tactical-loot-smoke.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({'status': report['status'], 'checks': len(checks), 'failure': report.get('failure'),
                      'javascript_or_shader_errors': errors}, ensure_ascii=False), flush=True)
