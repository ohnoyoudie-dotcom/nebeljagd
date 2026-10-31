import { BARRIER_STYLES, barrierLength, makeBarrier } from './barriers.js';
import { createBarrierPreview } from './barrier-preview.js';

const $ = id => document.getElementById(id);
const options = BARRIER_STYLES.map(style => `<option value="${style.kind}">${style.label}</option>`).join('');

/** Line controls are separate from the chosen GLB: changing a style never loses the route. */
export function createBarrierPanel(api) {
  $('barrier-tools')?.remove(); $('barrier-properties')?.remove();
  const section = document.createElement('section');
  section.id = 'barrier-tools'; section.className = 'tool-section barrier-tools';
  section.innerHTML = `<div class="section-heading"><h2>Mauern & Zäune ziehen</h2><span class="count-badge">NEU</span></div>
    <p class="small-note">Wähle ein Material und ziehe eine Strecke. Die Bauteile setzen sich von selbst zusammen.</p>
    <label for="barrier-kind">Was möchtest du bauen?</label><select id="barrier-kind">${options}</select>
    <label for="barrier-shape">Linienführung</label><select id="barrier-shape"><option value="straight">Gerade ziehen</option><option value="freehand">Freihand mit Ecken</option></select>
    <button type="button" id="barrier-draw" class="button primary" aria-pressed="false">Strecke ziehen</button>
    <div class="barrier-actions"><button type="button" id="barrier-gap" class="button small" aria-pressed="false">Durchgang setzen</button><button type="button" id="barrier-erase" class="button small" aria-pressed="false">Strecken radieren</button></div>
    <label class="landscape-check"><input type="checkbox" id="barrier-snap" checked> Auf ganze Meter einrasten</label>
    <label for="barrier-gap-width">Durchgangsbreite · Meter</label><input id="barrier-gap-width" type="number" min="1.5" max="12" step="0.5" value="3">
    <p class="small-note" id="barrier-status" role="status">Loslassen: speichern · Esc: abbrechen · Auswählen: Form ändern</p>
    <details id="barrier-preview-section"><summary>3D-Vorschau</summary><div id="barrier-preview" class="barrier-preview"></div><p id="barrier-preview-status" class="small-note" role="status">Zeigt die gewählte Strecke oder ein Beispiel.</p></details>`;
  $('editor-pane-objects').prepend(section);
  const inspector = document.createElement('div'); inspector.id = 'barrier-properties'; inspector.hidden = true;
  inspector.innerHTML = `<label for="barrier-object-kind">Material dieser Strecke</label><select id="barrier-object-kind">${options}</select>
    <label for="barrier-object-scale">Größe · Faktor</label><input id="barrier-object-scale" type="number" min="0.25" max="3" step="0.05" value="1">
    <p id="barrier-length" class="small-note"></p><p class="small-note">Die hellen Punkte auf der Karte verschieben. Mit „Punkt hinzufügen“ baust du weitere Ecken.</p>
    <button type="button" id="barrier-selection-preview" class="button small">Strecke in 3D ansehen</button>
    <h3>Durchgänge</h3><div id="barrier-gap-list"></div><button type="button" id="barrier-selection-gap" class="button small">Durchgang auf Karte setzen</button>`;
  $('properties-form').insertBefore(inspector, document.querySelector('.apply-properties'));
  if (!$('feature-filter').querySelector('option[value="barrier"]')) {
    const option = document.createElement('option'); option.value = 'barrier'; option.textContent = 'Mauer- und Zaunstrecken'; $('feature-filter').append(option);
  }
  const preview = createBarrierPreview($('barrier-preview'), $('barrier-preview-status'));
  let previewId = null, previewKey = null;
  const previewFeature = () => api.getMap().barriers?.find(item => item.id === previewId)
    ?? makeBarrier($('barrier-kind').value, [[-8, 0], [8, 0]], { id: 'barrier-example', gaps: [{ at: 8, width: 3 }] });
  function refreshPreview() {
    if (!$('barrier-preview-section').open) return;
    const item = previewFeature(), key = JSON.stringify(item);
    if (key !== previewKey) { previewKey = key; void preview.show(item); }
  }
  function showPreview(feature) {
    previewId = feature?.id ?? null; api.showObjectsPane(); $('barrier-preview-section').open = true;
    refreshPreview(); $('barrier-preview-section').scrollIntoView({ block: 'nearest' });
  }
  for (const [id, mode] of [['barrier-draw', 'barrierDraw'], ['barrier-gap', 'barrierGap'], ['barrier-erase', 'barrierErase']]) {
    $(id).addEventListener('click', () => api.setMode(api.getMode() === mode ? 'select' : mode));
  }
  $('barrier-kind').addEventListener('change', () => { api.cancelPointer(); previewId = null; refreshPreview(); });
  for (const id of ['barrier-shape', 'barrier-snap', 'barrier-gap-width']) $(id).addEventListener('change', api.cancelPointer);
  $('barrier-preview-section').addEventListener('toggle', refreshPreview);
  $('barrier-selection-preview').addEventListener('click', () => showPreview(api.selectedFeature()));
  $('barrier-selection-gap').addEventListener('click', () => { api.showObjectsPane(); api.setMode('barrierGap'); });
  function sync() {
    for (const [id, mode] of [['barrier-draw', 'barrierDraw'], ['barrier-gap', 'barrierGap'], ['barrier-erase', 'barrierErase']]) {
      const active = api.getMode() === mode; $(id).setAttribute('aria-pressed', String(active)); $(id).classList.toggle('active', active);
    }
    $('barrier-draw').textContent = api.getMode() === 'barrierDraw' ? 'Zeichnen beenden' : 'Strecke ziehen';
    refreshPreview();
  }
  function renderSelected(feature, type) {
    inspector.hidden = type !== 'barrier' || !feature;
    for (const input of inspector.querySelectorAll('input,select')) input.disabled = inspector.hidden;
    if (inspector.hidden) return;
    $('barrier-object-kind').value = feature.kind; $('barrier-object-scale').value = feature.scale;
    $('barrier-length').textContent = `${barrierLength(feature).toLocaleString('de-DE', { maximumFractionDigits: 1 })} m Länge · ${feature.points.length} Formpunkte`;
    const list = $('barrier-gap-list'); list.replaceChildren();
    if (!feature.gaps?.length) { const note = document.createElement('p'); note.className = 'small-note'; note.textContent = 'Noch kein Durchgang.'; list.append(note); }
    for (const [index, gap] of (feature.gaps ?? []).entries()) {
      const row = document.createElement('div'); row.className = 'barrier-gap-row';
      const label = document.createElement('span'); label.textContent = `${gap.width} m breit · bei ${Math.round(gap.at)} m`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = 'Schließen';
      remove.setAttribute('aria-label', `Durchgang ${index + 1} schließen`);
      remove.addEventListener('click', () => api.commit(candidate => {
        candidate.barriers.find(item => item.id === feature.id).gaps.splice(index, 1);
      }, 'Durchgang geschlossen.'));
      row.append(label, remove); list.append(row);
    }
    previewId = feature.id; refreshPreview();
  }
  function applySelected(feature, type) {
    if (type !== 'barrier') return;
    const style = BARRIER_STYLES.find(item => item.kind === $('barrier-object-kind').value);
    feature.kind = style.kind; feature.variant = style.variant; feature.scale = Number($('barrier-object-scale').value);
  }
  return { sync, renderSelected, applySelected, showPreview,
    settings: () => ({ kind: $('barrier-kind').value, shape: $('barrier-shape').value, snap: $('barrier-snap').checked, gapWidth: Number($('barrier-gap-width').value) }),
    status: text => { $('barrier-status').textContent = text; },
    setPreview: feature => { previewId = feature?.id ?? null; refreshPreview(); },
  };
}
