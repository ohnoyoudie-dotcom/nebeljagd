"""Generated editor/game: weighted loot, legacy sword, textured chest and restart."""
import base64, hashlib, json, os, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/chest-loot'; OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4174').rstrip('/')
fixture = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', """
import {createLobbyMap} from './src/lobby-map.js';
import {chestLoot} from './src/chests.js';
import {validateWorldmap} from './src/map/model.js';
const map=createLobbyMap(); map.objects=[]; map.paths=[];
let id; for(let i=0;i<100;i++) if(chestLoot('qa-chest-'+i,'common')[2].type==='sword'){id='qa-chest-'+i;break;}
map.objects.push({id,name:'Schatztruhe',kind:'chest',variant:'kit-tripo-chest',position:[0,0],scale:1,rotation:0},
 {id:'old-sword',name:'Altes Karten-Schwert',kind:'sword',variant:'steel',rarity:'normal',position:[-5,3],scale:1,rotation:0});
for(let i=0;i<16;i++) map.objects.push({id:'qa-bow-'+i,name:'Bogen',kind:'bow',variant:'wood',rarity:'legendary',position:[12+i*2,16],scale:1,rotation:0});
map.gameplay.spawnPosition=[0,3];
const check=validateWorldmap(map);if(!check.valid)throw new Error(JSON.stringify(check.errors));
console.log(JSON.stringify(map));
"""], cwd=ROOT))
source_hash = hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()
tiers = ['common', 'uncommon', 'rare', 'epic', 'legendary']
errors, checks = [], []
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else pw.chromium.executable_path), headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    try:
        context = browser.new_context(viewport={'width':1200,'height':850}, has_touch=True)
        context.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(fixture))+');')
        page = context.new_page(); page.set_default_timeout(180000)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda msg: errors.append(msg.text) if msg.type=='error' else None)
        page.goto(URL+'/magebrawl.html?inspect=1&mapSource=editor&quality=low', wait_until='domcontentloaded')
        page.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
        assert page.title().startswith('Magebrawl')
        expect(page.locator('.brand-title')).to_have_text('MAGEBRAWL')
        page.locator('#startBtn').click()
        state = lambda: page.evaluate('nebeljagdTestState()')
        initial = state()
        assert initial['world']['objects'] == fixture['objects']
        assert initial['chests'][0]['texturedInteriorSurfaces'] == 2, initial['chests']
        assert all(d['rarity'] in tiers for d in initial['weaponDrops'])
        assert any(d['rarity'] != 'legendary' for d in initial['weaponDrops'])
        old = next(d for d in initial['weaponDrops'] if d['id']=='old-sword')
        assert old['model']=='tripo' and old['variant']=='kit-tripo-sword'
        page.evaluate('nebeljagdInspect({x:0,z:2,health:100});nebeljagdInspectCamera({zoom:1.5})')
        page.wait_for_function('nebeljagdTestState().nearChest')
        page.keyboard.press('e')
        # Step back before the gold lands so its actual model and animation
        # remain visible instead of being collected immediately at the chest.
        page.evaluate('nebeljagdInspect({x:0,z:4.5})')
        page.wait_for_function('nebeljagdTestState().chests[0].lidRotation < -1.89')
        page.wait_for_function('nebeljagdTestState().pickups.filter(p=>p.type==="gold" && !p.collected && p.flight===0).length===2')
        opened = state()
        coins = [p for p in opened['pickups'] if p['type']=='gold']
        assert all(c['coin']['model']=='symmetric-gold-coin' and .49<c['coin']['diameter']<.52 and c['coin']['emblem']=='wizard-hat' and c['coin']['emblemSides']==2 for c in coins), coins
        rotation = coins[0]['coin']['rotation']
        page.wait_for_function('r=>nebeljagdTestState().pickups.find(p=>p.type==="gold").coin.rotation<r-.12', arg=rotation)
        drop = next(d for d in opened['weaponDrops'] if d['id'].endswith('-weapon'))
        assert drop['model']=='tripo' and drop['variant']=='kit-tripo-sword' and drop['rarity'] in tiers
        page.keyboard.press('Escape')
        paused = [p['coin']['rotation'] for p in state()['pickups'] if p['type']=='gold']
        page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        assert [p['coin']['rotation'] for p in state()['pickups'] if p['type']=='gold']==paused
        page.evaluate('nebeljagdInspectCamera({zoom:2.2})')
        (OUT/'open-chest.png').write_bytes(base64.b64decode(page.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
        (OUT/'gold-coins.json').write_text(json.dumps(state()['pickups'],indent=2))
        page.keyboard.press('Escape')
        for coin in coins:
            page.evaluate('p=>nebeljagdInspect({x:p.x,z:p.z})', coin)
            page.wait_for_function('id=>nebeljagdTestState().pickups.find(p=>p.id===id).collected', arg=coin['id'])
        assert state()['gold']==sum(c['amount'] for c in coins)
        expect(page.locator('#goldCount')).to_have_text(str(state()['gold']))
        checks.append('Real chest drops two small symmetric wizard-hat gold coins: slow clockwise turn, pause freezes rotation, collection awards exact gold')
        page.evaluate('p=>nebeljagdInspect({x:p.x,z:p.z})', drop)
        page.wait_for_function('nebeljagdTestState().equippedItem?.type==="sword"')
        equipped = state()['equippedItem']
        assert equipped['variant']=='kit-tripo-sword' and equipped['rarity']==drop['rarity']
        assert equipped['damage']=={'common':27,'uncommon':34,'rare':43,'epic':51,'legendary':58}[drop['rarity']]
        expect(page.locator('#weaponStatus')).to_have_attribute('data-rarity', drop['rarity'])
        page.evaluate('nebeljagdInspect({x:-5,z:3})')
        page.wait_for_function('nebeljagdTestState().nearWeapon==="sword"')
        page.locator('#pickupBtn').tap()
        page.wait_for_function('nebeljagdTestState().equippedItem?.id==="old-sword"')
        assert state()['equippedItem']['rarity']==old['rarity']
        checks.append('Real chest GLB: textured floor/walls/lid; new sword drop; keyboard opening and touch swap preserve tier/damage')
        page.keyboard.press('Escape'); page.locator('#restartBtn').click()
        fresh = state()
        assert not fresh['chests'][0]['opened'] and fresh['equippedItem'] is None
        assert fresh['gold']==0 and not fresh['pickups']
        assert len(fresh['weaponDrops'])==17 and fresh['world']['objects']==fixture['objects']
        assert [d['rarity'] for d in fresh['weaponDrops']] != [d['rarity'] for d in initial['weaponDrops']]
        assert [[d['x'],d['z']] for d in fresh['weaponDrops']]==[[d['x'],d['z']] for d in initial['weaponDrops']]
        checks.append('Restart rerolls tiers, restores exact locations and removes chest drops')
        page.close()
        editor = context.new_page(); editor.set_default_timeout(120000)
        editor.on('pageerror', lambda e: errors.append(str(e)))
        editor.goto(URL+'/map-editor.html', wait_until='domcontentloaded')
        editor.wait_for_function('window.nebeljagdMapTestState')
        assert editor.title().startswith('Magebrawl')
        before = editor.evaluate('nebeljagdMapTestState().map')
        editor.locator('#editor-tab-objects').click(); editor.locator('#editor-tool-objects-place').click()
        editor.locator('#palette-kind').select_option('sword')
        assert editor.locator('#palette-variant').input_value()=='kit-tripo-sword'
        assert editor.locator('#palette-variant option[value="steel"]').count()==0
        expect(editor.locator('#palette-rarity')).to_contain_text('Zufällig je Runde')
        editor.locator('#add-object-center').click()
        expect(editor.locator('#object-rarity-hint')).to_contain_text('27–58 Schaden')
        after = editor.evaluate('nebeljagdMapTestState().map')
        assert after['objects'][:-1]==before['objects']
        assert {k:v for k,v in before.items() if k!='objects'}=={k:v for k,v in after.items() if k!='objects'}
        checks.append('Generated editor offers only new sword, explains random tiers/damage and preserves all existing map content')
        assert not errors, errors
        assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==source_hash
        print(json.dumps({'status':'passed','checks':checks,'errors':errors}, ensure_ascii=False, indent=2), flush=True)
    finally:
        browser.close()
        (OUT/'report.json').write_text(json.dumps({'checks':checks,'errors':errors}, ensure_ascii=False, indent=2))
