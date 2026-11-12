"""Exercise the stable online entry and real generated standalone editor together."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
KEY = 'nebeljagd.worldmap.v1'


def run(directory: Path) -> None:
    out = ROOT / 'test-results/online-editor'
    out.mkdir(parents=True, exist_ok=True)
    release = json.loads((directory / 'release.json').read_text())
    project = json.loads((directory / 'worldmap.json').read_text())
    assert release['files']['worldmap.json']['sha256'] == hashlib.sha256((directory / 'worldmap.json').read_bytes()).hexdigest()
    assert release['files']['map-editor.html']['sha256'] == hashlib.sha256((directory / 'map-editor.html').read_bytes()).hexdigest()
    report = {'status': 'running', 'buildId': release['buildId'], 'checks': [], 'pageErrors': []}

    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(directory)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'

    def passed(name):
        report['checks'].append(name)
        print('PASS', name, flush=True)

    def ready(page):
        page.wait_for_function('typeof window.nebeljagdMapTestState === "function"')

    def state(page):
        return page.evaluate('window.nebeljagdMapTestState()')

    def monitor(page):
        page.set_default_timeout(30000)
        page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))

    try:
        with sync_playwright() as p:
            options = {'headless': True, 'args': ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']}
            # Keep real editor/game popups on Playwright's tested browser in CI.
            options['executable_path'] = os.environ.get('CHROMIUM_PATH') or p.chromium.executable_path
            browser = p.chromium.launch(**options)
            context = browser.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
            context.route('**/favicon.ico', lambda route: route.fulfill(status=204))
            context.add_init_script('window.showSaveFilePicker = undefined; window.showOpenFilePicker = undefined;')
            page = context.new_page()
            monitor(page)
            page.goto(base + '/editor.html?choose=1')
            expect(page.locator('#open-project')).to_be_enabled()
            expect(page.locator('#version')).to_contain_text(release['buildId'])
            expect(page.locator('#open-draft')).to_be_disabled()
            page.goto(base + '/editor.html')
            ready(page)
            query = parse_qs(urlsplit(page.url).query)
            assert query['v'] == [release['files']['map-editor.html']['sha256']]
            assert 'start' not in query
            assert state(page)['map'] == project, 'Project handoff preserves the complete map, including painted terrain and biomes'
            expect(page.locator('#editor-build-version')).to_contain_text(release['buildId'])
            expect(page.locator('#editor-map-source')).to_contain_text('Projektkarte')
            page.set_viewport_size({'width': 390, 'height': 844})
            expect(page.locator('#editor-build-version')).to_be_visible()
            expect(page.locator('#editor-map-source')).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.screenshot(path=str(out / 'editor-mobile.png'))
            page.set_viewport_size({'width': 1280, 'height': 900})
            passed('Fresh launcher opens matching editor and project map with visible version')

            # Legacy first-visit links used to retain start=project. Refreshing
            # that URL then reopened the project despite a successfully saved edit.
            page.goto(base + '/map-editor.html?start=project&v=' + release['files']['map-editor.html']['sha256'])
            ready(page)
            assert 'start' not in parse_qs(urlsplit(page.url).query)
            page.locator('[data-editor-action="objects"]').click()
            for kind, variant in [('crate', 'kit-tripo-crate-01'), ('stump', 'kit-tripo-stump-01'), ('stump', 'kit-tripo-stump-02'), ('lightningStaff', 'kit-tripo-lightning-staff'), ('gravityStaff', 'kit-tripo-gravity-staff')]:
                page.locator('#palette-kind').select_option(kind)
                page.locator('#palette-variant').select_option(variant)
                if page.locator('#place-object').get_attribute('aria-pressed') != 'true':
                    page.locator('#place-object').click()
                visible = page.locator('#world-objects [data-feature-type="object"]').evaluate_all('(xs)=>xs.map(x=>x.dataset.featureId)')
                assert set(visible) == {obj['id'] for obj in state(page)['map']['objects']}
                page.locator('#add-object-center').click()
                visible = page.locator('#world-objects [data-feature-type="object"]').evaluate_all('(xs)=>xs.map(x=>x.dataset.featureId)')
                assert set(visible) == {obj['id'] for obj in state(page)['map']['objects']}, 'Placing a different kind must keep every neighbour on the map'
                painted = page.locator('#world-objects [data-feature-type="object"] use').evaluate_all('(xs)=>xs.every(x=>x.getBBox().width>0 && x.getBBox().height>0)')
                assert painted, 'An empty selection ring is not a painted object'
            page.locator('#tool-select').click()
            page.locator('#clear-selection').click()
            page.locator('#world-objects [data-object-kind="gravityStaff"]').click()
            page.locator('#focus-selection').click()
            page.screenshot(path=str(out / 'gravity-and-stumps.png'))
            page.locator('#clear-selection').click()
            edited = state(page)['map']
            assert edited['objects'][:-5] == project['objects']
            page.locator('[data-editor-action="more"]').click()
            page.locator('#object-kind-filter').select_option('crate')
            visible = page.locator('#world-objects [data-feature-type="object"]').evaluate_all('(xs)=>xs.map(x=>x.dataset.featureId)')
            assert set(visible) == {obj['id'] for obj in edited['objects']}, 'A list filter must not hide objects on the canvas'
            page.screenshot(path=str(out / 'placement-neighbours.png'))
            passed('Crate and staff placement and list filtering keep all existing map objects visible')

            assert page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))', KEY) == edited
            with page.expect_download() as saved_placements:
                page.locator('#export-json').click()
            saved_path = out / 'placed-models.json'
            saved_placements.value.save_as(saved_path)
            assert json.loads(saved_path.read_text()) == edited
            reopen_url = page.url
            with page.expect_popup() as event:
                page.locator('#playtest-world').click()
            game = event.value; monitor(game)
            game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls > 0', timeout=180000)
            assert game.evaluate('nebeljagdTestState().world.objects') == edited['objects']
            assert game.evaluate('nebeljagdTestState().world.source') == 'editor'
            game.close(); page.close()
            page = context.new_page(); monitor(page)
            page.goto(reopen_url); ready(page)
            assert state(page)['map'] == edited
            page.reload(); ready(page)
            assert state(page)['map'] == edited
            page.goto(base + '/editor.html'); ready(page)
            assert state(page)['map'] == edited
            # Reusing the original old bookmark (not just the cleaned address)
            # must resume the saved placements as well.
            for _ in range(2):
                page.goto(base + '/map-editor.html?start=project&v=old-bookmark'); ready(page)
                assert state(page)['map'] == edited
                assert 'start' not in parse_qs(urlsplit(page.url).query)
            expect(page.locator('#save-status')).to_contain_text('Automatisch im Browser gespeichert')
            passed('Real game test, closing the editor, reload, stable entry and repeated old project bookmarks retain the complete edited map')

            draft = copy.deepcopy(project)
            draft['name'] = 'Mein unveröffentlichter Entwurf'
            page.evaluate('(v) => localStorage.setItem("nebeljagd.worldmap.v1", JSON.stringify(v))', draft)
            page.goto(base + '/editor.html')
            ready(page)
            assert state(page)['map'] == draft
            expect(page.locator('#editor-map-source')).to_contain_text('Entwurf')
            passed('Stable bookmark automatically resumes the complete own draft in the current editor')

            page.goto(base + '/editor.html?choose=1')
            expect(page.locator('#open-project')).to_be_enabled()
            page.locator('#open-project').click()
            ready(page)
            assert 'start' not in parse_qs(urlsplit(page.url).query)
            assert 'open' not in parse_qs(urlsplit(page.url).query)
            assert state(page)['map']['name'] == project['name']
            assert page.evaluate('JSON.parse(localStorage.getItem("nebeljagd.worldmap.v1")).name') == draft['name']
            expect(page.locator('#restore-banner')).to_be_visible()
            passed('Opening current project preserves the different local draft')

            page.goto(base + '/map-editor.html')
            ready(page)
            expect(page.locator('#editor-start-dialog')).not_to_be_visible()
            assert state(page)['map']['name'] == draft['name']
            expect(page.locator('#save-status')).to_contain_text('Automatisch im Browser gespeichert')
            passed('Direct editor visit automatically resumes the last browser draft')

            with page.expect_download() as saved_json:
                page.locator('#export-json').click()
            saved_json_path = out / 'auto-resumed.json'
            saved_json.value.save_as(saved_json_path)
            assert json.loads(saved_json_path.read_text())['name'] == draft['name']
            saved_json_path.unlink()
            passed('Automatically resumed map remains exportable as a normal JSON file')

            with page.expect_download() as download:
                page.locator('#export-editor').evaluate('(button) => button.click()')
            exported = directory / 'online-editor-snapshot-test.html'
            download.value.save_as(exported)
            try:
                fresh = browser.new_context(accept_downloads=True)
                snapshot_page = fresh.new_page()
                monitor(snapshot_page)
                snapshot_page.goto(base + '/' + exported.name)
                ready(snapshot_page)
                assert state(snapshot_page)['map']['name'] == draft['name']
                expect(snapshot_page.locator('#editor-start-dialog')).not_to_be_visible()
                passed('Exported standalone snapshot reopens its own map')
                fresh.close()
            finally:
                exported.unlink(missing_ok=True)

            page.goto(base + '/editor.html?choose=1')
            expect(page.locator('#open-project')).to_be_enabled()
            changed = copy.deepcopy(release)
            changed['buildId'] = 'abcdef012345'
            changed['files']['map-editor.html']['sha256'] = 'b' * 64
            page.route('**/release.json?*', lambda route: route.fulfill(json=changed))
            page.locator('#retry').click()
            expect(page.locator('#version')).to_contain_text(changed['buildId'])
            passed('Same bookmarked URL checks fresh manifest on request')
            page.goto(base + '/editor.html')
            ready(page)
            assert parse_qs(urlsplit(page.url).query)['v'] == ['b' * 64]
            assert state(page)['map'] == draft
            passed('An editor update automatically opens the new version with the entire saved map')
            page.goto(base + '/editor.html?choose=1')
            expect(page.locator('#version')).to_contain_text(changed['buildId'])
            page.unroute('**/release.json?*')
            page.route('**/release.json?*', lambda route: route.fulfill(status=503, body='Unavailable'))
            page.locator('#retry').click()
            expect(page.locator('#error')).to_be_visible()
            expect(page.locator('#open-project')).to_be_disabled()
            expect(page.locator('#open-draft')).to_be_disabled()
            assert page.evaluate('JSON.parse(localStorage.getItem("nebeljagd.worldmap.v1")).name') == draft['name']
            passed('Failed release check never silently opens stale editor or destroys a draft')
            page.unroute('**/release.json?*')

            page.evaluate('(key) => localStorage.setItem(key, "{broken-json")', KEY)
            page.goto(base + '/map-editor.html?start=project')
            ready(page)
            assert page.evaluate('(key) => localStorage.getItem(key)', KEY) == '{broken-json'
            assert state(page)['map']['objects'] == project['objects']
            passed('Unreadable browser draft remains intact while project opens')
            page.screenshot(path=str(out / 'editor.png'))
            assert not report['pageErrors'], report['pageErrors']
            browser.close()
        report['status'] = 'passed'
    finally:
        server.shutdown()
        server.server_close()
        (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', type=Path, default=ROOT / 'dist')
    run(parser.parse_args().directory.resolve())
