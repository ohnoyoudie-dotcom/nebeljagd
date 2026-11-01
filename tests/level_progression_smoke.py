"""Verify kill progression through real attacks in the standalone game.

NEBELJAGD_URL=http://127.0.0.1:5225 python tests/level_progression_smoke.py
Only an explicitly imported test island changes. The inspect hook positions the
player; weapon collection, F attacks, healing and restart use normal gameplay.
The source map and shipped default placements remain untouched. Core Node tests
cover arbitrary player IDs; this browser check does not claim live multiplayer.
"""
from __future__ import annotations

from copy import deepcopy
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
from urllib.parse import urlsplit
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5225').rstrip('/')
RELEASE = Path(os.environ.get('NEBELJAGD_RELEASE_DIR', ROOT / 'welt'))
OUT = Path(os.environ.get('NEBELJAGD_QA_OUT', '/tmp/nebeljagd-level-progression-qa'))
OUT.mkdir(parents=True, exist_ok=True)
BASE = json.loads((ROOT / 'worldmap.json').read_text())
MAP_HASH = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
REPORT = {'status': 'running', 'url': URL, 'checks': [], 'errors': [],
          'unexpectedRequests': [], 'screenshots': [],
          'limits': 'Actual standalone game in Chromium/SwiftShader with an imported test island and real NPC kills; no physical-device performance or live-multiplayer claim.'}


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def fixture():
    value = deepcopy(BASE)
    value['name'] = 'QA · Level und Lebenspunkte'
    value['bounds'] = {'minX': -90, 'minZ': -90, 'maxX': 90, 'maxZ': 90}
    points = [[-80, -80], [80, -80], [80, 80], [-80, 80]]
    value['island']['points'] = deepcopy(points)
    value['regions'] = [{'id': 'qa-meadow', 'name': 'Testwiese', 'biome': 'meadow',
                         'color': '#638b4c', 'label': [0, 0], 'points': deepcopy(points)}]
    for field in ['islets', 'paths', 'rivers', 'waterAreas', 'places', 'spawnAreas', 'barriers']:
        value[field] = []
    value['gameplay']['spawnPosition'] = [0, 0]
    value['zone']['center'] = [0, 0]
    value.pop('landscape', None)
    value['objects'] = [
        {'id': 'qa-sword', 'name': 'Testschwert', 'kind': 'sword', 'variant': 'kit-tripo-sword',
         'rarity': 'legendary', 'position': [-4, -4], 'rotation': 0, 'scale': 1},
        {'id': 'qa-fire', 'name': 'Testlavastab', 'kind': 'fireStaff', 'variant': 'kit-tripo-lava-staff',
         'rarity': 'common', 'position': [-10, -4], 'rotation': 0, 'scale': 1},
        *[{'id': f'qa-heart-{i+1}', 'name': 'Testherz', 'kind': 'heart', 'variant': 'healing',
           'position': [-15-i*5, -4], 'rotation': 0, 'scale': 1} for i in range(3)],
    ]
    return value


def state(page):
    return page.evaluate('''() => {
      const s=nebeljagdTestState();
      return {phase:s.phase, elapsed:s.elapsed, health:s.health, maxHealth:s.maxHealth,
        level:s.level, defeats:s.defeats, lastDefeat:s.lastDefeat,
        attackCooldown:s.attackCooldown, equippedWeapon:s.equippedWeapon,
        equippedItem:s.equippedItem, healthBars:s.healthBars, combat:s.combat,
        practiceActors:s.practiceActors, pickups:s.pickups, rendering:s.rendering,
        world:{name:s.world.mapName, source:s.world.source, objects:s.world.objects}};
    }''')


def wait_sim(page, duration):
    before = page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('t=>nebeljagdTestState().elapsed>=t', arg=before + duration)


def inspect(page, x, z, direction=0):
    page.evaluate('p=>nebeljagdInspect(p)', {'x': x, 'z': z, 'direction': direction})
    wait_sim(page, .08)


def capture(page, name):
    path = OUT / (name + '.png')
    page.screenshot(path=str(path))
    REPORT['screenshots'].append(str(path))


def health_ui(page, level, max_health, health, baseline_width=None):
    page.wait_for_function('v=>{const s=nebeljagdTestState();return s.level===v.level&&s.maxHealth===v.max&&Math.abs(s.health-v.health)<.001}',
                           arg={'level': level, 'max': max_health, 'health': health})
    page.wait_for_function('v=>document.querySelector("#playerLevel")?.textContent===String(v.level)&&document.querySelector("#healthBar")?.getAttribute("aria-valuemax")===String(v.max)',
                           arg={'level': level, 'max': max_health})
    data = page.evaluate('''() => {
      const bar=document.querySelector('#healthBar'), label=document.querySelector('#playerLevel');
      const a=bar.getBoundingClientRect(), b=label.getBoundingClientRect();
      return {width:a.width, left:a.left, levelRight:b.right, label:label.textContent,
        levelAria:label.getAttribute('aria-label'), segments:Number(bar.dataset.segments),
        level:Number(bar.dataset.level), max:Number(bar.getAttribute('aria-valuemax')),
        current:Number(bar.getAttribute('aria-valuenow')),
        step:parseFloat(getComputedStyle(bar).getPropertyValue('--health-segment-step')),
        fill:parseFloat(document.querySelector('#healthFill').style.width)};
    }''')
    assert data['label'] == str(level) and data['level'] == level, data
    assert data['levelAria'] == f'Level {level}', data
    assert data['levelRight'] <= data['left'], 'The level must sit left of the health track'
    assert data['segments'] == math.ceil(max_health / 25), data
    assert data['max'] == max_health and data['current'] == math.ceil(health), data
    assert abs(data['step'] - 2500 / max_health) < .001, data
    assert abs(data['fill'] - 100 * health / max_health) < .001, data
    if baseline_width is not None:
        assert abs(data['width'] - baseline_width) < .01, 'Level gains must not lengthen or shorten the health track'
    overhead = next(b for b in state(page)['healthBars'] if b['id'] == 'player')
    assert overhead['visible'] and overhead['level'] == level, overhead
    assert overhead['maxHealth'] == max_health and abs(overhead['health'] - health) < .001, overhead
    assert overhead['segmentCount'] == math.ceil(max_health / 25), overhead
    assert overhead['healthPerSegment'] == 25, overhead
    assert abs(overhead['barWidth'] - 1.805) < .0001, overhead
    assert overhead['levelBounds']['right'] < overhead['barBounds']['left'], overhead
    return {'hud': data, 'overhead': overhead}


def actor(page, identifier):
    return next(a for a in state(page)['practiceActors'] if a['id'] == identifier)


def attack_target(page, identifier, distance=1.3):
    page.wait_for_function('nebeljagdTestState().attackCooldown===0')
    along_x = identifier != 'practice-2'
    page.evaluate('''p=>{
      const a=nebeljagdTestState().practiceActors.find(a=>a.id===p.id);
      nebeljagdInspect({x:a.position.x-(p.alongX?p.distance:0),
        z:a.position.z-(p.alongX?0:p.distance),direction:p.alongX?Math.PI/2:0});
    }''', {'id': identifier, 'distance': distance, 'alongX': along_x})
    wait_sim(page, .08)
    before = state(page)['combat']['damageHits']
    page.keyboard.press('f')
    page.wait_for_function('n=>nebeljagdTestState().combat.damageHits>n', arg=before)
    current = state(page)
    assert current['combat']['lastDamage']['targetId'] == identifier, current['combat']
    return current


def record_document():
    digest = hashlib.sha256(); size = 0
    with urlopen(URL + '/nebeljagd.html', timeout=60) as response:
        assert response.status == 200
        while chunk := response.read(1024 * 1024):
            digest.update(chunk); size += len(chunk)
    local = RELEASE / 'nebeljagd.html'
    assert digest.hexdigest() == hashlib.sha256(local.read_bytes()).hexdigest()
    REPORT['delivery'] = {'file': str(local), 'bytes': size, 'sha256': digest.hexdigest()}


try:
    record_document()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),
            headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        try:
            context = browser.new_context(viewport={'width': 1280, 'height': 900})
            page = context.new_page(); page.set_default_timeout(120000)
            page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
            page.on('console', lambda message: REPORT['errors'].append(message.text) if message.type == 'error' else None)
            context.on('request', lambda request: REPORT['unexpectedRequests'].append(request.url)
                if request.url.startswith(('http:', 'https:')) and request.resource_type != 'document'
                and not urlsplit(request.url).path.endswith('/favicon.ico') else None)
            page.goto(URL + '/nebeljagd.html?inspect=1&quality=low', wait_until='domcontentloaded')
            page.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
            expected = fixture()
            with page.expect_navigation(wait_until='domcontentloaded'):
                page.locator('#worldMapFile').set_input_files({'name': 'level-progression-fixture.json',
                    'mimeType': 'application/json', 'buffer': json.dumps(expected).encode()})
            page.wait_for_function('name=>window.nebeljagdInspect&&nebeljagdTestState().rendering.calls>0&&nebeljagdTestState().world.mapName===name',
                                   arg=expected['name'])
            assert state(page)['world']['source'] == 'import'
            assert state(page)['world']['objects'] == expected['objects']
            page.locator('#startBtn').click()
            initial = health_ui(page, 1, 100, 72)
            width = initial['hud']['width']
            assert state(page)['defeats'] == 0
            passed('A fresh round starts at level 1 with 72/100 HP and four fixed-width segments', initial)

            inspect(page, -4, -4)
            page.wait_for_function('nebeljagdTestState().equippedWeapon==="sword"')
            assert state(page)['equippedItem']['model'] == 'tripo'
            for i in range(3):
                hit = attack_target(page, 'practice-1')
                if i < 2:
                    assert hit['level'] == 1 and hit['defeats'] == 0, hit
            first = health_ui(page, 2, 125, 97, width)
            assert not actor(page, 'practice-1')['alive']
            assert state(page)['defeats'] == 1
            assert state(page)['lastDefeat']['sourceId'] == 'player'
            capture(page, 'level-2-five-segments')
            passed('Only a defeated opponent grants level 2, exactly +25 current/max HP and a fifth segment', first)

            page.wait_for_function('nebeljagdTestState().attackCooldown===0')
            page.keyboard.press('f'); wait_sim(page, .7)
            assert state(page)['level'] == 2 and state(page)['defeats'] == 1
            passed('Attacking an already defeated opponent cannot grant a second level')

            for _ in range(3):
                attack_target(page, 'practice-2')
            second = health_ui(page, 3, 150, 122, width)
            assert state(page)['defeats'] == 2 and not actor(page, 'practice-2')['alive']
            capture(page, 'level-3-six-segments')
            passed('The next opponent grants level 3 and six finer segments without changing bar width', second)

            inspect(page, -15, -4)
            page.wait_for_function('nebeljagdTestState().pickups.find(p=>p.id==="qa-heart-1").collected')
            health_ui(page, 3, 150, 147, width)
            inspect(page, -20, -4)
            page.wait_for_function('nebeljagdTestState().pickups.find(p=>p.id==="qa-heart-2").collected')
            healed = health_ui(page, 3, 150, 150, width)
            inspect(page, -25, -4); wait_sim(page, .15)
            assert not next(p for p in state(page)['pickups'] if p['id'] == 'qa-heart-3')['collected']
            passed('Hearts heal above 100 to the increased maximum and remain unconsumed at full health', healed)

            for _ in range(2):
                attack_target(page, 'practice-3')
            assert abs(actor(page, 'practice-3')['health'] - 24) < .001
            inspect(page, -10, -4)
            page.keyboard.press('e')
            page.wait_for_function('nebeljagdTestState().equippedWeapon==="fireStaff"')
            burning = attack_target(page, 'practice-3', 3)
            target = next(a for a in burning['practiceActors'] if a['id'] == 'practice-3')
            assert target['alive'] and 0 < target['health'] <= 8 and target['burnRemaining'] > 0, target
            assert burning['level'] == 3
            page.wait_for_function('nebeljagdTestState().level===4')
            burnt = health_ui(page, 4, 175, 175, width)
            assert not actor(page, 'practice-3')['alive']
            assert state(page)['defeats'] == 3
            assert state(page)['lastDefeat']['sourceId'] == 'player'
            assert state(page)['lastDefeat']['type'] == 'burn', state(page)['lastDefeat']
            capture(page, 'level-4-burn-victory')
            passed('A lethal burn credits its player exactly once and grants level 4 / 175 HP',
                   {'afterDirectHit': target, 'afterBurn': burnt, 'lastDefeat': state(page)['lastDefeat']})

            page.keyboard.press('Escape')
            page.locator('#restartBtn').click()
            page.wait_for_function('nebeljagdTestState().phase==="playing"')
            restarted = health_ui(page, 1, 100, 72, width)
            assert state(page)['defeats'] == 0 and state(page)['lastDefeat'] is None
            assert all(a['alive'] for a in state(page)['practiceActors'])
            assert all(not p['collected'] for p in state(page)['pickups'])
            passed('A new round resets level, health capacity, divider spacing and defeated opponents', restarted)
            assert not REPORT['errors'], REPORT['errors']
            assert not REPORT['unexpectedRequests'], REPORT['unexpectedRequests']
        except BaseException:
            if 'page' in locals():
                try: capture(page, 'failure')
                except Exception: pass
            raise
        finally:
            browser.close()
    assert hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest() == MAP_HASH
    REPORT['sourceMapUnchanged'] = MAP_HASH
    REPORT['status'] = 'passed'
except BaseException as error:
    REPORT['status'] = 'failed'; REPORT['failure'] = str(error)
    raise
finally:
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': REPORT['status'], 'checks': len(REPORT['checks']),
                     'errors': REPORT['errors'], 'failure': REPORT.get('failure')}, ensure_ascii=False), flush=True)
