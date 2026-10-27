"""Integration checks for the generated island and editable prop document.

Run after npm run build, with npm run preview on 4173. --world-only and
--editor-only allow an affected stage to be retested without repeating the
other stage. All mutations use actual controls/imports; the public inspection
helper is only used to position a local test player and set the round clock.
"""
import argparse
import json
import math
import os
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'
DOCS = ROOT / 'docs'
SHOTS = DOCS / 'screenshots'
for folder in [OUT, SHOTS]:
    folder.mkdir(exist_ok=True)
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4173').rstrip('/')
SOURCE = json.loads((ROOT / 'worldmap.json').read_text())
parser = argparse.ArgumentParser()
parser.add_argument('--world-only', action='store_true')
parser.add_argument('--editor-only', action='store_true')
parser.add_argument('--resume', action='store_true')
args = parser.parse_args()
checks, errors, screenshots = [], [], []
if (args.editor_only or args.resume) and (OUT / 'generated-world-smoke.json').exists():
    old = json.loads((OUT / 'generated-world-smoke.json').read_text())
    checks = [item for item in old.get('checks', []) if item.get('stage') == 'world']
    if args.resume:
        checks = checks[:6]
    screenshots = old.get('screenshots', [])


def passed(name, evidence, stage='world'):
    checks.append({'stage': stage, 'name': name, 'evidence': evidence})
    print('PASS:', name, flush=True)


def monitor(page):
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)


def state(page, full=False):
    if full:
        return page.evaluate('window.nebeljagdTestState()')
    return page.evaluate('''() => {
      const s = window.nebeljagdTestState();
      delete s.world.objects; delete s.world.trees; delete s.world.grassPatches;
      delete s.world.projectileObstacles; delete s.world.importedAssets;
      return s;
    }''')


def ready(page, path='/?inspect=1&quality=low'):
    monitor(page)
    page.goto(URL + path, wait_until='domcontentloaded')
    page.wait_for_function('window.nebeljagdTestState && window.nebeljagdInspect && window.nebeljagdTestState().rendering.calls > 0')
    expect(page.locator('#startBtn')).to_be_enabled()
    expect(page.locator('#errorScreen')).to_be_hidden()
    page.locator('#startBtn').click()
    page.wait_for_function("window.nebeljagdTestState().phase === 'playing'")


def inspect(page, x, z, elapsed=0, health=100, direction=0):
    page.evaluate('p => window.nebeljagdInspect(p)', {'x': x, 'z': z, 'elapsed': elapsed,
                  'health': health, 'direction': direction})
    page.wait_for_function('t => window.nebeljagdTestState().elapsed > t + .02', arg=elapsed)


def wait_sim(page, seconds):
    before = page.evaluate('window.nebeljagdTestState().elapsed')
    page.wait_for_function('t => window.nebeljagdTestState().elapsed >= t', arg=before + seconds)


def walk(page, keys, seconds):
    try:
        for key in keys:
            page.keyboard.down(key)
        wait_sim(page, seconds)
    finally:
        for key in keys:
            page.keyboard.up(key)
    page.wait_for_function('!window.nebeljagdTestState().moving')


def capture(page, name):
    path = SHOTS / f'generated-world-{name}.png'
    page.screenshot(path=str(path))
    relative = str(path.relative_to(ROOT))
    if relative not in screenshots:
        screenshots.append(relative)


def world_checks(browser):
    page = browser.new_page(viewport={'width': 960, 'height': 640}, device_scale_factor=1)
    page.set_default_timeout(120000)
    ready(page)
    if not args.resume:
        full = state(page, True)
        world = full['world']
        stats = world['stats']
        assert world['objects'] == SOURCE['objects']
        assert world['bounds'] == SOURCE['bounds']
        assert stats['totalObjects'] == len(SOURCE['objects']) == 4030
        assert stats['treeCount'] == 2601 and stats['houseCount'] == 31
        assert stats['grassPatchCount'] == 741 and stats['loadedGLBs'] == 6
        crates = [item for item in world['destructibles'] if item['kind'] == 'crate']
        furniture = [item for item in world['destructibles'] if item['kind'] == 'furniture']
        assert len(crates) == 10 and len(furniture) == stats['houseCount']
        assert all(item['maxHealth'] > 0 for item in world['destructibles'])
        assert world['importedAssets']['trees'] == 2 and world['importedAssets']['flowers'] > 1000
        assert 0 < stats['visibleTerrainChunks'] < stats['terrainChunks'] / 3
        assert full['position']['x'] == 30 and full['position']['z'] == -42
        passed('The actual island uses all 4030 persisted props and culls distant terrain sections', stats)
        passed('Ten distributed map-placed Holzkisten are registered as destructible solid objects',
               {'crates': len(crates), 'breakableDiningTables': len(furniture), 'health': crates[0]['maxHealth']})
        capture(page, 'auenwacht')

        inspect(page, 30, -42)
        before = state(page)['position']
        walk(page, ['s'], .55)
        after = state(page)['position']
        assert after['z'] - before['z'] > 2.5, (before, after)
        page.keyboard.press('Space')
        page.wait_for_function('window.nebeljagdTestState().rollCooldown > 2')
        wait_sim(page, .55)
        rolled = state(page)
        assert rolled['position']['z'] - after['z'] > 3.3
        assert 0 < rolled['rollCooldown'] < 2.5
        passed('WASD movement and the space roll work at the map-derived spawn', {
            'walkStart': before, 'walkEnd': after, 'rolled': rolled['position']})

        inspect(page, 38, -42, health=60)
        page.wait_for_function('window.nebeljagdTestState().health > 60')
        assert state(page)['health'] == 85
        inspect(page, 34, -39)
        page.keyboard.press('e')
        page.wait_for_function("window.nebeljagdTestState().equippedWeapon === 'bow'")
        tree = next(t for t in world['trees'] if t.get('id') == 'obj-tree-2451')
        inspect(page, tree['x'], tree['z'] + 2, direction=math.pi)
        before_impact = state(page)['combat']['impacts']
        page.keyboard.press('f')
        page.wait_for_function('n => window.nebeljagdTestState().combat.impacts > n', arg=before_impact)
        impact = state(page)['combat']
        assert impact['lastImpact']['type'] == 'tree', impact
        point = impact['lastImpact']['point']
        assert abs(math.hypot(point['x'] - tree['x'], point['z'] - tree['z']) - tree['radius'] - .055) < .15
        passed('Persisted hearts heal and the persisted bow fires an arrow into the visible tree collider', {
            'healedTo': 85, 'treeId': tree['id'], 'impact': impact['lastImpact']})

        inspect(page, 26, -39)
        page.keyboard.press('e')
        page.wait_for_function("window.nebeljagdTestState().equippedWeapon === 'sword'")
        inspect(page, 7, -39, direction=-math.pi / 2)
        for hit_index in range(3):
            previous_health = next(item for item in state(page)['world']['destructibles'] if item['id'] == 'obj-crate-auenwacht-01')['health']
            page.keyboard.press('f')
            page.wait_for_function('h => window.nebeljagdTestState().world.destructibles.find(o => o.id === "obj-crate-auenwacht-01").health < h', arg=previous_health)
            if hit_index < 2:
                page.wait_for_function('window.nebeljagdTestState().attackCooldown < .02')
        crate = next(item for item in state(page)['world']['destructibles'] if item['id'] == 'obj-crate-auenwacht-01')
        assert crate['destroyed'] and crate['health'] == 0, crate
        crate_bodies = [body for body in state(page, True)['world']['projectileObstacles'] if body.get('objectId') == crate['id']]
        assert crate_bodies and all(body['destroyed'] for body in crate_bodies), crate_bodies
        inspect(page, 6, -39)
        freed = state(page)['position']
        assert freed['x'] == 6 and freed['z'] == -39, freed
        passed('Three sword hits destroy a map-placed wooden crate and free its collision and sight blocker',
               {'crate': crate, 'clearedPosition': freed})

        inspect(page, 30, -56.72)
        table_stop = state(page)['position']
        assert math.hypot(table_stop['x'] - 30, table_stop['z'] + 56.72) > .7, table_stop
        passed('Solid house furniture pushes the player out of the dining-table footprint', table_stop)
        page.wait_for_function('window.nebeljagdTestState().attackCooldown < .02')
        inspect(page, 30, -54.7, direction=math.pi)
        table_id = 'obj-house-auenwacht-01-furniture-dining-table'
        for hit_index in range(3):
            previous_health = next(item for item in state(page)['world']['destructibles'] if item['id'] == table_id)['health']
            page.keyboard.press('f')
            page.wait_for_function('args => window.nebeljagdTestState().world.destructibles.find(o => o.id === args[0]).health < args[1]', arg=[table_id, previous_health])
            if hit_index < 2:
                page.wait_for_function('window.nebeljagdTestState().attackCooldown < .02')
        table = next(item for item in state(page)['world']['destructibles'] if item['id'] == table_id)
        assert table['destroyed'] and table['health'] == 0, table
        furniture_bodies = [body for body in state(page, True)['world']['projectileObstacles'] if body.get('destructibleId') == table_id]
        assert furniture_bodies and all(body['destroyed'] for body in furniture_bodies), furniture_bodies
        inspect(page, 30, -56.72)
        table_freed = state(page)['position']
        assert table_freed['x'] == 30 and table_freed['z'] == -56.72, table_freed
        passed('Three sword hits break the house dining table and remove its collision and sight blockers',
               {'table': table, 'freedBodies': len(furniture_bodies), 'freedPosition': table_freed})

        # A seeded half-turn house uses a reversed entrance. Walk in through its
        # actual door, then repeat beside that door to verify the wall remains solid.
        house = next(o for o in SOURCE['objects'] if o['id'] == 'obj-house-auenwacht-03')
        x, z = house['position']
        inspect(page, x, z - 8.7)
        walk(page, ['s'], .7)
        entered = state(page)
        assert entered['shelter'] == house['name'], entered['shelter']
        assert entered['position']['z'] > z - 6
        assert next(h for h in entered['houses'] if h['name'] == house['name'])['roofVisible'] is False
        capture(page, 'interior')
        inspect(page, x - 4, z - 8.7)
        walk(page, ['s'], .7)
        stopped = state(page)['position']
        assert stopped['z'] < z - 7.35, stopped
        assert state(page)['shelter'] is None
        passed('A rotated house has a usable entrance, an elevated floor, roof cutaway and solid neighbouring wall', {
            'object': house, 'inside': entered['position'], 'wallStop': stopped})

        inspect(page, 10, -30)
        page.wait_for_function('window.nebeljagdTestState().hiddenInGrass && window.nebeljagdTestState().character.opacity < .5')
        hidden = state(page)
        assert hidden['hiddenFromOtherPlayers'] is True
        assert .44 <= hidden['character']['opacity'] <= .5
        capture(page, 'grass')
        inspect(page, 30, -42)
        page.wait_for_function('!window.nebeljagdTestState().hiddenInGrass && window.nebeljagdTestState().character.opacity > .98')
        passed('Persisted tall grass conceals the traveller and restores normal opacity after leaving', {
            'grassObjectId': 'obj-grass-start', 'opacity': hidden['character']['opacity']})

        biome_positions = [
            ('snow', -285, -400), ('heath', 300, -310), ('meadow', 30, -42),
            ('forest', -385, 70), ('marsh', -310, 425), ('volcanic', 360, 130), ('dunes', 140, 580),
        ]
        biome_evidence = []
        for biome, bx, bz in biome_positions:
            inspect(page, bx, bz)
            now = state(page)
            assert all(math.isfinite(now['position'][axis]) for axis in ['x', 'y', 'z'])
            assert math.hypot(now['position']['x'] - bx, now['position']['z'] - bz) < 15
            assert now['rendering']['calls'] > 0
            if 'biome' in now['world']:
                assert now['world']['biome'] == biome
            if biome in ['snow', 'volcanic']:
                assert now['position']['y'] > 5
                capture(page, biome)
            biome_evidence.append({'biome': biome, 'position': now['position'],
                                   'visibleChunks': now['world']['stats']['visibleTerrainChunks']})
        passed('All seven mapped landscapes render at their actual world coordinates, including elevated terrain', biome_evidence)

    # River bank at a simple upstream segment, far from a bridge. Walking west
    # towards the water must stop on the eastern bank.
    inspect(page, -73, -450)
    bank_start = state(page)['position']
    walk(page, ['a'], 1.3)
    bank_end = state(page)['position']
    # At z=-450 the river centre is roughly -83.21; start outsidebank.
    a, b = SOURCE['rivers'][0]['points'][:2]
    dx, dz = b[0] - a[0], b[1] - a[1]
    t = ((bank_end['x'] - a[0]) * dx + (bank_end['z'] - a[1]) * dz) / (dx * dx + dz * dz)
    bank_distance = math.hypot(bank_end['x'] - a[0] - t * dx, bank_end['z'] - a[1] - t * dz)
    assert bank_start['x'] > -74 and abs(bank_distance - SOURCE['rivers'][0]['width'] / 2 - .42) < .08, (bank_start, bank_end, bank_distance)
    # A bridge along the western route is nearly horizontal. Start at its
    # east end, press west and cross the river through the shared deck.
    inspect(page, -82, -17)
    bridge_before = state(page)['position']
    walk(page, ['a'], 6.2)
    bridge_after = state(page)['position']
    assert bridge_before['x'] > -84 and bridge_after['x'] < -109, (bridge_before, bridge_after)
    # Coastline closest to the eastern tip; stepping east cannot enter sea.
    inspect(page, 526, -155)
    walk(page, ['d'], 1)
    shore = state(page)['position']
    assert shore['x'] < 530, shore
    passed('River banks and island coast block walking while the actual bridge permits crossing', {
        'bank': bank_end, 'bridgeStart': bridge_before, 'bridgeEnd': bridge_after, 'coastStop': shore})

    inspect(page, 300, -310, elapsed=179)
    grace = state(page)
    assert grace['zone']['radius'] == 800 and grace['zone']['inDanger'] is False
    inspect(page, 300, -310, elapsed=600)
    middle = state(page)
    assert 430 < middle['zone']['radius'] < 441
    inspect(page, 300, -310, elapsed=1200)
    final_start = state(page)
    assert final_start['zone']['radius'] == 20 and final_start['zone']['inDanger'] is True
    wait_sim(page, .6)
    damaged = state(page)
    delta = damaged['elapsed'] - final_start['elapsed']
    assert abs((final_start['health'] - damaged['health']) - 11 * delta) < .25
    inspect(page, 0, 0, elapsed=1200)
    safe = state(page)
    assert safe['zone']['inDanger'] is False
    passed('Map-defined fog gives three minutes exploration, shrinks over twenty minutes and applies timed damage', {
        'graceRadius': grace['zone']['radius'], 'middleRadius': middle['zone']['radius'],
        'finalRadius': damaged['zone']['radius'], 'damagePerSecond': (final_start['health'] - damaged['health']) / delta})
    page.close()


def editor_state(page):
    return page.evaluate('window.nebeljagdMapTestState()')


def select_object(page, identifier):
    page.locator('#feature-filter').select_option('object')
    page.locator('#feature-search').fill(identifier)
    page.locator(f'#feature-list [data-type="object"][data-id="{identifier}"]').click()
    expect(page.locator('#properties-form')).to_be_visible()


def editor_checks(browser):
    context = browser.new_context(viewport={'width': 1280, 'height': 900}, device_scale_factor=1)
    editor = context.new_page(); editor.set_default_timeout(120000); monitor(editor)
    editor.goto(URL + '/map-editor.html', wait_until='load')
    editor.wait_for_function('window.nebeljagdMapTestState && window.nebeljagdMapTestState().map.objects.length > 3900')
    select_object(editor, 'obj-tree-2451')
    editor.locator('#feature-x').fill('20')
    editor.locator('#feature-z').fill('-40')
    editor.locator('#object-scale').fill('1.2')
    editor.locator('.apply-properties').click()
    changed_tree = next(o for o in editor_state(editor)['map']['objects'] if o['id'] == 'obj-tree-2451')
    assert changed_tree['position'] == [20, -40] and changed_tree['scale'] == 1.2
    # The palette creates a genuinely new flowerbed; properties place it at an
    # exact metrescale position rather than merely changing an SVG icon.
    editor.locator('#palette-kind').select_option('flower')
    editor.locator('#add-object-center').click()
    new_id = editor_state(editor)['selection']['id']
    editor.locator('#feature-name').fill('QA · Zauberblumen')
    editor.locator('#feature-x').fill('33')
    editor.locator('#feature-z').fill('-46')
    editor.locator('#object-rotation').fill('37')
    editor.locator('#object-scale').fill('1.25')
    editor.locator('#object-radius').fill('1.8')
    editor.locator('.apply-properties').click()
    editor.locator('#duplicate-object').click()
    duplicate_id = editor_state(editor)['selection']['id']
    assert duplicate_id != new_id
    editor.locator('#delete-feature').click()
    assert not any(o['id'] == duplicate_id for o in editor_state(editor)['map']['objects'])
    editor.locator('#palette-kind').select_option('house')
    editor.locator('#add-object-center').click()
    new_house_id = editor_state(editor)['selection']['id']
    editor.locator('#feature-name').fill('QA · Drehbares Holzhaus')
    editor.locator('#feature-x').fill('-105')
    editor.locator('#feature-z').fill('40')
    editor.locator('#object-rotation').fill('37')
    editor.locator('#object-scale').fill('1.1')
    editor.locator('.apply-properties').click()
    editor.locator('#palette-kind').select_option('grass')
    editor.locator('#add-object-center').click()
    new_grass_id = editor_state(editor)['selection']['id']
    editor.locator('#feature-name').fill('QA · Versteckgras')
    editor.locator('#feature-x').fill('30')
    editor.locator('#feature-z').fill('-33')
    editor.locator('#object-variant').select_option('tall')
    editor.locator('#object-radius').fill('2.5')
    editor.locator('.apply-properties').click()
    expected = editor_state(editor)['map']
    flower = next(o for o in expected['objects'] if o['id'] == new_id)
    assert flower['position'] == [33, -46] and abs(flower['rotation'] - math.radians(37)) < 1e-8
    assert len(expected['objects']) == 3986
    with editor.expect_download() as pending:
        editor.locator('#export-json').click()
    exported = OUT / 'generated-world-edited.json'; pending.value.save_as(exported)
    assert json.loads(exported.read_text()) == expected
    passed('Tree editing, flower/house/grass creation, duplication/deletion and JSON export preserve the object document', {
        'tree': changed_tree, 'flower': flower, 'houseId': new_house_id, 'grassId': new_grass_id, 'objectCount': len(expected['objects'])}, 'editor')
    capture(editor, 'editor-objects')

    with context.expect_page() as pending:
        editor.locator('#playtest-world').click()
    game = pending.value; game.set_default_timeout(120000); monitor(game)
    game.wait_for_function('window.nebeljagdTestState && window.nebeljagdTestState().rendering.calls > 0')
    game_data = state(game, True)
    assert game_data['world']['source'] == 'editor'
    assert game_data['world']['objects'] == expected['objects']
    moved_collider = next(tree for tree in game_data['world']['trees'] if tree['id'] == changed_tree['id'])
    assert moved_collider['x'] == 20 and moved_collider['z'] == -40
    assert abs(moved_collider['radius'] - .37 * 1.2) < 1e-8
    assert any(p['id'] == new_id for p in game_data['world']['importedAssets']['placements'])
    rendered_house = next(h for h in game_data['houses'] if h['id'] == new_house_id)
    assert abs(rendered_house['rotation'] - math.radians(37)) < 1e-8
    assert abs(rendered_house['halfWidth'] - 8.8) < 1e-8
    assert any(g['id'] == new_grass_id and g['radius'] == 2.5 for g in game_data['world']['grassPatches'])
    passed('In 3D testen opens the exact editor document and reconstructs its moved collider and newly placed imported flowers', {
        'source': game_data['world']['source'], 'movedTreeCollider': moved_collider,
        'flowerId': new_id, 'createdHouse': rendered_house, 'createdGrassRadius': 2.5, 'objectCount': len(game_data['world']['objects'])}, 'editor')
    game.close()

    # A plain game page can also consume the exported JSON. This is the
    # explicit transport for users moving the two standalone files separately.
    imported = json.loads(exported.read_text())
    imported['name'] = 'QA · Welt aus JSON'
    imported['zone']['center'] = [30, -42]
    game = context.new_page(); game.set_default_timeout(120000)
    ready(game)
    with game.expect_navigation(wait_until='domcontentloaded'):
        game.locator('#worldMapFile').set_input_files({'name': 'worldmap.json', 'mimeType': 'application/json',
            'buffer': json.dumps(imported, ensure_ascii=False).encode()})
    game.wait_for_function('window.nebeljagdTestState && window.nebeljagdTestState().world.source === "import"')
    loaded = state(game, True)
    assert loaded['world']['mapName'] == imported['name']
    assert loaded['world']['objects'] == imported['objects']
    assert loaded['zone']['center'] == [30, -42]
    assert loaded['zone']['radius'] == 800
    theta = math.radians(37)
    inspect(game, -105 + math.sin(theta) * 8.5 * 1.1, 40 + math.cos(theta) * 8.5 * 1.1)
    walk(game, ['w', 'a'], .7)
    new_house_inside = state(game)
    assert new_house_inside['shelter'] == 'QA · Drehbares Holzhaus', new_house_inside['position']
    passed('Game JSON import rebuilds the exported prop document and a changed fog centre', {
        'mapName': loaded['world']['mapName'], 'source': loaded['world']['source'],
        'zoneCenter': loaded['zone']['center'], 'createdHouseEntered': new_house_inside['shelter'], 'enteredPosition': new_house_inside['position'], 'objectCount': len(loaded['world']['objects'])}, 'editor')
    game.close(); editor.close(); context.close()

    offline = browser.new_context(viewport={'width': 800, 'height': 600}, offline=True)
    page = offline.new_page(); page.set_default_timeout(120000); monitor(page)
    requests = []
    page.on('request', lambda request: requests.append(request.url) if request.url.startswith(('http:', 'https:')) else None)
    page.set_content((ROOT / 'dist/nebeljagd.html').read_text(), wait_until='domcontentloaded')
    page.wait_for_function('window.nebeljagdTestState && window.nebeljagdTestState().rendering.calls > 0')
    assert state(page)['world']['stats']['totalObjects'] == 4030
    assert not requests, requests
    passed('The complete generated game remains one self-contained HTML with network disabled', {
        'httpRequests': requests, 'objects': 4030,
        'harness': 'Exact standalone HTML loaded in an empty-origin page; managed Chromium blocks file navigation'}, 'editor')
    page.close(); offline.close()


report = {'status': 'running', 'checks': checks, 'javascript_or_shader_errors': errors, 'screenshots': screenshots}
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        if not args.editor_only:
            world_checks(browser)
        if not args.world_only:
            editor_checks(browser)
        browser.close()
    assert not errors, errors
    report['status'] = 'passed'
except BaseException as error:
    report['status'] = 'interrupted' if isinstance(error, KeyboardInterrupt) else 'failed'
    report['failure'] = str(error)
    raise
finally:
    contents = json.dumps(report, ensure_ascii=False, indent=2)
    (OUT / 'generated-world-smoke.json').write_text(contents)
    (DOCS / 'generated-world-smoke.json').write_text(contents)
    print(json.dumps({'status': report['status'], 'checks': len(checks), 'javascript_or_shader_errors': errors,
        'failure': report.get('failure')}, ensure_ascii=False), flush=True)
