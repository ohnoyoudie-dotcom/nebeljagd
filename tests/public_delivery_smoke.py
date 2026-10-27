"""Verify the real published Nebeljagd URLs against the current local build.

Run only AFTER publishing dist/ into the existing Pages welt/ directory.
Uses normal certificate verification for downloads and a fresh browser context
for the game/editor round-trip. No production map or server state is mutated.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import traceback
import urllib.request
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_BASE = 'https://ohnoyoudie-dotcom.github.io/nebeljagd/welt/'


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run(base: str, report_path: Path) -> None:
    base = base.rstrip('/') + '/'
    expected_map = json.loads((ROOT / 'dist/worldmap.json').read_text())
    expected_objects = expected_map['objects']
    expected_counts = Counter(item['kind'] for item in expected_objects)
    expected_total = len(expected_objects)
    errors: list[str] = []
    report = {
        'status': 'running',
        'checkedAt': datetime.now(timezone.utc).isoformat(),
        'baseURL': base,
        'expectedObjects': expected_total,
        'expectedObjectCounts': dict(expected_counts),
        'http': [],
        'javascriptOrShaderErrors': errors,
        'browserHarnessNote': (
            'Ephemeral Chromium context ignores the execution environment TLS '
            'proxy certificate; urllib HTTPS download validation uses its normal '
            'certificate verification.'
        ),
    }

    def monitor(page):
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)

    def game_ready(page):
        page.wait_for_function(
            'window.nebeljagdTestState && window.nebeljagdTestState().rendering.calls > 0',
            timeout=90000,
        )
        expect(page.locator('#startBtn')).to_be_enabled(timeout=30000)
        return page.evaluate('''() => {
            const s = window.nebeljagdTestState();
            return {source:s.world.source, objects:s.world.objects.length,
                trees:s.world.stats.treeCount, houses:s.houses.length,
                mounds:s.world.stats.moundCount,
                glbs:s.world.stats.loadedGLBs, phase:s.phase,
                renderCalls:s.rendering.calls,
                roofless:s.houses.every(h => !h.roofVisible),
                interiorsVisible:s.houses.every(h => h.interiorVisible),
                visionRadius:s.vision.radius, visionDirection:s.vision.direction,
                visionAppearance:s.vision.appearance, sceneryTransmission:s.vision.sceneryTransmission,
                minimap:s.minimap,
                chests:s.chests.length,
                crystalObjects:s.world.objects.filter(o => o.kind==='crystal').length,
                crystalPickups:s.pickups.filter(o => o.type==='crystal').length,
                healthBars:s.healthBars};
        }''')

    try:
        assert expected_counts['crystal'] == 0, 'Local build still contains diamond pickups.'
        assert expected_counts['chest'] > 0, 'Local build has no chests.'
        assert expected_counts['fireStaff'] and expected_counts['iceStaff'], 'Local build lacks starter magic staves.'
        paths = [
            ('', 'nebeljagd.html'),
            ('map-editor.html', 'map-editor.html'),
            ('nebeljagd-welt-und-editor.zip', 'nebeljagd-welt-und-editor.zip'),
        ]
        for remote_path, filename in paths:
            request = urllib.request.Request(base + remote_path, headers={'User-Agent': 'Nebeljagd-delivery-verification/1.0'})
            with urllib.request.urlopen(request, timeout=60) as response:
                data = response.read()
                record = {
                    'url': response.url, 'status': response.status,
                    'bytes': len(data), 'contentType': response.headers.get('Content-Type'),
                    'sha256': digest(data),
                    'matchesLocal': data == (ROOT / 'dist' / filename).read_bytes(),
                }
            report['http'].append(record)
            assert record['status'] == 200, record
            assert record['matchesLocal'], f'Published {filename} does not match the current local build: {record}'
            if filename.endswith('.zip'):
                with zipfile.ZipFile(io.BytesIO(data)) as archive:
                    record['zipIntegrity'] = archive.testzip()
                    record['zipFiles'] = archive.namelist()
                    assert record['zipIntegrity'] is None, 'ZIP CRC check failed.'
                    expected_names = {'nebeljagd.html', 'map-editor.html', 'worldmap.json', 'worldmap.svg', 'worldmap.schema.json', 'Anleitung.txt'}
                    assert set(archive.namelist()) == expected_names
                    for name in expected_names - {'Anleitung.txt'}:
                        assert archive.read(name) == (ROOT / 'dist' / name).read_bytes(), f'ZIP contains outdated {name}.'
                    record['zipContentsMatchLocal'] = True
            print(f'PASS HTTPS bytes: {record["url"]} ({record["bytes"]} bytes)', flush=True)

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path='/usr/bin/chromium', headless=True,
                args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
            )
            context = browser.new_context(viewport={'width': 1280, 'height': 800}, ignore_https_errors=True)
            game = context.new_page()
            monitor(game)
            response = game.goto(base + '?inspect=1', wait_until='domcontentloaded', timeout=60000)
            assert response.status == 200
            snapshot = game_ready(game)
            assert snapshot['objects'] == expected_total, snapshot
            assert snapshot['mounds'] == expected_counts['mound'] == 4, snapshot
            assert snapshot['glbs'] == 5, snapshot
            assert snapshot['roofless'] and snapshot['interiorsVisible'], snapshot
            assert snapshot['visionRadius'] == 18, snapshot
            assert snapshot['visionAppearance'] == 'translucent-blue-grey', snapshot
            assert snapshot['sceneryTransmission'] > .35, snapshot
            assert snapshot['chests'] == expected_counts['chest'], snapshot
            assert snapshot['crystalObjects'] == snapshot['crystalPickups'] == 0, snapshot
            assert any(bar['id'] == 'player' and bar['visible'] for bar in snapshot['healthBars']), snapshot
            report['gameBrowser'] = snapshot
            # Walk-over auto pickup is real runtime behavior; inspect only repositions the avatar.
            staff = next(item for item in expected_objects if item['kind'] == 'fireStaff')
            game.evaluate('(point) => window.nebeljagdInspect({x:point[0],z:point[1]})', staff['position'])
            game.wait_for_function('window.nebeljagdTestState().equippedWeapon === "fireStaff"', timeout=15000)
            equipped = game.evaluate('window.nebeljagdTestState().equippedItem')
            assert equipped['rarity'] == staff.get('rarity', 'common'), equipped
            assert equipped['damage'] > 0 and equipped['burn']['damagePerSecond'] > 0, equipped
            expect(game.locator('#weaponTier')).to_have_text(equipped['rarityLabel'].upper())
            report['hostedStaffPickup'] = {
                'mapObject': staff['id'], 'type': equipped['type'], 'automaticWhenUnarmed': True,
                'rarity': equipped['rarity'], 'damage': equipped['damage'],
                'burn': equipped['burn'],
            }
            # An equipped weapon must never change just by walking over another one.
            sword = next(item for item in expected_objects if item['kind'] == 'sword')
            game.evaluate('(point) => window.nebeljagdInspect({x:point[0],z:point[1]})', sword['position'])
            before = game.evaluate('window.nebeljagdTestState().elapsed')
            game.wait_for_function('(time) => window.nebeljagdTestState().elapsed > time + .25', arg=before)
            assert game.evaluate('window.nebeljagdTestState().equippedWeapon') == 'fireStaff'
            game.keyboard.press('KeyE')
            game.wait_for_function('window.nebeljagdTestState().equippedWeapon === "sword"', timeout=10000)
            report['manualWeaponSwap'] = {'automaticReplacementBlocked':True,'key':'E','equipped':'sword'}
            game.wait_for_function('window.nebeljagdTestState().minimap?.displayWidth >= 200')
            local = game.evaluate('window.nebeljagdTestState().minimap')
            assert local['mode'] == 'local' and local['spanMeters'] == 160, local
            assert local['player']['x'] == local['player']['y'] == 128, local
            game.locator('#mapMode-island').click()
            game.wait_for_function('window.nebeljagdTestState().minimap?.mode === "island"')
            island = game.evaluate('window.nebeljagdTestState().minimap')
            assert island['spanMeters'] >= 1200 and island['markers'] == [], island
            game.locator('#mapMode-local').click()
            game.wait_for_function('window.nebeljagdTestState().minimap?.mode === "local"')
            report['minimapViews'] = {'local':local, 'island':island, 'actualButtonsWork':True}
            print('PASS hosted game, light fog, larger minimap, automatic first weapon and manual swap:', json.dumps(snapshot), flush=True)
            game.close()

            editor = context.new_page()
            monitor(editor)
            response = editor.goto(base + 'map-editor.html', wait_until='load', timeout=60000)
            assert response.status == 200
            editor.wait_for_function('window.nebeljagdMapTestState', timeout=30000)
            assert editor.evaluate('window.nebeljagdMapTestState().map.objects.length') == expected_total
            expect(editor.locator('#grass-brush')).to_be_visible()
            editor.locator('#grass-brush').click()
            expect(editor.locator('#grass-brush')).to_have_attribute('aria-pressed', 'true')
            editor.keyboard.press('Escape')
            expect(editor.locator('#grass-brush')).to_have_attribute('aria-pressed', 'false')
            expect(editor.locator('#object-eraser')).to_be_visible()
            editor.locator('#object-eraser').click()
            expect(editor.locator('#object-eraser')).to_have_attribute('aria-pressed', 'true')
            editor.keyboard.press('Escape')
            expect(editor.locator('#object-eraser')).to_have_attribute('aria-pressed', 'false')
            editor.locator('#palette-kind').select_option('mound')
            editor.locator('#palette-variant').select_option('ridge')
            expect(editor.locator('#palette-preview-title')).to_contain_text('Felskante')
            editor.locator('#palette-kind').select_option('tree')
            editor.locator('#palette-variant').select_option('rei-tree01')
            expect(editor.locator('#palette-asset-preview')).to_be_visible()
            editor.wait_for_function('document.querySelector("#palette-preview-image svg image")?.getAttribute("href")?.startsWith("data:image/webp;base64,")')
            preview_size = editor.evaluate("""async () => {
                const preview = new Image();
                preview.src = document.querySelector('#palette-preview-image svg image').getAttribute('href');
                await preview.decode(); return [preview.naturalWidth, preview.naturalHeight];
            }""")
            assert preview_size[0] >= 128 and preview_size[1] >= 96, preview_size
            assert 'Rei' in editor.locator('#palette-preview-title').inner_text()
            report['editorTools'] = {'grassBrushToggle':True,'eraserToggle':True,'moundVariantAvailable':True,'assetPreviewLoaded':True,'assetVariant':'rei-tree01'}
            editor.locator('#palette-kind').select_option('chest')
            editor.locator('#add-object-center').click()
            editor.wait_for_function('(count) => window.nebeljagdMapTestState().map.objects.length === count', arg=expected_total + 1)
            editor.locator('#palette-kind').select_option('iceStaff')
            editor.locator('#palette-rarity').select_option('legendary')
            editor.locator('#add-object-center').click()
            editor.wait_for_function('(count) => window.nebeljagdMapTestState().map.objects.length === count', arg=expected_total + 2)
            edited_map = editor.evaluate('window.nebeljagdMapTestState().map')
            added = edited_map['objects'][-2:]
            assert added[0]['kind'] == 'chest', added
            assert added[1]['kind'] == 'iceStaff' and added[1]['rarity'] == 'legendary', added
            expect(editor.locator('#object-rarity')).to_have_value('legendary')
            with editor.expect_popup(timeout=30000) as popup_info:
                editor.locator('#playtest-world').click()
            popup = popup_info.value
            monitor(popup)
            popup.wait_for_load_state('domcontentloaded')
            snapshot = game_ready(popup)
            assert snapshot['source'] == 'editor', snapshot
            assert snapshot['objects'] == expected_total + 2, snapshot
            assert snapshot['chests'] == expected_counts['chest'] + 1, snapshot
            assert popup.url == base + 'index.html?mapSource=editor', popup.url
            received_objects = popup.evaluate('window.nebeljagdTestState().world.objects')
            assert received_objects == edited_map['objects'], 'The hosted game did not receive the exact edited object document.'
            assert popup.evaluate('window.nebeljagdTestState().world.mapId') == edited_map['id']
            assert popup.evaluate('window.nebeljagdTestState().world.bounds') == edited_map['bounds']
            assert snapshot['roofless'] and snapshot['visionRadius'] == 18
            report['editorBrowser'] = {
                'url': editor.url, 'baseObjects': expected_total,
                'editedObjects': len(edited_map['objects']), 'addedObjects': added,
                'popupURL': popup.url, 'popupGame': snapshot,
                'exactObjectDocumentReceived': True,
            }
            print('PASS hosted editor → game with chest and legendary staff:', json.dumps(report['editorBrowser']), flush=True)
            browser.close()
        assert not errors, errors
        report['status'] = 'passed'
    except BaseException as error:
        report['status'] = 'failed'
        report['failure'] = str(error)
        traceback.print_exc()
        raise
    finally:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default=PUBLIC_BASE)
    parser.add_argument('--report', type=Path, default=ROOT / 'docs/public-delivery-check.json')
    args = parser.parse_args()
    run(args.base, args.report)
