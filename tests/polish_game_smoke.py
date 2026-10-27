"""Real controls exercise the readability/movement/loot polish on the built game.

NEBELJAGD_URL=http://127.0.0.1:4174 python3 tests/polish_game_smoke.py
The only inspect mutation relocates/orients the local player. Weapons and hits
always use actual automatic pickup, E and F. All waits follow simulation time.
"""
import hashlib
import json
import math
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4174').rstrip('/')
GAME = os.environ.get('NEBELJAGD_GAME_PATH', '/nebeljagd.html')
MINIMAP_ONLY = '--minimap-only' in sys.argv
previous = json.loads((ROOT / 'docs/polish-game-check.json').read_text()) if MINIMAP_ONLY else None
checks, errors, screenshots = (previous['checks'], [], previous['screenshots']) if previous else ([], [], [])
report = {'status': 'running', 'url': BASE + GAME, 'checks': checks, 'errors': errors, 'screenshots': screenshots}


def state(page):
    return page.evaluate('''() => {const s=nebeljagdTestState(); s.world={stats:s.world.stats,source:s.world.source}; return s;}''')


def wait_sim(page, seconds):
    elapsed = page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('time => nebeljagdTestState().elapsed >= time', arg=elapsed + seconds)


def inspect(page, x, z, direction=0, health=100):
    page.evaluate('p=>nebeljagdInspect(p)', {'x': x, 'z': z, 'direction': direction, 'health': health})
    wait_sim(page, .12)


def passed(name, evidence):
    checks.append({'name': name, 'evidence': evidence})
    print('PASS:', name, flush=True)


def capture(page, name):
    path = ROOT / 'docs/screenshots' / f'polish-game-{name}.png'
    page.screenshot(path=str(path))
    screenshots.append(str(path.relative_to(ROOT)))


def actor(s, ident='practice-3'):
    return next(a for a in s['practiceActors'] if a['id'] == ident)


def bar(s, ident='practice-3'):
    return next(b for b in s['healthBars'] if b['id'] == ident)


def minimap_checks(page, initial):
    inspect(page, 30, -42, direction=math.pi / 2)
    wait_sim(page, .2)
    local = state(page)['minimap']
    assert local['mode'] == 'local'
    # Telemetry positions are in logical canvas units (the 512px backbuffer is 2×).
    assert abs(local['player']['x'] - initial['minimap']['player']['x']) < 1
    assert abs(local['player']['y'] - initial['minimap']['player']['y']) < 1
    assert abs(local['center']['x'] - 30) < .01 and abs(local['center']['z'] + 42) < .01
    assert abs(local['player']['direction'] - math.pi / 2) < .001
    assert len(local['markers']) >= 3
    page.locator('#mapMode-island').click()
    page.wait_for_function("nebeljagdTestState().minimap.mode === 'island'")
    island = state(page)['minimap']
    assert island['spanMeters'] > local['spanMeters'] * 3
    expect(page.locator('#mapMode-island')).to_have_attribute('aria-pressed', 'true')
    capture(page, 'minimap-island')
    page.locator('#mapMode-local').click()
    page.wait_for_function("nebeljagdTestState().minimap.mode === 'local'")
    expect(page.locator('#mapMode-local')).to_have_attribute('aria-pressed', 'true')
    passed('The larger minimap follows position and heading, marks places, and toggles between local and island views', {
        'local': local, 'island': island})



def run(browser):
    page = browser.new_page(viewport={'width': 1200, 'height': 800}, device_scale_factor=1)
    page.set_default_timeout(120000)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    response = page.goto(BASE + GAME + '?inspect=1&quality=low', wait_until='domcontentloaded')
    report['served_html_sha256'] = hashlib.sha256(response.body()).hexdigest()
    if previous: assert report['served_html_sha256'] == previous['served_html_sha256'], 'Resume requires the identical tested build'
    page.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls > 0')
    expect(page.locator('#errorScreen')).to_be_hidden()
    page.locator('#startBtn').click()
    wait_sim(page, .2)
    initial = state(page)
    if MINIMAP_ONLY:
        minimap_checks(page, initial)
        assert not errors, errors
        page.close()
        return
    assert initial['vision']['appearance'] == 'translucent-blue-grey'
    assert initial['vision']['sceneryTransmission'] >= .4
    assert initial['vision']['radius'] == 18
    assert all(not h['roofVisible'] for h in initial['houses'])
    assert initial['world']['stats']['grassRendering']['tallHeight'][0] >= 2.2
    assert initial['world']['stats']['grassRendering']['bendsAwayFromPlayer'] is False
    assert initial['minimap']['canvasPixels'] == 512 and initial['minimap']['displayWidth'] >= 220
    capture(page, 'overview')
    passed('Pale translucent fog, taller grass and a larger sharp minimap load without render errors', {
        'vision': initial['vision'], 'grass': initial['world']['stats']['grassRendering'], 'minimap': initial['minimap']})

    assert initial['equippedWeapon'] is None
    inspect(page, 34, -39)
    page.wait_for_function("nebeljagdTestState().equippedWeapon === 'bow'")
    auto = state(page)
    assert next(w for w in auto['weaponDrops'] if w['id'] == 'obj-bow-start')['collected']
    inspect(page, 35, -34)
    wait_sim(page, .35)
    still = state(page)
    assert still['equippedWeapon'] == 'bow'
    assert not next(w for w in still['weaponDrops'] if w['id'] == 'obj-fireStaff-start')['collected']
    expect(page.locator('#pickupPrompt')).to_contain_text('wechseln')
    page.keyboard.press('e')
    page.wait_for_function("nebeljagdTestState().equippedWeapon === 'fireStaff'")
    manual = state(page)
    assert manual['equippedItem']['rarity'] == 'rare'
    expect(page.locator('#weaponStatus')).to_have_attribute('data-rarity', 'rare')
    capture(page, 'rarity')
    passed('Walking over the first bow equips automatically; an equipped weapon changes only on E', {
        'automatic': auto['equippedItem'], 'beforeE': still['equippedWeapon'], 'afterE': manual['equippedItem']})

    inspect(page, 30, -42, direction=0)
    page.evaluate('''() => {
      window.__motionFrames=[];window.__sampleMotion=true;
      const sample=()=>{if(!window.__sampleMotion)return;const s=nebeljagdTestState();
        __motionFrames.push({elapsed:s.elapsed,moving:s.moving,position:s.position,direction:s.direction,...s.character.locomotion});
        requestAnimationFrame(sample)};requestAnimationFrame(sample);
    }''')
    page.keyboard.down('s')
    wait_sim(page, .45)
    walking = state(page)
    assert walking['moving'] and walking['character']['locomotion']['walkWeight'] > .8
    assert walking['character']['locomotion']['forwardLean'] > .02
    page.keyboard.up('s'); page.keyboard.down('d')
    wait_sim(page, .22)
    page.keyboard.up('d')
    wait_sim(page, .6)
    stopped = state(page)
    frames = page.evaluate('() => {__sampleMotion=false; return __motionFrames;}')
    turning = [f for f in frames if abs(f['turnRate']) > 1 and abs(f['sideLean']) > .001]
    assert turning, 'real keyboard direction change should produce a short weighted turn'
    assert any(.05 < f['walkWeight'] < .8 and f['moving'] for f in frames), 'idle-to-walk blend is gradual'
    assert not stopped['moving'] and stopped['character']['locomotion']['walkWeight'] < .01
    assert any(not f['moving'] and .01 < f['walkWeight'] < .8 and f['playbackSpeed'] >= .42 for f in frames)
    passed('Real WASD input blends idle, walk, turn and stop without freezing the fading gait', {
        'walking': walking['character']['locomotion'], 'turn': turning[0], 'stopped': stopped['character']['locomotion']})

    # Approach the third target along its X patrol axis, then use the real F attack.
    target = actor(state(page))
    inspect(page, target['position']['x'] - 3, target['position']['z'], direction=math.pi / 2)
    before = state(page)
    page.evaluate('''() => {
      const baseline=nebeljagdTestState().combat.damageHits;
      window.__hitFrames=[];window.__sampleHits=true;
      const sample=()=>{if(!window.__sampleHits)return;const s=nebeljagdTestState();
        if(s.combat.damageHits>baseline)__hitFrames.push({elapsed:s.elapsed,actor:s.practiceActors.find(a=>a.id==='practice-3'),
          bar:s.healthBars.find(b=>b.id==='practice-3'),feedback:s.damageFeedback});
        requestAnimationFrame(sample)};requestAnimationFrame(sample);
    }''')
    page.keyboard.press('f')
    page.wait_for_function('window.__hitFrames.length > 0')
    first = page.evaluate('__hitFrames[0]')
    expected = before['equippedItem']['damage']
    assert first['actor']['health'] <= before['practiceActors'][2]['health'] - expected
    assert first['bar']['health'] == first['actor']['health'], 'authoritative health and bar value update together on the hit frame'
    assert first['bar']['displayedRatio'] > first['bar']['health'] / first['bar']['maxHealth']
    assert first['bar']['flash'] > 0
    direct = next(d for d in first['feedback']['active'] if d['type'] == 'fireStaff')
    assert direct['amount'] == expected and direct['text'] == str(expected)
    capture(page, 'hit-number')
    wait_sim(page, .45)
    subsequent = state(page)
    burns = [d for d in subsequent['damageFeedback']['active'] if d['type'] == 'burn']
    assert burns and all(d['amount'] > .5 for d in burns), 'continuous damage is coalesced into readable numbers'
    assert actor(subsequent)['health'] < first['actor']['health']
    assert any(d['type'] == 'fireStaff' and d['age'] > direct['age'] for d in subsequent['damageFeedback']['active'])
    assert subsequent['damageFeedback']['emitted'] < 10
    page.evaluate('__sampleHits=false')
    capture(page, 'burn-number')
    passed('A real fire hit updates HP immediately, flashes and eases the bar, and floats readable coalesced damage numbers', {
        'firstHit': first, 'laterFeedback': subsequent['damageFeedback'], 'laterBar': bar(subsequent)})

    # The nearby house wall occludes target3 while it is still burning.
    inspect(page, 52.00000634, -40.00796326)
    behind = state(page)
    target = actor(behind)
    separation = math.hypot(target['position']['x'] - behind['position']['x'], target['position']['z'] - behind['position']['z'])
    assert 2 < separation < 18 and behind['shelter']
    assert not target['visible'] and not bar(behind)['visible']
    assert not any(d['targetId'] == target['id'] for d in behind['damageFeedback']['active'])
    assert not any(d['targetId'] == target['id'] for d in behind['damageFeedback']['pending'])
    before_hidden_health = target['health']
    wait_sim(page, .45)
    hidden_burn = state(page)
    assert actor(hidden_burn)['health'] < before_hidden_health
    assert not any(d['targetId'] == target['id'] for d in hidden_burn['damageFeedback']['active'])
    capture(page, 'cover')
    inspect(page, 100, -42, health=61)
    outside = state(page)
    assert all(not a['visible'] for a in outside['practiceActors'])
    assert all(not b['visible'] for b in outside['healthBars'] if not b['local'])
    assert not outside['damageFeedback']['active']
    assert bar(outside, 'player')['health'] == 61 and bar(outside, 'player')['visible']
    passed('Walls and range conceal actors, bars and pending/active damage numbers while actual burning continues', {
        'wallDistance': separation, 'wallHealthBefore': before_hidden_health, 'wallHealthAfter': actor(hidden_burn)['health'],
        'wallFeedback': hidden_burn['damageFeedback'], 'outsideBars': outside['healthBars']})

    inspect(page, 10, -30, health=61)
    page.wait_for_function('nebeljagdTestState().hiddenInGrass && nebeljagdTestState().character.opacity < .5')
    grass = state(page)
    assert grass['hiddenFromOtherPlayers'] and bar(grass, 'player')['visible']
    capture(page, 'grass')
    passed('Raised high grass hides the body without parting and preserves local health readability', {
        'height': grass['world']['stats']['grassRendering'], 'concealment': grass['concealment'], 'opacity': grass['character']['opacity']})

    minimap_checks(page, initial)
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
    report['status'] = 'failed'; report['failure'] = str(error)
    raise
finally:
    (ROOT / 'docs/polish-game-check.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'checks': len(checks), 'failure': report.get('failure'), 'errors': errors}, ensure_ascii=False), flush=True)
