"""Isolated real-WebGL vegetation preview, seven presets and resource disposal.
Run against Vite; NEBELJAGD_URL defaults to http://127.0.0.1:5173.
"""
from pathlib import Path
import json, os, re, urllib.request
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
URL=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5173').rstrip('/')
source=urllib.request.urlopen(URL+'/src/world-object-renderer.js').read().decode()
three_url=re.search(r'import \* as THREE from "([^"]+)"',source).group(1)
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':800,'height':600});page.set_default_timeout(120000)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.route('**/qa-wind',lambda route:route.fulfill(status=200,content_type='text/html',body='<html><body style="margin:0;background:#1e3025"></body></html>'))
 page.goto(URL+'/qa-wind')
 report=page.evaluate('''async threeURL=>{
  const THREE=await import(threeURL);
  const {createWorldObjectRenderer}=await import('/src/world-object-renderer.js');
  const {VEGETATION_TYPES}=await import('/src/map/landscape.js');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(800,600);document.body.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#304535');
  scene.add(new THREE.HemisphereLight('#e5efe4','#30452a',2));const sun=new THREE.DirectionalLight('#fff5d9',2.2);sun.position.set(-5,8,4);scene.add(sun);
  const camera=new THREE.PerspectiveCamera(40,800/600,.1,100);camera.position.set(8,9,10);camera.lookAt(0,1,0);
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(22,22),new THREE.MeshStandardMaterial({color:'#527849'}));plane.rotation.x=-Math.PI/2;scene.add(plane);
  const results=[];let latest;
  for(const type of VEGETATION_TYPES){
   latest?.dispose();const object={id:'preview-grass',kind:'grass',variant:type.variant,position:[0,0],radius:3.5,scale:1,rotation:.7,vegetation:{...type.settings,groundColor:true,groundBlend:.6}};
   const map={objects:[object],landscape:{version:1,wind:{enabled:true,strength:1,speed:1,direction:1.1,gusts:true,gustStrength:1,gustFrequency:.3,turbulence:.4},windZones:[]}};
   latest=await createWorldObjectRenderer(scene,{map,heightAt:()=>0,colorAt:(x,z,c)=>c.set('#657f46'),quality:'high',previewOnly:true});
   latest.update(0,0);renderer.render(scene,camera);const before=renderer.domElement.toDataURL();
   latest.update(1,5);renderer.render(scene,camera);const after=renderer.domElement.toDataURL();
   if(before===after)throw new Error('No actual GPU animation for '+type.id);
   results.push({type:type.id,stats:latest.stats,patch:latest.grassPatches[0],animatedPixels:true,memory:{...renderer.info.memory}});
  }
  window.qaCapture=renderer.domElement.toDataURL();
  latest.wind.configure({landscape:{version:1,wind:{enabled:false}}});latest.update(0,0);renderer.render(scene,camera);const still=renderer.domElement.toDataURL();latest.update(1,10);renderer.render(scene,camera);
  const disabledReallyStill=still===renderer.domElement.toDataURL();if(!disabledReallyStill)throw new Error('Disabled wind still animates');
  latest.dispose();renderer.render(scene,camera);const memoryAfterDispose={...renderer.info.memory};
  if(memoryAfterDispose.geometries>1)throw new Error('Preview geometry leak '+JSON.stringify(memoryAfterDispose));
  return {presets:results,disabledReallyStill,memoryAfterDispose};
 }''',three_url)
 assert not errors,errors
 import base64
 path=ROOT/'docs/screenshots/vegetation-wind-preview.png';path.parent.mkdir(parents=True,exist_ok=True)
 path.write_bytes(base64.b64decode(page.evaluate('qaCapture').split(',')[1]))
 browser.close()
report.update(status='passed',errors=errors,url=URL)
(ROOT/'docs/vegetation-render-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'passed','presets':len(report['presets']),'disabledReallyStill':report['disabledReallyStill'],'memoryAfterDispose':report['memoryAfterDispose'],'errors':errors}))
