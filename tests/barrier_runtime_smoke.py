"""Exercise drawn barriers through the real GLB renderer and collision systems.

Run against Vite dev: NEBELJAGD_URL=http://127.0.0.1:5193 python tests/barrier_runtime_smoke.py
The document stays canonical; only the renderer expands paths into instances.
"""
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5193').rstrip('/')
OUT = Path('test-results/barriers')
OUT.mkdir(parents=True, exist_ok=True)
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
        args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1000, 'height': 700}, device_scale_factor=1)
    page.set_default_timeout(90000)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    page.route('**/barrier-runtime-test.html', lambda route: route.fulfill(
        content_type='text/html', body='<!doctype html><title>Barrier runtime check</title><body style="margin:0"></body>'))
    page.goto(f'{URL}/barrier-runtime-test.html')
    result = page.evaluate('''async () => {
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const {createWorldObjectRenderer} = await import('/src/world-object-renderer.js');
      const {createSightModel} = await import('/src/visibility-model.js');
      const map = await fetch('/worldmap.json').then(r => r.json());
      map.objects = [{id:'legacy-wall', name:'Existing single wall', kind:'wall', variant:'kit-stone',
        position:[25,0], rotation:0, scale:1, barrierId:'untrusted-extra', longitudinalScale:9}];
      map.barriers = [
        {id:'test-wall', name:'Wall with corner and passage', kind:'wall', variant:'kit-stone', scale:1,
          points:[[-12,0],[12,0],[12,12]], gaps:[{at:12,width:3}]},
        {id:'test-fence', name:'Fence with passage', kind:'fence', variant:'kit-wood', scale:1,
          points:[[-12,9],[5,9]], gaps:[{at:8.5,width:3}]},
        {id:'test-diagonal', name:'Scaled diagonal wall', kind:'wall', variant:'kit-stone', scale:1.5,
          points:[[-12,-14],[12,-6]], gaps:[{at:Math.hypot(24,8)/2,width:3}]},
      ];
      const before = JSON.stringify(map), scene = new THREE.Scene(), group = new THREE.Group();
      scene.add(group);
      const objects = await createWorldObjectRenderer(group, {map, heightAt:()=>0, quality:'low'});
      const positions = [
        ['wall-solid',-6,0], ['wall-gap',0,0], ['wall-corner-arm',12,6],
        ['fence-solid',-8,9], ['fence-gap',-3.5,9],
        ['diagonal-solid',-6,-12], ['diagonal-gap',0,-10],
      ].map(([name,x,z]) => {
        const position={x,y:0,z}; objects.resolveMovement(position,.42);
        return {name,input:[x,z],output:[position.x,position.z],moved:Math.hypot(position.x-x,position.z-z)};
      });
      const sight=createSightModel({obstacles:objects.projectileObstacles,radius:50});
      function crossing(x,z,dx,dz) {
        const start={x:x-dx,y:.8,z:z-dz},end={x:x+dx,y:.8,z:z+dz};
        const hit=objects.traceProjectile(start,end);
        sight.update({...start,y:0});
        return {hit:hit?.collider?.objectId??null,visible:sight.isVisible(end)};
      }
      const crossings={wall:crossing(-6,0,0,2),gap:crossing(0,0,0,2),
        fence:crossing(-8,9,0,2),fenceGap:crossing(-3.5,9,0,2),
        diagonal:crossing(-6,-12,-.7,2.1),diagonalGap:crossing(0,-10,-.7,2.1)};
      const legacy=objects.projectileObstacles.find(body=>body.objectId==='legacy-wall');
      const solidHeights=[...new Set(objects.projectileObstacles.map(body=>Number(body.maxY.toFixed(4))))];
      const renderer = new THREE.WebGLRenderer({antialias:true});
      renderer.setSize(1000,700); renderer.setClearColor('#dbe4d5');
      document.body.append(renderer.domElement);
      scene.add(new THREE.HemisphereLight(0xffffff,0x485a43,2.3));
      const sun=new THREE.DirectionalLight(0xfff0d0,2.2);sun.position.set(-10,30,20);scene.add(sun);
      const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#6f865b',roughness:1}));
      ground.rotation.x=-Math.PI/2;ground.position.y=-.03;scene.add(ground);
      const camera=new THREE.OrthographicCamera(-27,27,18.9,-18.9,.1,200);
      camera.position.set(14,50,35);camera.lookAt(5,0,-2);
      objects.update(0,1,new THREE.Vector3(5,0,0)); renderer.render(scene,camera);
      const result={sourceUnchanged:before===JSON.stringify(map),stats:objects.stats,positions,crossings,
        legacyWidth:legacy.maxX-legacy.minX,solidHeights,calls:renderer.info.render.calls,
        triangles:renderer.info.render.triangles,obstacleCount:objects.projectileObstacles.length};
      return result;
    }''')
    assert result['sourceUnchanged'], 'Runtime must not bake its instances into the editable document'
    stats = result['stats']
    assert stats['barrierCount'] == 3 and stats['barrierSegmentCount'] > 10, stats
    assert stats['authoredObjectCount'] == 1, stats
    assert stats['totalObjects'] == stats['barrierSegmentCount'] + 1, stats
    assert result['obstacleCount'] == stats['totalObjects'], result
    for position in result['positions']:
        if 'gap' in position['name']:
            assert position['moved'] < 1e-7, position
        else:
            assert position['moved'] > .4, position
    for name, crossing in result['crossings'].items():
        if 'gap' in name.lower():
            assert crossing['hit'] is None and crossing['visible'], (name, crossing)
        else:
            assert crossing['hit'] is not None and not crossing['visible'], (name, crossing)
    assert 3.70 < result['legacyWidth'] < 3.72, result['legacyWidth']
    assert result['calls'] > 0 and result['triangles'] > 0, result
    assert not errors, errors
    page.screenshot(path=str(OUT/'runtime.png'))
    (OUT/'runtime-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    browser.close()
print('PASS: GLB rendering, canonical paths, unchanged legacy objects, solid collision and open passages, projectiles and sight for wall/fence/diagonal lines.')
