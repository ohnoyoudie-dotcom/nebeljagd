import { SIMPLE_TOOLS, LIBRARY_GROUPS, filterLibrary, friendlyLabel } from './simple-editor-model.js';
import { getVariantPreviewSvg } from './asset-catalog.js';
import { PATH_BRUSH_PRESETS } from './landscape.js';
const $=id=>document.getElementById(id);
const change=element=>element.dispatchEvent(new Event('change',{bubbles:true}));
const paths={land:'M3 17 8 7l5 8 3-5 5 7M3 20h18',paths:'M6 3c14 4-9 12 10 18M11 3c14 4-9 12 10 18',rocks:'m3 18 3-9 6-5 7 6 2 8Z M6 9l7 5 6-4',objects:'M4 8 12 4l8 4v10l-8 4-8-4Z M4 8l8 4 8-4M12 12v10',move:'M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4',erase:'m3 15 10-11 8 7-10 11H9Z M8 10l8 7'};
const icon=key=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[key]}"/></svg>`;
function node(tag,className,text){const e=document.createElement(tag);e.className=className;if(text)e.textContent=text;return e;}
function generated(tag,className,text){const e=node(tag,className,text);e.dataset.simpleGenerated='true';return e;}
function action(label,id,callback){const b=node('button','simple-button',label);b.type='button';b.id=id;b.addEventListener('click',callback);return b;}
/** Exported editors contain assembled markup. No original control is removed. */
export function resetSimpleEditorDOM(){
 const inspector=document.querySelector('.inspector');if(inspector)document.querySelector('.editor-layout').append(inspector);
 document.querySelectorAll('[data-simple-generated]').forEach(n=>n.remove());
 document.body.classList.remove('simple-editor','advanced-tools','selection-expanded');
 document.querySelectorAll('.simple-show-extra').forEach(n=>n.classList.remove('simple-show-extra'));
}
export function createSimpleEditor(api){
 document.body.classList.add('simple-editor');
 let current='land', group='all', chosen=null, selectedId=null;
 const sidebar=document.querySelector('.sidebar'), layout=document.querySelector('.editor-layout');
 const nav=generated('nav','simple-tools');nav.setAttribute('aria-label','Werkzeug wählen');
 const heading=generated('section','simple-tool-heading');heading.append(node('span','simple-eyebrow','DEINE WELT GESTALTEN'),node('h2','','Landschaft'),node('p','','Wähle eine Farbe und male auf der Insel.'));
 const tips={land:'Wähle eine Landschaft. Ziehe dann auf der Insel, um zu malen.',paths:'Wähle einen Weg. Ziehe auf der Insel, um ihn zu zeichnen.',rocks:'Male Felsen oder dichten Wald. Hier kommen Spieler nicht durch.',objects:'Wähle ein Bild. Tippe danach auf die Insel, um das Objekt zu setzen.',move:'Ziehe ein Objekt an seinen neuen Platz. Ziehe auf freier Fläche, um die Karte zu bewegen.',erase:'Wähle, was weg soll. Ziehe darüber. Rückgängig holt es zurück.'};
 function activate(id){
  const tool=SIMPLE_TOOLS.find(t=>t[0]===id);if(!tool)return;
  if(id==='erase')$('erase-target').value=api.getMode().startsWith('obstacle')?'obstacles':api.getMode()==='brush'?'grass':['objects','move'].includes(current)?'objects':'surface';
  current=id;document.body.classList.remove('advanced-tools');
  if(tool[2])api.showPane(tool[2],tool[3]);
  if(id==='paths')$('landscape-path-brush').click();else if(tool[4])api.setMode(id==='objects'&&!chosen?'select':tool[4]);
  api.clearUnsafeSelection();sidebar.dataset.simpleTool=id;heading.querySelector('h2').textContent=tool[1];heading.querySelector('p').textContent=tips[id];
  if(id==='move')document.querySelectorAll('.editor-pane').forEach(p=>p.hidden=true);
  sync();sidebar.scrollTop=0;
 }
 for(const [id,label]of SIMPLE_TOOLS){const b=action(label,`simple-tool-${id}`,()=>activate(id));b.innerHTML=icon(id)+`<span>${label}</span>`;nav.append(b);}
 sidebar.prepend(nav,heading);heading.after(document.querySelector('.inspector'));
 const more=generated('details','simple-more');more.id='simple-more';more.append(node('summary','','Weitere Werkzeuge'));
 function advanced(label,pane,tool){more.append(action(label,`simple-more-${tool}`,()=>{document.body.classList.add('advanced-tools');sidebar.dataset.simpleTool='more';api.showPane(pane,tool);heading.querySelector('h2').textContent=label;heading.querySelector('p').textContent='Mit den großen Werkzeugen oben kommst du jederzeit zurück.';more.open=false;sync();}));}
 advanced('Mauern & Zäune zeichnen','objects','barriers');advanced('Objekte verteilen','objects','scatter');advanced('Wind einstellen','more','wind');advanced('Inselumriss & Karteninhalt','more','shape');advanced('Ansicht & Dateien','more','map');sidebar.append(more);
 // Keep existing settings and event handlers, revealing detail only on request.
 function extra(panel,ids,label='Feineinstellungen'){
  for(const id of ids){const e=$(id);if(!e)continue;e.classList.add('simple-extra');const l=panel.querySelector(`label[for="${id}"]`);l?.classList.add('simple-extra');}
  const b=generated('button','simple-extra-toggle',label);b.type='button';b.setAttribute('aria-expanded','false');b.addEventListener('click',()=>{const open=panel.classList.toggle('simple-show-extra');b.setAttribute('aria-expanded',String(open));});panel.append(b);
 }
 const biomes=$('landscape-section-biomes');
 extra(biomes,[],'Weitere Landschaften & Farben');biomes.querySelector('.biome-advanced').classList.add('simple-extra');
 for(const b of biomes.querySelectorAll('[data-biome-choice]'))if(!['meadow','forest','snow','desert'].includes(b.dataset.biomeChoice))b.classList.add('simple-extra');
 const grass=generated('button','simple-secondary','Gras zum Verstecken malen');grass.type='button';grass.id='simple-grass';grass.addEventListener('click',()=>{api.showPane('paint','vegetation');api.setMode('brush');heading.querySelector('h2').textContent='Versteckgras';heading.querySelector('p').textContent='Ziehe auf der Insel. In diesem hohen Gras können sich Spieler verstecken.';});biomes.append(grass);
 const terrain=$('landscape-section-terrain');
 extra(terrain,['terrain-type','landscape-terrain-brush','terrain-edit-paths'],'Bodenfarbe & weitere Einstellungen');terrain.querySelector('details').classList.add('simple-extra');
 const roadCards=generated('div','simple-road-cards');
 for(const preset of PATH_BRUSH_PRESETS){const b=action(preset.label.split(' · ')[0],`simple-path-${preset.id}`,()=>{$('path-preset').value=preset.id;change($('path-preset'));$('landscape-path-brush').click();sync();});b.style.setProperty('--road-color',preset.color);b.dataset.pathPreset=preset.id;roadCards.append(b);}
 terrain.querySelector('.landscape-controls').prepend(roadCards);
 const obstacles=$('landscape-section-obstacles');extra(obstacles,['world-edge','obstacle-biome','woodland-details'],'Material & Umgebung');$('woodland-details').closest('label').classList.add('simple-extra');
 // A searchable picture catalogue replaces the two dependent dropdown menus.
 const palette=document.querySelector('.object-palette'),library=generated('section','simple-library');
 const search=node('input','simple-search');search.type='search';search.id='simple-object-search';search.placeholder='Suchen: Baum, Haus, Truhe …';search.setAttribute('aria-label','Objekte suchen');
 const groups=node('div','simple-library-groups');groups.setAttribute('aria-label','Objektgruppen');
 for(const [id,label]of LIBRARY_GROUPS){const b=action(label,`simple-group-${id}`,()=>{group=id;renderLibrary();});b.dataset.libraryGroup=id;groups.append(b);}
 const count=node('p','simple-library-count');count.setAttribute('aria-live','polite');const grid=node('div','simple-library-grid');grid.id='simple-library-grid';
 const chosenView=node('div','simple-chosen');chosenView.id='simple-chosen';chosenView.setAttribute('aria-live','polite');
 library.append(search,groups,count,grid,chosenView);palette.prepend(library);
 function renderLibrary(){
  const items=filterLibrary(group,search.value);grid.replaceChildren();count.textContent=`${items.length} ${items.length===1?'Objekt':'Objekte'} · Bild wählen, dann auf die Karte tippen`;
  for(const b of groups.children)b.setAttribute('aria-pressed',String(b.dataset.libraryGroup===group));
  for(const item of items){
   const b=action('',`simple-asset-${item.kind}-${item.variant}`,()=>choose(item));b.className='simple-asset';b.dataset.assetKey=`${item.kind}:${item.variant}`;b.setAttribute('aria-label',item.label);b.setAttribute('aria-pressed',String(b.dataset.assetKey===chosen));
   const picture=node('span','simple-asset-picture');picture.innerHTML=getVariantPreviewSvg(item.kind,item.variant);picture.setAttribute('aria-hidden','true');b.append(picture,node('span','simple-asset-name',item.label));grid.append(b);
  }
  if(!items.length){const empty=node('div','simple-library-empty','Nichts gefunden. Versuche einen anderen Namen oder „Alles“.');empty.append(action('Suche zurücksetzen','simple-reset-search',()=>{search.value='';group='all';renderLibrary();}));grid.append(empty);}
 }
 function choose(item){
  $('palette-kind').value=item.kind;change($('palette-kind'));$('palette-variant').value=item.variant;change($('palette-variant'));
  chosen=`${item.kind}:${item.variant}`;chosenView.replaceChildren(node('strong','',item.label),node('span','','Bereit zum Platzieren · Mehrmals tippen setzt mehrere Exemplare.'));
  api.setMode('place');sync();
 }
 search.addEventListener('input',renderLibrary);renderLibrary();
 extra(palette,['palette-house-builder','palette-chest-property','palette-rarity-property','palette-placement-rotation'],'Objekt anpassen');
 // One contextual card. Common edits apply immediately through the undo history.
 const inspector=document.querySelector('.inspector'),quick=generated('section','simple-selection');
 const title=node('h2');title.id='simple-selection-title';quick.append(title,node('p','','Zum Verschieben direkt auf der Karte ziehen.'));
 const quickActions=node('div','simple-selection-actions');
 for(const [label,id,cb]of [['↶ Drehen','rotate',()=>api.transform('rotate')],['− Kleiner','smaller',()=>api.transform('smaller')],['＋ Größer','larger',()=>api.transform('larger')],['Kopieren','copy',()=>api.duplicate()],['Löschen','delete',()=>api.remove()]]){const b=action(label,`simple-selection-${id}`,cb);quickActions.append(b);}
 quick.append(quickActions);const detailed=action('Weitere Eigenschaften','simple-selection-details',()=>{const open=document.body.classList.toggle('selection-expanded');detailed.setAttribute('aria-expanded',String(open));});detailed.setAttribute('aria-expanded','false');quick.append(detailed);inspector.querySelector('.inspector-heading').after(quick);
 // Persistent, short help and an explicit way to return to the whole island.
 const help=generated('details','simple-help');help.append(node('summary','','So geht’s'),node('p','','1. Werkzeug oder Objekt auswählen. 2. Auf der Karte malen, tippen oder ziehen. 3. Mit Spielen ausprobieren. Rückgängig macht den letzten Schritt rückgängig. Speichern sichert eine Kartendatei.'));
 document.querySelector('.header-actions').append(help);
 $('fit-map').textContent='Ganze Insel';$('fit-map').setAttribute('aria-label','Ganze Insel anzeigen');
 $('tool-select').lastChild.textContent=' Verschieben';$('tool-pan').lastChild.textContent=' Karte schieben';
 function sync(){
  const mode=api.getMode(), feature=api.selected();
  for(const b of nav.children){const id=b.id.replace('simple-tool-','');const modeMatch=id==='move'?(['select','pan'].includes(mode)&&!(current==='objects'&&!chosen)):id==='erase'?(['erase','terrainErase'].includes(mode)||(mode==='obstacleErase'&&current==='erase')):id==='rocks'?(mode.startsWith('obstacle')&&current!=='erase'):id==='land'?['biome','brush'].includes(mode):id==='objects'?(mode==='place'||(current==='objects'&&!chosen&&mode==='select')):mode==='terrain';b.setAttribute('aria-pressed',String(!document.body.classList.contains('advanced-tools')&&modeMatch));}
  for(const b of grid.querySelectorAll('[data-asset-key]'))b.setAttribute('aria-pressed',String(b.dataset.assetKey===chosen));
  for(const b of roadCards.children)b.setAttribute('aria-pressed',String(b.dataset.pathPreset===$('path-preset').value));
  if(selectedId!==feature?.id){document.body.classList.remove('selection-expanded');detailed.setAttribute('aria-expanded','false');selectedId=feature?.id;}
  quick.hidden=!feature;title.textContent=feature?.name??'';
  for(const id of ['rotate','smaller','larger','copy'])$(`simple-selection-${id}`).hidden=!feature?.kind;
  $('simple-selection-delete').hidden=api.selectionType()==='island';
  layout.dataset.simpleSelection=feature?'yes':'no';
 }
 activate('land');
 return {sync,allowsSelection:type=>document.body.classList.contains('advanced-tools')||!['island','islet','region','waterArea','spawn'].includes(type),state:()=>({tool:current,group,query:search.value,chosen})};
}
