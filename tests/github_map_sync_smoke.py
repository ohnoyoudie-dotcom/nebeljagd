"""Real standalone editor with a deterministic GitHub API; no real credentials/writes."""
import base64
import copy
import hashlib
import json
import os
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / os.environ.get('NEBELJAGD_BROWSER_DIRECTORY', 'welt')
OUT = ROOT / 'test-results/github-map-sync'
OUT.mkdir(parents=True, exist_ok=True)
PROJECT = json.loads((DIRECTORY / 'worldmap.json').read_text())
KEY = 'nebeljagd.worldmap.v1'
AUTH = 'nebeljagd.github-map-auth.v1'
FAKE = 'test-only-placeholder-credential'
report = {'status':'running', 'checks':[], 'pageErrors':[], 'realGitHubWrites':0}

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(DIRECTORY)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
remote = {'map':copy.deepcopy(PROJECT), 'sha':'a'*40, 'text':json.dumps(PROJECT), 'writes':[], 'deny':False, 'race':False}

def replace_remote(value):
    remote['map'] = copy.deepcopy(value)
    remote['text'] = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    remote['sha'] = hashlib.sha1(remote['text'].encode()).hexdigest()

def api(route):
    request = route.request
    headers = {'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,PUT,OPTIONS', 'Access-Control-Allow-Headers':'authorization,content-type,x-github-api-version'}
    if request.method == 'OPTIONS': return route.fulfill(status=204, headers=headers)
    assert request.headers.get('authorization') == 'Bearer ' + FAKE
    if remote['deny']: return route.fulfill(status=401, json={'message':'Expired'}, headers=headers)
    assert request.url.split('?')[0] == 'https://api.github.com/repos/ohnoyoudie-dotcom/nebeljagd/contents/worldmap.json'
    if request.method == 'GET':
        assert request.url.endswith('?ref=work')
        return route.fulfill(json={'type':'file', 'size':len(remote['text'].encode()), 'sha':remote['sha'], 'encoding':'base64', 'content':base64.b64encode(remote['text'].encode()).decode()}, headers=headers)
    assert request.method == 'PUT'
    body = request.post_data_json
    assert body['branch'] == 'work'
    if body['sha'] != remote['sha'] or remote['race']:
        return route.fulfill(status=409, json={'message':'Conflict'}, headers=headers)
    remote['text'] = base64.b64decode(body['content']).decode()
    remote['map'] = json.loads(remote['text'])
    remote['sha'] = hashlib.sha1(remote['text'].encode()).hexdigest()
    remote['writes'].append(copy.deepcopy(remote['map']))
    route.fulfill(status=201, json={'content':{'sha':remote['sha']},'commit':{'sha':'c'*40}}, headers=headers)

def published(route):
    release = json.loads((DIRECTORY / 'release.json').read_text())
    release['files']['worldmap.json']['sha256'] = hashlib.sha256(remote['text'].encode()).hexdigest()
    route.fulfill(json=release)

def state(page): return page.evaluate('nebeljagdMapTestState()')
def ready(page):
    page.wait_for_function('typeof window.nebeljagdMapTestState === "function"')
    expect(page.locator('#github-connect')).to_be_visible()

def import_map(page, value):
    page.locator('#json-file-input').set_input_files({'name':'edited.json','mimeType':'application/json','buffer':json.dumps(value).encode()})
    page.wait_for_function('(name) => nebeljagdMapTestState().map.name === name', arg=value['name'])

def passed(check):
    report['checks'].append(check)
    print('PASS', check, flush=True)

try:
    with sync_playwright() as p:
        options = {'headless':True, 'args':['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']}
        executable = os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
        if executable: options['executable_path'] = executable
        browser = p.chromium.launch(**options)
        context = browser.new_context(viewport={'width':1280,'height':900}, accept_downloads=True)
        context.route('https://api.github.com/**', api)
        context.route('**/release.json?*', published)
        context.add_init_script('window.showSaveFilePicker = undefined; window.showOpenFilePicker = undefined;')
        page = context.new_page()
        page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
        page.goto(base + '/map-editor.html?sync=github')
        ready(page)
        draft = copy.deepcopy(PROJECT); draft['name'] = 'Meine aktuelle Karte · 🌙'
        import_map(page,draft)
        page.locator('[data-editor-action="objects"]').click()
        for kind,variant in [('stump','kit-tripo-stump-01'),('stump','kit-tripo-stump-02'),('gravityStaff','kit-tripo-gravity-staff')]:
            page.locator('#palette-kind').select_option(kind)
            page.locator('#palette-variant').select_option(variant)
            page.locator('#add-object-center').click()
        draft = state(page)['map']
        assert len(draft['objects']) == len(PROJECT['objects']) + 3
        page.locator('#export-json').click()
        expect(page.locator('#github-map-dialog')).to_be_visible()
        page.set_viewport_size({'width':390,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(OUT / 'connect-mobile.png'))
        page.set_viewport_size({'width':1280,'height':900})
        page.locator('#github-map-token').fill(FAKE)
        page.locator('#github-map-remember').check()
        page.locator('#github-map-submit').click()
        expect(page.locator('#online-map-status')).to_have_text('Karte online gespeichert und veröffentlicht.', timeout=30000)
        assert remote['writes'] == [draft]
        assert remote['map'] == state(page)['map'] == draft
        assert page.evaluate('(key)=>localStorage.getItem(key)', AUTH) == FAKE
        passed('One-time connection saves the entire current map to work and confirms matching publication')

        page.keyboard.press('Control+s')
        expect(page.locator('#online-map-status')).to_have_text('Karte online gespeichert und veröffentlicht.')
        assert len(remote['writes']) == 1
        passed('Repeated saving of an unchanged map does not create redundant commits')

        with page.expect_download() as dl:
            page.locator('#export-editor').evaluate('(button)=>button.click()')
        exported = OUT / 'snapshot.html'; dl.value.save_as(exported)
        contents = exported.read_text()
        assert FAKE not in contents
        assert '<dialog id="github-map-dialog"' not in contents
        exported.unlink()
        passed('Offline editor export contains the current map and no connection credential')

        page.reload(); ready(page)
        expect(page.locator('#online-map-status')).to_have_text('Karte online gespeichert und veröffentlicht.')
        assert state(page)['map'] == draft
        newer = copy.deepcopy(draft); newer['name'] = 'Neuer Online-Kartenstand'
        replace_remote(newer)
        page.reload(); ready(page)
        page.wait_for_function('(name)=>nebeljagdMapTestState().map.name===name', arg=newer['name'])
        assert state(page)['map'] == newer
        passed('Remembered connection resumes saved work and adopts newer online maps without local edits')

        local = copy.deepcopy(newer); local['name'] = 'Noch nicht veröffentlichte Änderungen'
        import_map(page,local)
        other = copy.deepcopy(newer); other['name'] = 'Gleichzeitig von anderem Gerät gespeichert'
        replace_remote(other)
        page.locator('#export-json').click()
        expect(page.locator('#github-load-remote')).to_be_visible()
        assert remote['map'] == other and state(page)['map'] == local
        assert len(remote['writes']) == 1
        assert page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))', KEY) == local
        passed('Concurrent online changes block overwrites while preserving every local edit')

        page.locator('#github-load-remote').click()
        page.wait_for_function('(name)=>nebeljagdMapTestState().map.name===name', arg=other['name'])
        assert page.evaluate('JSON.parse(localStorage.getItem("nebeljagd.worldmap.before-online.v1"))') == local
        with page.expect_download() as dl: page.locator('#github-map-backup').click()
        backup = OUT / 'backup.json'; dl.value.save_as(backup)
        assert json.loads(backup.read_text()) == local; backup.unlink()
        passed('Choosing the online map keeps a separately downloadable backup and undo history')

        race = copy.deepcopy(other); race['name'] = 'Edit during race'
        import_map(page,race); remote['race'] = True
        page.locator('#export-json').click()
        expect(page.locator('#github-load-remote')).to_be_visible()
        assert state(page)['map'] == race and remote['map'] == other
        remote['race'] = False
        passed('GitHub compare-and-swap also catches changes occurring between read and write')

        page.locator('#github-load-remote').click()
        page.wait_for_function('(name)=>nebeljagdMapTestState().map.name===name', arg=other['name'])
        expect(page.locator('#github-backup-choice')).to_be_visible()
        assert page.locator('#github-backup-choice option').count() == 2
        page.locator('#github-backup-choice').select_option(index=1)
        with page.expect_download() as dl: page.locator('#github-map-backup').click()
        backup = OUT / 'earlier-backup.json'; dl.value.save_as(backup)
        assert json.loads(backup.read_text()) == local; backup.unlink()
        passed('A later conflict keeps earlier local backups available individually')

        import_map(page,race)

        remote['deny'] = True
        page.reload(); ready(page)
        expect(page.locator('#online-map-status')).to_contain_text('GitHub-Zugriff fehlt')
        assert state(page)['map'] == race
        page.locator('#github-connect').click()
        page.locator('#github-map-disconnect').click()
        assert page.evaluate('(key)=>localStorage.getItem(key)', AUTH) is None
        assert page.evaluate('(key)=>sessionStorage.getItem(key)', AUTH) is None
        page.locator('#export-json').click()
        expect(page.locator('#github-map-dialog')).to_be_visible()
        assert state(page)['map'] == race
        passed('Expired credentials and disconnect preserve the map and require a new connection')

        remote['deny'] = False
        page.goto(base + '/map-editor.html?sync=github&open=project'); ready(page)
        expect(page.locator('#restore-banner')).to_be_visible()
        page.locator('#export-json').click()
        page.locator('#github-map-token').fill(FAKE)
        page.locator('#github-map-remember').uncheck()
        page.locator('#github-map-submit').click()
        expect(page.locator('#online-map-status')).to_have_text('Karte online gespeichert und veröffentlicht.')
        assert page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))', KEY) == other
        assert page.evaluate('(key)=>localStorage.getItem(key)', AUTH) is None
        assert page.evaluate('(key)=>sessionStorage.getItem(key)', AUTH) == FAKE
        expect(page.locator('#restore-banner')).not_to_be_visible()
        page.reload(); ready(page)
        page.wait_for_function('(name)=>nebeljagdMapTestState().map.name===name', arg=other['name'])
        assert state(page)['map'] == other
        passed('Explicit online save preserves a protected older draft separately and resumes the saved map; session-only credentials stay out of persistent storage')
        assert not report['pageErrors'], report['pageErrors']
        browser.close()
    report['status'] = 'passed'
finally:
    server.shutdown(); server.server_close()
    (OUT / 'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
