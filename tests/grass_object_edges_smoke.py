"""Compare the real grass carpet at the Tripo tavern's foundation edge.

Run against Vite dev, e.g. NEBELJAGD_URL=http://127.0.0.1:5193 python tests/grass_object_edges_smoke.py.
The pinned before-source is only used for the comparison image; current modules
must also pass direct instance-position assertions. No production data is edited.
"""
from pathlib import Path
import json
import os
import shutil
import subprocess

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/grass-object-edges'
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5193').rstrip('/')
BASELINE_REF = os.environ.get('NEBELJAGD_GRASS_BASELINE_REF', '47a4568')
baseline = subprocess.check_output(['git', 'show', f'{BASELINE_REF}:src/meadow-ground.js'], cwd=ROOT, text=True)
baseline = baseline.replace("from 'three'", "from '/node_modules/.vite/deps/three.js'")
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),
        headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1100, 'height': 850}, device_scale_factor=1)
    page.set_default_timeout(120000)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    page.route('**/grass-object-edges.html', lambda route: route.fulfill(content_type='text/html',
        body='<!doctype html><title>Grass foundation edge comparison</title><body style="margin:0"></body>'))
    page.route('**/src/grass-edge-baseline.js', lambda route: route.fulfill(content_type='text/javascript', body=baseline))
    page.goto(URL + '/grass-object-edges.html')
    page.evaluate('''async () => {
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const {createWorldObjectRenderer} = await import('/src/world-object-renderer.js');
      const current = await import('/src/meadow-ground.js');
      const before = await import('/src/grass-edge-baseline.js');
      const {getEnvironmentKitDefinition} = await import('/src/map/environment-kit-definitions.js');
      const map = await fetch('/worldmap.json').then(response => response.json());
      map.objects = [{id:'edge-tavern',name:'Edge comparison tavern',kind:'house',variant:'kit-tripo-tavern',
        position:[0,0],rotation:0,scale:1}];
      map.barriers=[]; map.paths=[]; map.rivers=[]; delete map.landscape;
      map.groundCover={type:'rei-grass',height:.82,density:8.8,windEnabled:false};
      const sourceSnapshot=JSON.stringify(map), scene=new THREE.Scene(), root=new THREE.Group();
      scene.add(root); scene.background=new THREE.Color('#345c32');
      const groundColor = new THREE.Color('#3e7435');
      const colorAt = (x,z,target) => target.copy(groundColor);
      const objects = await createWorldObjectRenderer(root,{map,heightAt:()=>0,colorAt,quality:'high'});
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:groundColor,roughness:1}));
      ground.rotation.x=-Math.PI/2; ground.position.y=-.04;scene.add(ground);
      scene.add(new THREE.HemisphereLight('#e4e8db','#37542a',2));
      const sun=new THREE.DirectionalLight('#ffe9c4',2.3);sun.position.set(-15,30,20);scene.add(sun);
      const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
      renderer.setSize(1100,850);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
      document.body.append(renderer.domElement);
      const camera=new THREE.OrthographicCamera(-6.8,6.8,6.8*850/1100,-6.8*850/1100,.1,150);
      camera.position.set(-9.8,25,16);camera.lookAt(-9.8,0,6.4);
      const player=new THREE.Vector3(-13,0,10);
      objects.update(0,1,player);
      const spatial={isLand:(x,z)=>Math.abs(x)<23&&Math.abs(z)<20,isWater:()=>false,
        regionAt:()=>({biome:'meadow'}),biomeWeightsAt:()=>[{biome:'meadow',weight:1}]};
      let meadow=null;
      const kit=getEnvironmentKitDefinition('house','kit-tripo-tavern');
      window.renderGrassEdge = useBefore => {
        meadow?.dispose();
        const module=useBefore?before:current;
        meadow=module.createMeadowGround(root,{map,heightAt:()=>0,colorAt,spatial,quality:'high'});
        for(let i=0;i<80;i++)meadow.update(1,player);
        const carpet=root.getObjectByName('Nebeljagd · dichte animierte Wiese');
        let roots=0,interiorRoots=0,leftStrip=0,frontStrip=0,nearLeft=Infinity,nearFront=Infinity;
        const matrix=new THREE.Matrix4();
        carpet.traverse(mesh=>{
          if(!mesh.isInstancedMesh||!mesh.name.startsWith('Dichte Wiese '))return;
          for(let i=0;i<mesh.count;i++){
            mesh.getMatrixAt(i,matrix);const x=matrix.elements[12],z=matrix.elements[14];roots++;
            if(Math.abs(x)<kit.footprint.halfWidth&&Math.abs(z)<kit.footprint.halfDepth)interiorRoots++;
            if(z>-7&&z<7&&x<-kit.footprint.halfWidth){
              nearLeft=Math.min(nearLeft,-kit.footprint.halfWidth-x);
              if(x>-11.65)leftStrip++;
            }
            if(x>-9&&x<9&&z>kit.footprint.halfDepth){
              nearFront=Math.min(nearFront,z-kit.footprint.halfDepth);
              if(z<9.55)frontStrip++;
            }
          }
        });
        renderer.render(scene,camera);
        return {roots,interiorRoots,leftStrip,frontStrip,nearLeft,nearFront,
          sourceUnchanged:JSON.stringify(map)===sourceSnapshot,meadow:meadow.inspect(),
          loadedGLBs:objects.stats.loadedGLBs,renderCalls:renderer.info.render.calls,
          triangles:renderer.info.render.triangles};
      };
    }''')
    before = page.evaluate('renderGrassEdge(true)')
    page.screenshot(path=str(OUT / 'before.png'))
    after = page.evaluate('renderGrassEdge(false)')
    page.screenshot(path=str(OUT / 'after.png'))
    assert before['leftStrip'] == 0 and before['frontStrip'] == 0, before
    assert after['leftStrip'] > 40 and after['frontStrip'] > 40, after
    assert before['nearLeft'] > .7 and before['nearFront'] > .7, before
    assert after['nearLeft'] < .08 and after['nearFront'] < .08, after
    for result in [before, after]:
        assert result['interiorRoots'] == 0, result
        assert result['sourceUnchanged'] and result['loadedGLBs'] > 0 and result['renderCalls'] > 0, result
        assert result['meadow']['pendingChunks'] == 0, result
    assert not errors, errors
    report={'status':'passed','baselineCommit':BASELINE_REF,'url':URL,'before':before,'after':after,
      'errors':errors,'screenshots':['before.png','after.png'],
      'limits':'Deterministic Chromium/SwiftShader close-up with actual Tripo tavern and runtime grass. No physical-device performance claim.'}
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    browser.close()
print('PASS: automatic grass reaches the measured tavern edge, the former clearance strips contain grass, and interior roots remain absent.')
