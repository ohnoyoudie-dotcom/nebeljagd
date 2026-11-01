"""Check one-handed casts and the real projectile start in side views.

Run after npm run build: python3 tests/staff_cast_smoke.py.
Four real F attacks cover both Tripo staves and opposite side views. Eight
screenshots cover channel/release/recovery plus the opposite release. The
shared grip-smoke helpers only serve files, inspect state, and take screenshots;
this script runs its own bounded editor/game journey and never rewrites a map.
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
import re
import shutil
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from playwright.sync_api import expect, sync_playwright
import weapon_grip_smoke as support


ROOT = support.ROOT
OUT = Path(os.environ.get('NEBELJAGD_QA_OUT', str(ROOT / 'test-results/staff-cast')))
BASE = support.BASE
SOURCE_HASH = support.SOURCE_HASH
STAVES = support.STAVES
CAST_POSITION = [36, -62]
REPORT = {'status': 'running', 'checks': [], 'errors': [], 'screenshots': [],
          'documents': [], 'samples': [], 'views': [],
          'limits': 'Actual standalone editor/game with software WebGL. Explicit inspect '
                    'hooks position the actor and set zoom4; E/F/Pause remain normal UI '
                    'actions. Physical-device performance and finger articulation are not measured.'}
support.OUT = OUT
support.REPORT = REPORT
support.BASELINE = False


def point_distance(a, b):
    return math.dist([a[axis] for axis in 'xyz'], [b[axis] for axis in 'xyz'])


def check_hands(combat):
    support.grip_error({'combat': combat})
    hands = combat['hands']
    assert all(math.isfinite(hands[side][axis]) for side in ['left', 'right'] for axis in 'xyz'), hands
    assert hands['right']['z'] - hands['left']['z'] >= .10, 'The free hand must stay behind the casting hand'
    assert hands['right']['y'] - hands['left']['y'] >= .08, 'The free hand must remain lower, nearer the body'


def wait_settled(page):
    page.wait_for_function('''()=>{
      const s=nebeljagdTestState(),c=s.combat,e=c.effects;
      return s.attackCooldown===0&&c.spellsActive===0&&e.activeParticles===0&&
        e.activeBursts===0&&(e.activeTrails??0)===0;
    }''')


def start_observer(page):
    page.evaluate('''()=>{
      const before=nebeljagdTestState().combat.shotsFired;
      window.__staffCastSamples=[]; window.__staffCapture=null;
      window.__staffCastBefore=before; window.__staffMode='channel';
      window.__staffObserving=true;
      const observe=()=>{
        if(!window.__staffObserving) return;
        const s=nebeljagdTestState(),c=s.combat;
        if(s.phase==='playing') {
          const sample={elapsed:s.elapsed,position:{...s.position},combat:{
            attackPhase:c.attackPhase,shotsFired:c.shotsFired,hands:c.hands,
            heldGrip:c.heldGrip,staffTip:c.staffTip,lastSpellLaunch:c.lastSpellLaunch,
            spells:c.spells}};
          window.__staffCastSamples.push(structuredClone(sample));
          const mode=window.__staffMode;
          const hit=mode==='channel' ? c.attackPhase==='channel'&&c.shotsFired===before
            : mode==='release' ? c.attackPhase==='release'&&c.shotsFired===before+1
            : mode==='recover' ? c.attackPhase==='recover'&&c.shotsFired===before+1
            : mode==='finished' ? c.attackPhase==='idle'&&s.attackCooldown===0&&c.shotsFired===before+1
            : false;
          if(hit) {
            window.__staffCapture=structuredClone(sample); window.__staffMode=null;
            document.querySelector('#pauseBtn').click();
          }
        }
        requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    }''')


def freeze_phase(page, phase, name, screenshot):
    if phase != 'channel':
        page.evaluate('mode=>{window.__staffCapture=null;window.__staffMode=mode;}', phase)
        page.keyboard.press('Escape')
    page.wait_for_function('window.__staffCapture&&nebeljagdTestState().phase==="paused"')
    snapshot = page.evaluate('window.__staffCapture')
    check_hands(snapshot['combat'])
    if screenshot:
        support.capture(page, name + '-' + phase + '-close')
    return snapshot


def check_trajectory(samples, kind, before):
    fired = [sample['combat'] for sample in samples if sample['combat']['shotsFired'] == before + 1]
    assert fired
    launch = fired[0]['lastSpellLaunch']
    assert launch and launch['type'] == kind, launch
    assert all(math.isfinite(launch[key][axis]) for key in ['tip', 'position'] for axis in 'xyz'), launch
    assert point_distance(launch['tip'], launch['position']) < 1e-6, 'Projectile must start at the actual staff tip'
    assert math.isfinite(launch['flightHeight'])
    projectiles = [spell for combat in fired for spell in combat['spells'] if spell['type'] == kind and spell['mode'] == 'flying']
    assert len(projectiles) >= 2, 'Capture at least two actual flight frames'
    tip_y, plane_y = launch['tip']['y'], launch['flightHeight']
    span = abs(tip_y - plane_y)
    assert span > .02, 'The side-view fixture must exercise the former launch-height mismatch'
    heights = [spell['position']['y'] for spell in projectiles]
    assert min(tip_y, plane_y) - 1e-6 <= min(heights)
    assert max(heights) <= max(tip_y, plane_y) + 1e-6
    assert abs(heights[0] - plane_y) > .001, 'The first flight frame must not snap immediately to the old flight plane'
    distances = [span, *[abs(height - plane_y) for height in heights]]
    assert all(later <= earlier + 1e-6 for earlier, later in zip(distances, distances[1:])), distances
    assert distances[-1] < 1e-6, 'The projectile must settle onto the unchanged flight plane'
    return {'launch': launch, 'sampledHeights': heights,
            'maximumPalmError': max(c['heldGrip']['error'] for c in fired)}


def cast_from_side(page, obj, heading, label, detailed):
    support.stage(f'{obj["kind"]}: one-handed cast from {label}')
    support.position(page, CAST_POSITION, heading)
    page.evaluate('nebeljagdInspectCamera({zoom:4})')
    wait_settled(page)
    before = support.state(page)['combat']['shotsFired']
    start_observer(page)
    page.keyboard.press('f')
    snapshots = {}
    for phase in ['channel', 'release', 'recover']:
        snapshots[phase] = freeze_phase(page, phase, obj['kind'] + '-' + label,
                                        detailed or phase == 'release')
    freeze_phase(page, 'finished', obj['kind'] + '-' + label, False)
    samples = page.evaluate('()=>{window.__staffObserving=false;return window.__staffCastSamples;}')
    for sample in samples:
        if sample['combat']['attackPhase'] != 'idle':
            check_hands(sample['combat'])
    evidence = check_trajectory(samples, obj['kind'], before)
    evidence['phases'] = snapshots
    REPORT['samples'].append({'weapon': obj['kind'], 'side': label, 'frames': samples})
    support.passed(f'{obj["kind"]} {label}: free arm rests and projectile starts at the staff tip', evidence)
    page.keyboard.press('Escape')
    wait_settled(page)


def run(url):
    REPORT['url'] = url
    REPORT['buildId'] = json.loads((support.FILES / 'release.json').read_text())['buildId']
    game = None
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=shutil.which('chromium'), headless=True,
            args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1200, 'height': 800})
        context.on('page', support.monitor)
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

        context.route(re.compile('^' + re.escape(url + '/nebeljagd.html') + r'\?'), inspect_navigation)
        editor = context.new_page()
        try:
            support.stage('Place both actual staves in the delivered editor')
            editor.goto(url + '/map-editor.html?v=staff-cast-check', wait_until='domcontentloaded')
            editor.wait_for_function('window.nebeljagdMapTestState')
            support.record_document(url, 'map-editor.html')
            assert editor.evaluate('nebeljagdMapTestState().map') == BASE
            objects = []
            for kind, variant, point in STAVES:
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
            assert draft['objects'][:-2] == BASE['objects']
            assert {k:v for k,v in draft.items() if k!='objects'} == {k:v for k,v in BASE.items() if k!='objects'}
            support.passed('Both real staves placed without changing any original map content', objects)
            with editor.expect_popup() as popup:
                editor.locator('#playtest-world').click()
            game = popup.value
            game.set_viewport_size({'width': 960, 'height': 640})
            game.bring_to_front()
            game.wait_for_function('window.nebeljagdInspectCamera&&nebeljagdTestState().rendering.calls>0')
            expect(game.locator('#errorScreen')).to_be_hidden()
            support.record_document(url, 'nebeljagd.html')
            assert parse_qs(urlsplit(game.url).query).get('v') == ['staff-cast-check']
            current = support.state(game)
            assert current['world']['source'] == 'editor' and current['world']['objects'] == draft['objects']
            support.passed('Spielen opens the exact generated game and editor draft', REPORT['editorPlayNavigation'])
            game.locator('#startBtn').click()
            for obj in objects:
                support.position(game, obj['position'], math.pi / 2)
                game.wait_for_function('id=>nebeljagdTestState().equippedItem?.id===id||nebeljagdTestState().nearWeapon!==null', arg=obj['id'])
                if support.state(game)['equippedItem'] is None or support.state(game)['equippedItem']['id'] != obj['id']:
                    game.keyboard.press('e')
                game.wait_for_function('id=>nebeljagdTestState().equippedItem?.id===id', arg=obj['id'])
                cast_from_side(game, obj, math.pi / 2, 'east', True)
                cast_from_side(game, obj, -math.pi / 2, 'west', False)
            assert support.state(game)['world']['objects'] == draft['objects']
            assert editor.evaluate('nebeljagdMapTestState().map') == draft
            assert not REPORT['errors'], REPORT['errors']
        except BaseException:
            try:
                if game is not None:
                    REPORT['failureState'] = support.state(game)
                    game.screenshot(path=str(OUT/'failure.png'))
            except Exception:
                pass
            raise
        finally:
            browser.close()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        with support.static_url() as url:
            run(url)
        import hashlib
        assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest() == SOURCE_HASH
        REPORT['sourceMapUnchanged'] = SOURCE_HASH
        REPORT['status'] = 'passed'
    except BaseException as error:
        REPORT['status'] = 'failed'
        REPORT['failure'] = str(error)
        print('FAIL', REPORT.get('stage'), REPORT['failure'], flush=True)
    finally:
        (OUT/'report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':REPORT['status'],'checks':len(REPORT['checks']),'errors':REPORT['errors']}),flush=True)
    return 0 if REPORT['status'] == 'passed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
