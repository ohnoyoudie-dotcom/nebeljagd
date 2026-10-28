/* Editor changes use J(), preserving undo, drafts and JSON/playtest handoff. */
function reiEditorSync() {
  const panel=document.getElementById('rei-ground-panel');if(!panel)return;
  const s=reiGroundSettings(M);
  for(const key of ['type','height','density','color','groundBlend','scope','windStrength','windSpeed','windDirection']) {const node=document.getElementById('rei-'+key);if(node)node.value=s[key];}
  document.getElementById('rei-windEnabled').checked=s.windEnabled;
  for(const node of panel.querySelectorAll('[data-rei-dependent]'))node.disabled=s.type!=='rei-grass';
  document.getElementById('rei-ground-status').textContent=s.type==='rei-grass'?'Rei-Wiese aktiv · Wind im 3D-Spiel':'Bisheriger Boden · Rei-Wiese ist noch aus';
  const regionSelect=document.getElementById('rei-region-ground');
  if(regionSelect)regionSelect.value=N?.type==='region'?(W()?.groundCover||'inherit'):'inherit';
  reiEditorLabels();
}
function reiEditorLabels(){
  const format={height:v=>Number(v).toFixed(2)+' m',density:v=>Number(v).toFixed(1)+' / m²',groundBlend:v=>Math.round(v*100)+' %',windStrength:v=>Math.round(v*100)+' %',windSpeed:v=>Number(v).toFixed(1)+'×',windDirection:v=>v+'°'};
  for(const [key,fn]of Object.entries(format)){const output=document.getElementById('rei-'+key+'-value');if(output)output.textContent=fn(document.getElementById('rei-'+key).value);}
}
function reiPaintMap(svg,map) {
  const settings=reiGroundSettings(map),ns='http://www.w3.org/2000/svg';
  svg.querySelectorAll('[data-rei-ground-overlay]').forEach(e=>e.remove());
  if(!svg.querySelector('#rei-grass-pattern')) {
    const pattern=document.createElementNS(ns,'pattern');pattern.id='rei-grass-pattern';pattern.setAttribute('width','23');pattern.setAttribute('height','19');pattern.setAttribute('patternUnits','userSpaceOnUse');
    const path=document.createElementNS(ns,'path');path.setAttribute('d','M4 15 Q4 10 1 8 M4 15 Q7 10 8 5 M4 15 Q4 8 3 6 M16 7 Q14 3 13 2 M16 7 Q18 2 20 1');path.setAttribute('fill','none');path.setAttribute('stroke','#d4ec9e');path.setAttribute('stroke-opacity','.48');path.setAttribute('stroke-width','1.4');pattern.append(path);svg.querySelector('defs').append(pattern);
  }
  for(const region of map.regions) {
    const group=svg.querySelector('[data-feature-type="region"][data-feature-id="'+CSS.escape(region.id)+'"]');
    if(!group)continue;const polygon=group.querySelector('polygon');if(!polygon)continue;
    if(!polygon.dataset.reiBaseFill)polygon.dataset.reiBaseFill=polygon.getAttribute('fill');
    polygon.setAttribute('fill',reiRegionHasGrass(map,region,settings)?settings.color:polygon.dataset.reiBaseFill);
    if(!reiRegionHasGrass(map,region,settings))continue;
    const overlay=document.createElementNS(ns,'polygon');overlay.setAttribute('points',polygon.getAttribute('points'));overlay.setAttribute('fill','url(#rei-grass-pattern)');overlay.setAttribute('pointer-events','none');overlay.setAttribute('data-rei-ground-overlay','true');group.append(overlay);
  }
}
function reiEditorMount(){
  if(!document.getElementById('rei-ground-panel')){
    const panel=document.createElement('section');panel.className='tool-section rei-ground-panel';panel.id='rei-ground-panel';
    panel.innerHTML=`<div class="section-heading"><h2>Untergrund</h2><span class="count-badge">DICHTE WIESE</span></div>
      <label for="rei-type">Bodenstil</label><select id="rei-type"><option value="existing">Bisheriger Boden</option><option value="rei-grass">Dichte Rei-Wiese · mit Wind</option></select>
      <canvas id="rei-ground-preview" width="320" height="120" aria-label="Schematische Grasvorschau – das 3D-Spiel zeigt die echte Wiese"></canvas>
      <p id="rei-ground-status" class="small-note" role="status"></p>
      <details open><summary>Wiese einstellen</summary>
      <label for="rei-scope">Gras automatisch verteilen</label><select id="rei-scope" data-rei-dependent><option value="green">Wiese, Wald, Heide und Moor</option><option value="all">Alle Landregionen</option></select>
      <label for="rei-height">Grashöhe <output id="rei-height-value"></output></label><input id="rei-height" type="range" min="0.15" max="2" step="0.05" data-rei-dependent>
      <label for="rei-density">Dichte <output id="rei-density-value"></output></label><input id="rei-density" type="range" min="2" max="18" step="0.5" data-rei-dependent>
      <label for="rei-color">Grasfarbe</label><input id="rei-color" type="color" data-rei-dependent>
      <label for="rei-groundBlend">Bodenfarbe übernehmen <output id="rei-groundBlend-value"></output></label><input id="rei-groundBlend" type="range" min="0" max="1" step="0.05" data-rei-dependent>
      </details><details><summary>Wind</summary>
      <label class="rei-check"><input id="rei-windEnabled" type="checkbox" data-rei-dependent> Wind aktivieren</label>
      <label for="rei-windStrength">Windstärke <output id="rei-windStrength-value"></output></label><input id="rei-windStrength" type="range" min="0" max="1" step="0.05" data-rei-dependent>
      <label for="rei-windSpeed">Geschwindigkeit <output id="rei-windSpeed-value"></output></label><input id="rei-windSpeed" type="range" min="0.1" max="3" step="0.1" data-rei-dependent>
      <label for="rei-windDirection">Richtung <output id="rei-windDirection-value"></output></label><input id="rei-windDirection" type="range" min="0" max="360" step="5" data-rei-dependent>
      </details><p class="small-note">Bodenschicht, kein platzierbares Objekt. Wege, Wasser und Hausflächen bleiben frei. Bewegung siehst du über „In 3D testen“. Hohes Versteckgras bleibt ein eigenes Werkzeug.</p>`;
    document.querySelector('.object-palette').before(panel);
  }
  if(!document.getElementById('rei-ground-style')){
    const style=document.createElement('style');style.id='rei-ground-style';style.textContent=`.rei-ground-panel{background:#e9efdf}.rei-ground-panel label{display:block;font-size:10px;margin:12px 0 6px;color:#516348}.rei-ground-panel input[type=range]{width:100%;accent-color:#5d803f}.rei-ground-panel input[type=color]{width:100%;height:28px;border:1px solid #b7c5a6;border-radius:4px}.rei-ground-panel output{float:right;color:#365d2a}.rei-ground-panel details{margin-top:10px}.rei-ground-panel summary{cursor:pointer;font-size:11px;color:#3e5934;font-weight:600;padding:5px 0}.rei-ground-panel .rei-check{display:flex;align-items:center;gap:8px}#rei-ground-preview{width:100%;height:80px;margin-top:10px;border:1px solid #b9c9a6;border-radius:5px;display:block}.rei-ground-panel input:disabled{opacity:.45}`;document.head.append(style);
  }
  const regionProps=document.getElementById('region-properties');
  if(!document.getElementById('rei-region-ground'))regionProps.insertAdjacentHTML('beforeend',`<label for="rei-region-ground">Gras-Untergrund dieser Region</label><select id="rei-region-ground"><option value="inherit">Globale Bodeneinstellung</option><option value="rei-grass">Rei-Wiese verwenden</option><option value="none">Kein Bodengras</option></select><p class="small-note">Rei-Wiese muss links unter „Untergrund“ eingeschaltet sein.</p>`);
  for(const key of ['type','height','density','color','groundBlend','scope','windStrength','windSpeed','windDirection','windEnabled']){
    const node=document.getElementById('rei-'+key);node.addEventListener('input',reiEditorLabels);
    node.addEventListener('change',()=>{
      const value=key==='windEnabled'?node.checked:['height','density','groundBlend','windStrength','windSpeed','windDirection'].includes(key)?Number(node.value):node.value;
      J(map=>{map.groundCover={...reiGroundSettings(map),[key]:value};},key==='type'?(value==='rei-grass'?'Rei-Wiese als Untergrund aktiviert. Mit „In 3D testen“ ansehen.':'Bisherigen Boden wiederhergestellt.'):undefined);
    });
  }
  document.getElementById('rei-region-ground').addEventListener('change',event=>{
    if(N?.type!=='region')return;const id=N.id,value=event.target.value;
    J(map=>{const region=map.regions.find(r=>r.id===id);if(region){if(value==='inherit')delete region.groundCover;else region.groundCover=value;}},'Gras-Untergrund der Region gespeichert.');
  });
  reiEditorSync();reiPaintMap(document.querySelector('#map-stage svg'),M);
  const image=new Image();image.src=REI_GRASS_MASK_DATA;
  image.onload=()=>{
    const canvas=document.getElementById('rei-ground-preview'),ctx=canvas.getContext('2d'),tinted=document.createElement('canvas');tinted.width=tinted.height=256;const tctx=tinted.getContext('2d');
    tctx.drawImage(image,0,0,256,256);const pixels=tctx.getImageData(0,0,256,256);for(let i=0;i<pixels.data.length;i+=4)pixels.data[i+3]=pixels.data[i];tctx.putImageData(pixels,0,0);
    let last=0;function draw(now){
      requestAnimationFrame(draw);if(document.hidden||now-last<60)return;last=now;
      const s=reiGroundSettings(M),enabled=s.type==='rei-grass';ctx.fillStyle=enabled?s.color:'#899a70';ctx.fillRect(0,0,320,120);
      if(!enabled){ctx.fillStyle='#edf2e6';ctx.font='13px Segoe UI';ctx.fillText('Rei-Wiese oben auswählen',70,67);return;}
      const colored=document.createElement('canvas');colored.width=colored.height=256;const cctx=colored.getContext('2d');cctx.drawImage(tinted,0,0);cctx.globalCompositeOperation='source-in';const gradient=cctx.createLinearGradient(0,0,0,256);gradient.addColorStop(0,'#b9d767');gradient.addColorStop(.5,s.color);gradient.addColorStop(1,'#547b3e');cctx.fillStyle=gradient;cctx.fillRect(0,0,256,256);
      for(let i=0;i<130;i++){const x=(i*67)%354-17,y=55+Math.floor(i/16)*22,h=(29+(i*11)%29)*(s.height/.85)**.45,w=38;const bend=s.windEnabled?Math.sin(now*.0017*s.windSpeed+x*.017)*s.windStrength*.22:0;ctx.save();ctx.translate(x,y);ctx.transform(1,0,bend,1,0,0);ctx.drawImage(colored,(i%2)*128,Math.floor(i%4/2)*128,128,128,-w/2,-h,w,h);ctx.restore();}
    }requestAnimationFrame(draw);
  };
}
