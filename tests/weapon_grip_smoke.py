"""Check real staff grips through the generated editor and game.

Run after the final build: python3 tests/weapon_grip_smoke.py.
NEBELJAGD_GRIP_BASELINE=1 captures only the previous fire-staff idle/cast view,
without asserting the missing palm attachment. NEBELJAGD_GRIP_FILES can point
to preserved standalone files; NEBELJAGD_QA_OUT selects the result directory.
Final checks use real E/F/W controls, the normal pause button, and inspect-only
actor positioning/camera zoom. No map files, models or bones are changed here.
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
BASELINE = os.environ.get('NEBELJAGD_GRIP_BASELINE') == '1'
FILES = Path(os.environ.get('NEBELJAGD_GRIP_FILES', str(ROOT / 'welt')))
OUT = Path(os.environ.get('NEBELJAGD_QA_OUT', str(ROOT / 'test-results/weapon-grip/after')))
BASE = json.loads((FILES / 'worldmap.json').read_text())
SOURCE_HASH = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
STAVES = [('fireStaff', 'kit-tripo-lava-staff', [36, -54]),
          ('iceStaff', 'kit-tripo-crystal-staff', [44, -54])]
REPORT = {'status': 'running', 'baseline': BASELINE, 'checks': [], 'errors': [],
          'screenshots': [], 'documents': [], 'samples': [], 'views': [],
          'limits': 'Actual generated game/editor with software WebGL. Actor positioning and '
                    'zoom use explicit inspect hooks; editor controls, E/F/W and Pause remain '
                    'normal UI actions. Baseline captures do not assert corrected palm alignment.'}


def stage(name):
    REPORT['stage'] = name
    print('STAGE', name, flush=True)


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def monitor(page):
    def error(message):
        REPORT['errors'].append(message)
        print('BROWSER ERROR', message, flush=True)

    page.set_default_timeout(120000)
    page.on('pageerror', lambda value: error(str(value)))
    page.on('console', lambda message: error(message.text)
            if message.type == 'error' or re.search(
                r'GL_INVALID|INVALID_OPERATION|INVALID_VALUE|shader error', message.text, re.I) else None)
    page.on('response', lambda response: error(f'HTTP {response.status}: {urlsplit(response.url).path}')
            if response.status >= 400 else None)


@contextmanager
def static_url():
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

    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(FILES)))
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
    expected = json.loads((FILES / 'release.json').read_text())['files'][filename]
    assert size == expected['bytes'] and digest.hexdigest() == expected['sha256']
    REPORT['documents'].append({'name': filename, 'bytes': size, 'sha256': digest.hexdigest(),
                                'matchesPreservedOrDeliveredRelease': True})


def state(page):
    return page.evaluate('''()=>{
      const s=nebeljagdTestState();
      return {phase:s.phase,position:s.position,direction:s.direction,elapsed:s.elapsed,
        moving:s.moving,equippedItem:s.equippedItem,attackCooldown:s.attackCooldown,
        combat:s.combat,camera:s.camera,character:s.character,
        world:{source:s.world.source,objects:s.world.objects}};
    }''')


def grip_error(snapshot):
    if BASELINE:
        return None
    grip = snapshot['combat']['heldGrip']
    assert grip and grip['side'] == 'right' and grip['source'] == 'palm', grip
    for key in ['position', 'palm', 'wrist']:
        assert all(math.isfinite(grip[key][axis]) for axis in 'xyz'), grip
    error = math.dist([grip['position'][axis] for axis in 'xyz'], [grip['palm'][axis] for axis in 'xyz'])
    assert error <= .01, f'Staff grip is {error:.6f}m away from the palm: {grip}'
    assert math.isclose(error, grip['error'], abs_tol=1e-7), grip
    wrist_offset = math.dist([grip['wrist'][axis] for axis in 'xyz'], [grip['palm'][axis] for axis in 'xyz'])
    assert .02 < wrist_offset < .20, 'The palm socket must be distinct from the wrist joint'
    return error


def capture(page, name):
    snapshot = state(page)
    grip_error(snapshot)
    zoom = snapshot['camera'].get('zoom', 1)
    assert zoom == (4 if name.endswith('-close') else 1), (name, zoom)
    path = OUT / (name + '.png')
    page.locator('#pauseScreen').evaluate("element=>element.style.opacity='0'")
    page.screenshot(path=str(path))
    page.locator('#pauseScreen').evaluate("element=>element.style.removeProperty('opacity')")
    REPORT['screenshots'].append(str(path))
    REPORT['views'].append({'name': name, 'zoom': zoom, 'heldGrip': snapshot['combat'].get('heldGrip')})
    assert not REPORT['errors'], REPORT['errors']


def position(page, point, direction):
    page.evaluate('p=>nebeljagdInspect({x:p[0],z:p[1],direction:p[2],health:100,elapsed:0})',
                  [*point, direction])
    page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')


def freeze_idle(page):
    page.locator('#pauseBtn').click()
    page.wait_for_function('nebeljagdTestState().phase==="paused"')
    current = state(page)
    grip_error(current)
    return current


def arm_motion(page, mode):
    page.evaluate('''mode=>{
      const start=nebeljagdTestState();
      window.__gripCapture=null; window.__gripSamples=[]; window.__gripMode=mode;
      const sample=()=>{
        if(window.__gripMode!==mode) return;
        const s=nebeljagdTestState(), c=s.combat;
        if(s.phase==='playing') {
          window.__gripSamples.push({elapsed:s.elapsed,moving:s.moving,
            combat:{heldGrip:c.heldGrip,attackPhase:c.attackPhase,shotsFired:c.shotsFired}});
          const matched=mode==='walk' ? s.moving&&s.elapsed>=start.elapsed+.7
            : mode==='cast' ? c.attackPhase==='channel'
            : c.attackPhase==='idle'&&s.attackCooldown===0;
          if(matched) {
            window.__gripCapture={phase:s.phase,position:s.position,direction:s.direction,
              elapsed:s.elapsed,moving:s.moving,combat:structuredClone(c)};
            window.__gripMode=null; document.querySelector('#pauseBtn').click(); return;
          }
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }''', mode)


def collect_motion(page, label):
    page.wait_for_function('window.__gripCapture&&nebeljagdTestState().phase==="paused"')
    snapshots = page.evaluate('window.__gripSamples')
    errors = [grip_error(s) for s in snapshots]
    REPORT['samples'].append({'name': label, 'frames': snapshots, 'maximumPalmError':
                             max(errors) if not BASELINE and errors else None})
    return page.evaluate('window.__gripCapture')


def exercise_staff(page, obj):
    kind = obj['kind']
    name = 'fire' if kind == 'fireStaff' else 'ice'
    stage(f'Inspect {name} staff in the animated hand')
    position(page, obj['position'], math.pi / 4)
    page.wait_for_function('id=>nebeljagdTestState().equippedItem?.id===id||nebeljagdTestState().nearWeapon!==null', arg=obj['id'])
    if state(page)['equippedItem'] is None or state(page)['equippedItem']['id'] != obj['id']:
        page.keyboard.press('e')
    page.wait_for_function('id=>nebeljagdTestState().equippedItem?.id===id', arg=obj['id'])
    headings = [math.pi / 4] if BASELINE else [math.pi / 4 + i * math.pi / 2 for i in range(4)]
    idle = []
    for index, heading in enumerate(headings):
        position(page, obj['position'], heading)
        if not BASELINE:
            page.evaluate('nebeljagdInspectCamera({zoom:1})')
        snapshot = freeze_idle(page)
        if index == 0:
            capture(page, name + '-idle-normal')
        if not BASELINE:
            page.evaluate('nebeljagdInspectCamera({zoom:4})')
            capture(page, name + f'-idle-{index + 1}-close')
        idle.append(snapshot)
    passed(f'{name.title()} staff idle views' + (' captured before the correction' if BASELINE else ' attach to the right palm at four headings'), idle)

    if not BASELINE:
        page.keyboard.press('Escape')
        arm_motion(page, 'walk')
        page.keyboard.down('w')
        walking = collect_motion(page, name + '-walking')
        page.keyboard.up('w')
        assert walking['moving'] and len(REPORT['samples'][-1]['frames']) >= 3
        capture(page, name + '-walking-close')
        passed(f'{name.title()} staff follows the right palm through walking and turning', walking)

    position(page, obj['position'], math.pi / 4)
    if not BASELINE:
        page.evaluate('nebeljagdInspectCamera({zoom:4})')
    page.wait_for_function('nebeljagdTestState().attackCooldown===0')
    arm_motion(page, 'cast')
    page.keyboard.press('f')
    cast = collect_motion(page, name + '-cast-windup')
    capture(page, name + ('-cast-normal' if BASELINE else '-cast-close'))
    if not BASELINE:
        arm_motion(page, 'cast-end')
        page.keyboard.press('Escape')
        collect_motion(page, name + '-cast-through-release')
        phases = {s['combat']['attackPhase'] for s in REPORT['samples'][-1]['frames']}
        assert 'release' in phases and 'recover' in phases and 'idle' in phases, phases
        passed(f'{name.title()} staff stays in the palm through the real F cast and recovery', cast)
        page.keyboard.press('Escape')
        page.wait_for_function('''()=>{
          const c=nebeljagdTestState().combat,e=c.effects;
          return c.spellsActive===0&&e.activeParticles===0&&e.activeBursts===0&&(e.activeTrails??0)===0;
        }''')
    else:
        passed('Previous fire-staff cast captured without claiming corrected palm alignment', cast)


def run(url):
    REPORT['url'] = url
    REPORT['buildId'] = json.loads((FILES / 'release.json').read_text())['buildId']
    game = None
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=shutil.which('chromium'), headless=True,
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
                route.fulfill(status=302, headers={'location': urlunsplit((parsed.scheme, parsed.netloc,
                    parsed.path, urlencode(query, doseq=True), parsed.fragment))})
            else:
                route.continue_()

        context.route(re.compile('^' + re.escape(url + '/magebrawl.html') + r'\?'), inspect_navigation)
        editor = context.new_page()
        try:
            stage('Place real staves in the standalone editor without changing the source map')
            editor.goto(url + '/map-editor.html?v=grip-check', wait_until='domcontentloaded')
            editor.wait_for_function('window.nebeljagdMapTestState')
            record_document(url, 'map-editor.html')
            assert editor.evaluate('nebeljagdMapTestState().map') == BASE
            objects = []
            for kind, variant, point in STAVES[:1] if BASELINE else STAVES:
                editor.locator('#editor-tab-objects').click()
                editor.locator('#editor-tool-objects-place').click()
                editor.locator('#palette-kind').select_option(kind)
                editor.locator('#palette-variant').select_option(variant)
                editor.locator('#add-object-center').click()
                for field, value in [('feature-x', point[0]), ('feature-z', point[1]),
                                     ('object-rotation', 0), ('object-scale', 1)]:
                    editor.locator('#' + field).fill(str(value))
                editor.locator('#properties-form button[type=submit]').click()
                objects.append(editor.evaluate('nebeljagdMapTestState().map.objects.at(-1)'))
            draft = editor.evaluate('nebeljagdMapTestState().map')
            assert draft['objects'][:-len(objects)] == BASE['objects']
            assert {k:v for k,v in draft.items() if k!='objects'} == {k:v for k,v in BASE.items() if k!='objects'}
            passed('Real Tripo staves are placed in the editor while all original map data is preserved', objects)
            stage('Open the actual Spielen popup')
            with editor.expect_popup() as popup:
                editor.locator('#playtest-world').click()
            game = popup.value
            game.set_viewport_size({'width': 960, 'height': 640})
            game.bring_to_front()
            game.wait_for_function('window.nebeljagdInspect&&nebeljagdTestState().rendering.calls>0')
            expect(game.locator('#errorScreen')).to_be_hidden()
            record_document(url, 'magebrawl.html')
            assert parse_qs(urlsplit(game.url).query).get('v') == ['grip-check']
            current = state(game)
            assert current['world']['source'] == 'editor' and current['world']['objects'] == draft['objects']
            if not BASELINE:
                assert game.evaluate('typeof nebeljagdInspectCamera==="function"')
            passed('Spielen loads the exact draft and matching generated game', REPORT['editorPlayNavigation'])
            game.locator('#startBtn').click()
            for obj in objects:
                exercise_staff(game, obj)
            assert state(game)['world']['objects'] == draft['objects']
            assert editor.evaluate('nebeljagdMapTestState().map') == draft
            assert not REPORT['errors'], REPORT['errors']
        except BaseException:
            try:
                if game is not None:
                    REPORT['failureState'] = state(game)
                    game.screenshot(path=str(OUT/'failure.png'))
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
        assert hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest() == SOURCE_HASH
        REPORT['sourceMapUnchanged'] = SOURCE_HASH
        REPORT['status'] = 'captured' if BASELINE else 'passed'
    except BaseException as error:
        REPORT['status'] = 'failed'
        REPORT['failure'] = str(error)
        print('FAIL', REPORT.get('stage'), REPORT['failure'], flush=True)
    finally:
        (OUT/'report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':REPORT['status'],'checks':len(REPORT['checks']),'errors':REPORT['errors']}),flush=True)
    return 0 if REPORT['status'] in ['passed','captured'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
