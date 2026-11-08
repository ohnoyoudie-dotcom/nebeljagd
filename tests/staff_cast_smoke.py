"""Check braced casts, standing feet and straight flight from the staff tip.

Run after npm run build: python3 tests/staff_cast_smoke.py.
Four side-view F attacks cover both Tripo staves; two more compare the standing
cast with walking. Ten screenshots cover the two side views and standing/gait. The
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
OUT = Path(os.environ.get('NEBELJAGD_QA_OUT', str(ROOT / 'test-results/cast-stance')))
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
    rig = combat['rigPose']
    if rig['castWeight'] < .65:
        return
    assert hands['right']['z'] - hands['left']['z'] >= .10, 'The support hand must stay behind the casting hand'
    assert hands['right']['y'] - hands['left']['y'] >= .08, 'The support hand must remain lower than the casting hand'
    arm = rig['leftArm']
    assert arm['hand']['x'] - arm['shoulder']['x'] >= .08, 'The support hand should sit to the side of the torso'
    upper = [arm['shoulder'][axis] - arm['elbow'][axis] for axis in 'xyz']
    forearm = [arm['hand'][axis] - arm['elbow'][axis] for axis in 'xyz']
    length = math.sqrt(sum(value * value for value in upper) * sum(value * value for value in forearm))
    assert length > 1e-5
    cosine = max(-1, min(1, sum(a * b for a, b in zip(upper, forearm)) / length))
    angle = math.degrees(math.acos(cosine))
    assert 25 < angle < 155, f'The support elbow should be visibly bent, got {angle:.2f} degrees'


def check_stance(rig):
    assert rig['stanceWeight'] >= .95, rig
    feet = rig['feet']
    assert all(math.isfinite(feet[side][axis]) for side in ['left', 'right'] for axis in 'xyz'), feet
    width = abs(feet['left']['x'] - feet['right']['x'])
    stagger = abs(feet['left']['z'] - feet['right']['z'])
    assert width >= .20, f'Standing ankles should be separated, got {width:.4f}m'
    assert stagger >= .10, f'Standing ankles should be staggered, got {stagger:.4f}m'
    return {'width': width, 'stagger': stagger, 'feet': feet, 'hips': rig['hips']}


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
            heldGrip:c.heldGrip,staffTip:c.staffTip,lastSpellLaunch:c.lastSpellLaunch,rigPose:c.rigPose,
            spells:c.spells}};
          window.__staffCastSamples.push(structuredClone(sample));
          const mode=window.__staffMode;
          const hit=mode==='channel' ? c.attackPhase==='channel'&&c.rigPose.castWeight>=.65&&c.shotsFired===before
            : mode==='release' ? c.attackPhase==='release'&&c.shotsFired===before+1
            : mode==='recover' ? c.attackPhase==='recover'&&c.shotsFired===before+1
            : mode==='finished' ? c.attackPhase==='idle'&&s.attackCooldown===0&&c.spellsActive===0&&c.shotsFired===before+1
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
    tip_y = launch['tip']['y']
    assert math.isclose(launch['flightHeight'], tip_y, abs_tol=1e-6), 'Flight height must equal the actual launch height'
    heights = [spell['position']['y'] for spell in projectiles]
    assert all(math.isfinite(height) and abs(height - tip_y) < 1e-6 for height in heights), 'Projectile must never dip from the launch plane'
    peaks = [c for c in fired if c['rigPose']['castWeight'] >= .65]
    assert peaks, 'Observe the actual braced release pose'
    for combat in peaks:
        check_hands(combat)
    return {'launch': launch, 'sampledHeights': heights,
            'maximumHeightDrift': max(abs(height - tip_y) for height in heights),
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
    support.passed(f'{obj["kind"]} {label}: bent support arm and level flight from the staff tip', evidence)
    page.keyboard.press('Escape')
    wait_settled(page)


def exercise_stance_and_gait(page):
    support.stage('Compare standing feet with natural gait while casting')
    support.position(page, CAST_POSITION, 0)
    page.evaluate('nebeljagdInspectCamera({zoom:4})')
    wait_settled(page)
    idle = support.state(page)['combat']['rigPose']
    assert idle['stanceWeight'] == 0, 'The wider stance should only blend in during a standing cast'
    page.evaluate('''()=>{
      window.__standingCapture=null;
      const observe=()=>{
        const s=nebeljagdTestState();
        if(s.phase==='playing'&&s.combat.rigPose.stanceWeight>=.95) {
          window.__standingCapture=structuredClone(s.combat.rigPose);
          document.querySelector('#pauseBtn').click();return;
        }
        requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    }''')
    page.keyboard.press('f')
    page.wait_for_function('window.__standingCapture&&nebeljagdTestState().phase==="paused"')
    standing = support.state(page)
    standing_measurement = check_stance(standing['combat']['rigPose'])
    idle_width = abs(idle['feet']['left']['x'] - idle['feet']['right']['x'])
    assert standing_measurement['width'] - idle_width >= .07, 'Standing casts should visibly widen the idle stance'
    support.capture(page, 'feet-standing-front-close')
    page.keyboard.press('Escape')
    wait_settled(page)
    page.evaluate('''()=>{
      window.__gaitSamples=[];window.__gaitCapture=null;window.__gaitStart=null;window.__gaitObserve=true;
      const observe=()=>{
        if(!window.__gaitObserve) return;
        const s=nebeljagdTestState(),c=s.combat;
        if(s.phase==='playing'&&s.moving) {
          if(window.__gaitStart===null) window.__gaitStart=s.elapsed;
          const sample={elapsed:s.elapsed,moving:s.moving,combat:{attackPhase:c.attackPhase,
            hands:c.hands,heldGrip:c.heldGrip,rigPose:c.rigPose}};
          window.__gaitSamples.push(structuredClone(sample));
          if(c.rigPose.castWeight>=.65&&c.rigPose.stanceWeight<.15) {
            window.__gaitCapture=structuredClone(sample);window.__gaitObserve=false;
            document.querySelector('#pauseBtn').click();return;
          }
        }
        requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    }''')
    page.keyboard.down('w')
    page.wait_for_function('''()=>{
      const s=nebeljagdTestState();
      return window.__gaitStart!==null&&s.elapsed>=window.__gaitStart+.75&&
        s.moving&&s.combat.rigPose.stanceWeight<.15;
    }''')
    page.keyboard.press('f')
    page.wait_for_function('window.__gaitCapture&&nebeljagdTestState().phase==="paused"')
    page.keyboard.up('w')
    moving = page.evaluate('window.__gaitCapture')
    samples = page.evaluate('window.__gaitSamples')
    check_hands(moving['combat'])
    support.capture(page, 'feet-walking-cast-close')
    natural = [sample['combat']['rigPose'] for sample in samples if sample['combat']['rigPose']['stanceWeight'] < .15]
    assert len(natural) >= 4, 'Observe several unconstrained gait frames'
    stride = [rig['feet']['left']['z'] - rig['feet']['right']['z'] for rig in natural]
    assert max(stride) - min(stride) > .12, 'The feet must move through the natural gait, not remain fixed in the standing stance'
    page.keyboard.press('Escape')
    wait_settled(page)
    page.wait_for_function('nebeljagdTestState().combat.rigPose.stanceWeight===0&&!nebeljagdTestState().moving')
    restored = support.state(page)['combat']['rigPose']
    assert restored['castWeight'] == 0, 'Recovering must restore the authored idle pose'
    evidence = {'idleBefore': idle, 'standing': standing_measurement, 'walkingCast': moving, 'gaitSamples': samples,
                'signedStrideRange': [min(stride), max(stride)], 'idleAfter': restored}
    REPORT['gait'] = evidence
    support.passed('Standing feet are wider and staggered; casting while walking preserves the natural gait', evidence)


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

        context.route(re.compile('^' + re.escape(url + '/magebrawl.html') + r'\?'), inspect_navigation)
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
            support.record_document(url, 'magebrawl.html')
            assert parse_qs(urlsplit(game.url).query).get('v') == ['staff-cast-check']
            current = support.state(game)
            assert current['world']['source'] == 'editor' and current['world']['objects'] == draft['objects']
            support.passed('Spielen opens the exact generated game and editor draft', REPORT['editorPlayNavigation'])
            game.locator('#startBtn').click()
            for index, obj in enumerate(objects):
                support.position(game, obj['position'], math.pi / 2)
                game.wait_for_function('id=>nebeljagdTestState().equippedItem?.id===id||nebeljagdTestState().nearWeapon!==null', arg=obj['id'])
                if support.state(game)['equippedItem'] is None or support.state(game)['equippedItem']['id'] != obj['id']:
                    game.keyboard.press('e')
                game.wait_for_function('id=>nebeljagdTestState().equippedItem?.id===id', arg=obj['id'])
                cast_from_side(game, obj, math.pi / 2, 'east', True)
                cast_from_side(game, obj, -math.pi / 2, 'west', False)
                if index == 0:
                    exercise_stance_and_gait(game)
            assert support.state(game)['world']['objects'] == draft['objects']
            game.close()
            editor.bring_to_front()
            expect(editor.locator('#playtest-world')).to_be_visible()
            assert editor.evaluate('nebeljagdMapTestState().map') == draft
            support.passed('Returning from the game preserves the open standalone editor and its exact draft')
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
