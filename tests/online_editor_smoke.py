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
        page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))

    try:
        with sync_playwright() as p:
            options = {'headless': True, 'args': ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']}
            executable = os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
            if executable:
                options['executable_path'] = executable
            browser = p.chromium.launch(**options)
            context = browser.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
            context.add_init_script('window.showSaveFilePicker = undefined; window.showOpenFilePicker = undefined;')
            page = context.new_page()
            monitor(page)
            page.goto(base + '/editor.html')
            expect(page.locator('#open-project')).to_be_enabled()
            expect(page.locator('#version')).to_contain_text(release['buildId'])
            expect(page.locator('#open-draft')).to_be_disabled()
            page.locator('#open-project').click()
            ready(page)
            query = parse_qs(urlsplit(page.url).query)
            assert query['v'] == [release['files']['map-editor.html']['sha256']]
            assert query['start'] == ['project']
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

            draft = copy.deepcopy(project)
            draft['name'] = 'Mein unveröffentlichter Entwurf'
            page.evaluate('(v) => localStorage.setItem("nebeljagd.worldmap.v1", JSON.stringify(v))', draft)
            page.goto(base + '/editor.html')
            expect(page.locator('#open-draft')).to_be_enabled()
            page.locator('#open-draft').click()
            ready(page)
            assert state(page)['map']['name'] == draft['name']
            expect(page.locator('#editor-map-source')).to_contain_text('Entwurf')
            passed('Own browser draft resumes only through explicit choice')

            page.goto(base + '/editor.html')
            expect(page.locator('#open-project')).to_be_enabled()
            page.locator('#open-project').click()
            ready(page)
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

            page.goto(base + '/editor.html')
            expect(page.locator('#open-project')).to_be_enabled()
            changed = copy.deepcopy(release)
            changed['buildId'] = 'abcdef012345'
            changed['files']['map-editor.html']['sha256'] = 'b' * 64
            page.route('**/release.json?*', lambda route: route.fulfill(json=changed))
            page.locator('#retry').click()
            expect(page.locator('#version')).to_contain_text(changed['buildId'])
            passed('Same bookmarked URL checks fresh manifest on request')
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
