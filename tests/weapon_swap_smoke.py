"""Exercise weapon swaps through the actual standalone editor/play transition.

Run after `npm run build`: python3 tests/weapon_swap_smoke.py.
By default a temporary loopback HTTP server serves welt/ under /preview/ and is
stopped on exit. NEBELJAGD_URL can target an existing static directory instead.
Only the browser's draft changes. Positioning uses the existing inspect hook;
placement, the Spielen transition, weapon swaps and restart use real UI events.
"""
from __future__ import annotations

from contextlib import contextmanager
import functools
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import re
import shutil
import threading
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('NEBELJAGD_QA_OUT', str(ROOT / 'test-results/weapon-swap')))
BASE = json.loads((ROOT / 'worldmap.json').read_text())
MAP_HASH = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
WEAPONS = [
    ('sword', 'kit-tripo-sword', 'rare', [36, -54]),
    ('fireStaff', 'kit-tripo-lava-staff', 'uncommon', [44, -54]),
    ('iceStaff', 'kit-tripo-crystal-staff', 'legendary', [52, -54]),
]
REPORT = {'status': 'running', 'checks': [], 'errors': [], 'screenshots': [], 'documents': [],
          'limits': 'Standalone editor/game in Chromium with software WebGL over local HTTP. '
                    'QA adds inspect and low-quality flags to the real Spielen navigation. '
                    'No physical-device performance or public-host HTTP claim.'}


def stage(name):
    REPORT['stage'] = name
    print('STAGE', name, flush=True)


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def monitor(page):
    page.set_default_timeout(120000)
    page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
    page.on('response', lambda response: REPORT['errors'].append(
        f'HTTP {response.status}: {urlsplit(response.url).path}') if response.status >= 400 else None)


@contextmanager
def static_url():
    external = os.environ.get('NEBELJAGD_URL')
    if external:
        yield external.rstrip('/')
        return

    class Handler(SimpleHTTPRequestHandler):
        def do_GET(self):
            if urlsplit(self.path).path.endswith('/favicon.ico'):
                self.send_response(204)
                self.end_headers()
                return
            if not self.path.startswith('/preview/'):
                self.send_error(404)
                return
            self.path = self.path[len('/preview'):]
            super().do_GET()

        def log_message(self, *_args):
            pass

    handler = functools.partial(Handler, directory=str(ROOT / 'welt'))
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}/preview'
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=5)


def record_document(url, filename):
    digest = hashlib.sha256()
    size = 0
    with urlopen(url + '/' + filename, timeout=60) as response:
        assert response.status == 200
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
    expected = ROOT / 'welt' / filename
    assert digest.hexdigest() == hashlib.sha256(expected.read_bytes()).hexdigest()
    REPORT['documents'].append({'name': filename, 'bytes': size,
                                'sha256': digest.hexdigest(), 'matchesDeliveredFile': True})


def state(page):
    return page.evaluate('''() => {
      const s=nebeljagdTestState();
      return {phase:s.phase, position:s.position, equippedItem:s.equippedItem,
        nearWeapon:s.nearWeapon, weaponDrops:s.weaponDrops, heldModel:s.combat.heldModel,
        world:{source:s.world.source, objects:s.world.objects}};
    }''')


def capture(page, name):
    path = OUT / (name + '.png')
    page.screenshot(path=str(path))
    REPORT['screenshots'].append(str(path))


def inspect_at(page, position):
    page.evaluate('p=>nebeljagdInspect({x:p[0],z:p[1],direction:Math.PI,health:100})', position)


def equipped(page, obj):
    page.wait_for_function('id=>nebeljagdTestState().equippedItem?.id===id', arg=obj['id'])
    current = state(page)
    held, item = current['heldModel'], current['equippedItem']
    assert item['type'] == obj['kind'] and item['variant'] == obj['variant'], item
    assert item['rarity'] == obj['rarity'] and item['model'] == 'tripo', item
    assert math.isclose(item['rotation'], obj['rotation'], abs_tol=1e-9), item
    assert math.isclose(item['scale'], obj['scale'], abs_tol=1e-9), item
    assert held['visible'] and held['variant'] == obj['variant'] and held['model'] == 'tripo', held
    expect(page.locator('#weaponStatus')).to_have_attribute('data-rarity', obj['rarity'])
    return current


def inventory_is_conserved(current, expected_ids, held_id):
    drops = current['weaponDrops']
    assert len(drops) == len(expected_ids), drops
    assert {drop['id'] for drop in drops} == expected_ids, drops
    assert len({drop['id'] for drop in drops}) == len(drops), drops
    assert [drop['id'] for drop in drops if drop['collected']] == [held_id], drops
    assert not next(drop for drop in drops if drop['id'] == held_id)['visible'], drops


def assert_ground(current, obj, position):
    drop = next(drop for drop in current['weaponDrops'] if drop['id'] == obj['id'])
    assert not drop['collected'] and drop['visible'], drop
    assert drop['type'] == obj['kind'] and drop['variant'] == obj['variant'], drop
    assert drop['rarity'] == obj['rarity'] and drop['model'] == 'tripo', drop
    assert math.isclose(drop['x'], position[0], abs_tol=1e-6), drop
    assert math.isclose(drop['z'], position[1], abs_tol=1e-6), drop
    return drop


def run(url):
    REPORT['url'] = url
    REPORT['buildId'] = json.loads((ROOT / 'welt/release.json').read_text())['buildId']
    game = None
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or playwright.chromium.executable_path,
            headless=True,
            args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1200, 'height': 800})
        context.on('page', monitor)
        context.route('**/favicon.ico', lambda route: route.fulfill(status=204))
        # The editor button still creates the popup and passes the real draft.
        # Adding QA switches to the request avoids loading the large game twice.
        def inspect_navigation(route):
            parsed = urlsplit(route.request.url)
            query = parse_qs(parsed.query)
            if query.get('mapSource') == ['editor'] and 'inspect' not in query:
                REPORT['editorPlayNavigation'] = route.request.url
                query['inspect'], query['quality'] = ['1'], ['low']
                location = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query, doseq=True), parsed.fragment))
                route.fulfill(status=302, headers={'location': location})
            else:
                route.continue_()

        context.route(re.compile('^' + re.escape(url + '/magebrawl.html') + r'\?'), inspect_navigation)
        editor = context.new_page()
        try:
            stage('Place sword and both staves in the delivered editor')
            response = editor.goto(url + '/map-editor.html?v=swap-check', wait_until='domcontentloaded')
            assert response.status == 200
            record_document(url, 'map-editor.html')
            editor.wait_for_function('typeof nebeljagdMapTestState === "function"')
            assert editor.evaluate('nebeljagdMapTestState().map') == BASE
            objects = []
            for index, (kind, variant, rarity, position) in enumerate(WEAPONS):
                editor.locator('#editor-tab-objects').click()
                editor.locator('#editor-tool-objects-place').click()
                editor.locator('#palette-kind').select_option(kind)
                editor.locator('#palette-variant').select_option(variant)
                editor.locator('#palette-rarity').select_option('common')
                editor.locator('#add-object-center').click()
                for field, value in [('feature-x', position[0]), ('feature-z', position[1]),
                                     ('object-rotation', (index + 1) * 30), ('object-scale', 1.2)]:
                    editor.locator('#' + field).fill(str(value))
                editor.locator('#properties-form button[type=submit]').click()
                obj = editor.evaluate('nebeljagdMapTestState().map.objects.at(-1)')
                assert obj['kind'] == kind and obj['variant'] == variant and obj['rarity'] == 'common'
                objects.append(obj)
            edited = editor.evaluate('nebeljagdMapTestState().map')
            assert edited['objects'][:-3] == BASE['objects']
            assert {k: v for k, v in edited.items() if k != 'objects'} == {k: v for k, v in BASE.items() if k != 'objects'}
            capture(editor, 'editor-swap-fixture')
            passed('Editor places three distinct models and rarities without changing the source map', objects)

            stage('Open the real Spielen popup with the authored draft')
            with editor.expect_popup() as popup:
                editor.locator('#playtest-world').click()
            game = popup.value
            game.set_viewport_size({'width': 960, 'height': 640})
            game.bring_to_front()
            game.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
            expect(game.locator('#errorScreen')).to_be_hidden()
            parsed = urlsplit(game.url)
            assert parsed.path == urlsplit(url).path + '/magebrawl.html', game.url
            assert parse_qs(parsed.query)['mapSource'] == ['editor']
            assert parse_qs(parsed.query).get('v') == ['swap-check'], game.url
            assert parse_qs(urlsplit(REPORT['editorPlayNavigation']).query).get('v') == ['swap-check'], REPORT['editorPlayNavigation']
            record_document(url, 'magebrawl.html')
            initial = state(game)
            assert initial['world']['source'] == 'editor' and initial['world']['objects'] == edited['objects']
            expected_ids = {drop['id'] for drop in initial['weaponDrops']}
            assert len(expected_ids) == len(initial['weaponDrops'])
            assert all(not drop['collected'] for drop in initial['weaponDrops'])
            passed('Spielen hands the exact editor draft and cache version to the sibling standalone game',
                   {'navigation': REPORT['editorPlayNavigation'], 'version': 'swap-check'})
            game.locator('#startBtn').click()

            objects = [{**obj, 'rarity': next(d['rarity'] for d in state(game)['weaponDrops'] if d['id']==obj['id'])} for obj in objects]
            sword, fire_staff, ice_staff = objects
            stage('Pick up the first weapon automatically')
            inspect_at(game, sword['position'])
            current = equipped(game, sword)
            inventory_is_conserved(current, expected_ids, sword['id'])
            passed('First pickup equips the authored sword with its ID, rarity and scale')

            stage('Swap to the lava staff and recover the dropped sword')
            inspect_at(game, fire_staff['position'])
            game.wait_for_function('nebeljagdTestState().nearWeapon === "fireStaff"')
            assert state(game)['equippedItem']['id'] == sword['id'], 'walking over a second weapon must not auto-swap'
            game.keyboard.press('e')
            current = equipped(game, fire_staff)
            inventory_is_conserved(current, expected_ids, fire_staff['id'])
            first_drop = assert_ground(current, sword, fire_staff['position'])
            assert math.dist([first_drop['x'], first_drop['z']], sword['position']) > 4
            capture(game, 'sword-returned-to-ground')
            passed('E equips the lava staff and returns the original sword visibly to the pickup location', first_drop)

            stage('Swap back and forth without copies or automatic snap-back')
            evidence = []
            for target, old in [(sword, fire_staff), (fire_staff, sword), (sword, fire_staff), (fire_staff, sword)]:
                game.wait_for_function('kind=>nebeljagdTestState().nearWeapon === kind', arg=target['kind'])
                game.keyboard.press('e')
                current = equipped(game, target)
                inventory_is_conserved(current, expected_ids, target['id'])
                evidence.append(assert_ground(current, old, fire_staff['position']))
            passed('Repeated E swaps keep exactly one held weapon and preserve all original pickup IDs', evidence)

            stage('Swap to the crystal staff and preserve the earlier ground drop')
            inspect_at(game, ice_staff['position'])
            game.wait_for_function('nebeljagdTestState().nearWeapon === "iceStaff"')
            game.keyboard.press('e')
            current = equipped(game, ice_staff)
            inventory_is_conserved(current, expected_ids, ice_staff['id'])
            assert_ground(current, fire_staff, ice_staff['position'])
            assert_ground(current, sword, fire_staff['position'])
            assert current['world']['objects'] == edited['objects'], 'runtime drops must not rewrite the authored map'
            capture(game, 'both-earlier-weapons-on-ground')
            passed('The third pickup leaves both earlier weapons in the world with their original models and rarities')

            stage('Restart restores the exact authored placements')
            game.keyboard.press('Escape')
            game.locator('#restartBtn').click()
            game.wait_for_function('nebeljagdTestState().phase === "playing"')
            reset = state(game)
            assert reset['equippedItem'] is None
            assert len(reset['weaponDrops']) == len(expected_ids)
            assert {drop['id'] for drop in reset['weaponDrops']} == expected_ids
            assert all(not drop['collected'] for drop in reset['weaponDrops'])
            assert reset['world']['objects'] == edited['objects']
            for obj in edited['objects']:
                if obj['id'] not in expected_ids:
                    continue
                rolled = next(d['rarity'] for d in reset['weaponDrops'] if d['id']==obj['id'])
                assert rolled in ['common', 'uncommon', 'rare', 'epic', 'legendary']
                assert_ground(reset, {**obj, 'rarity': rolled}, obj['position'])
            passed('Restart returns every authored weapon to its original placement with no duplicate drops')
            assert not REPORT['errors'], REPORT['errors']
        except BaseException:
            try:
                if game is not None:
                    REPORT['failureState'] = state(game)
                capture(game or editor, 'failure')
            except Exception:
                pass
            raise
        finally:
            browser.close()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        with static_url() as url:
            run(url)
        assert hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest() == MAP_HASH
        REPORT['sourceMapUnchanged'] = MAP_HASH
        REPORT['status'] = 'passed'
    except BaseException as error:
        REPORT['status'] = 'failed'
        REPORT['failure'] = str(error)
        print('FAIL', REPORT.get('stage', 'setup'), REPORT['failure'], flush=True)
    finally:
        (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': REPORT['status'], 'checks': len(REPORT['checks']), 'errors': REPORT['errors']}, ensure_ascii=False), flush=True)
    return 0 if REPORT['status'] == 'passed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
