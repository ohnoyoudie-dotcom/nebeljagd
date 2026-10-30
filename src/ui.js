import portraitUrl from '../assets/characters/player-portrait.png?url&inline';
import { WEAPON_TYPES, weaponStats } from './loot-tiers.js';

function describeWeapon(item) {
  const type = item.type || item.kind;
  if (!WEAPON_TYPES.includes(type)) return { name: 'Leer', rarity: '', rarityLabel: '', color: '#bdc7af', damage: 0 };
  const stats = weaponStats(type, item.rarity);
  return { ...stats, ...item, name: item.label || (item.name && item.name !== stats.name ? item.name : stats.label) };
}

const icon = (name, className = '') => {
  const shapes = {
    leaf: '<path d="M19 3C9 2 3 7 4 13c.6 4 4 6 7 5 6-2 8-9 8-15Z"/><path d="M4 21 15 9M8 16l-1-5m5 1 4 1"/>',
    coin: '<ellipse cx="12" cy="12" rx="8" ry="9"/><ellipse cx="12" cy="12" rx="5" ry="6"/><path d="M12 8v8m-2-6h3a1 1 0 0 1 0 2h-2a1 1 0 0 0 0 2h3"/>',
    chest: '<path d="M3 11h18v10H3ZM3 11V8a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v3M8 3v8m8-8v8"/><path d="M10 10h4v5h-4z"/>',
    fireStaff: '<path d="m5 22 9-14m-5 7 4 2M13 11c-5-2-2-6 1-8 0 3 5 3 4 6a3 3 0 0 1-5 2Z"/>',
    iceStaff: '<path d="m5 22 9-14M14 1v12M8 4l12 6M8 10l12-6M11 2l3 2 3-2m-6 10 3-2 3 2"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    fog: '<path d="M4 7h9m3 0h4M2 12h20M5 17h6m3 0h5"/><path d="m10 3 2-2 2 2"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    dash: '<path d="m13 2-8 12h6l-1 8 9-13h-7l1-7Z"/>',
    roll: '<path d="M4 11a8 8 0 1 1 2.2 7M4 11V5m0 6h6"/><circle cx="12" cy="13" r="2"/>',
    bow: '<path d="M7 3c8 2 13 10 10 18M7 3c-8 3-8 15 10 18M7 3l10 18M3 13l17-4m-4-3 4 3-2 4"/>',
    sword: '<path d="m19 3 2 2-9 10-3-3 10-9ZM8 12l4 4m-8-1 5 5m-3-7 5 5m-5 3 3-3"/>',
    hand: '<path d="M8 13V7a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v5-2a1.5 1.5 0 0 1 3 0v4c0 4-2 7-7 7h-2c-3 0-4-2-7-6a1.5 1.5 0 0 1 2-2l2 2Z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5 5-3Z"/>',
    shield: '<path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    return: '<path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12h-3"/>',
  };
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.leaf}</svg>`;
};

const portrait = `<img src="${portraitUrl}" width="64" height="64" alt="" aria-hidden="true">`;

const pad = n => String(Math.max(0, Math.floor(n))).padStart(2, '0');
const timeLabel = seconds => `${pad(seconds / 60)}:${pad(seconds % 60)}`;

export function createUI({ onStart, onPause, onResume, onRestart, onDash, onAttack, onInteract, onQualityChange, onMapImport } = {}) {
  const root = document.getElementById('ui');
  root.dataset.phase = 'ready';
  root.innerHTML = `
    <div class="world-vignette" aria-hidden="true"></div>
    <header class="brand-lockup">
      <div class="brand-mark">${icon('leaf')}</div>
      <div><div class="brand-title">NEBELJAGD</div><div class="brand-subtitle">DIE NEBELINSEL</div></div>
    </header>

    <div class="zone-panel playing-only" id="zonePanel">
      <span class="zone-icon">${icon('fog')}</span>
      <div class="zone-copy"><span class="eyebrow" id="zoneLabel">DER NEBEL ZIEHT AUF</span><div><strong id="zoneTime">03:00</strong><span class="zone-separator">/</span><span id="zoneRadius">— m</span></div></div>
      <div class="zone-track"><div id="zoneProgress"></div></div>
    </div>

    <div class="top-tools playing-only">
      <button id="pauseBtn" class="icon-button" aria-label="Spiel pausieren" title="Pause · Esc">${icon('pause')}</button>
    </div>
    <aside class="map-panel playing-only" aria-label="Minikarte der Insel">
      <div class="map-heading"><span>${icon('compass')}<strong id="mapViewLabel">UMGEBUNG</strong></span><span class="map-north" aria-label="Norden ist oben">N ↑</span></div>
      <div class="map-frame"><canvas id="minimap" width="512" height="512" aria-label="Deine Position, bekannte Orte und die sichere Zone"></canvas></div>
      <div class="map-mode-switch" role="group" aria-label="Kartenansicht"><button id="mapMode-local" type="button" aria-pressed="true">Umgebung</button><button id="mapMode-island" type="button" aria-pressed="false">Insel</button></div>
      <div class="map-legend" aria-label="Kartenlegende"><span><i class="map-key-self"></i>Du</span><span><i class="map-key-place"></i>Ort</span><span><i class="map-key-loot"></i>Beute</span></div>
    </aside>

    <section class="player-panel playing-only" aria-label="Spielfigur und Gesundheit">
      <div class="portrait">${portrait}<span class="portrait-level">I</span></div>
      <div class="player-info"><div class="player-name-row"><strong>Abenteurer</strong><span id="healthValue">75 <small>/ 100</small></span></div>
        <div id="healthBar" class="health-track" role="progressbar" aria-label="Lebenspunkte" aria-valuemin="0" aria-valuemax="100" aria-valuenow="75"><div id="healthFill"></div><span class="health-segments"></span></div>
        <div class="player-status" id="playerStatusWrap"><span class="status-dot"></span><span id="playerStatus">Bereit für das Unbekannte</span></div>
      </div>
    </section>

    <div class="inventory playing-only"><span class="inventory-icon">${icon('coin')}</span><strong id="goldCount">0</strong><span>Gold</span></div>
    <div class="weapon-status playing-only" id="weaponStatus" aria-label="Ausgerüstete Waffe: Leer" aria-live="polite"><span class="weapon-status-icon" id="weaponIcon">${icon('shield')}</span><span class="weapon-status-copy"><small id="weaponTier">WAFFE</small><strong id="weaponName">Leer</strong><span id="weaponDetail"></span></span></div>
    <button id="pickupPrompt" class="pickup-prompt playing-only" aria-label="Waffe mit E aufnehmen" hidden>${icon('hand')}<span class="pickup-key"><kbd>E</kbd><span id="pickupAction">aufnehmen</span></span><strong id="pickupItem">Bogen</strong></button>
    <div class="desktop-controls playing-only"><span class="key-cluster"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>Bewegen</span><i></i><kbd class="space-key">LEERTASTE</kbd><span>Rolle</span><i></i><kbd>F</kbd><span>Angriff</span><i></i><kbd>E</kbd><span>Wechseln / öffnen</span></div>
    <div class="touch-controls playing-only">
      <div id="joystick" class="joystick" role="group" aria-label="Virtueller Bewegungsjoystick"><span class="joystick-cross"></span><div id="joystickKnob" class="joystick-knob">${icon('compass')}</div></div>
      <div class="touch-actions">
        <button id="pickupBtn" class="pickup-button" aria-label="Waffe aufheben" hidden>${icon('hand')}<span>AUFHEBEN</span></button>
        <button id="dashBtn" class="dash-button" aria-label="Rolle ausführen">${icon('roll')}<span>ROLLE</span></button>
        <button id="attackBtn" class="attack-button" aria-label="Angriff" disabled>${icon('sword')}<span>ANGRIFF</span></button>
      </div>
    </div>

    <div class="danger-warning playing-only" id="dangerWarning" role="status">${icon('fog')}<span>Du bist im Nebel. Zurück in die sichere Zone!</span></div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>

    <section class="intro-screen" id="startScreen" aria-labelledby="introTitle">
      <div class="intro-atmosphere" aria-hidden="true"></div>
      <div class="intro-card">
        <div class="intro-eyebrow"><span></span>DIE GROSSE NEBELINSEL</div>
        <h1 id="introTitle">Die Insel<br><em>ruft.</em></h1>
        <p class="intro-description">Erkunde offene Häuser und alte Ruinen. Finde Gold und seltene Waffen in Truhen. Hinter Mauern, Bäumen und hohem Gras bleibst du verborgen — deine Sicht reicht nur in die Nähe.</p>
        <div class="intro-world-summary"><strong id="worldName">Die Nebelinsel</strong><span id="worldStats">Die Welt wird vorbereitet …</span></div>
        <div class="intro-features"><span>${icon('leaf')}Erkunden</span><span>${icon('chest')}Schätze finden</span><span>${icon('shield')}Überleben</span></div>
        <button id="startBtn" class="primary-button"><span>Insel betreten</span>${icon('arrow')}</button>
        <div class="world-map-actions"><button id="loadMapBtn" class="map-load-button" type="button" disabled>Eigene Karte laden</button><a href="./map-editor.html" target="_blank" rel="noopener">Im Karteneditor gestalten ${icon('arrow')}</a></div>
        <input id="worldMapFile" type="file" accept=".json,application/json" hidden>
        <div class="intro-controls"><span class="desktop-hint">WASD / PFEILE <b>BEWEGEN</b><span>·</span> LEERTASTE <b>ROLLE</b><span>·</span> F <b>ANGRIFF</b><span>·</span> E <b>WECHSELN / ÖFFNEN</b><br>ERSTE WAFFE <b>AUTOMATISCH BEIM DARÜBERLAUFEN</b></span><span class="touch-hint">JOYSTICK ZUM BEWEGEN · TASTEN FÜR ROLLE UND ANGRIFF</span></div>
      </div>
      <div class="intro-location"><span>01</span><div>Die Nebelinsel<small>Ein Ort voller Geheimnisse</small></div></div>
    </section>

    <section class="modal-screen" id="pauseScreen" aria-labelledby="pauseTitle" hidden>
      <div class="modal-card"><span class="modal-emblem">${icon('leaf')}</span><div class="eyebrow">EIN MOMENT DER RUHE</div><h2 id="pauseTitle">Durchatmen.</h2><p>Die Insel wartet auf dich.</p>
        <button id="resumeBtn" class="primary-button"><span>Weiter erkunden</span>${icon('arrow')}</button>
        <button id="restartBtn" class="secondary-button">Neu beginnen</button>
        ${onQualityChange ? '<label class="quality-option" for="qualityMode">Darstellung<select id="qualityMode"><option value="high">Detailreich</option><option value="low">Leistung</option></select></label>' : ''}
        <p class="pause-help desktop-hint">WASD / Pfeile · Bewegen<br>Leertaste · Rolle &nbsp; F · Angriff &nbsp; E · Aufheben / Truhe öffnen<br>Esc · Pause</p>
      </div>
    </section>
    <section class="modal-screen" id="deathScreen" aria-labelledby="deathTitle" hidden>
      <div class="modal-card"><span class="modal-emblem">${icon('fog')}</span><div class="eyebrow">DER NEBEL HAT DICH GEFUNDEN</div><h2 id="deathTitle">Ein neuer Anfang.</h2><p>Jeder Weg durch den Wald lehrt dich etwas.</p><div class="round-result"><span>Erkundet<strong id="finalTime">00:00</strong></span><span>Gold<strong id="finalGold">0</strong></span></div><button id="retryBtn" class="primary-button"><span>Zurück auf die Insel</span>${icon('return')}</button></div>
    </section>
    <section class="modal-screen error-screen" id="errorScreen" hidden><div class="modal-card"><span class="modal-emblem">${icon('fog')}</span><h2>Die Insel ist noch im Nebel.</h2><p id="errorMessage"></p></div></section>
  `;

  const $ = id => document.getElementById(id);
  const healthFill = $('healthFill');
  const healthValue = $('healthValue');
  const healthBar = $('healthBar');
  const zoneTime = $('zoneTime');
  const zoneRadius = $('zoneRadius');
  const zonePanel = $('zonePanel');
  const zoneLabel = $('zoneLabel');
  const zoneProgress = $('zoneProgress');
  const goldCount = $('goldCount');
  const playerStatus = $('playerStatus');
  const dangerWarning = $('dangerWarning');
  const map = $('minimap');
  const mapContext = map.getContext('2d');
  const toastElement = $('toast');
  const dashButton = $('dashBtn');
  const attackButton = $('attackBtn');
  const interactButton = $('pickupBtn');
  const pickupPrompt = $('pickupPrompt');
  const weaponStatus = $('weaponStatus');
  const weaponIcon = $('weaponIcon');
  const weaponName = $('weaponName');
  const weaponTier = $('weaponTier');
  const weaponDetail = $('weaponDetail');
  const pickupAction = $('pickupAction');
  const pickupItem = $('pickupItem');
  let currentPhase = 'ready';
  let latestState = {};
  let toastTimeout;
  let lastMapTime = -Infinity;
  let lastHealth = -1;
  let lastDanger = false;
  let lastWeaponType;
  let lastNearWeaponType;
  let worldmap = null;
  let mapBackdrop = null;
  let mapProjection = null;

  $('startBtn').addEventListener('click', () => onStart?.());
  $('pauseBtn').addEventListener('click', () => onPause?.());
  $('resumeBtn').addEventListener('click', () => onResume?.());
  $('restartBtn').addEventListener('click', () => onRestart?.());
  $('retryBtn').addEventListener('click', () => onRestart?.());
  dashButton.addEventListener('pointerdown', event => { event.preventDefault(); onDash?.(); });
  attackButton.addEventListener('pointerdown', event => { event.preventDefault(); if (!attackButton.disabled) onAttack?.(); });
  interactButton.addEventListener('pointerdown', event => { event.preventDefault(); if (!interactButton.disabled) onInteract?.(); });
  pickupPrompt.addEventListener('pointerdown', event => { event.preventDefault(); if (!pickupPrompt.disabled) onInteract?.(); });
  attackButton.addEventListener('click', event => { if (event.detail === 0 && !attackButton.disabled) onAttack?.(); });
  interactButton.addEventListener('click', event => { if (event.detail === 0 && !interactButton.disabled) onInteract?.(); });
  pickupPrompt.addEventListener('click', event => { if (event.detail === 0 && !pickupPrompt.disabled) onInteract?.(); });
  $('qualityMode')?.addEventListener('change', event => onQualityChange?.(event.target.value));
  $('loadMapBtn').addEventListener('click', () => $('worldMapFile').click());
  $('worldMapFile').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!onMapImport) return toast('Diese Spielversion unterstützt den Kartenimport noch nicht.', 'danger');
    try { await onMapImport(file); }
    catch (error) { toast(error?.message || 'Die Karte konnte nicht geladen werden.', 'danger'); }
  });

  function setPhase(phase) {
    if (!['ready', 'playing', 'paused', 'dead'].includes(phase)) return;
    currentPhase = phase;
    root.dataset.phase = phase;
    $('startScreen').hidden = phase !== 'ready';
    $('pauseScreen').hidden = phase !== 'paused';
    $('deathScreen').hidden = phase !== 'dead';
    $('pauseBtn').disabled = phase !== 'playing';
    if (phase === 'dead') {
      $('finalTime').textContent = timeLabel(latestState.elapsed || 0);
      $('finalGold').textContent = String(latestState.gold || 0);
    }
  }

  const MAP_SIZE = 256;
  const LOCAL_SPAN = 160;
  let mapMode = 'local';
  let atlasProjection = null;
  let mapDrawnMarkers = [];
  let mapPlayerPixel = null;
  const landmarkObjects = [];

  function makeMapProjection(centerX, centerZ, span, padding = 0) {
    const scale = (MAP_SIZE - padding * 2) / span;
    return { scale, centerX, centerZ, span,
      point: (x, z) => [MAP_SIZE / 2 + (x - centerX) * scale, MAP_SIZE / 2 + (z - centerZ) * scale] };
  }
  function traceMapLine(ctx, points, closed = false) {
    ctx.beginPath();
    points.forEach(([x, z], index) => {
      const [px, py] = mapProjection.point(x, z);
      index ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    if (closed) ctx.closePath();
  }
  function mapSymbol(ctx, kind, x, y, size = 6, color = '#f0ddad') {
    ctx.save(); ctx.translate(x, y); ctx.lineJoin = 'round'; ctx.lineWidth = 1.4;
    ctx.fillStyle = color; ctx.strokeStyle = '#244138';
    ctx.beginPath();
    if (kind === 'shrine') {
      ctx.moveTo(0, -size); ctx.lineTo(size * .7, 0); ctx.lineTo(0, size); ctx.lineTo(-size * .7, 0); ctx.closePath();
    } else if (kind === 'ruin') {
      ctx.moveTo(-size, size); ctx.lineTo(-size, -size); ctx.lineTo(-size * .35, -size);
      ctx.lineTo(-size * .35, -size * .4); ctx.lineTo(size * .35, -size * .4);
      ctx.lineTo(size * .35, -size); ctx.lineTo(size, -size); ctx.lineTo(size, size); ctx.closePath();
    } else if (kind === 'chest') {
      ctx.roundRect(-size, -size * .65, size * 2, size * 1.45, 1.5);
    } else if (kind === 'heart') {
      ctx.moveTo(0, size); ctx.bezierCurveTo(-size * 2, -size * .4, -size * .4, -size * 1.6, 0, -size * .5);
      ctx.bezierCurveTo(size * .4, -size * 1.6, size * 2, -size * .4, 0, size);
    } else if (WEAPON_TYPES.includes(kind)) {
      ctx.moveTo(-size * .65, size); ctx.lineTo(size * .65, -size);
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-size * .7, size * .1); ctx.lineTo(size * .1, size * .7);
      ctx.lineWidth = 1.7; ctx.stroke(); ctx.restore(); return;
    } else if (kind === 'gold') {
      ctx.arc(0, 0, size * .8, 0, Math.PI * 2);
    } else {
      ctx.moveTo(-size, -size * .15); ctx.lineTo(0, -size); ctx.lineTo(size, -size * .15);
      ctx.lineTo(size * .75, -size * .15); ctx.lineTo(size * .75, size);
      ctx.lineTo(-size * .75, size); ctx.lineTo(-size * .75, -size * .15); ctx.closePath();
    }
    ctx.fill(); ctx.stroke();
    if (kind === 'chest') { ctx.beginPath(); ctx.moveTo(-size, 0); ctx.lineTo(size, 0); ctx.stroke(); ctx.fillStyle = '#fff2ba'; ctx.fillRect(-1, -1.5, 2, 4); }
    else if (kind === 'village') { ctx.fillStyle = '#244138'; ctx.fillRect(-1.5, size * .2, 3, size * .8); }
    ctx.restore();
  }
  function drawGeography(ctx, local) {
    const size = MAP_SIZE, scale = mapProjection.scale;
    ctx.fillStyle = '#1d424e'; ctx.fillRect(0, 0, size, size);
    // Fine contour-like sea lines stay fixed to the map, never to the player.
    ctx.strokeStyle = '#83b1b915'; ctx.lineWidth = .5;
    for (let line = 14; line < size; line += 22) { ctx.beginPath(); ctx.moveTo(0, line); ctx.lineTo(size, line); ctx.stroke(); }
    traceMapLine(ctx, worldmap.island.points, true);
    ctx.fillStyle = '#6f885d'; ctx.fill();
    ctx.strokeStyle = '#86b9b78c'; ctx.lineWidth = local ? 7 : 5; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.save(); traceMapLine(ctx, worldmap.island.points, true); ctx.clip();
    for (const region of worldmap.regions || []) {
      traceMapLine(ctx, region.points, true); ctx.fillStyle = region.color; ctx.fill();
    }
    ctx.fillStyle = '#1f40252b'; ctx.fillRect(0, 0, size, size);
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const river of worldmap.rivers || []) {
      traceMapLine(ctx, river.points);
      ctx.strokeStyle = '#315961'; ctx.lineWidth = Math.max(2, river.width * scale + 1.5); ctx.stroke();
      ctx.strokeStyle = '#8bc5ce'; ctx.lineWidth = Math.max(1.2, river.width * scale); ctx.stroke();
    }
    for (const path of worldmap.paths || []) {
      traceMapLine(ctx, path.points);
      const bridge = path.kind === 'bridge';
      ctx.strokeStyle = bridge ? '#453d2a' : '#45614866';
      ctx.lineWidth = Math.max(bridge ? 2.8 : 1.8, path.width * scale + (local ? 2 : .7)); ctx.stroke();
      ctx.strokeStyle = bridge ? '#f1d8a5' : '#e0ce9e';
      ctx.lineWidth = Math.max(bridge ? 1.7 : .85, path.width * scale);
      ctx.setLineDash(path.kind === 'trail' ? (local ? [3, 2.5] : [1.5, 2.5]) : []); ctx.stroke(); ctx.setLineDash([]);
    }
    if (local) for (const object of landmarkObjects) {
      const [px, py] = mapProjection.point(...object.position);
      if (px < -30 || py < -30 || px > size + 30 || py > size + 30) continue;
      if (object.kind === 'house') {
        ctx.save(); ctx.translate(px, py); ctx.rotate(-(object.rotation ?? 0));
        const width = 16 * object.scale * scale, depth = 14 * object.scale * scale;
        ctx.fillStyle = '#dfc894'; ctx.strokeStyle = '#5a5038'; ctx.lineWidth = 1.6;
        ctx.fillRect(-width / 2, -depth / 2, width, depth); ctx.strokeRect(-width / 2, -depth / 2, width, depth);
        ctx.strokeStyle = '#8c785455'; ctx.lineWidth = .8;
        ctx.beginPath(); ctx.moveTo(0, -depth / 2); ctx.lineTo(0, depth / 2); ctx.stroke();
        ctx.fillStyle = '#3c5b43'; ctx.fillRect(-2.5 * scale, depth / 2 - 1, 5 * scale, 2); ctx.restore();
      } else mapSymbol(ctx, object.kind, px, py, 5, object.kind === 'shrine' ? '#e3c4ed' : '#e2dac4');
    }
    ctx.restore();
    traceMapLine(ctx, worldmap.island.points, true); ctx.strokeStyle = '#e8dfb8b3'; ctx.lineWidth = local ? 1.4 : .8; ctx.stroke();
    for (const place of worldmap.places || []) {
      const [px, py] = mapProjection.point(...place.position);
      if (px < 12 || py < 13 || px > size - 12 || py > size - 13) continue;
      mapSymbol(ctx, place.kind, px, py, local ? 6 : 4.5, place.kind === 'shrine' ? '#e7bfff' : '#f3dfab');
      if (local) {
        ctx.font = '600 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3; ctx.strokeStyle = '#223c30c9'; ctx.strokeText(place.name, px, py - 9);
        ctx.fillStyle = '#fff0ce'; ctx.fillText(place.name, px, py - 9);
      }
    }
  }
  function setWorldmap(data) {
    worldmap = data; mapBackdrop = null; mapProjection = null; landmarkObjects.length = 0;
    if (!data?.bounds || !data.island?.points?.length) return;
    const { minX, minZ, maxX, maxZ } = data.bounds;
    atlasProjection = makeMapProjection((minX + maxX) / 2, (minZ + maxZ) / 2, Math.max(maxX - minX, maxZ - minZ), 12);
    mapProjection = atlasProjection;
    landmarkObjects.push(...(data.objects || []).filter(object => ['house', 'ruin', 'shrine'].includes(object.kind)));
    mapBackdrop = document.createElement('canvas'); mapBackdrop.width = mapBackdrop.height = 512;
    const ctx = mapBackdrop.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0); drawGeography(ctx, false);
    $('worldName').textContent = data.name || 'Die Nebelinsel';
    let twiceArea = 0;
    data.island.points.forEach((p, i) => { const n = data.island.points[(i + 1) % data.island.points.length]; twiceArea += p[0] * n[1] - n[0] * p[1]; });
    const area = (Math.abs(twiceArea) / 2e6).toLocaleString('de-DE', { maximumFractionDigits: 2 });
    $('worldStats').textContent = `${area} km² · ${(data.regions || []).length} Landschaften · ${landmarkObjects.filter(item => item.kind === 'house').length} begehbare Häuser`;
    lastMapTime = -Infinity; drawMap(latestState);
  }
  function drawMap(state) {
    if (!mapContext) return;
    const ctx = mapContext, size = MAP_SIZE;
    ctx.setTransform(map.width / size, 0, 0, map.height / size, 0, 0);
    ctx.clearRect(0, 0, size, size); mapDrawnMarkers = []; mapPlayerPixel = null;
    if (!mapBackdrop || !atlasProjection || !worldmap) { ctx.fillStyle = '#1d424e'; ctx.fillRect(0, 0, size, size); return; }
    const local = mapMode === 'local';
    const viewer = state.player || { x: worldmap.gameplay?.spawnPosition?.[0] ?? 0, z: worldmap.gameplay?.spawnPosition?.[1] ?? 0 };
    mapProjection = local ? makeMapProjection(viewer.x, viewer.z, LOCAL_SPAN) : atlasProjection;
    if (local) drawGeography(ctx, true); else ctx.drawImage(mapBackdrop, 0, 0, size, size);
    const point = mapProjection.point, scale = mapProjection.scale;
    if (state.zoneRadius != null) {
      const zoneCenter = state.zoneCenter || worldmap.zone?.center || [0, 0];
      const [zx, zy] = Array.isArray(zoneCenter) ? point(...zoneCenter) : point(zoneCenter.x, zoneCenter.z);
      const zr = Math.max(.01, state.zoneRadius) * scale;
      ctx.save(); traceMapLine(ctx, worldmap.island.points, true); ctx.clip();
      ctx.fillStyle = '#74587e80'; ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.arc(zx, zy, zr, 0, Math.PI * 2, true); ctx.fill('evenodd'); ctx.restore();
      ctx.setLineDash([5, 3]); ctx.strokeStyle = state.inDanger ? '#ffa99c' : '#edcfff'; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    if (local && state.player) {
      const [px, py] = point(state.player.x, state.player.z);
      ctx.beginPath(); ctx.arc(px, py, 18 * scale, 0, Math.PI * 2);
      ctx.fillStyle = '#e8f1e30c'; ctx.fill(); ctx.strokeStyle = '#f3f4d53d'; ctx.lineWidth = .8; ctx.setLineDash([2, 4]); ctx.stroke(); ctx.setLineDash([]);
      // Only caller-provided, currently visible loot is allowed on the map.
      const markers = [...(state.visibleMapObjects || []), ...(state.pickups || []).filter(item => !item.collected).map(item => ({ ...item, kind: item.type }))];
      for (const item of markers) {
        if (!['chest', 'heart', 'gold', ...WEAPON_TYPES].includes(item.kind)) continue;
        const [x, y] = point(item.x, item.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 8 || y < 8 || x > size - 8 || y > size - 8) continue;
        mapSymbol(ctx, item.kind, x, y, 4, item.color || (item.kind === 'heart' ? '#fb8f9f' : '#f3d17e'));
        mapDrawnMarkers.push({ id: item.id, kind: item.kind, x, y });
      }
    }
    if (state.player) {
      const [rawX, rawY] = point(state.player.x, state.player.z);
      const px = Math.max(10, Math.min(size - 10, rawX)), py = Math.max(10, Math.min(size - 10, rawY));
      ctx.save(); ctx.translate(px, py);
      ctx.fillStyle = '#072d3b99'; ctx.beginPath(); ctx.arc(0, 0, 10.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#baf7ff'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.rotate(-(state.player.direction ?? state.direction ?? Math.PI));
      ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(5.5, -5.5); ctx.lineTo(0, -2.6); ctx.lineTo(-5.5, -5.5); ctx.closePath();
      ctx.fillStyle = '#d7fbff'; ctx.shadowColor = '#85efff'; ctx.shadowBlur = 5; ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#1c5260'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      mapPlayerPixel = { x: px, y: py, direction: state.player.direction ?? state.direction ?? Math.PI };
    }
    // Scale and compass are separate from map coordinates for constant readability.
    const scaleMeters = local ? 25 : 200, scalePixels = scaleMeters * scale;
    ctx.strokeStyle = '#e6e5bd'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(12, size - 16); ctx.lineTo(12 + scalePixels, size - 16); ctx.stroke();
    ctx.fillStyle = '#f5edce'; ctx.font = '600 8px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`${scaleMeters} m`, 12, size - 22);
    $('mapViewLabel').textContent = local ? 'UMGEBUNG' : 'NEBELINSEL';
    map.dataset.mode = mapMode; map.dataset.markerCount = String(mapDrawnMarkers.length);
  }
  for (const mode of ['local', 'island']) {
    $(`mapMode-${mode}`).addEventListener('click', () => {
      mapMode = mode;
      $('mapMode-local').setAttribute('aria-pressed', String(mode === 'local'));
      $('mapMode-island').setAttribute('aria-pressed', String(mode === 'island'));
      drawMap(latestState);
    });
  }

  function update(state) {
    latestState = state;
    if (state.phase && state.phase !== currentPhase) setPhase(state.phase);
    const maxHealth = state.maxHealth || 100;
    const health = Math.max(0, Math.min(maxHealth, state.health ?? maxHealth));
    const roundedHealth = Math.ceil(health);
    if (health !== lastHealth) {
      healthFill.style.width = `${(health / maxHealth) * 100}%`;
      healthValue.innerHTML = `${roundedHealth} <small>/ ${maxHealth}</small>`;
      healthBar.setAttribute('aria-valuenow', String(roundedHealth));
      healthBar.setAttribute('aria-valuemax', String(maxHealth));
      healthBar.classList.toggle('low-health', health / maxHealth < .3);
      if (lastHealth >= 0 && roundedHealth < Math.ceil(lastHealth)) {
        root.classList.remove('hit');
        // A class animation gives damage feedback without rebuilding the HUD.
        requestAnimationFrame(() => root.classList.add('hit'));
      }
      lastHealth = health;
    }
    const danger = Boolean(state.inDanger);
    root.classList.toggle('in-tall-grass', Boolean(state.hiddenInGrass));
    zoneTime.textContent = timeLabel(state.zoneCountdown || 0);
    zoneRadius.textContent = `${Math.round(state.zoneRadius ?? worldmap?.zone?.initialRadius ?? 0)} m`;
    zoneProgress.style.transform = `scaleX(${Math.max(0, Math.min(1, state.zoneProgress ?? 0))})`;
    zonePanel.classList.toggle('is-danger', danger);
    zoneLabel.textContent = danger ? 'IM GEFÄHRLICHEN NEBEL' : (state.zoneShrinking ? 'DIE ZONE SCHRUMPFT' : (state.zoneProgress >= 1 ? 'DIE LETZTE ZUFLUCHT' : 'DER NEBEL ZIEHT AUF'));
    playerStatus.textContent = state.shelter ? `In ${state.shelter}` :
      (state.hiddenInGrass ? 'Im hohen Gras verborgen' :
        (danger ? 'Der Nebel zehrt an dir' : (health < maxHealth ? 'Herzen geben dir neue Kraft' : 'Voller Lebenskraft')));
    root.classList.toggle('in-danger', danger);
    if (danger !== lastDanger) { dangerWarning.classList.toggle('visible', danger); lastDanger = danger; }
    goldCount.textContent = String(state.gold || 0);
    const dashCooldown = Math.max(0, state.rollCooldown ?? state.dashCooldown ?? 0);
    dashButton.classList.toggle('on-cooldown', dashCooldown > 0);
    dashButton.disabled = dashCooldown > 0 || currentPhase !== 'playing';
    dashButton.style.setProperty('--cooldown', Math.min(1, dashCooldown / (state.rollCooldownDuration || state.dashCooldownDuration || 2.5)));
    const weaponType = state.equippedItem?.type || (typeof state.equippedWeapon === 'string' ? state.equippedWeapon : state.equippedWeapon?.type);
    const weapon = describeWeapon(state.equippedItem || { type: weaponType });
    const weaponKey = `${weaponType}:${weapon.rarity}:${weapon.damage}:${weapon.name}`;
    if (weaponKey !== lastWeaponType) {
      weaponName.textContent = weapon.name;
      weaponTier.textContent = weaponType ? weapon.rarityLabel.toUpperCase() : 'WAFFE';
      weaponDetail.textContent = weaponType ? `${weapon.damage} Schaden${weaponType === 'fireStaff' ? ' · Verbrennung' : weaponType === 'iceStaff' ? ' · Verlangsamung' : ''}` : 'Erste Waffe automatisch';
      weaponStatus.style.setProperty('--rarity-color', weapon.color);
      weaponStatus.dataset.rarity = weapon.rarity;
      weaponIcon.innerHTML = icon(weaponType || 'shield');
      weaponStatus.setAttribute('aria-label', weaponType ? `${weapon.name}, ${weapon.rarityLabel}, ${weapon.damage} Schaden` : 'Keine Waffe ausgerüstet');
      attackButton.querySelector('.icon').outerHTML = icon(weaponType || 'sword');
      attackButton.setAttribute('aria-label', weaponType === 'bow' ? 'Mit dem Bogen schießen' : weaponType === 'sword' ? 'Mit dem Schwert angreifen' : weaponType === 'fireStaff' ? 'Feuerzauber wirken' : weaponType === 'iceStaff' ? 'Eiszauber wirken' : 'Angriff: keine Waffe ausgerüstet');
      lastWeaponType = weaponKey;
    }
    const attackCooldown = Math.max(0, state.attackCooldown ?? 0);
    attackButton.disabled = !WEAPON_TYPES.includes(weaponType) || attackCooldown > 0 || currentPhase !== 'playing';
    attackButton.classList.toggle('on-cooldown', attackCooldown > 0);
    const nearWeapon = typeof state.nearWeapon === 'string' ? { type: state.nearWeapon } : state.nearWeapon;
    const nearChest = state.nearChest;
    const nearby = nearChest && (!nearWeapon || (nearChest.distance ?? Infinity) < (nearWeapon.distance ?? Infinity)) ? nearChest : nearWeapon;
    const isChest = nearby?.type === 'chest' || nearby?.kind === 'chest';
    const nearType = nearby?.type || nearby?.kind;
    const canInteract = currentPhase === 'playing' && (isChest || WEAPON_TYPES.includes(nearType));
    pickupPrompt.hidden = !canInteract;
    interactButton.hidden = !canInteract;
    interactButton.disabled = !canInteract;
    const near = isChest ? { name: nearby.name || 'Holztruhe', color: '#e6bb68', rarity: 'chest', rarityLabel: '' } : describeWeapon(nearby || {});
    const nearKey = `${nearby?.id}:${nearType}:${near.rarity}:${near.name}:${near.damage}:${weaponType}`;
    if (nearKey !== lastNearWeaponType) {
      pickupItem.textContent = isChest ? near.name : `${near.name} · ${near.rarityLabel} · ${near.damage} Schaden`;
      pickupAction.textContent = isChest ? 'öffnen' : weaponType ? 'wechseln' : 'aufnehmen';
      pickupPrompt.style.setProperty('--rarity-color', near.color);
      pickupPrompt.querySelector('.icon').outerHTML = icon(isChest ? 'chest' : 'hand');
      pickupPrompt.setAttribute('aria-label', `${near.name} mit E ${isChest ? 'öffnen' : 'aufnehmen'}`);
      interactButton.setAttribute('aria-label', `${near.name} ${isChest ? 'öffnen' : 'aufheben'}`);
      interactButton.querySelector('.icon').outerHTML = icon(isChest ? 'chest' : 'hand');
      interactButton.querySelector('span').textContent = isChest ? 'ÖFFNEN' : weaponType ? 'WECHSELN' : 'AUFHEBEN';
      lastNearWeaponType = nearKey;
    }
    const now = performance.now();
    if (now - lastMapTime > 90) { drawMap(state); lastMapTime = now; }
    if (state.quality && $('qualityMode')) $('qualityMode').value = state.quality;
  }

  function toast(message, tone = 'default') {
    clearTimeout(toastTimeout);
    toastElement.textContent = message;
    toastElement.dataset.tone = tone;
    toastElement.classList.add('visible');
    toastTimeout = setTimeout(() => toastElement.classList.remove('visible'), 2800);
  }

  return {
    update, setPhase, toast, setWorldmap,
    inspectMinimap: () => ({ mode: mapMode, canvasPixels: map.width, displayWidth: map.getBoundingClientRect().width,
      spanMeters: mapProjection?.span ?? null, center: mapProjection ? { x: mapProjection.centerX, z: mapProjection.centerZ } : null,
      player: mapPlayerPixel, markers: mapDrawnMarkers.map(item => ({ ...item })) }),
    joystick: $('joystick'), joystickKnob: $('joystickKnob'), dashButton, attackButton, interactButton,
    setLoading(message) { $('startBtn').disabled = Boolean(message); $('loadMapBtn').disabled = Boolean(message); $('startBtn').querySelector('span').textContent = message || 'Insel betreten'; },
    showError(message) { $('errorMessage').textContent = message; $('errorScreen').hidden = false; },
  };
}
