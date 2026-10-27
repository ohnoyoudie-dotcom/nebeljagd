import { VEGETATION_TYPES, TERRAIN_TYPES, BIOME_PRESETS, WIND_DEFAULTS, getLandscape, ensureLandscape, vegetationSettings, terrainSettings, biomePreset } from './landscape.js';
import { OBJECT_CATALOG } from './objects.js';
import { createVegetationStroke, createTerrainStroke, createScatterStroke, createBiomeStroke } from './landscape-brush.js';
import { createLandscapePreview } from './landscape-preview.js';

const $ = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
const num = id => Number($(id).value);
const pct = id => num(id) / 100;
const radians = id => num(id) * Math.PI / 180;
const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const options = items => items.map(item => `<option value="${item.id}">${item.label}</option>`).join('');
const range = (id, label, min, max, value, step = 1, unit = '%') => `<label class="landscape-range" for="${id}">${label}<output id="${id}-value">${value}${unit}</output></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-unit="${unit}">`;
const check = (id, label, checked = false) => `<label class="landscape-check"><input type="checkbox" id="${id}"${checked ? ' checked' : ''}>${label}</label>`;
const button = (id, label) => `<button type="button" class="button landscape-tool" id="${id}" aria-pressed="false">${label}</button>`;
const selector = (id, label, items) => `<label for="${id}">${label}</label><select id="${id}">${options(items)}</select>`;
const vegetationFields = prefix => `${selector(`${prefix}-type`, 'Vegetationstyp', VEGETATION_TYPES)}
${range(`${prefix}-height`, 'Grashöhe', 25, 300, 100)}${range(`${prefix}-height-variation`, 'Höhenvariation', 0, 50, 12)}
${range(`${prefix}-density`, 'Dichte', 0, 100, 100)}${range(`${prefix}-edge`, 'Weicher, unregelmäßiger Rand', 0, 100, 30)}
${check(`${prefix}-ground`, 'Bodenfarbe übernehmen')}${range(`${prefix}-ground-blend`, 'Farbübergang zum Boden', 0, 100, 55)}
<label for="${prefix}-color">Eigene Grasfarbe</label><input id="${prefix}-color" type="color" value="#799754">
${range(`${prefix}-brightness`, 'Helligkeit', 25, 200, 100)}${range(`${prefix}-saturation`, 'Sättigung', 0, 200, 100)}${range(`${prefix}-color-variation`, 'Farbvariation je Büschel', 0, 100, 14)}`;

/** Existing editor integration: these controls mutate only through commit(),
 * sharing its validation, undo stack, import/export and local draft storage. */
export function createLandscapePanel(api) {
  const sidebar = document.querySelector('.sidebar');
  // A saved standalone HTML may already contain the mounted controls. Remove
  // their old DOM before rebuilding; event handlers and preview are recreated.
  for (const element of sidebar.querySelectorAll('[data-landscape-generated]')) element.remove();
  for (const section of sidebar.querySelectorAll('.landscape-section')) {
    while (section.firstElementChild) {
      const child = section.firstElementChild;
      if (child.tagName === 'SUMMARY') child.remove(); else sidebar.insertBefore(child, section);
    }
    section.remove();
  }
  const oldGrass = sidebar.querySelector('.grass-brush-section');
  oldGrass.querySelector('h2').textContent = 'Vegetation malen';
  oldGrass.querySelector('.small-note').textContent = 'Ziehen malt einzelne Büschel oder Flächen. Höhe und Dichte lassen sich später für jede Fläche ändern.';
  $('brush-radius').min = '.5'; $('brush-radius').max = '20';
  const sections = {};
  for (const [key, label] of [['terrain', 'Gelände'], ['vegetation', 'Vegetation'], ['objects', 'Objekte'], ['wind', 'Wind und Umgebung'], ['biomes', 'Biome'], ['map', 'Karte und Vorschau']]) {
    const details = document.createElement('details'); details.className = 'landscape-section'; details.id = `landscape-section-${key}`; details.open = true;
    const summary = document.createElement('summary'); summary.textContent = label; details.append(summary); sidebar.append(details); sections[key] = details;
  }
  const move = (selector, key) => { const element = sidebar.querySelector(selector); if (element) sections[key].append(element); };
  move('.grass-brush-section', 'vegetation'); move('.object-palette', 'objects'); move('.eraser-section', 'objects'); move('.objects-section', 'objects');
  move('.layer-section', 'map'); move('.project-actions', 'map');
  const editTools = [...sidebar.querySelectorAll(':scope > .tool-section')].find(section => section.querySelector('#tool-select'));
  if (editTools) sidebar.insertBefore(editTools, sections.terrain);
  const nav = document.createElement('nav'); nav.className = 'landscape-nav'; nav.dataset.landscapeGenerated = 'true'; nav.setAttribute('aria-label', 'Editorbereiche');
  for (const [key, details] of Object.entries(sections)) { const link=document.createElement('button');link.type='button';link.textContent=details.querySelector('summary').textContent;link.addEventListener('click',()=>{details.open=true;details.scrollIntoView({block:'start',behavior:'instant'});if(getComputedStyle(sidebar).overflowY==='auto')sidebar.scrollTop-=nav.offsetHeight;});nav.append(link); }
  sidebar.insertBefore(nav, editTools ?? sections.terrain);
  const mount = (key, html, className = '') => {
    const section = document.createElement('section'); section.className = `tool-section landscape-controls ${className}`; section.dataset.landscapeGenerated = 'true'; section.innerHTML = html; sections[key].append(section); return section;
  };
  const vegetation = mount('vegetation', `${vegetationFields('vegetation')}${range('vegetation-strength', 'Pinselstärke', 0, 100, 100)}<p class="small-note">100 % Höhe entspricht dem gewählten Typ. Wurzeln bleiben am Boden; Farbe verändert keine Texturtransparenz.</p>`);
  $('vegetation-type').value = 'tall';
  mount('terrain', `${selector('terrain-type', 'Bodenart', TERRAIN_TYPES)}${button('landscape-terrain-brush', 'Boden malen')}${range('terrain-radius', 'Pinselradius', .5, 80, 8, .5, ' m')}${range('terrain-strength', 'Pinselstärke', 0, 100, 80)}${range('terrain-hardness', 'Randhärte', 0, 100, 30)}<label for="terrain-color">Bodenfarbe</label><input id="terrain-color" type="color" value="#4e854b">${range('terrain-variation', 'Farbvariation', 0, 100, 18)}${button('landscape-terrain-erase', 'Bodenfarbe radieren')}<p class="small-note">0 % Randhärte erzeugt weiche Übergänge. Bodenflächen bleiben in der Kartenliste auswählbar und verschiebbar. Der Bodenradierer entfernt ganze gemalte Flächen, deren Mittelpunkt berührt wird.</p>`);
  const scatterKinds = OBJECT_CATALOG.filter(item => ['tree', 'bush', 'grass', 'rock', 'flower'].includes(item.kind));
  mount('objects', `<h3>Natürlich verteilen</h3><p class="small-note">Modelle auswählen und über die Karte ziehen. Wege, Gewässer, Gebäude, Startbereiche und bestehende Hindernisse werden berücksichtigt.</p>${scatterKinds.map(item => `<div class="scatter-model"><label class="landscape-check"><input type="checkbox" id="scatter-${item.kind}"${['tree','bush'].includes(item.kind) ? ' checked' : ''}>${item.label}</label><select id="scatter-variant-${item.kind}" aria-label="${item.label}: Modell">${options(item.variants)}</select></div>`).join('')}${button('landscape-scatter-brush', 'Objekte verteilen')}${range('scatter-radius', 'Pinselradius', .5, 20, 12, .5, ' m')}${range('scatter-density', 'Objektdichte', 0, 100, 35)}${range('scatter-strength', 'Pinselstärke', 0, 100, 100)}${range('scatter-distance', 'Mindestabstand', .5, 30, 3, .5, ' m')}${range('scatter-min', 'Kleinste Größe', 25, 300, 80)}${range('scatter-max', 'Größte Größe', 25, 300, 125)}${range('scatter-clustering', 'Gruppenbildung', 0, 100, 65)}${check('scatter-rotation', 'Zufällige Drehung', true)}`);
  mount('wind', `${check('wind-enabled', 'Wind aktivieren', true)}${range('wind-strength', 'Windstärke', 0, 100, 35)}${range('wind-speed', 'Windgeschwindigkeit', 0, 5, 1, .05, '×')}<label for="wind-direction">Windrichtung</label><div class="wind-compass" id="wind-compass" tabindex="0" role="slider" aria-label="Windrichtung" aria-valuemin="0" aria-valuemax="360" aria-valuenow="37"><span class="wind-north">N</span><span id="wind-arrow" aria-hidden="true">↑</span></div>${range('wind-direction', 'Richtung', 0, 360, 37, 1, '°')}${check('wind-gusts', 'Windböen', true)}${range('wind-gust-strength', 'Böenstärke', 0, 100, 35)}${range('wind-gust-frequency', 'Böenhäufigkeit', 0, 2, .18, .01, ' /s')}${range('wind-turbulence', 'Turbulenz', 0, 100, 20)}<button type="button" class="button" id="wind-apply">Wind übernehmen</button><h3>Lokale Windzone</h3>${button('landscape-wind-zone', 'Windzone auf Karte setzen')}${range('wind-zone-radius', 'Zonenradius', .5, 250, 20, .5, ' m')}${range('wind-zone-strength', 'Lokale Windstärke', 0, 100, 10)}${range('wind-zone-falloff', 'Weicher Übergang', 0, 100, 50)}${range('wind-zone-direction', 'Lokale Richtung', 0, 360, 37, 1, '°')}<p class="small-note">0 % Stärke ergibt einen windgeschützten Bereich. Zonen in der Kartenliste oder am Kreisrand auswählen, verschieben und rechts bearbeiten.</p>`);
  mount('biomes', `${selector('biome-preset', 'Landschaft', BIOME_PRESETS)}${button('landscape-biome-brush', 'Biom malen')}${range('biome-radius', 'Pinselradius', .5, 80, 18, .5, ' m')}${range('biome-strength', 'Pinselstärke', 0, 100, 80)}<button type="button" class="button small" id="biome-settings">Biom als Werkzeugeinstellung</button><p class="small-note">Malt Boden und verteilt passende Pflanzen als einzeln editierbare Objekte. Bestehende Objekte bleiben erhalten.</p><h3>Eigene Einstellungen</h3><label for="landscape-preset-name">Vorlagenname</label><input id="landscape-preset-name" maxlength="120" placeholder="Zum Beispiel Abendwald"><button type="button" class="button" id="landscape-preset-save">Einstellungen speichern</button><label for="landscape-preset-select">Gespeicherte Vorlage</label><select id="landscape-preset-select"></select><div class="property-pair"><button type="button" class="button small" id="landscape-preset-load">Laden</button><button type="button" class="button small" id="landscape-preset-delete">Entfernen</button></div><p class="small-note">Vorlagen enthalten Boden, Vegetation, Verteilung und Wind und werden mit der Karte gespeichert.</p>`);
  mount('map', `<h3>Lebendige Vorschau</h3><div id="landscape-preview" class="landscape-preview"></div><p id="landscape-preview-status" class="small-note">Vegetation und Wind werden mit denselben Regeln wie im Spiel dargestellt.</p><p id="landscape-status" class="small-note" role="status">Ziehen: malen · Leertaste: verschieben · Esc: abbrechen</p>`);

  const inspector = document.createElement('div'); inspector.id = 'landscape-feature-properties'; inspector.hidden = true;
  inspector.innerHTML = `<div id="vegetation-object-properties" hidden><h3>Vegetation dieser Fläche</h3>${vegetationFields('object-vegetation')}</div><div id="terrain-object-properties" hidden>${selector('object-terrain-type', 'Bodenart', TERRAIN_TYPES)}${range('object-terrain-radius', 'Flächenradius', .5, 80, 8, .5, ' m')}${range('object-terrain-hardness', 'Randhärte', 0, 100, 30)}${range('object-terrain-strength', 'Deckkraft', 0, 100, 80)}<label for="object-terrain-color">Bodenfarbe</label><input id="object-terrain-color" type="color">${range('object-terrain-variation', 'Farbvariation', 0, 100, 18)}</div><div id="wind-object-properties" hidden>${range('object-wind-radius', 'Zonenradius', .5, 250, 20, .5, ' m')}${range('object-wind-strength', 'Lokale Windstärke', 0, 100, 10)}${range('object-wind-falloff', 'Weicher Übergang', 0, 100, 50)}${range('object-wind-direction', 'Windrichtung', 0, 360, 37, 1, '°')}</div>`;
  $('landscape-feature-properties')?.remove(); $('properties-form').insertBefore(inspector, document.querySelector('.apply-properties'));

  function readVegetation(prefix = 'vegetation', old = null) {
    return { ...vegetationSettings(old ?? { variant: 'tall' }), type: $(`${prefix}-type`).value,
      height: pct(`${prefix}-height`), heightVariation: pct(`${prefix}-height-variation`), density: pct(`${prefix}-density`), edgeSoftness: pct(`${prefix}-edge`),
      color: $(`${prefix}-color`).value, groundColor: $(`${prefix}-ground`).checked, groundBlend: pct(`${prefix}-ground-blend`),
      brightness: pct(`${prefix}-brightness`), saturation: pct(`${prefix}-saturation`), colorVariation: pct(`${prefix}-color-variation`) };
  }
  function writeVegetation(value, prefix = 'vegetation') {
    $(`${prefix}-type`).value = value.type; $(`${prefix}-color`).value = value.color; $(`${prefix}-ground`).checked = value.groundColor;
    for (const [field, key] of [['height','height'],['height-variation','heightVariation'],['density','density'],['edge','edgeSoftness'],['ground-blend','groundBlend'],['brightness','brightness'],['saturation','saturation'],['color-variation','colorVariation']]) $(`${prefix}-${field}`).value = value[key] * 100;
    updateOutputs();
  }
  function readTerrain(prefix = 'terrain') { return { type: $(`${prefix}-type`).value, color: $(`${prefix}-color`).value, hardness: pct(`${prefix}-hardness`), strength: pct(`${prefix}-strength`), variation: pct(`${prefix}-variation`) }; }
  function writeTerrain(value, prefix = 'terrain') { for (const key of ['type','color']) $(`${prefix}-${key}`).value = value[key]; for (const key of ['hardness','strength','variation']) $(`${prefix}-${key}`).value = value[key] * 100; updateOutputs(); }
  function readWind() { return { enabled: $('wind-enabled').checked, strength: pct('wind-strength'), speed: num('wind-speed'), direction: radians('wind-direction'), gusts: $('wind-gusts').checked, gustStrength: pct('wind-gust-strength'), gustFrequency: num('wind-gust-frequency'), turbulence: pct('wind-turbulence') }; }
  function writeWind(value) { $('wind-enabled').checked = value.enabled; $('wind-gusts').checked = value.gusts; for (const [id,key,factor] of [['wind-strength','strength',100],['wind-speed','speed',1],['wind-direction','direction',180/Math.PI],['wind-gust-strength','gustStrength',100],['wind-gust-frequency','gustFrequency',1],['wind-turbulence','turbulence',100]]) $(id).value = key === 'direction' ? ((value[key] * factor % 360) + 360) % 360 : value[key] * factor; updateOutputs(); }
  function readScatter() { return { density:pct('scatter-density'), minDistance:num('scatter-distance'), scaleMin:pct('scatter-min'), scaleMax:pct('scatter-max'), clustering:pct('scatter-clustering'), randomRotation:$('scatter-rotation').checked, seed:1, entries:scatterKinds.filter(item => $(`scatter-${item.kind}`).checked).map(item => ({kind:item.kind,variant:$(`scatter-variant-${item.kind}`).value,weight:1})) }; }
  function writeScatter(value) { for (const item of scatterKinds) { const entry=value.entries?.find(entry=>entry.kind===item.kind); $(`scatter-${item.kind}`).checked=!!entry; if(entry) $(`scatter-variant-${item.kind}`).value=entry.variant; } for(const [id,key,factor] of [['scatter-density','density',100],['scatter-distance','minDistance',1],['scatter-min','scaleMin',100],['scatter-max','scaleMax',100],['scatter-clustering','clustering',100]]) $(id).value=value[key]*factor; $('scatter-rotation').checked=value.randomRotation; updateOutputs(); }
  function updateOutputs() { for (const input of document.querySelectorAll('.landscape-controls input[type=range],#landscape-feature-properties input[type=range]')) { const output=$(`${input.id}-value`); if(output) output.textContent=`${Number(input.value).toLocaleString('de-DE',{maximumFractionDigits:2})}${input.dataset.unit??''}`; } $('wind-arrow').style.transform=`rotate(${num('wind-direction')}deg)`; $('wind-compass').setAttribute('aria-valuenow',$('wind-direction').value); }
  let lastWind = null, selectedFeatureInPanel = null;
  const selectedPreview = () => api.getMode() === 'select' ? selectedFeatureInPanel : null;
  const preview = createLandscapePreview($('landscape-preview'), {
    getMap: () => ({ ...api.getMap(), landscape: { ...getLandscape(api.getMap()), wind: readWind() } }),
    getVegetation: () => selectedPreview() ? readVegetation('object-vegetation', selectedPreview()) : readVegetation(),
    getVariant: () => selectedPreview()?.kind === 'grass' && $('object-variant').value === 'kit-tall' && $('object-vegetation-type').value === 'tall' ? 'kit-tall' : null,
    getPosition: () => api.getPosition(),
  });
  const refresh = () => { updateOutputs(); preview.refresh(); api.refreshCursor(); };
  for (const input of document.querySelectorAll('.landscape-controls input,.landscape-controls select,#landscape-feature-properties input,#landscape-feature-properties select')) input.addEventListener('input', refresh);
  for (const prefix of ['vegetation','object-vegetation']) $(`${prefix}-type`).addEventListener('change', () => { writeVegetation(VEGETATION_TYPES.find(type=>type.id===$(`${prefix}-type`).value).settings,prefix); refresh(); });
  for (const prefix of ['terrain','object-terrain']) $(`${prefix}-type`).addEventListener('change',()=>{writeTerrain(terrainSettings($(`${prefix}-type`).value),prefix);refresh();});
  const modeButtons = { terrain:'landscape-terrain-brush', scatter:'landscape-scatter-brush', biome:'landscape-biome-brush', windzone:'landscape-wind-zone', terrainErase:'landscape-terrain-erase' };
  for(const [mode,id] of Object.entries(modeButtons)) $(id).addEventListener('click',()=>api.setMode(api.getMode()===mode?'select':mode));
  const applyWind = () => { const value=readWind(); if(api.commit(candidate=>{ensureLandscape(candidate).wind=value;},'Wind mit der Karte gespeichert.')) lastWind=JSON.stringify(value); };
  $('wind-apply').addEventListener('click',applyWind);
  // Sliders preview continuously, then one history entry is committed on release.
  for(const input of sections.wind.querySelectorAll('input')) if(input.id.startsWith('wind-')&&!input.id.startsWith('wind-zone-')) input.addEventListener('change',applyWind);
  let compassPointer=null;
  const compassAngle=event=>{const r=$('wind-compass').getBoundingClientRect();$('wind-direction').value=Math.round((Math.atan2(event.clientX-r.left-r.width/2,-(event.clientY-r.top-r.height/2))*180/Math.PI+360)%360);refresh();};
  $('wind-compass').addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();compassPointer={id:event.pointerId,before:$('wind-direction').value};$('wind-compass').setPointerCapture(event.pointerId);compassAngle(event);});
  $('wind-compass').addEventListener('pointermove',event=>{if(compassPointer?.id===event.pointerId)compassAngle(event);});
  $('wind-compass').addEventListener('pointerup',event=>{if(compassPointer?.id!==event.pointerId)return;compassAngle(event);compassPointer=null;applyWind();});
  $('wind-compass').addEventListener('pointercancel',()=>{if(compassPointer)$('wind-direction').value=compassPointer.before;compassPointer=null;refresh();});
  $('wind-compass').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopPropagation();$('wind-direction').value=(num('wind-direction')+(['ArrowLeft','ArrowDown'].includes(event.key)?355:5))%360;refresh();applyWind();});
  function loadPreset(preset) { if(preset.vegetation)writeVegetation(vegetationSettings({vegetation:preset.vegetation}));if(preset.terrain)writeTerrain({...terrainSettings(preset.terrain.type),...preset.terrain});if(preset.scatter)writeScatter({...BIOME_PRESETS[0].scatter,...preset.scatter});if(preset.wind){writeWind({...WIND_DEFAULTS,...preset.wind});applyWind();}if(preset.brushRadius)$('brush-radius').value=Math.min(20,preset.brushRadius);refresh(); }
  const currentBiome = () => biomePreset($('biome-preset').value) ?? getLandscape(api.getMap()).presets.find(item => item.id === $('biome-preset').value) ?? biomePreset('meadow');
  $('biome-settings').addEventListener('click',()=>loadPreset(currentBiome()));
  $('landscape-preset-save').addEventListener('click',()=>{const name=$('landscape-preset-name').value.trim();if(!name)return api.toast('Bitte einen Vorlagennamen eingeben.',true);const scatter=readScatter();if(!scatter.entries.length)return api.toast('Mindestens eine Objektart für die Vorlage wählen.',true);const preset={id:uid('landscape-preset'),name,terrain:readTerrain(),vegetation:readVegetation(),scatter,wind:readWind(),brushRadius:num('brush-radius')};if(api.commit(candidate=>{ensureLandscape(candidate).presets.push(preset);},'Landschaftsvorlage mit der Karte gespeichert.'))$('landscape-preset-select').value=preset.id;});
  $('landscape-preset-load').addEventListener('click',()=>{const preset=getLandscape(api.getMap()).presets.find(item=>item.id===$('landscape-preset-select').value);if(preset)loadPreset(preset);});
  $('landscape-preset-delete').addEventListener('click',()=>{const id=$('landscape-preset-select').value;if(id)api.commit(candidate=>{const landscape=ensureLandscape(candidate);landscape.presets=landscape.presets.filter(item=>item.id!==id);},'Vorlage entfernt.');});
  for (const [type,label] of [['terrain','Gemalte Bodenflächen'],['wind','Windzonen']]) { $('feature-filter').querySelector(`option[value="${type}"]`)?.remove(); const option=document.createElement('option');option.value=type;option.textContent=label;$('feature-filter').append(option); }

  function sync() {
    const landscape=getLandscape(api.getMap()),windKey=JSON.stringify(landscape.wind);
    if(windKey!==lastWind){writeWind(landscape.wind);lastWind=windKey;}
    const biomeValue=$('biome-preset').value; $('biome-preset').innerHTML=options(BIOME_PRESETS);
    for(const preset of landscape.presets) if(preset.terrain&&preset.vegetation&&preset.scatter){const option=document.createElement('option');option.value=preset.id;option.textContent=`Eigene Vorlage · ${preset.name}`;$('biome-preset').append(option);}
    if([...$('biome-preset').options].some(option=>option.value===biomeValue))$('biome-preset').value=biomeValue;
    const value=$('landscape-preset-select').value; $('landscape-preset-select').replaceChildren();
    for(const preset of landscape.presets){const option=document.createElement('option');option.value=preset.id;option.textContent=preset.name;$('landscape-preset-select').append(option);}
    if(landscape.presets.some(p=>p.id===value))$('landscape-preset-select').value=value;
    $('landscape-preset-load').disabled=!landscape.presets.length; $('landscape-preset-delete').disabled=!landscape.presets.length;
    for(const [mode,id] of Object.entries(modeButtons)){const active=api.getMode()===mode;$(id).classList.toggle('active',active);$(id).setAttribute('aria-pressed',String(active));}
    preview.refresh();
  }
  function renderSelected(feature,type) {
    const isVegetation=type==='object'&&['grass','flower'].includes(feature?.kind);
    selectedFeatureInPanel = isVegetation ? feature : null;
    inspector.hidden=!(isVegetation||type==='terrain'||type==='wind');
    $('vegetation-object-properties').hidden=!isVegetation;$('terrain-object-properties').hidden=type!=='terrain';$('wind-object-properties').hidden=type!=='wind';
    if(isVegetation)writeVegetation(vegetationSettings(feature),'object-vegetation');
    if(type==='terrain'){writeTerrain({...terrainSettings(feature.type),...feature},'object-terrain');$('object-terrain-radius').value=feature.radius;}
    if(type==='wind'){for(const [field,key,factor] of [['radius','radius',1],['strength','strength',100],['falloff','falloff',100],['direction','direction',180/Math.PI]])$(`object-wind-${field}`).value=key==='direction'?((feature[key]*factor%360)+360)%360:feature[key]*factor;}
    for(const input of inspector.querySelectorAll('input,select'))input.disabled=!!input.closest('[hidden]');
    updateOutputs(); preview.refresh();
  }
  function applySelected(feature,type) {
    if(type==='object'&&['grass','flower'].includes(feature.kind)){feature.vegetation=readVegetation('object-vegetation',feature);if(feature.kind==='grass'&&!(feature.variant==='kit-tall'&&feature.vegetation.type==='tall'))feature.variant=VEGETATION_TYPES.find(t=>t.id===feature.vegetation.type).variant;}
    if(type==='terrain')Object.assign(feature,readTerrain('object-terrain'),{radius:num('object-terrain-radius')});
    if(type==='wind')Object.assign(feature,{radius:num('object-wind-radius'),strength:pct('object-wind-strength'),falloff:pct('object-wind-falloff'),direction:radians('object-wind-direction')});
  }
  function createStroke(mode,map) {
    if(mode==='brush')return createVegetationStroke(map,{radius:num('brush-radius'),strength:pct('vegetation-strength'),vegetation:readVegetation(),seed:Date.now()>>>0});
    if(mode==='terrain')return createTerrainStroke(map,{radius:num('terrain-radius'),strength:1,terrain:readTerrain(),seed:Date.now()>>>0});
    if(mode==='scatter'){const scatter=readScatter();if(!scatter.entries.length)throw new Error('Bitte mindestens eine Objektart wählen.');if(scatter.scaleMin>scatter.scaleMax)throw new Error('Kleinste Größe darf nicht über der größten Größe liegen.');return createScatterStroke(map,{radius:num('scatter-radius'),strength:pct('scatter-strength'),scatter,vegetation:readVegetation(),seed:Date.now()>>>0});}
    if(mode==='biome'){const preset=currentBiome();return createBiomeStroke(map,{radius:num('biome-radius'),strength:pct('biome-strength'),presetId:preset.id,preset,seed:Date.now()>>>0});}
    return null;
  }
  function createZone(position){return{id:uid('wind-zone'),name:'Lokale Windzone',position:[...position],radius:num('wind-zone-radius'),strength:pct('wind-zone-strength'),falloff:pct('wind-zone-falloff'),direction:radians('wind-zone-direction')};}
  function radius(mode){return num(mode==='brush'?'brush-radius':mode==='scatter'?'scatter-radius':mode==='biome'?'biome-radius':mode==='windzone'?'wind-zone-radius':'terrain-radius');}
  writeVegetation(VEGETATION_TYPES.find(type=>type.id==='tall').settings);writeWind(getLandscape(api.getMap()).wind);
  return {sync,refresh,renderSelected,applySelected,createStroke,createZone,radius,readVegetation,
    setSelectedVariant: variant => {writeVegetation(VEGETATION_TYPES.find(type=>type.id===(variant==='kit-tall'?'tall':variant))?.settings ?? VEGETATION_TYPES[0].settings,'object-vegetation'); refresh();},
    color:mode=>mode==='terrain'||mode==='terrainErase'?$('terrain-color').value:mode==='windzone'?'#91bed2':readVegetation().color,
    state:()=>({vegetation:readVegetation(),terrain:readTerrain(),scatter:readScatter(),wind:readWind(),biome:$('biome-preset').value,preview:preview.stats}),
    status:message=>{$('landscape-status').textContent=message;},dispose:()=>preview.dispose()};
}
