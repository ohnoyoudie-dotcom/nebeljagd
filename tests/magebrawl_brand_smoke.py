"""Generated Magebrawl delivery, old bookmarks, draft continuity and offline ZIP."""
import functools, hashlib, http.server, json, os, re, subprocess, threading, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
URL=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:4174').rstrip('/')
OUT=ROOT/'test-results/magebrawl'; OUT.mkdir(parents=True,exist_ok=True)
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"""
import {createLobbyMap} from './src/lobby-map.js';
const map=createLobbyMap();map.objects=[];map.name='Mein bisheriger gespeicherter Entwurf';
console.log(JSON.stringify(map));
"""],cwd=ROOT))
original=hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()
checks=[];errors=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else pw.chromium.executable_path),headless=True,
        args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    try:
        context=browser.new_context(viewport={'width':1280,'height':900})
        context.add_init_script('localStorage.setItem("nebeljagd.worldmap.v1",'+json.dumps(json.dumps(fixture))+');')
        page=context.new_page();page.set_default_timeout(180000)
        page.on('pageerror',lambda error:errors.append(str(error)))
        for file in ['index.html','teacher.html']:
            page.goto(URL+'/'+file,wait_until='domcontentloaded')
            assert page.title().startswith('Magebrawl'),page.title()
            assert not re.search(r'\bNebeljagd\b',page.locator('body').inner_text(),re.I)
            expect(page.locator('.brand-mark')).to_have_text('M')
        checks.append('Portal and teacher entry use Magebrawl and the M monogram')
        page.goto(URL+'/editor.html',wait_until='domcontentloaded')
        page.wait_for_function('window.nebeljagdMapTestState')
        assert page.title().startswith('Magebrawl')
        assert page.evaluate('nebeljagdMapTestState().map')==fixture
        assert not re.search(r'\bNebeljagd\b',page.locator('body').inner_text(),re.I)
        checks.append('Permanent editor entry restores the exact draft stored under the old name')
        with page.expect_popup() as opened: page.locator('#playtest-world').click()
        game=opened.value;game.set_default_timeout(180000)
        game.on('pageerror',lambda error:errors.append(str(error)))
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
        assert '/magebrawl.html?' in game.url,game.url
        assert game.title().startswith('Magebrawl')
        expect(game.locator('.brand-title')).to_have_text('MAGEBRAWL')
        assert game.evaluate('nebeljagdTestState().world.mapName')==fixture['name']
        assert not re.search(r'\bNebeljagd\b',game.locator('body').inner_text(),re.I)
        game.screenshot(path=str(OUT/'magebrawl-start.png'))
        game.locator('#startBtn').click()
        game.wait_for_function('nebeljagdTestState().phase==="playing"')
        checks.append('Editor launches the renamed game with its exact map and Magebrawl title/HUD')
        game.goto(URL+'/nebeljagd.html?mapSource=editor&quality=low&v=rename-check#play',wait_until='domcontentloaded')
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
        assert game.url==URL+'/magebrawl.html?mapSource=editor&quality=low&v=rename-check#play',game.url
        assert game.evaluate('nebeljagdTestState().world.mapName')==fixture['name']
        checks.append('Old public game bookmark redirects and keeps editor map, quality, version and anchor')
        game.close();page.close()
        with zipfile.ZipFile(ROOT/'welt/magebrawl-welt-und-editor.zip') as bundle:
            assert 'magebrawl.html' in bundle.namelist() and 'nebeljagd.html' in bundle.namelist()
            assert bundle.read('nebeljagd.html').find(b'./magebrawl.html')>=0
            assert bundle.getinfo('nebeljagd.html').file_size<4096,'legacy entry must not duplicate the game'
            assert 'MAGEBRAWL' in bundle.read('Anleitung.txt').decode()
            assert json.loads(bundle.read('worldmap.json'))==json.loads((ROOT/'worldmap.json').read_text())
            offline=OUT/'offline';offline.mkdir(exist_ok=True)
            for name in ['magebrawl.html','nebeljagd.html']: (offline/name).write_bytes(bundle.read(name))
        # Managed Chrome prohibits file:// navigation. Serve only these two
        # extracted files and reject every external request; file URL resolution
        # itself is covered separately in rename_compatibility.test.js.
        handler=functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(offline))
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        local=f'http://127.0.0.1:{server.server_port}'
        packaged=browser.new_context(viewport={'width':1280,'height':900})
        def route(request):
            if request.request.url.startswith(local+'/'): request.continue_()
            else:
                errors.append('Unexpected external dependency in ZIP: '+request.request.url)
                request.abort()
        packaged.route('**/*',route)
        try:
            page=packaged.new_page();page.set_default_timeout(180000)
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(local+'/nebeljagd.html?quality=low#offline',wait_until='domcontentloaded')
            page.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
            assert '/magebrawl.html?quality=low#offline' in page.url
            assert page.title().startswith('Magebrawl')
        finally:
            packaged.close();server.shutdown();server.server_close()
        checks.append('Extracted ZIP game and legacy redirect render without external dependencies; instructions and authored map are intact')
        assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==original
        assert not errors,errors
        print(json.dumps({'status':'passed','checks':checks,'errors':errors},ensure_ascii=False,indent=2),flush=True)
    finally:
        browser.close();(OUT/'report.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2))
