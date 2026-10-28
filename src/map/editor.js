import { RARITIES, WEAPON_TYPES, weaponStats } from '../loot-tiers.js';
import defaultMap from '../../worldmap.json';
import { validateWorldmap, getWorldmapStats, zoneAt, pointInPolygon } from './model.js';
import { renderWorldmapSvg } from './render.js';
import { OBJECT_CATALOG, getObjectDefinition, getObjectFootprintRadius, makeWorldObject, normalizeWorldmap } from './objects.js';
import { canPaintGrass } from './grass-brush.js';
import { createLandscapePanel } from './landscape-panel.js';
import { getLandscape, ensureLandscape } from './landscape.js';
import { eraseLandscapeAt } from './landscape-brush.js';
import { createObjectEraserStroke, objectEraserTargets } from './object-eraser.js';
import { getVariantAsset, getVariantPreviewSvg } from './asset-catalog.js';
import './editor.css';

const $ = id => document.getElementById(id);
document.body.dataset.fileMode = location.protocol === 'file:' ? 'true' : 'false';
const clone = value => JSON.parse(JSON.stringify(value));
const STORAGE_KEY = 'nebeljagd.worldmap.v1';
const SVG_NS = 'http://www.w3.org/2000/svg';
const collectionKeys = { region: 'regions', path: 'paths', river: 'rivers', place: 'places', spawn: 'spawnAreas', object: 'objects' };
const PLAYTEST_KEY = 'nebeljagd.worldmap.playtest.v1';
const MAX_FILE_BYTES = 5_000_000;
const playtestWindows = new Map();
const kindNames = { island: 'Inselumriss', region: 'Region', path: 'Weg', river: 'Fluss', place: 'Ort', spawn: 'Startbereich', object: 'Weltobjekt', terrain: 'Bodenfläche', wind: 'Windzone' };
const initialSnapshot = (() => {
  try {
    const saved = normalizeWorldmap(JSON.parse($('map-snapshot')?.textContent || 'null'));
    return saved && validateWorldmap(saved).valid ? saved : normalizeWorldmap(defaultMap);
  } catch { return normalizeWorldmap(defaultMap); }
})();
let map = clone(initialSnapshot);
let selection = null;
let mode = 'select';
let history = [];
let future = [];
let pointer = null;
let spaceHeld = false;
let toastTimer;
let restoredDraft = null;
let storageAvailable = true;
let view = initialView();
let zoneTime = 0;
let listLimit = 50;
let hoverPoint = null;
let landscapePanel = null;
const paintModes = ['brush', 'terrain', 'scatter', 'biome'];
const placementModes = ['place', ...paintModes, 'erase', 'terrainErase', 'windzone'];
const layers = { showLabels: true, showSpawns: true, showGrid: false, showZone: false, showObjects: true };

function initialView() {
  const b = map.bounds;
  return { x: b.minX, y: b.minZ, width: b.maxX - b.minX, height: b.maxZ - b.minZ };
}
function featureCollection(data, type) {
  return type === 'terrain' ? getLandscape(data).terrain : type === 'wind' ? getLandscape(data).windZones : data[collectionKeys[type]];
}
function selectedFeature(data = map) {
  if (!selection) return null;
  return selection.type === 'island' ? data.island : featureCollection(data, selection.type)?.find(item => item.id === selection.id) ?? null;
}
function featureRows() {
  return [{ type: 'island', item: map.island }, ...Object.entries(collectionKeys).flatMap(([type, key]) => (map[key] ?? []).map(item => ({ type, item }))), ...getLandscape(map).terrain.map(item => ({type:'terrain',item})), ...getLandscape(map).windZones.map(item => ({type:'wind',item}))];
}
function toast(message, error = false) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.toggle('error', error);
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 9000 : 4200);
}
function validate(candidate) {
  try { return validateWorldmap(candidate); }
  catch { return { valid: false, errors: ['Die Kartendatei besitzt eine beschädigte Datenstruktur.'], warnings: [] }; }
}
function updateWarnings(result = validate(map)) {
  const warnings = $('validation-warnings');
  warnings.hidden = !result.warnings.length;
  warnings.textContent = result.warnings.length ? `Planungshinweis: ${result.warnings.join(' ')}` : '';
}
function saveDraft() {
  if (restoredDraft !== null) {
    $('save-status').textContent = 'Voriger Entwurf wartet · JSON exportieren';
    return;
  }
  $('restore-banner').hidden = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    storageAvailable = true;
    $('save-status').textContent = 'Lokal gespeichert · JSON exportieren';
  } catch {
    storageAvailable = false;
    $('save-status').textContent = 'Nur im Speicher · JSON exportieren';
  }
}
function remember(previous) {
  history.push(previous);
  if (history.length > 30) history.shift();
  future = [];
  saveDraft();
}
function commit(mutator, message) {
  const previous = clone(map);
  const candidate = clone(map);
  mutator(candidate);
  const result = validate(candidate);
  if (!result.valid) {
    toast(`Änderung nicht übernommen: ${result.errors.slice(0, 3).join(' ')}`, true);
    renderProperties();
    return false;
  }
  if (JSON.stringify(candidate) === JSON.stringify(map)) return true;
  map = candidate;
  remember(previous);
  renderAll();
  if (message) toast(message);
  return true;
}
function renderAll() {
  renderMap(); renderList(); renderProperties(); renderFacts(); updateWarnings();
  $('undo').disabled = !history.length;
  $('redo').disabled = !future.length;
  landscapePanel?.sync();
}
function renderMap(rebuild = true) {
  const zone = zoneAt(map, zoneTime);
  const zoom = (map.bounds.maxX - map.bounds.minX) / view.width;
  if (rebuild || !$('map-stage').firstElementChild) {
    // Only validated imports/commits can reach this renderer. During a drag all
    // coordinates are numeric and may briefly leave land until pointerup rolls
    // them back. Avoid revalidating thousands of static objects per pointermove.
    const kind = $('object-kind-filter').value;
    $('map-stage').innerHTML = renderWorldmapSvg(map, {
      ...layers, zoneRadius: zone.radius, editor: true, validated: true,
      showLabels: layers.showLabels && zoom <= 4,
      showPlaces: zoom <= 4,
      showSpawns: layers.showSpawns && zoom <= 6,
      showObjectKinds: kind === 'all' ? undefined : [kind],
    });
  }
  const svg = $('map-stage').firstElementChild;
  svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`);
  svg.setAttribute('aria-label', 'Editierbare Insel mit denselben Weltobjekten wie im 3D-Spiel');
  svg.setAttribute('role', 'img');
  svg.removeAttribute('width'); svg.removeAttribute('height');
  svg.querySelector('#selection-overlay')?.remove();
  appendSelection(svg);
  updatePlacementPreview();
  $('zoom-label').textContent = `${Math.round(zoom * 100)} %`;
  $('map-viewport').classList.toggle('is-pan', mode === 'pan' || spaceHeld);
  $('map-viewport').classList.toggle('is-placing', placementModes.includes(mode) && !spaceHeld);
  $('zone-clock').textContent = `${Math.floor(zoneTime / 60).toString().padStart(2, '0')}:${Math.floor(zoneTime % 60).toString().padStart(2, '0')}`;
  $('zone-radius').textContent = `${Math.round(zone.radius)} m sicherer Radius`;
}
function objectFootprint(object) {
  const radius = object.radius ?? (object.kind === 'tree' ? 3 : getObjectFootprintRadius(object.kind, object.variant));
  return radius * object.scale;
}
function updatePlacementPreview() {
  const svg = $('map-stage').firstElementChild;
  svg?.querySelector('#placement-preview')?.remove();
  svg?.querySelector('#eraser-target-preview')?.remove();
  for (const target of svg?.querySelectorAll('.map-erase-target') ?? []) target.classList.remove('map-erase-target');
  if (!svg || !placementModes.includes(mode) || !hoverPoint || spaceHeld) return;
  const definition = getObjectDefinition($('palette-kind').value);
  const point = mode === 'place' ? snapped(hoverPoint) : hoverPoint;
  const radius = mode === 'erase' ? Number($('eraser-radius').value) : mode !== 'place' ? landscapePanel?.radius(mode) ?? 4 : definition.defaultRadius ?? getObjectFootprintRadius(definition.kind, $('palette-variant').value);
  const circle = document.createElementNS(SVG_NS, 'circle');
  const valid = ['erase','terrainErase'].includes(mode) || (mode === 'brush' ? canPaintGrass(point, map.island.points, radius) : pointInPolygon(point, map.island.points));
  const pixel = 1 / (svg.getScreenCTM()?.a || 1);
  circle.id = 'placement-preview';
  circle.setAttribute('cx', point[0]); circle.setAttribute('cy', point[1]);
  circle.setAttribute('r', mode !== 'place' ? radius : Math.max(radius, pixel * 7));
  circle.setAttribute('fill', ['erase','terrainErase'].includes(mode) ? '#d88e7c' : valid ? landscapePanel?.color(mode) ?? '#b9d488' : '#d89486');
  circle.setAttribute('fill-opacity', '.25');
  circle.setAttribute('stroke', mode === 'erase' ? '#9e3e32' : valid ? '#f0e7bc' : '#f2b6a8');
  circle.setAttribute('stroke-width', '1.5'); circle.setAttribute('vector-effect', 'non-scaling-stroke');
  circle.setAttribute('pointer-events', 'none');
  if (mode !== 'place') circle.setAttribute('stroke-dasharray', '5 3');
  svg.append(circle);
  if (mode === 'erase') {
    const targets = objectEraserTargets(map, point, { radius, filter: $('eraser-filter').value });
    const marks = document.createElementNS(SVG_NS, 'g'); marks.id = 'eraser-target-preview';
    marks.setAttribute('pointer-events', 'none'); marks.setAttribute('aria-hidden', 'true');
    for (const object of targets) {
      document.getElementById(`feature-object-${object.id}`)?.classList.add('map-erase-target');
      const mark = document.createElementNS(SVG_NS, 'circle');
      mark.setAttribute('cx', object.position[0]); mark.setAttribute('cy', object.position[1]);
      mark.setAttribute('r', pixel * 4); mark.setAttribute('fill', '#a53e31');
      mark.setAttribute('stroke', '#fff4df'); mark.setAttribute('stroke-width', '1');
      mark.setAttribute('vector-effect', 'non-scaling-stroke'); marks.append(mark);
    }
    svg.append(marks);
    if (!pointer?.eraser) $('eraser-status').textContent = targets.length
      ? `${targets.length} ${targets.length === 1 ? 'Objekt' : 'Objekte'} im Kreis · ganze Objekte entfernen`
      : 'Mittelpunkt berühren · Leertaste: Verschieben · Esc beendet';
  }
}
function updateMovingDrawing() {
  const svg = $('map-stage').firstElementChild;
  const feature = selectedFeature();
  if (!svg || !feature) return;
  const element = document.getElementById(`feature-${selection.type}-${selection.id}`);
  if (element) {
    if (feature.points) {
      const points = feature.points.map(point => point.join(',')).join(' ');
      if (element.tagName.toLowerCase() === 'polygon') element.setAttribute('points', points);
      else for (const geometry of element.querySelectorAll('polygon,polyline')) geometry.setAttribute('points', points);
    } else if (selection.type === 'object') {
      element.setAttribute('transform', `translate(${feature.position[0]} ${feature.position[1]}) rotate(${-feature.rotation * 180 / Math.PI}) scale(${feature.scale})`);
    } else if (['place','terrain','wind'].includes(selection.type)) element.setAttribute('transform', `translate(${feature.position[0]} ${feature.position[1]})`);
    else if (selection.type === 'spawn') {
      const circle = element.querySelector('circle'), label = element.querySelector('text');
      circle?.setAttribute('cx', feature.position[0]); circle?.setAttribute('cy', feature.position[1]);
      label?.setAttribute('x', feature.position[0]); label?.setAttribute('y', feature.position[1] + 5);
    }
  }
  renderMap(false);
}
function appendSelection(svg) {
  const feature = selectedFeature();
  if (!feature) return;
  const group = document.createElementNS(SVG_NS, 'g');
  group.id = 'selection-overlay';
  group.setAttribute('aria-hidden', 'true');
  const scale = svg.getScreenCTM()?.a;
  const pixel = scale ? 1 / scale : view.width / Math.max(100, $('map-viewport').clientWidth);
  const outline = document.createElementNS(SVG_NS, feature.points ? 'polyline' : 'circle');
  outline.setAttribute('class', 'map-selection-outline');
  if (feature.points) {
    const points = [...feature.points];
    if (['island', 'region'].includes(selection.type)) points.push(points[0]);
    outline.setAttribute('points', points.map(point => point.join(',')).join(' '));
  } else {
    outline.setAttribute('cx', feature.position[0]); outline.setAttribute('cy', feature.position[1]);
    outline.setAttribute('r', ['spawn','terrain','wind'].includes(selection.type) ? feature.radius : selection.type === 'object' ? Math.max(objectFootprint(feature) + pixel * 3, pixel * 12) : pixel * 15);
  }
  group.append(outline);
  if (['object','terrain','wind'].includes(selection.type)) {
    group.dataset.featureType = selection.type; group.dataset.featureId = feature.id;
    const hit = outline.cloneNode(false);
    hit.removeAttribute('class'); hit.setAttribute('fill', 'transparent'); hit.setAttribute('stroke', 'none'); hit.setAttribute('pointer-events', 'all');
    group.prepend(hit);
  }
  if (feature.points) feature.points.forEach((point, index) => {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', point[0]); circle.setAttribute('cy', point[1]); circle.setAttribute('r', pixel * (selection.vertex === index ? 7 : 5));
    circle.setAttribute('fill', selection.vertex === index ? '#f1c76d' : '#fff9e3');
    circle.setAttribute('stroke', '#326750');
    circle.setAttribute('data-map-handle', index);
    group.append(circle);
  });
  svg.append(group);
}
function renderFacts() {
  const stats = getWorldmapStats(map);
  $('map-name').textContent = map.name;
  $('players-fact').textContent = map.gameplay.targetPlayers;
  $('world-object-count').textContent = (map.objects ?? []).length.toLocaleString('de-DE');
  $('area-fact').textContent = `${(stats.landAreaM2 / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 2 })} km²`;
  $('size-fact').textContent = `${(stats.widthM / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} × ${(stats.heightM / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} km`;
  $('walk-fact').textContent = `Geradlinig queren: ca. ${Math.ceil(stats.walkAcrossSeconds / 60)} Min.`;
  $('zone-time').max = stats.matchDurationSeconds;
  if (zoneTime > stats.matchDurationSeconds) zoneTime = stats.matchDurationSeconds;
}
function renderList() {
  const filter = $('feature-filter').value;
  const kind = $('object-kind-filter').value;
  const search = $('feature-search').value.trim().toLocaleLowerCase('de-DE');
  const list = $('feature-list');
  list.replaceChildren();
  const rows = featureRows().filter(row => (filter === 'all' || row.type === filter)
    && (row.type !== 'object' || kind === 'all' || row.item.kind === kind)
    && (!search || `${row.item.name} ${row.item.id}`.toLocaleLowerCase('de-DE').includes(search)));
  $('feature-count').textContent = rows.length.toLocaleString('de-DE');
  $('object-kind-filter').hidden = filter !== 'object' && kind === 'all';
  const shown = rows.slice(0, listLimit);
  if (selection && !shown.some(row => row.type === selection.type && row.item.id === selection.id)) {
    const selected = rows.find(row => row.type === selection.type && row.item.id === selection.id);
    if (selected) shown.unshift(selected);
  }
  for (const { type, item } of shown) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'feature-row';
    button.dataset.type = type; button.dataset.id = item.id;
    button.classList.toggle('selected', selection?.type === type && selection.id === item.id);
    button.setAttribute('aria-pressed', selection?.type === type && selection.id === item.id ? 'true' : 'false');
    const swatch = document.createElement('span'); swatch.className = 'feature-swatch';
    if (item.color) swatch.style.backgroundColor = item.color;
    if (type === 'river') swatch.style.backgroundColor = '#6ba5ae';
    if (type === 'path') swatch.style.backgroundColor = '#beaa7d';
    if (type === 'object') {
      swatch.classList.add(`swatch-${item.kind}`);
      if (WEAPON_TYPES.includes(item.kind)) swatch.style.backgroundColor = (RARITIES[item.rarity] ?? RARITIES.common).color;
    }
    const label = document.createElement('span'); label.className = 'feature-label'; label.textContent = item.name;
    const kindLabel = document.createElement('span'); kindLabel.className = 'feature-type';
    kindLabel.textContent = type === 'object' ? getObjectDefinition(item.kind).label + (WEAPON_TYPES.includes(item.kind) ? ` · ${(RARITIES[item.rarity] ?? RARITIES.common).label}` : '') : kindNames[type];
    button.append(swatch, label, kindLabel);
    button.addEventListener('click', () => select(type, item.id));
    list.append(button);
  }
  $('list-more').hidden = rows.length <= listLimit;
  $('list-more').textContent = `Weitere anzeigen · ${Math.min(rows.length, listLimit)} von ${rows.length}`;
}
function select(type, id, vertex = null) {
  selection = { type, id, vertex };
  if (!selectedFeature()) selection = null;
  renderMap(); renderList(); renderProperties();
}
function renderProperties() {
  const feature = selectedFeature();
  $('selection-empty').hidden = Boolean(feature);
  $('properties-form').hidden = !feature;
  landscapePanel?.renderSelected(feature, selection?.type);
  if (!feature) return;
  $('selection-title').textContent = feature.name;
  $('selection-kind').textContent = selection.type === 'object' ? getObjectDefinition(feature.kind).label : kindNames[selection.type];
  $('feature-name').value = feature.name;
  $('position-properties').hidden = !feature.position;
  if (feature.position) { $('feature-x').value = feature.position[0]; $('feature-z').value = feature.position[1]; }
  $('region-properties').hidden = selection.type !== 'region';
  if (selection.type === 'region') { $('feature-biome').value = feature.biome; $('feature-color').value = feature.color; }
  $('line-properties').hidden = !['path', 'river'].includes(selection.type);
  if (feature.width) $('feature-width').value = feature.width;
  $('spawn-properties').hidden = selection.type !== 'spawn';
  if (selection.type === 'spawn') { $('feature-radius').value = feature.radius; $('feature-capacity').value = feature.capacity; }
  $('object-properties').hidden = selection.type !== 'object';
  $('duplicate-object').hidden = selection.type !== 'object';
  if (selection.type === 'object') {
    fillVariants($('object-variant'), feature.kind, feature.variant);
    renderAssetPreview('object', feature.kind, feature.variant);
    $('object-rarity-property').hidden = !WEAPON_TYPES.includes(feature.kind);
    $('object-rarity').value = feature.rarity ?? 'common';
    updateRarityHint();
    $('object-rotation').value = Math.round(feature.rotation * 180 / Math.PI * 100) / 100;
    $('object-scale').value = feature.scale;
    $('object-radius-property').hidden = !['grass', 'flower'].includes(feature.kind);
    $('object-radius').value = feature.radius ?? getObjectDefinition(feature.kind).defaultRadius ?? 1;
    $('object-radius').disabled = $('object-radius-property').hidden;
  }
  // Native form validation must ignore values belonging to another element.
  for (const id of ['position-properties', 'region-properties', 'line-properties', 'spawn-properties', 'object-properties']) {
    for (const input of $(id).querySelectorAll('input,select')) input.disabled = $(id).hidden || Boolean(input.closest('[hidden]'));
  }
  $('vertex-properties').hidden = !feature.points;
  $('delete-feature').hidden = selection.type === 'island';
  if (feature.points) {
    $('vertex-count').textContent = feature.points.length;
    $('delete-vertex').disabled = selection.vertex === null || feature.points.length <= (['island', 'region'].includes(selection.type) ? 3 : 2);
    $('selected-vertex-info').textContent = selection.vertex === null ? 'Kein Formpunkt ausgewählt' : `Punkt ${selection.vertex + 1}: x ${Math.round(feature.points[selection.vertex][0])} · z ${Math.round(feature.points[selection.vertex][1])}`;
  }
}
function applyProperties(event) {
  event.preventDefault();
  if (!selectedFeature()) return;
  commit(candidate => {
    const feature = selectedFeature(candidate);
    feature.name = $('feature-name').value.trim();
    if (feature.position) feature.position = [Number($('feature-x').value), Number($('feature-z').value)];
    if (selection.type === 'region') { feature.biome = $('feature-biome').value.trim(); feature.color = $('feature-color').value; }
    if (['path', 'river'].includes(selection.type)) feature.width = Number($('feature-width').value);
    if (selection.type === 'spawn') { feature.radius = Number($('feature-radius').value); feature.capacity = Number($('feature-capacity').value); }
    if (selection.type === 'object') {
      feature.variant = $('object-variant').value;
      if (WEAPON_TYPES.includes(feature.kind)) feature.rarity = $('object-rarity').value;
      feature.rotation = Number($('object-rotation').value) * Math.PI / 180;
      feature.scale = Number($('object-scale').value);
      if (['grass', 'flower'].includes(feature.kind)) feature.radius = Number($('object-radius').value);
    }
    landscapePanel?.applySelected(feature, selection.type);
  }, 'Eigenschaften übernommen.');
}
function coordinateAt(event) {
  const svg = $('map-stage').firstElementChild;
  const ctm = svg?.getScreenCTM();
  if (!ctm) return [0, 0];
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
  return [point.x, point.y];
}
function snapped(point) {
  return point.map(value => $('snap-grid').checked ? Math.round(value / 10) * 10 : Math.round(value * 10) / 10);
}
function pointForAddition() {
  const center = [Math.round(view.x + view.width / 2), Math.round(view.y + view.height / 2)];
  return pointInPolygon(center, map.island.points) ? center : clone(map.zone.center);
}
function addFeature(type) {
  const position = pointForAddition();
  const id = `${type}-${Date.now().toString(36)}`;
  let added;
  if (type === 'place') added = { id, name: 'Neuer Ort', kind: 'landmark', position };
  if (type === 'region') added = { id, name: 'Neue Region', biome: 'meadow', color: '#a3b674', points: [[position[0] - 60, position[1] - 50], [position[0] + 60, position[1] - 50], [position[0] + 60, position[1] + 50], [position[0] - 60, position[1] + 50]], label: clone(position) };
  if (type === 'path') added = { id, name: 'Neuer Weg', kind: 'trail', width: 5, points: [[position[0] - 50, position[1]], [position[0] + 50, position[1]]] };
  if (type === 'river') added = { id, name: 'Neuer Fluss', width: 12, points: [[position[0], position[1] - 50], [position[0], position[1] + 50]] };
  if (commit(candidate => { candidate[collectionKeys[type]].push(added); }, `${kindNames[type]} hinzugefügt. Ziehen und benennen, um weiterzuarbeiten.`)) {
    if (type === 'spawn') { layers.showSpawns = true; $('layer-spawns').checked = true; }
    $('feature-filter').value = 'all';
    select(type, id);
  }
}
function deleteFeature() {
  if (!selection || selection.type === 'island') return;
  const id = selection.id;
  const type = selection.type;
  if (commit(candidate => {
    if (type === 'terrain' || type === 'wind') { const key = type === 'terrain' ? 'terrain' : 'windZones'; const landscape = ensureLandscape(candidate); landscape[key] = landscape[key].filter(feature => feature.id !== id); }
    else { const key = collectionKeys[type]; candidate[key] = candidate[key].filter(feature => feature.id !== id); }
  }, 'Element entfernt. Mit „Zurück“ wiederherstellen.')) {
    selection = null; renderAll();
  }
}
function addVertex(point = null) {
  const feature = selectedFeature();
  if (!feature?.points) return;
  const isPolygon = ['island', 'region'].includes(selection.type);
  const segmentCount = feature.points.length - (isPolygon ? 0 : 1);
  let index = selection.vertex ?? 0;
  if (index >= segmentCount) index = segmentCount - 1;
  if (point) {
    let bestDistance = Infinity;
    for (let i = 0; i < segmentCount; i++) {
      const a = feature.points[i], b = feature.points[(i + 1) % feature.points.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      const distance = Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz);
      if (distance < bestDistance) { bestDistance = distance; index = i; }
    }
  }
  const next = feature.points[(index + 1) % feature.points.length];
  const added = point ? snapped(point) : snapped([(feature.points[index][0] + next[0]) / 2, (feature.points[index][1] + next[1]) / 2]);
  if (commit(candidate => { selectedFeature(candidate).points.splice(index + 1, 0, added); }, 'Formpunkt eingefügt.')) {
    selection.vertex = index + 1; renderMap(); renderProperties();
  }
}
function deleteVertex() {
  const feature = selectedFeature();
  if (!feature?.points || selection.vertex === null) return;
  const minimum = ['island', 'region'].includes(selection.type) ? 3 : 2;
  if (feature.points.length <= minimum) return toast(`Mindestens ${minimum} Formpunkte müssen bestehen bleiben.`, true);
  const index = selection.vertex;
  // Clear before render because the old last index may cease to exist.
  selection.vertex = null;
  if (!commit(candidate => { selectedFeature(candidate).points.splice(index, 1); }, 'Formpunkt entfernt.')) selection.vertex = index;
  renderMap(); renderProperties();
}
function undo() {
  cancelPointer();
  if (!history.length) return;
  future.push(clone(map)); map = history.pop();
  repairSelection(); saveDraft(); renderAll();
}
function redo() {
  cancelPointer();
  if (!future.length) return;
  history.push(clone(map)); map = future.pop();
  repairSelection(); saveDraft(); renderAll();
}
function repairSelection() {
  const feature = selectedFeature();
  if (!feature) selection = null;
  else if (selection.vertex !== null && selection.vertex >= (feature.points?.length ?? 0)) selection.vertex = null;
}
function zoomBy(factor, anchor = null) {
  const base = initialView();
  const newWidth = Math.max(base.width / 100, Math.min(base.width * 2.5, view.width * factor));
  const ratio = newWidth / view.width;
  const center = anchor ?? [view.x + view.width / 2, view.y + view.height / 2];
  view.x = center[0] - (center[0] - view.x) * ratio;
  view.y = center[1] - (center[1] - view.y) * ratio;
  view.width = newWidth; view.height *= ratio;
  renderMap();
}
function pointerDown(event) {
  if (event.button !== 0 && event.button !== 1 || pointer) return;
  event.preventDefault();
  // Keep Escape/undo usable after choosing a radius or filter in a form field.
  $('map-viewport').focus({ preventScroll: true });
  const start = coordinateAt(event);
  if (mode === 'place' && !spaceHeld && event.button === 0) { addObjectAt(start); return; }
  const pan = mode === 'pan' || spaceHeld || event.button === 1;
  if (mode === 'erase' && !pan) {
    layers.showObjects = true; $('layer-objects').checked = true;
    $('feature-filter').value = 'object'; $('object-kind-filter').value = 'all'; $('feature-search').value = '';
    selection = null; hoverPoint = start; renderMap(); renderProperties();
    pointer = { id: event.pointerId, eraser: createObjectEraserStroke(map, {
      radius: Number($('eraser-radius').value), filter: $('eraser-filter').value,
    }), previous: clone(map) };
    $('map-viewport').setPointerCapture(event.pointerId);
    eraseObjectSample(start);
    return;
  }
  if (mode === 'windzone' && !pan) {
    if (!pointInPolygon(start, map.island.points)) return toast('Bitte eine Windzone auf der Insel setzen.', true);
    const zone = landscapePanel.createZone(snapped(start));
    if (commit(candidate => { ensureLandscape(candidate).windZones.push(zone); }, 'Windzone gesetzt. Am Kreisrand auswählen und verschieben.')) select('wind', zone.id);
    return;
  }
  if (mode === 'terrainErase' && !pan) {
    selection = null; hoverPoint = start;
    pointer = { id: event.pointerId, terrainEraser: { last: start, count: 0 }, previous: clone(map) };
    $('map-viewport').setPointerCapture(event.pointerId); eraseTerrainSample(start); return;
  }
  if (paintModes.includes(mode) && !pan) {
    let stroke;
    try { stroke = landscapePanel.createStroke(mode, map); }
    catch (error) { toast(error.message, true); return; }
    layers.showObjects = true; $('layer-objects').checked = true;
    $('feature-filter').value = 'all'; $('object-kind-filter').value = 'all'; $('feature-search').value = '';
    selection = null; renderMap(); renderProperties();
    pointer = { id: event.pointerId, brush: stroke, paintMode: mode, previous: clone(map) };
    $('map-viewport').setPointerCapture(event.pointerId);
    paintLandscapeSample(start); return;
  }
  const handle = event.target.closest?.('[data-map-handle]');
  const hit = event.target.closest?.('[data-feature-type][data-feature-id]');
  if (!pan && handle && selection) {
    selection.vertex = Number(handle.dataset.mapHandle);
    renderProperties(); renderMap();
  } else if (!pan && hit) {
    select(hit.dataset.featureType, hit.dataset.featureId);
  } else if (!pan) {
    selection = null; renderAll();
  }
  pointer = { id: event.pointerId, start, clientX: event.clientX, clientY: event.clientY, previous: clone(map), originalView: { ...view }, pan: pan || !selection, moved: false, vertex: handle && !pan ? Number(handle.dataset.mapHandle) : null };
  $('map-viewport').setPointerCapture(event.pointerId);
}
function pointerMove(event) {
  const point = coordinateAt(event);
  $('coordinate-display').textContent = `x: ${Math.round(point[0])} · z: ${Math.round(point[1])}`;
  hoverPoint = point;
  if (placementModes.includes(mode) && !pointer) updatePlacementPreview();
  if (!pointer || pointer.id !== event.pointerId) return;
  if (pointer.brush) { event.preventDefault(); paintLandscapeSample(point); return; }
  if (pointer.terrainEraser) { event.preventDefault(); eraseTerrainSample(point); return; }
  if (pointer.eraser) { event.preventDefault(); eraseObjectSample(point); return; }
  if (Math.hypot(event.clientX - pointer.clientX, event.clientY - pointer.clientY) < 3 && !pointer.moved) return;
  pointer.moved = true;
  $('map-viewport').classList.add('is-dragging');
  if (pointer.pan) {
    const svg = $('map-stage').firstElementChild;
    const matrix = svg.getScreenCTM();
    const dx = (event.clientX - pointer.clientX) / matrix.a;
    const dy = (event.clientY - pointer.clientY) / matrix.d;
    view.x = pointer.originalView.x - dx; view.y = pointer.originalView.y - dy;
  } else {
    const feature = selectedFeature();
    const original = selectedFeature(pointer.previous);
    if (!feature) return;
    const delta = snapped([point[0] - pointer.start[0], point[1] - pointer.start[1]]);
    if (feature.points) {
      if (pointer.vertex !== null) feature.points[pointer.vertex] = snapped([original.points[pointer.vertex][0] + delta[0], original.points[pointer.vertex][1] + delta[1]]);
      else {
        feature.points = original.points.map(p => [p[0] + delta[0], p[1] + delta[1]]);
        if (feature.label) feature.label = [original.label[0] + delta[0], original.label[1] + delta[1]];
      }
    } else if (feature.position) feature.position = snapped([original.position[0] + delta[0], original.position[1] + delta[1]]);
  }
  if (pointer.pan) renderMap(false); else updateMovingDrawing();
}
function pointerEnd(event, cancelled = false) {
  if (!pointer || pointer.id !== event.pointerId) return;
  const finished = pointer; pointer = null;
  if ($('map-viewport').hasPointerCapture(event.pointerId)) $('map-viewport').releasePointerCapture(event.pointerId);
  $('map-viewport').classList.remove('is-dragging');
  if (finished.eraser) {
    const result = cancelled ? null : validate(map);
    if (cancelled || !result.valid) {
      map = finished.previous;
      if (!cancelled) toast(`Radieren nicht übernommen: ${result.errors.slice(0, 2).join(' ')}`, true);
    } else if (finished.eraser.objects.length) {
      remember(finished.previous);
      toast(`${finished.eraser.objects.length} Objekte entfernt. „Zurück“ stellt den ganzen Strich wieder her.`);
    } else toast('Kein Objektmittelpunkt berührt. Radius vergrößern oder genauer über das Objekt ziehen.');
    $('eraser-status').textContent = cancelled ? 'Radierstrich verworfen.' : `${finished.eraser.objects.length} Objekte entfernt · ein Schritt zurück stellt sie wieder her`;
    repairSelection(); renderAll();
    return;
  }
  if (finished.brush || finished.terrainEraser) {
    const result = cancelled ? null : validate(map);
    if (cancelled || !result.valid) {
      map = finished.previous;
      if (!cancelled) toast(`Pinselstrich nicht übernommen: ${result.errors.slice(0, 2).join(' ')}`, true);
    } else if (JSON.stringify(map) !== JSON.stringify(finished.previous)) {
      remember(finished.previous);
      const addedObject = finished.brush?.objects.at(-1), addedTerrain = finished.brush?.terrain.at(-1);
      selection = addedObject ? { type: 'object', id: addedObject.id, vertex: null } : addedTerrain ? { type: 'terrain', id: addedTerrain.id, vertex: null } : null;
      toast('Pinselstrich gespeichert. „Zurück“ stellt den ganzen Strich wieder her.');
    } else toast(finished.brush?.full ? 'Die Grenze für diesen Pinselstrich ist erreicht.' : 'Hier wurden keine Änderungen vorgenommen. Freie Fläche oder einen kleineren Pinsel wählen.');
    const message = cancelled ? 'Pinselstrich verworfen.' : finished.brush?.full ? 'Grenze erreicht · Strich gespeichert' : 'Leertaste halten zum Verschieben · Esc beendet';
    $('brush-status').textContent = message; landscapePanel.status(message);
    repairSelection(); renderAll(); return;
  }
  if (!finished.pan && finished.moved) {
    const result = validate(map);
    if (cancelled || !result.valid) {
      map = finished.previous;
      if (!cancelled) toast(`Verschieben nicht übernommen: ${result.errors.slice(0, 2).join(' ')}`, true);
    } else if (JSON.stringify(map) !== JSON.stringify(finished.previous)) remember(finished.previous);
  }
  renderAll();
}
function paintLandscapeSample(point) {
  if (!pointer?.brush) return;
  const added = pointer.brush.sample(point);
  if (added.objects.length) map.objects.push(...added.objects);
  if (added.terrain.length || added.biomes.length) {
    const landscape = ensureLandscape(map);
    landscape.terrain.push(...added.terrain); landscape.biomes.push(...added.biomes);
  }
  if (added.objects.length || added.terrain.length) {
    // Lightweight in-stroke overlay; full map redraw and validation happen once
    // on release, not for every touch sample across thousands of objects.
    const svg = $('map-stage').firstElementChild;
    let preview = svg.querySelector('#brush-stroke-preview');
    if (!preview) { preview = document.createElementNS(SVG_NS, 'g'); preview.id = 'brush-stroke-preview'; preview.setAttribute('pointer-events', 'none'); svg.append(preview); }
    for (const item of [...added.terrain, ...added.objects]) {
      const patch = document.createElementNS(SVG_NS, 'circle');
      patch.setAttribute('cx', item.position[0]); patch.setAttribute('cy', item.position[1]);
      patch.setAttribute('r', item.radius ?? getObjectFootprintRadius(item.kind, item.variant));
      patch.setAttribute('fill', item.color ?? item.vegetation?.color ?? '#759c4b'); patch.setAttribute('fill-opacity', '.65');
      patch.setAttribute('stroke', '#d0e1a4'); patch.setAttribute('stroke-width', '.7'); patch.setAttribute('vector-effect', 'non-scaling-stroke'); preview.append(patch);
    }
  }
  const message = pointer.brush.full ? 'Strichgrenze erreicht · Loslassen zum Speichern' : `${pointer.brush.objects.length} Objekte · ${pointer.brush.terrain.length} Bodenflächen in diesem Strich`;
  $('brush-status').textContent = message; landscapePanel.status(message); updatePlacementPreview();
}
function eraseTerrainSample(point) {
  if (!pointer?.terrainEraser) return;
  const gesture = pointer.terrainEraser;
  const removed = eraseLandscapeAt(map, gesture.last, point, landscapePanel.radius('terrainErase'), 'terrain');
  if (removed.terrainIds.length) {
    const ids = new Set(removed.terrainIds); const landscape = ensureLandscape(map);
    landscape.terrain = landscape.terrain.filter(item => !ids.has(item.id));
    gesture.count += ids.size;
    for (const id of ids) document.getElementById(`feature-terrain-${id}`)?.remove();
  }
  gesture.last = point; landscapePanel.status(`${gesture.count} Bodenflächen entfernt · ein Schritt zurück stellt den Strich wieder her`); updatePlacementPreview();
}
function eraseObjectSample(point) {
  if (!pointer?.eraser) return;
  const removed = pointer.eraser.sample(point);
  if (removed.length) {
    const ids = pointer.eraser.removedIds;
    map.objects = map.objects.filter(object => !ids.has(object.id));
    for (const object of removed) document.getElementById(`feature-object-${object.id}`)?.remove();
  }
  $('eraser-status').textContent = `${pointer.eraser.objects.length} Objekte in diesem Strich entfernt · Loslassen zum Speichern`;
  updatePlacementPreview();
}
function cancelPointer() {
  if (pointer) pointerEnd({ pointerId: pointer.id }, true);
}
function download(contents, filename, mime) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function exportJson() {
  if (pointer || !validate(map).valid) return toast('Bitte die laufende Änderung zuerst abschließen.', true);
  download(`${JSON.stringify(map, null, 2)}\n`, 'worldmap.json', 'application/json');
  toast('worldmap.json gespeichert. Diese Datei ist die Datenbasis für den weiteren Weltbau.');
}
function exportSvg() {
  if (pointer || !validate(map).valid) return toast('Bitte die laufende Änderung zuerst abschließen.', true);
  download(renderWorldmapSvg(map, { ...layers, editor: false, zoneRadius: zoneAt(map, zoneTime).radius }), 'worldmap.svg', 'image/svg+xml');
  toast('worldmap.svg mit editierbaren Vektorflächen gespeichert.');
}
function exportEditor() {
  const externalScript = document.querySelector('script[src]');
  if (externalScript) return toast('Für eine eigenständige HTML-Kopie bitte die gebaute map-editor.html öffnen. JSON und SVG lassen sich hier bereits speichern.', true);
  if (pointer || !validate(map).valid) return toast('Bitte die laufende Änderung zuerst abschließen.', true);
  const doc = document.documentElement.cloneNode(true);
  const snapshot = doc.querySelector('#map-snapshot');
  snapshot.textContent = JSON.stringify(map).replace(/</g, '\\u003c');
  // Rebuild transient UI on next open; no stale user inputs or validation messages.
  doc.querySelector('#map-stage').replaceChildren();
  doc.querySelector('#feature-list').replaceChildren();
  doc.querySelector('#restore-banner').hidden = true;
  doc.querySelector('#toast').hidden = true;
  download(`<!doctype html>\n${doc.outerHTML}`, 'map-editor.html', 'text/html');
  toast('Eigenständiger Editor mit dem aktuellen Kartenstand gespeichert.');
}
async function importJson(event) {
  const file = event.target.files?.[0]; event.target.value = '';
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) return toast('Die Datei ist zu groß. Karten dürfen höchstens 5 MB groß sein.', true);
  let candidate;
  try { candidate = normalizeWorldmap(JSON.parse(await file.text())); }
  catch { return toast('Die Datei ist kein gültiges JSON. Bitte eine worldmap.json auswählen.', true); }
  const result = validate(candidate);
  if (!result.valid) return toast(`Karte nicht geöffnet: ${result.errors.slice(0, 4).join(' ')}`, true);
  const previous = clone(map);
  map = candidate; selection = null; zoneTime = 0; $('zone-time').value = 0; view = initialView();
  remember(previous); renderAll(); toast('Karte geöffnet. Mit „Zurück“ kehrst du zum vorherigen Stand zurück.');
}
function resetMap() {
  const previous = clone(map);
  map = normalizeWorldmap(defaultMap); selection = null; view = initialView(); zoneTime = 0; $('zone-time').value = 0;
  $('reset-confirm').hidden = true;
  remember(previous); renderAll(); toast('Ausgangskarte geladen. Der vorige Stand bleibt unter „Zurück“ erhalten.');
}
function setMode(next) {
  cancelPointer();
  mode = next;
  for (const type of ['select', 'pan']) {
    $(`tool-${type}`).classList.toggle('active', mode === type);
    $(`tool-${type}`).setAttribute('aria-pressed', mode === type ? 'true' : 'false');
  }
  $('place-object').classList.toggle('active', mode === 'place');
  $('place-object').setAttribute('aria-pressed', mode === 'place' ? 'true' : 'false');
  $('grass-brush').classList.toggle('active', mode === 'brush');
  $('grass-brush').setAttribute('aria-pressed', mode === 'brush' ? 'true' : 'false');
  $('grass-brush').textContent = mode === 'brush' ? 'Graspinsel aktiv · Esc beendet' : 'Graspinsel aktivieren';
  $('object-eraser').classList.toggle('active', mode === 'erase');
  $('object-eraser').setAttribute('aria-pressed', mode === 'erase' ? 'true' : 'false');
  $('object-eraser').textContent = mode === 'erase' ? 'Radiergummi aktiv · Esc beendet' : 'Radiergummi aktivieren';
  if (mode === 'erase') {
    layers.showObjects = true; $('layer-objects').checked = true;
    $('feature-filter').value = 'object'; $('object-kind-filter').value = 'all'; $('feature-search').value = '';
    renderList();
  }
  landscapePanel?.sync();
  $('canvas-instruction').textContent = ['terrain','scatter','biome'].includes(mode) ? 'Ziehen: Landschaft gestalten · Leertaste: verschieben · Esc bricht ab' : mode === 'windzone' ? 'Auf die Insel klicken: lokale Windzone setzen · Esc beendet' : mode === 'terrainErase' ? 'Ziehen: gemalte Bodenflächen entfernen · Esc bricht ab' : mode === 'erase' ? 'Ziehen: ganze Objekte radieren · Mittelpunkt berühren · Esc bricht ab' : mode === 'brush' ? 'Ziehen: Versteckgras malen · Leertaste: Karte verschieben · Esc beendet' : mode === 'place' ? 'Auf die Insel klicken, um ein Objekt zu setzen · Esc beendet' : mode === 'pan' ? 'Karte ziehen · Mausrad oder + / − zum Zoomen' : 'Element auswählen und ziehen · Punkte ändern die Form';
  renderMap();
}

function fillVariants(select, kind, value = null) {
  const definition = getObjectDefinition(kind);
  select.replaceChildren();
  for (const variant of definition.variants) {
    const option = document.createElement('option'); option.value = variant.id; option.textContent = variant.label;
    select.append(option);
  }
  select.value = value ?? definition.defaultVariant;
}
function renderAssetPreview(prefix, kind, variant) {
  const asset = getVariantAsset(kind, variant);
  const svg = getVariantPreviewSvg(kind, variant);
  $(`${prefix}-preview-image`).innerHTML = svg;
  $(`${prefix}-preview-title`).textContent = asset?.label ?? getObjectDefinition(kind).label;
  $(`${prefix}-preview-source`).textContent = asset?.sourceLabel ?? 'Vorhandenes Spielmodell';
  $(`${prefix}-preview-note`).textContent = asset?.notes ?? '';
}
function updateRarityHint() {
  const feature = selectedFeature();
  if (!feature || !WEAPON_TYPES.includes(feature.kind)) return;
  const stats = weaponStats(feature.kind, $('object-rarity').value);
  $('object-rarity-hint').textContent = `${stats.damage} Schaden pro Treffer${stats.burn ? ` · zusätzlich ${Math.round(stats.burn.damagePerSecond * stats.burn.duration)} Brandschaden` : stats.slow ? ' · 50 % Verlangsamung' : ''}`;
}
function updatePaletteRarity() {
  $('palette-rarity-property').hidden = !WEAPON_TYPES.includes($('palette-kind').value);
  $('palette-rarity').disabled = $('palette-rarity-property').hidden;
}
function preparePalette() {
  $('palette-kind').replaceChildren(); $('palette-rarity').replaceChildren(); $('object-rarity').replaceChildren();
  $('object-kind-filter').innerHTML = '<option value="all">Alle Objektarten</option>';
  for (const rarity of Object.values(RARITIES)) for (const select of [$('palette-rarity'), $('object-rarity')]) {
    const option = document.createElement('option'); option.value = rarity.id;
    option.textContent = `${rarity.label} · ×${rarity.multiplier}`; select.append(option);
  }
  $('palette-rarity').value = 'common';
  for (const definition of OBJECT_CATALOG) {
    for (const select of [$('palette-kind'), $('object-kind-filter')]) {
      const option = document.createElement('option'); option.value = definition.kind; option.textContent = definition.label;
      select.append(option);
    }
  }
  fillVariants($('palette-variant'), $('palette-kind').value);
  updatePaletteRarity();
  renderAssetPreview('palette', $('palette-kind').value, $('palette-variant').value);
}
function addObjectAt(point) {
  const position = snapped(point);
  if (!pointInPolygon(position, map.island.points)) return toast('Bitte einen Punkt auf der Insel wählen.', true);
  const kind = $('palette-kind').value;
  const added = makeWorldObject(kind, position, {variant: $('palette-variant').value, rarity: $('palette-rarity').value});
  if (commit(candidate => { candidate.objects.push(added); }, `${getObjectDefinition(kind).label} gesetzt. Weitere Klicks setzen weitere Objekte; Esc beendet.`)) {
    layers.showObjects = true; $('layer-objects').checked = true;
    $('feature-filter').value = 'object'; $('object-kind-filter').value = kind; $('feature-search').value = ''; listLimit = 50;
    select('object', added.id);
  }
}
function focusSelection() {
  const feature = selectedFeature();
  if (!feature) return;
  if (selection.type === 'island') { view = initialView(); return renderMap(); }
  const points = feature.points ?? [feature.position];
  const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
  const center = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  const width = Math.max(selection.type === 'object' ? objectFootprint(feature) * 5 : ['terrain','wind'].includes(selection.type) ? feature.radius * 2.8 : 40, Math.max(...xs) - Math.min(...xs) + 35, 40);
  const aspect = Math.max(.35, $('map-viewport').clientWidth / Math.max(1, $('map-viewport').clientHeight));
  const height = Math.max(width / aspect, Math.max(...zs) - Math.min(...zs) + 35);
  view = {x: center[0] - height * aspect / 2, y: center[1] - height / 2, width: height * aspect, height};
  renderMap();
}
function duplicateObject() {
  const original = selectedFeature();
  if (selection?.type !== 'object' || !original) return;
  let point = [original.position[0] + 5, original.position[1] + 5];
  if (!pointInPolygon(point, map.island.points)) point = original.position;
  const added = makeWorldObject(original.kind, point, {...original, id: undefined, name: `${original.name} · Kopie`.slice(0,120)});
  if (original.vegetation) added.vegetation = clone(original.vegetation);
  if (commit(candidate => { candidate.objects.push(added); }, 'Objekt dupliziert. Die Kopie lässt sich unabhängig verschieben.')) select('object', added.id);
}
function playtestWorld() {
  if (pointer || !validate(map).valid) return toast('Bitte die laufende Änderung zuerst abschließen.', true);
  const snapshot = clone(map);
  let stored = false;
  try { localStorage.setItem(PLAYTEST_KEY, JSON.stringify(snapshot)); stored = true; } catch { /* Popup handshake also works without storage. */ }
  if (!['http:', 'https:', 'file:'].includes(location.protocol)) return toast('JSON speichern und im Spiel laden, oder den Editor als HTML-Datei im Browser öffnen.', true);
  const url = new URL(location.protocol === 'file:' ? './nebeljagd.html?mapSource=editor' : './index.html?mapSource=editor', location.href);
  const popup = window.open(url.href, '_blank');
  if (!popup) return toast('Der Browser hat das neue Fenster blockiert. Pop-ups für diesen Editor erlauben oder JSON im Spiel laden.', true);
  playtestWindows.set(popup, {map: snapshot, origin: location.origin});
  setTimeout(() => playtestWindows.delete(popup), 30_000);
  toast(location.protocol === 'file:' ? '3D-Test geöffnet. Die nebeljagd.html muss neben dieser Editor-Datei liegen.' : stored ? '3D-Welt mit diesem Kartenstand geöffnet.' : '3D-Welt erhält diesen Kartenstand direkt vom Editor.');
}
window.addEventListener('message', event => {
  const session = playtestWindows.get(event.source);
  if (!session || event.origin !== session.origin || event.data?.type !== 'nebeljagd-map-request') return;
  event.source.postMessage({type: 'nebeljagd-map', map: session.map}, session.origin === 'null' ? '*' : session.origin);
  playtestWindows.delete(event.source);
});
preparePalette();
landscapePanel = createLandscapePanel({ getMap: () => map, getMode: () => mode, setMode, commit, toast,
  getPosition: () => selectedFeature()?.position ?? hoverPoint ?? map.gameplay.spawnPosition ?? map.zone.center,
  refreshCursor: () => updatePlacementPreview(),
});
$('palette-kind').addEventListener('change', () => { fillVariants($('palette-variant'), $('palette-kind').value); updatePaletteRarity(); renderAssetPreview('palette', $('palette-kind').value, $('palette-variant').value); updatePlacementPreview(); });
$('palette-variant').addEventListener('change', () => { renderAssetPreview('palette', $('palette-kind').value, $('palette-variant').value); updatePlacementPreview(); });
$('object-variant').addEventListener('change', () => { const feature = selectedFeature(); if (feature) renderAssetPreview('object', feature.kind, $('object-variant').value); if (feature?.kind === 'grass') landscapePanel.setSelectedVariant($('object-variant').value); });
$('grass-brush').addEventListener('click', () => setMode(mode === 'brush' ? 'select' : 'brush'));
$('object-eraser').addEventListener('click', () => setMode(mode === 'erase' ? 'select' : 'erase'));
$('eraser-radius').addEventListener('input', () => { cancelPointer(); $('eraser-radius-value').textContent = `${$('eraser-radius').value} m`; updatePlacementPreview(); });
$('eraser-filter').addEventListener('change', () => { cancelPointer(); updatePlacementPreview(); });
$('brush-radius').addEventListener('input', () => { $('brush-radius-value').textContent = `${$('brush-radius').value} m`; updatePlacementPreview(); });
$('object-rarity').addEventListener('change', updateRarityHint);
$('place-object').addEventListener('click', () => setMode(mode === 'place' ? 'select' : 'place'));
$('add-object-center').addEventListener('click', () => addObjectAt(pointForAddition()));
$('duplicate-object').addEventListener('click', duplicateObject);
$('focus-selection').addEventListener('click', focusSelection);
$('playtest-world').addEventListener('click', playtestWorld);

$('properties-form').addEventListener('submit', applyProperties);
$('feature-filter').addEventListener('change', () => { listLimit = 50; renderList(); });
$('feature-search').addEventListener('input', () => { listLimit = 50; renderList(); });
$('object-kind-filter').addEventListener('change', () => { listLimit = 50; $('feature-filter').value = 'object'; renderList(); renderMap(); });
$('list-more').addEventListener('click', () => { listLimit += 50; renderList(); });
$('clear-selection').addEventListener('click', () => { selection = null; renderAll(); });
$('undo').addEventListener('click', undo); $('redo').addEventListener('click', redo);
$('add-vertex').addEventListener('click', () => addVertex()); $('delete-vertex').addEventListener('click', deleteVertex);
$('delete-feature').addEventListener('click', deleteFeature);
for (const type of ['place', 'region', 'path', 'river']) $(`add-${type}`).addEventListener('click', () => addFeature(type));
for (const type of ['select', 'pan']) $(`tool-${type}`).addEventListener('click', () => setMode(type));
$('zoom-in').addEventListener('click', () => zoomBy(.8)); $('zoom-out').addEventListener('click', () => zoomBy(1.25));
$('fit-map').addEventListener('click', () => { view = initialView(); renderMap(); });
for (const [id, key] of [['layer-objects', 'showObjects'], ['layer-labels', 'showLabels'], ['layer-spawns', 'showSpawns'], ['layer-grid', 'showGrid'], ['layer-zone', 'showZone']]) $(id).addEventListener('change', () => { layers[key] = $(id).checked; renderMap(); });
$('zone-time').addEventListener('input', event => { zoneTime = Number(event.target.value); renderMap(); });
$('import-json').addEventListener('click', () => $('json-file-input').click());
$('json-file-input').addEventListener('change', importJson);
$('export-json').addEventListener('click', exportJson); $('export-svg').addEventListener('click', exportSvg); $('export-editor').addEventListener('click', exportEditor);
$('reset-map').addEventListener('click', () => { $('reset-confirm').hidden = !$('reset-confirm').hidden; });
$('reset-confirm-yes').addEventListener('click', resetMap); $('reset-confirm-no').addEventListener('click', () => { $('reset-confirm').hidden = true; });
$('map-viewport').addEventListener('pointerdown', pointerDown);
$('map-viewport').addEventListener('pointermove', pointerMove);
$('map-viewport').addEventListener('pointerup', event => pointerEnd(event));
$('map-viewport').addEventListener('pointercancel', event => pointerEnd(event, true));
$('map-viewport').addEventListener('lostpointercapture', event => pointerEnd(event, true));
$('map-viewport').addEventListener('pointerleave', () => { if (!pointer) { hoverPoint = null; updatePlacementPreview(); } });
$('map-viewport').addEventListener('dblclick', event => {
  if (mode === 'select' && selectedFeature()?.points) { event.preventDefault(); addVertex(coordinateAt(event)); }
});
$('map-viewport').addEventListener('wheel', event => {
  event.preventDefault(); if (pointer?.brush || pointer?.eraser || pointer?.terrainEraser) return; zoomBy(event.deltaY > 0 ? 1.12 : 1 / 1.12, coordinateAt(event));
}, { passive: false });
document.addEventListener('keydown', event => {
  const editing = event.target.closest?.('input,textarea,select,[contenteditable=true]');
  if (editing) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); selection?.vertex !== null && selectedFeature()?.points ? deleteVertex() : deleteFeature(); }
  if (event.key === 'Escape') { selection = null; setMode('select'); renderAll(); }
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); focusSelection(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selection?.type === 'object') { event.preventDefault(); duplicateObject(); }
  if (event.code === 'Space') { event.preventDefault(); if (!pointer?.brush && !pointer?.eraser && !pointer?.terrainEraser) { spaceHeld = true; renderMap(); } }
});
document.addEventListener('keyup', event => { if (event.code === 'Space') { spaceHeld = false; renderMap(); } });
window.addEventListener('blur', () => { cancelPointer(); spaceHeld = false; renderMap(false); });
new ResizeObserver(() => { if (!pointer) renderMap(); }).observe($('map-viewport'));

try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored.length <= MAX_FILE_BYTES) {
    const candidate = normalizeWorldmap(JSON.parse(stored));
    if (validate(candidate).valid && JSON.stringify(candidate) !== JSON.stringify(map)) {
      restoredDraft = candidate; $('restore-banner').hidden = false;
    }
  }
} catch { storageAvailable = false; }
$('restore-draft').addEventListener('click', () => {
  if (!restoredDraft) return;
  const previous = clone(map); map = clone(restoredDraft); selection = null; view = initialView();
  restoredDraft = null;
  remember(previous); renderAll(); toast('Lokalen Entwurf wiederhergestellt.');
});
$('discard-draft').addEventListener('click', () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch { storageAvailable = false; }
  restoredDraft = null; $('restore-banner').hidden = true;
  if (JSON.stringify(map) !== JSON.stringify(initialSnapshot)) saveDraft();
});
window.nebeljagdMapTestState = () => ({
  map: clone(map), data: clone(map), selection: clone(selection), mode,
  brush: { radius: Number($('brush-radius').value), activeStroke: Boolean(pointer?.brush), pendingObjects: pointer?.brush?.objects.length ?? 0 },
  eraser: { radius: Number($('eraser-radius').value), filter: $('eraser-filter').value, activeStroke: Boolean(pointer?.eraser), pendingObjects: pointer?.eraser?.objects.length ?? 0 },
  landscape: landscapePanel?.state(),
  dirty: JSON.stringify(map) !== JSON.stringify(initialSnapshot),
  viewBox: [view.x, view.y, view.width, view.height], view: { ...view }, zoom: (map.bounds.maxX - map.bounds.minX) / view.width,
  zone: zoneAt(map, zoneTime), zoneTime, palette: {kind: $('palette-kind').value, variant: $('palette-variant').value, rarity: $('palette-rarity').value}, visibleListRows: $('feature-list').children.length, undoCount: history.length, redoCount: future.length, layers: { ...layers }, storageAvailable,
});
renderAll();
if (!storageAvailable) $('save-status').textContent = 'Nur im Speicher · JSON exportieren';
