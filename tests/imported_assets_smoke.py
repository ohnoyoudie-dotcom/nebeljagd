"""Browser admission checks for the user-supplied Rei garden assets.

Run against a finished Vite preview using NEBELJAGD_URL (default port 4173).
The inspector only places the local player; walking and bow use actual inputs.
Loading-state observations, rendered bounds, palette and collision evidence are
kept separate from the source-file inspection in the asset documentation.
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


def passed(name, evidence):
    checks.append({'name': name, 'evidence': evidence})
    print('PASS:', name, flush=True)


def inspect(page, x, z, direction=0):
    page.evaluate('p => window.nebeljagdInspect(p)', {'x': x, 'z': z, 'elapsed': 0, 'health': 100, 'direction': direction})
    page.wait_for_function('window.nebeljagdTestState().elapsed > .04')


def wait_simulation(page, seconds):
    before = state(page)['elapsed']
    page.wait_for_function('t => window.nebeljagdTestState().elapsed >= t', arg=before + seconds)


def capture(page, filename):
    page.screenshot(path=str(OUT / filename)); images.append(filename)
    print('CAPTURE:', filename, flush=True)


def monitor(page):
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)


def start(page, path=''):
    monitor(page)
    page.goto(f'{URL}/{path}?inspect=1&quality=low', wait_until='domcontentloaded')
    page.wait_for_function('window.nebeljagdTestState && window.nebeljagdInspect && window.nebeljagdTestState().rendering.calls > 0')
    expect(page.locator('#startBtn')).to_be_enabled()
    expect(page.locator('#errorScreen')).to_be_hidden()
    page.locator('#startBtn').click()
    page.wait_for_function("window.nebeljagdTestState().phase === 'playing'")


report = {'status': 'running', 'checks': checks, 'javascript_or_shader_errors': errors, 'screenshots': images}
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
        page.set_default_timeout(90000)
        page.add_init_script('''
          window.__assetLoadingHistory = [];
          const observer = new MutationObserver(() => {
            const button = document.getElementById('startBtn');
            if (!button) return;
            const sample = {disabled: button.disabled, text: button.textContent.trim(),
              gameReady: typeof window.nebeljagdTestState === 'function'};
            const previous = window.__assetLoadingHistory.at(-1);
            if (!previous || JSON.stringify(previous) !== JSON.stringify(sample)) window.__assetLoadingHistory.push(sample);
          });
          observer.observe(document, {childList: true, subtree: true, attributes: true, characterData: true});
        ''')
        start(page)
        history = page.evaluate('window.__assetLoadingHistory')
        assert any(item['disabled'] for item in history), history
        assert history[-1]['disabled'] is False and history[-1]['gameReady'] is True, history
        assert not any(not item['disabled'] and not item['gameReady'] for item in history), history
        passed('Asynchronous world loading keeps Start disabled until assets and character are ready', history)

        world = state(page)['world']; imported = world['importedAssets']
        assert imported['loaded'] is True and imported['loadedGLBs'] == 5, imported
        assert (imported['trees'], imported['bushes'], imported['flowers'], imported['beds']) == (2, 2, 24, 2), imported
        assert world['treeCount'] == 34 and len(world['grassPatches']) == 12, world
        assert imported['grassSourceContainsBlades'] is False, imported
        assert len(imported['sources']) == 5
        palette = imported['materialPalette']
        assert all(palette[key].lower().lstrip('#') not in ['ffffff', 'fff'] for key in ['bark', 'foliage', 'foliageLight']), palette
        assert palette['flowersUseVertexColors'] is True, palette
        passed('Five supplied GLB exports are loaded with colored runtime surfaces; ground-only source is identified honestly', {
            'loadedGLBs': imported['loadedGLBs'], 'trees': imported['trees'], 'bushes': imported['bushes'],
            'flowers': imported['flowers'], 'beds': imported['beds'], 'palette': palette,
            'totalTrees': world['treeCount'], 'grassPatches': len(world['grassPatches']), 'sources': imported['sources']})

        placement_evidence = []
        for placement in imported['placements']:
            bounds = placement['bounds']; minimum, maximum = bounds['min'], bounds['max']
            assert all(math.isfinite(v) for edge in [minimum, maximum] for v in edge.values()), placement
            assert maximum['x'] > minimum['x'] and maximum['z'] > minimum['z'], placement
            if placement['kind'] == 'bed':
                assert abs(minimum['y'] - placement['groundY'] - .032) < .025, placement
                assert abs(maximum['y'] - minimum['y']) < .02, placement
            else:
                assert maximum['y'] > minimum['y'], placement
                offset = .043 if placement['kind'] == 'flower' else 0
                assert abs(minimum['y'] - placement['groundY'] - offset) < .03, placement
                assert abs((maximum['y'] - minimum['y']) - placement['height']) < .04, placement
            placement_evidence.append({'asset': placement['asset'], 'kind': placement['kind'], 'bounds': bounds, 'groundY': placement['groundY']})
        assert len(placement_evidence) == 30, len(placement_evidence)
        passed('All 30 actual scene placements have finite visible bounds and meet their ground surfaces', placement_evidence)

        inspect(page, -8, 8)
        capture(page, 'imports-village-current.png')
        inspect(page, -7.5, 11)
        capture(page, 'imports-spawn-flowers.png')
        inspect(page, -22.5, 10.5)
        capture(page, 'imports-garden-current.png')

        imported_trees = [tree for tree in world['trees'] if tree.get('imported') and tree.get('asset')]
        assert {tree['asset'] for tree in imported_trees} == {'tree01.glb', 'tree02.glb'}, imported_trees
        collision_trees = [body for body in world['projectileObstacles'] if body.get('imported') and body.get('type') == 'tree']
        assert len(collision_trees) == 2, collision_trees

        inspect(page, -4, 11)
        page.keyboard.press('e')
        page.wait_for_function("window.nebeljagdTestState().equippedWeapon === 'bow'")
        for tree in imported_trees:
            inspect(page, tree['x'], tree['z'] + 1.8, math.pi)
            actual_start = state(page)['position']
            assert math.hypot(actual_start['x'] - tree['x'], actual_start['z'] - tree['z'] - 1.8) < .12, (tree, actual_start)
            try:
                page.keyboard.down('w')
                wait_simulation(page, .6)
            finally:
                page.keyboard.up('w')
            page.wait_for_function('!window.nebeljagdTestState().moving')
            stopped = state(page)['position']
            distance = math.hypot(stopped['x'] - tree['x'], stopped['z'] - tree['z'])
            assert tree['radius'] + .39 <= distance <= tree['radius'] + .55, (tree, stopped, distance)
            passed(f"Visible imported trunk {tree['asset']} blocks actual walking at its collider boundary", {
                'tree': tree, 'stopped': stopped, 'distance': distance})

            inspect(page, tree['x'], tree['z'] + 1.8, math.pi)
            before = state(page)['combat']
            page.keyboard.press('f')
            page.wait_for_function('n => window.nebeljagdTestState().combat.impacts > n', arg=before['impacts'])
            impact = state(page)['combat']; point = impact['lastImpact']['point']
            assert impact['lastImpact']['type'] == 'tree', impact
            assert impact['shotsFired'] == before['shotsFired'] + 1, impact
            assert impact['arrowsActive'] > 0 and impact['arrowsFlying'] == 0, impact
            assert abs(math.hypot(point['x'] - tree['x'], point['z'] - tree['z']) - tree['radius'] - .055) < .12, (tree, impact)
            assert tree['minY'] <= point['y'] <= tree['maxY'], (tree, impact)
            passed(f"Arrow hits and bounces from imported trunk {tree['asset']}", impact)
            page.wait_for_function('window.nebeljagdTestState().attackCooldown === 0 && window.nebeljagdTestState().combat.arrowsActive === 0')
            # Side views keep the neighbouring cottage roof out of the subject.
            side = 3.4 if tree['asset'] == 'tree01.glb' else -3.4
            inspect(page, tree['x'] + side, tree['z'], math.pi)
            capture(page, f"imports-{tree['asset'].replace('.glb', '')}-current.png")
        report['rendering'] = state(page)['rendering']
        page.close()

        page = browser.new_page(viewport={'width': 960, 'height': 640}, device_scale_factor=1)
        page.set_default_timeout(90000)
        requests = []
        page.on('request', lambda request: requests.append(request.url) if request.url.startswith(('http:', 'https:')) else None)
        start(page, 'nebeljagd.html')
        embedded = state(page)['world']['importedAssets']
        assert len(requests) == 1, requests
        assert embedded['loadedGLBs'] == 5 and embedded['flowers'] == 24, embedded
        passed('Standalone HTML also loads all imported assets without additional HTTP requests', {'requests': requests, 'loadedGLBs': embedded['loadedGLBs']})
        page.close(); browser.close()
        assert not errors, errors
        report['status'] = 'passed'
except BaseException as error:
    report['status'] = 'interrupted' if isinstance(error, KeyboardInterrupt) else 'failed'
    report['failure'] = str(error)
    raise
finally:
    (OUT / 'imported-assets-smoke.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({'status': report['status'], 'checks': len(checks), 'javascript_or_shader_errors': errors,
                      'screenshots': images, 'failure': report.get('failure')}, ensure_ascii=False, indent=2), flush=True)
