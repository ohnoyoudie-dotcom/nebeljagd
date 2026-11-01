"""Render both elemental effects through the delivered editor's Spielen button.

Run after npm run build: python3 tests/spell_effects_smoke.py.
The source map stays untouched: a wall is imported into the browser draft and
two staves are placed with normal editor controls. Actual E/F input performs
combat; the existing inspect hook only positions the actor. A RAF observer uses
the normal pause button to freeze charge, launch, flight and impact screenshots.
"""
from __future__ import annotations

from contextlib import contextmanager
import copy
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
OUT = Path(os.environ.get('NEBELJAGD_QA_OUT', str(ROOT / 'test-results/spell-effects')))
BASE = json.loads((ROOT / 'worldmap.json').read_text())
MAP_HASH = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
STAVES = [('fireStaff', 'kit-tripo-lava-staff', [36, -54]),
          ('iceStaff', 'kit-tripo-crystal-staff', [44, -54])]
REPORT = {'status': 'running', 'checks': [], 'errors': [], 'screenshots': [], 'documents': [],
          'limits': 'Chromium software WebGL with the actual standalone editor/game files. '
                    'QA adds inspect and low-quality query switches and positions the actor; '
                    'F launches spells and the normal Pause button freezes screenshots. '
                    'No public-host or physical-device performance claim.'}


def stage(name):
    REPORT['stage'] = name
    print('STAGE', name, flush=True)


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def monitor(page):
    page.set_default_timeout(120000)
    page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
    page.on('console', lambda message: REPORT['errors'].append(message.text) if message.type == 'error' else None)
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

    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT / 'welt')))
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
    expected = json.loads((ROOT / 'welt/release.json').read_text())['files'][filename]
    assert size == expected['bytes'] and digest.hexdigest() == expected['sha256']
    assert digest.hexdigest() == hashlib.sha256((ROOT / 'welt' / filename).read_bytes()).hexdigest()
    REPORT['documents'].append({'name': filename, 'bytes': size, 'sha256': digest.hexdigest(),
                                'matchesDeliveredFileAndRelease': True})


def state(page):
    return page.evaluate('''() => {
      const s=nebeljagdTestState();
      return {phase:s.phase, position:s.position, equippedItem:s.equippedItem,
        attackCooldown:s.attackCooldown, combat:s.combat, weaponDrops:s.weaponDrops,
        rendering:s.rendering, world:{source:s.world.source, objects:s.world.objects}};
    }''')


def capture(page, name):
    path = OUT / (name + '.png')
    page.screenshot(path=str(path))
    REPORT['screenshots'].append(str(path))


def inspect_at(page, position, direction=math.pi):
    page.evaluate('p=>nebeljagdInspect({x:p[0],z:p[1],direction:p[2],health:100,elapsed:0})',
                  [*position, direction])
    page.wait_for_function('nebeljagdTestState().phase === "playing"')


def wait_settled(page):
    page.wait_for_function('''() => {
      const s=nebeljagdTestState(), e=s.combat.effects;
      return s.attackCooldown===0 && s.combat.spellsActive===0 &&
        e.activeParticles===0 && e.activeBursts===0 && !e.channelActive;
    }''')


def arm_capture(page, mode, before):
    page.evaluate('''({mode,before})=> {
      window.__spellCapture = null;
      window.__spellCaptureMode = mode;
      const sample=()=> {
        if(window.__spellCaptureMode!==mode) return;
        const s=nebeljagdTestState(), c=s.combat, e=c.effects;
        const flying=(c.spells||[]).filter(p=>p.mode==='flying'&&p.visible);
        const matches = mode==='charge' ? e.channelActive&&e.channelVisible&&c.shotsFired===before.shotsFired
          : mode==='launch' ? c.shotsFired===before.shotsFired+1&&e.bursts.some(b=>b.kind==='muzzle'&&b.visible)
          : mode==='flight' ? flying.some(p=>Math.hypot(p.position.x-s.position.x,p.position.z-s.position.z)>3.4)
          : c.impacts===before.impacts+1&&e.activeBursts>0;
        if(s.phase==='playing'&&matches) {
          window.__spellCapture={mode,combat:structuredClone(c),position:{...s.position}};
          window.__spellCaptureMode=null;
          document.querySelector('#pauseBtn').click();
        } else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }''', {'mode': mode, 'before': before})


def frozen_capture(page, name):
    page.wait_for_function('window.__spellCapture && nebeljagdTestState().phase === "paused"')
    frozen = page.evaluate('window.__spellCapture')
    page.locator('#pauseScreen').evaluate("element=>element.style.opacity='0'")
    capture(page, name)
    page.locator('#pauseScreen').evaluate("element=>element.style.removeProperty('opacity')")
    after = state(page)['combat']
    assert after['effects']['activeParticles'] == frozen['combat']['effects']['activeParticles'], 'Paused effects must not emit or expire particles'
    assert after['effects']['emitted'] == frozen['combat']['effects']['emitted'], 'Paused frames must not repeat launch/impact events'
    assert after['spells'] == frozen['combat']['spells'], 'Paused projectiles must stay at their captured positions'
    return frozen


def exercise_staff(page, obj):
    kind = obj['kind']
    name = 'fire' if kind == 'fireStaff' else 'ice'
    stage(f'Capture {name} charge, launch, flight and impact from a real F attack')
    inspect_at(page, obj['position'])
    page.wait_for_function('kind=>nebeljagdTestState().equippedItem?.type===kind || nebeljagdTestState().nearWeapon===kind', arg=kind)
    if state(page)['equippedItem'] is None or state(page)['equippedItem']['id'] != obj['id']:
        page.keyboard.press('e')
    page.wait_for_function('id=>nebeljagdTestState().equippedItem?.id===id', arg=obj['id'])
    wait_settled(page)
    before = state(page)['combat']
    arm_capture(page, 'charge', before)
    page.keyboard.press('f')
    frames = {'charge': frozen_capture(page, name + '-charge')}
    assert frames['charge']['combat']['effects']['channelActive']
    assert frames['charge']['combat']['shotsFired'] == before['shotsFired']

    for phase in ['launch', 'flight', 'impact']:
        arm_capture(page, phase, before)
        page.keyboard.press('Escape')
        frames[phase] = frozen_capture(page, name + '-' + phase)
    flight = frames['flight']['combat']
    assert flight['shotsFired'] == before['shotsFired'] + 1
    assert flight['spellsActive'] == 1 and flight['effects']['visibleParticles'] > 0, flight
    active = [p for p in flight['spells'] if p['mode'] == 'flying' and p['visible']]
    assert len(active) == 1 and active[0]['type'] == kind, active
    assert active[0]['position']['z'] > -62, 'The projectile must remain on the near side before impact'
    impact = frames['impact']['combat']
    assert impact['shotsFired'] == before['shotsFired'] + 1
    assert impact['impacts'] == before['impacts'] + 1
    assert impact['effects']['latestImpact']['type'] == kind, impact['effects']
    point = impact['lastImpact']['point']
    assert abs(point['z'] + 62) < .8 and 32 <= point['x'] <= 48, point
    assert any(b['kind'] == 'impact' and b['type'] == kind and b['visible'] for b in impact['effects']['bursts'])
    assert impact['effects']['visibleParticles'] > 0
    emitted = impact['effects']['emitted'][kind]
    assert emitted['launches'] == before['effects']['emitted'][kind]['launches'] + 1
    assert emitted['impacts'] == before['effects']['emitted'][kind]['impacts'] + 1
    for frame in frames.values():
        effects = frame['combat']['effects']
        assert effects['activeParticles'] <= effects['capacity']['particles']
        assert effects['activeBursts'] <= effects['capacity']['bursts']
    page.keyboard.press('Escape')
    wait_settled(page)
    final = state(page)['combat']
    assert final['effects']['activeParticles'] == 0 and final['effects']['activeBursts'] == 0
    assert final['spellsActive'] == 0 and final['shotsFired'] == before['shotsFired'] + 1
    passed(f'{name.title()} charge, muzzle flash, moving projectile/trail and wall impact render and expire', frames)


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

        context.route(re.compile('^' + re.escape(url + '/nebeljagd.html') + r'\?'), inspect_navigation)
        editor = context.new_page()
        try:
            stage('Create a browser-only wall fixture and place both staves with editor controls')
            response = editor.goto(url + '/map-editor.html?v=spell-check', wait_until='domcontentloaded')
            assert response.status == 200
            record_document(url, 'map-editor.html')
            editor.wait_for_function('typeof nebeljagdMapTestState === "function"')
            assert editor.evaluate('nebeljagdMapTestState().map') == BASE
            fixture = copy.deepcopy(BASE)
            fixture.setdefault('barriers', []).append({'id': 'qa-spell-wall', 'name': 'Zaubertest-Wand',
                'kind': 'wall', 'variant': 'kit-stone', 'points': [[32, -62], [48, -62]], 'scale': 1, 'gaps': []})
            editor.locator('#json-file-input').set_input_files({'name': 'spell-effects-qa.json',
                'mimeType': 'application/json', 'buffer': json.dumps(fixture).encode()})
            editor.wait_for_function('value=>JSON.stringify(nebeljagdMapTestState().map)===JSON.stringify(value)', arg=fixture)
            objects = []
            for kind, variant, position in STAVES:
                editor.locator('#editor-tab-objects').click()
                editor.locator('#editor-tool-objects-place').click()
                editor.locator('#palette-kind').select_option(kind)
                editor.locator('#palette-variant').select_option(variant)
                editor.locator('#palette-rarity').select_option('rare')
                editor.locator('#add-object-center').click()
                for field, value in [('feature-x', position[0]), ('feature-z', position[1]),
                                     ('object-rotation', 0), ('object-scale', 1)]:
                    editor.locator('#' + field).fill(str(value))
                editor.locator('#properties-form button[type=submit]').click()
                obj = editor.evaluate('nebeljagdMapTestState().map.objects.at(-1)')
                assert obj['kind'] == kind and obj['variant'] == variant
                objects.append(obj)
            edited = editor.evaluate('nebeljagdMapTestState().map')
            assert edited['objects'][:-2] == BASE['objects']
            assert edited['barriers'][:-1] == BASE.get('barriers', [])
            assert {k: v for k, v in edited.items() if k not in ['objects', 'barriers']} == {
                k: v for k, v in BASE.items() if k not in ['objects', 'barriers']}
            capture(editor, 'editor-spell-fixture')
            passed('The real editor creates both Tripo staves and preserves every user placement', objects)

            stage('Open the real Spielen popup with the exact editor draft')
            with editor.expect_popup() as popup:
                editor.locator('#playtest-world').click()
            game = popup.value
            game.set_viewport_size({'width': 960, 'height': 640})
            game.bring_to_front()
            game.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
            expect(game.locator('#errorScreen')).to_be_hidden()
            parsed = urlsplit(game.url)
            assert parsed.path == urlsplit(url).path + '/nebeljagd.html'
            assert parse_qs(parsed.query).get('v') == ['spell-check']
            assert parse_qs(urlsplit(REPORT['editorPlayNavigation']).query).get('mapSource') == ['editor']
            record_document(url, 'nebeljagd.html')
            initial = state(game)
            assert initial['world']['source'] == 'editor' and initial['world']['objects'] == edited['objects']
            assert 'effects' in initial['combat'] and 'spells' in initial['combat']
            passed('Spielen transfers the real draft and matching version to the generated game', REPORT['editorPlayNavigation'])
            game.locator('#startBtn').click()
            for obj in objects:
                exercise_staff(game, obj)

            stage('Restart while spell effects are active')
            before = state(game)['combat']
            arm_capture(game, 'launch', before)
            game.keyboard.press('f')
            frozen_capture(game, 'active-effects-before-reset')
            game.locator('#restartBtn').click()
            game.wait_for_function('nebeljagdTestState().phase === "playing"')
            reset = state(game)
            effects = reset['combat']['effects']
            assert reset['equippedItem'] is None and reset['combat']['spellsActive'] == 0
            assert effects['activeParticles'] == 0 and effects['activeBursts'] == 0 and not effects['channelActive'], effects
            assert reset['combat']['shotsFired'] == 0 and reset['combat']['impacts'] == 0
            assert all(value == 0 for counts in effects['emitted'].values() for value in counts.values())
            assert reset['world']['objects'] == edited['objects']
            assert all(not drop['collected'] for drop in reset['weaponDrops'])
            assert editor.evaluate('nebeljagdMapTestState().map') == edited
            passed('Restart clears live effects and preserves the authored editor draft', effects)
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
