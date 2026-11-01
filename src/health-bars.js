import * as THREE from 'three';

const BAR_WIDTH = 1.9;
const BAR_HEIGHT = .26;
const BAR_INSET = .025;
const HEALTH_PER_SEGMENT = 25;
const LEVEL_GAP = .08;
const GLYPH_WIDTH = .24;
const LEVEL_PADDING = .20;
const LEVEL_HEIGHT = .48;
const GLYPHS = '0123456789.kMBTP';
const LEVEL_RESERVE = LEVEL_GAP + LEVEL_PADDING + GLYPH_WIDTH * 4 + .04;
const validLevel = value => Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
const capacityOf = value => Number.isFinite(value) ? Math.max(1, value) : 100;

function levelText(level) {
  if (level < 10000) return String(level);
  for (const [size, suffix] of [[1e15, 'P'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']]) {
    if (level < size) continue;
    const amount = level / size;
    return `${amount < 10 ? Number(amount.toFixed(1)) : Math.floor(amount)}${suffix}`;
  }
  return String(level);
}

// One small, immutable atlas serves every actor. No DOM/canvas is needed by
// renderer-independent Node tests, and no text textures are created on level-up.
function makeLevelAtlas() {
  const cell = 64;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = cell * GLYPHS.length; canvas.height = cell;
    const context = canvas.getContext('2d');
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#ffffff'; context.font = 'bold 56px Georgia, serif';
      context.textAlign = 'center'; context.textBaseline = 'middle';
      for (let index = 0; index < GLYPHS.length; index++) context.fillText(GLYPHS[index], (index + .5) * cell, cell * .52);
      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      return texture;
    }
  }
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

/** World-space, camera-facing health bars. All actors share a single draw call. */
export function createHealthBars(scene, { capacity = 128 } = {}) {
  // Reserve space only to the left: the original bar keeps its width, centre
  // and height regardless of its maximum health or the number of level digits.
  const geometry = new THREE.PlaneGeometry(BAR_WIDTH + LEVEL_RESERVE, LEVEL_HEIGHT + .04);
  geometry.translate(-LEVEL_RESERVE / 2, 0, 0);
  const healthRatios = new Float32Array(capacity);
  const displayedRatios = new Float32Array(capacity);
  const flashes = new Float32Array(capacity);
  const colors = new Float32Array(capacity * 3);
  const healthUnits = new Float32Array(capacity);
  const levelGlyphs = new Float32Array(capacity * 4);
  const levelLengths = new Float32Array(capacity);
  const healthAttribute = new THREE.InstancedBufferAttribute(healthRatios, 1).setUsage(THREE.DynamicDrawUsage);
  const colorAttribute = new THREE.InstancedBufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage);
  const displayAttribute = new THREE.InstancedBufferAttribute(displayedRatios, 1).setUsage(THREE.DynamicDrawUsage);
  const flashAttribute = new THREE.InstancedBufferAttribute(flashes, 1).setUsage(THREE.DynamicDrawUsage);
  const unitsAttribute = new THREE.InstancedBufferAttribute(healthUnits, 1).setUsage(THREE.DynamicDrawUsage);
  const glyphAttribute = new THREE.InstancedBufferAttribute(levelGlyphs, 4).setUsage(THREE.DynamicDrawUsage);
  const lengthAttribute = new THREE.InstancedBufferAttribute(levelLengths, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('healthRatio', healthAttribute);
  geometry.setAttribute('healthDisplayRatio', displayAttribute);
  geometry.setAttribute('healthFlash', flashAttribute);
  geometry.setAttribute('healthColor', colorAttribute);
  geometry.setAttribute('healthUnits', unitsAttribute);
  geometry.setAttribute('levelGlyphs', glyphAttribute);
  geometry.setAttribute('levelLength', lengthAttribute);
  const levelAtlas = makeLevelAtlas();
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    uniforms: { levelAtlas: { value: levelAtlas } },
    vertexShader: `
      attribute float healthRatio;
      attribute vec3 healthColor;
      attribute float healthDisplayRatio;
      attribute float healthFlash;
      attribute float healthUnits;
      attribute vec4 levelGlyphs;
      attribute float levelLength;
      varying vec2 vPosition;
      varying float vHealth;
      varying float vDisplayedHealth;
      varying float vFlash;
      varying vec3 vColor;
      varying float vUnits;
      varying vec4 vGlyphs;
      varying float vLength;
      void main() {
        vPosition = position.xy; vHealth = healthRatio; vDisplayedHealth = healthDisplayRatio;
        vFlash = healthFlash; vColor = healthColor;
        vUnits = healthUnits; vGlyphs = levelGlyphs; vLength = levelLength;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D levelAtlas;
      varying vec2 vPosition;
      varying float vHealth;
      varying float vDisplayedHealth;
      varying float vFlash;
      varying vec3 vColor;
      varying float vUnits;
      varying vec4 vGlyphs;
      varying float vLength;
      void main() {
        vec2 barUv = vec2(vPosition.x / ${BAR_WIDTH} + .5, vPosition.y / ${BAR_HEIGHT} + .5);
        if (barUv.x < 0.0) {
          float badgeRight = -${BAR_WIDTH / 2 + LEVEL_GAP};
          float badgeWidth = ${LEVEL_PADDING} + vLength * ${GLYPH_WIDTH};
          vec2 badge = abs(vec2(vPosition.x - badgeRight + badgeWidth * .5, vPosition.y));
          vec2 halfSize = vec2(badgeWidth * .5, ${LEVEL_HEIGHT / 2});
          // Clipped corners and two inset metal rims read as a small rank
          // medallion. Its extra space extends left, never into the health bar.
          float edge = max(max(badge.x - halfSize.x, badge.y - halfSize.y),
            (badge.x + badge.y - halfSize.x - halfSize.y + .075) * .7071);
          if (edge > 0.0) discard;
          float light = clamp(vPosition.y / ${LEVEL_HEIGHT} + .5, 0.0, 1.0);
          vec3 gold = mix(vec3(.55, .25, .055), vec3(1.0, .77, .32), light);
          vec3 badgeColor = mix(vec3(.055, .032, .012), vec3(.16, .10, .028), light);
          if (edge > -.024) badgeColor = gold;
          else if (edge > -.043) badgeColor = vec3(.045, .025, .008);
          else if (edge > -.055) badgeColor = gold * .66;
          float textX = (vPosition.x - badgeRight + badgeWidth - ${LEVEL_PADDING / 2}) / ${GLYPH_WIDTH};
          float textY = vPosition.y / .44 + .5;
          if (textX >= 0.0 && textX < vLength && textY > 0.0 && textY < 1.0) {
            float slot = floor(textX);
            float glyph = slot < .5 ? vGlyphs.x : slot < 1.5 ? vGlyphs.y : slot < 2.5 ? vGlyphs.z : vGlyphs.w;
            vec2 glyphUv = vec2((glyph + fract(textX)) / ${GLYPHS.length}.0, textY);
            float shadow = texture2D(levelAtlas, glyphUv + vec2(-.022 / ${GLYPHS.length}.0, .035)).a;
            float ink = texture2D(levelAtlas, glyphUv).a;
            badgeColor = mix(badgeColor, vec3(.012, .007, .002), shadow * .9);
            badgeColor = mix(badgeColor, mix(vec3(1.0, .69, .24), vec3(1.0, .96, .72), light), ink);
          }
          gl_FragColor = vec4(badgeColor, .98);
        } else {
        if (barUv.x > 1.0 || barUv.y < 0.0 || barUv.y > 1.0) discard;
        vec3 color = mix(vec3(.035, .05, .065), vec3(.95, .85, .62), vFlash * .8);
        float alpha = .96;
        if (barUv.x > .025 && barUv.x < .975 && barUv.y > .17 && barUv.y < .83) {
          float x = (barUv.x - .025) / .95;
          color = vec3(.18, .12, .14);
          if (x < vDisplayedHealth) {
            color = mix(vColor * .72, vColor, smoothstep(.17, .83, barUv.y));
            if (x > vHealth) color = vec3(.95, .63, .25);
            color = mix(color, vec3(1., .95, .78), vFlash * .65);
          }
          // Every divider represents exactly 25 HP, including a short final
          // segment for actors whose maximum is not divisible by 25.
          float boundary = floor(x * vUnits + .5);
          float tick = abs(x * vUnits - boundary) / vUnits;
          float inside = step(.5, boundary) * (1.0 - step(vUnits - .001, boundary));
          float pixel = max(.001, fwidth(x));
          float spacing = 1.0 / max(.001, vUnits * pixel);
          float strength = inside * smoothstep(1.0, 2.5, spacing);
          color *= mix(1.0, mix(.40, 1.0, smoothstep(pixel * .30, pixel * .85, tick)), strength);
        }
        gl_FragColor = vec4(color, alpha);
        }
        #include <colorspace_fragment>
      }
    `,
  });
  material.userData.ignoreFogOfWar = true;
  material.userData.ignoreVision = true;
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = 'Lebensbalken'; mesh.count = 0; mesh.renderOrder = 9000;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const bars = new Map();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  function add(id, { position, health = 100, maxHealth = 100, level = 1, local = false,
    height = 2.8, color: barColor = '#81d878', visible = true, concealed = false } = {}) {
    if (bars.has(id)) throw new Error(`Lebensbalken bereits vorhanden: ${id}`);
    if (bars.size >= capacity) throw new Error(`Maximal ${capacity} Lebensbalken möglich.`);
    if (!position) throw new Error('Ein Lebensbalken benötigt eine Position.');
    const normalizedLevel = validLevel(level);
    const bar = { id, position, health, maxHealth, level: normalizedLevel, levelLabel: levelText(normalizedLevel), local, height, color: barColor, visible, concealed, rendered: false,
      displayedRatio: Math.max(0, Math.min(1, health / Math.max(1, maxHealth))), flash: 0, flashStrength: 0, flashCooldown: 0 };
    bars.set(id, bar); mesh.count = bars.size;
    return bar;
  }

  function set(id, changes) {
    const bar = bars.get(id);
    if (!bar) return false;
    const before = bar.health;
    const beforeMax = bar.maxHealth;
    // IDs are stable; other values can follow live actor state each frame.
    for (const key of ['position', 'health', 'maxHealth', 'height', 'color', 'visible', 'concealed', 'local']) {
      if (key in changes) bar[key] = changes[key];
    }
    if ('level' in changes && validLevel(changes.level) !== bar.level) {
      bar.level = validLevel(changes.level); bar.levelLabel = levelText(bar.level);
    }
    const lost = before - bar.health;
    if (lost > 0 && bar.flashCooldown <= 0) {
      bar.flash = .18; bar.flashCooldown = .28;
      bar.flashStrength = Math.min(1, Math.max(.32, lost / Math.max(1, bar.maxHealth) * 5));
    }
    // Healing and a new round never show a delayed "damage" strip.
    if (bar.health > before || bar.maxHealth !== beforeMax || changes.snap) {
      bar.displayedRatio = Math.max(0, Math.min(1, bar.health / Math.max(1, bar.maxHealth)));
      bar.flash = bar.flashCooldown = 0;
    }
    return true;
  }

  function update(camera, { isVisible = () => true, dt = 1 / 60 } = {}) {
    const delta = Math.max(0, Number.isFinite(dt) ? dt : 0);
    let slot = 0;
    for (const bar of bars.values()) {
      const ratio = Math.max(0, Math.min(1, bar.health / Math.max(1, bar.maxHealth)));
      bar.rendered = bar.local || (bar.health > 0 && bar.visible && !bar.concealed && isVisible(bar.position, { concealed: bar.concealed, local: false }));
      bar.displayedRatio += (ratio - bar.displayedRatio) * (1 - Math.exp(-delta / .085));
      if (Math.abs(ratio - bar.displayedRatio) < .001) bar.displayedRatio = ratio;
      bar.flash = Math.max(0, bar.flash - delta);
      bar.flashCooldown = Math.max(0, bar.flashCooldown - delta);
      // A hidden actor must not reveal an old hit after stepping back into sight.
      if (!bar.rendered) { bar.displayedRatio = ratio; bar.flash = 0; }
      dummy.position.copy(bar.position); dummy.position.y += bar.height;
      dummy.quaternion.copy(camera.quaternion);
      dummy.scale.setScalar(bar.rendered ? 1 : 0);
      dummy.updateMatrix(); mesh.setMatrixAt(slot, dummy.matrix);
      healthRatios[slot] = ratio;
      displayedRatios[slot] = bar.displayedRatio;
      flashes[slot] = bar.flashStrength * bar.flash / .18;
      healthUnits[slot] = capacityOf(bar.maxHealth) / HEALTH_PER_SEGMENT;
      levelLengths[slot] = bar.levelLabel.length;
      for (let glyph = 0; glyph < 4; glyph++) levelGlyphs[slot * 4 + glyph] = Math.max(0, GLYPHS.indexOf(bar.levelLabel[glyph]));
      color.set(ratio < .3 ? '#f27169' : bar.color).toArray(colors, slot * 3);
      slot++;
    }
    mesh.count = slot;
    mesh.instanceMatrix.needsUpdate = true;
    healthAttribute.needsUpdate = displayAttribute.needsUpdate = flashAttribute.needsUpdate = true;
    unitsAttribute.needsUpdate = glyphAttribute.needsUpdate = lengthAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
  }

  return {
    add, set, update,
    remove(id) { const result = bars.delete(id); mesh.count = bars.size; return result; },
    inspect() { return [...bars.values()].map(({ id, health, maxHealth, level, levelLabel, local, rendered, displayedRatio, flash }) => ({
      id, health, maxHealth, level, levelLabel, local, visible: rendered, displayedRatio, flash,
      healthPerSegment: HEALTH_PER_SEGMENT, segmentCount: Math.ceil(capacityOf(maxHealth) / HEALTH_PER_SEGMENT),
      barWidth: BAR_WIDTH * (1 - BAR_INSET * 2), barBounds: { left: -BAR_WIDTH / 2, right: BAR_WIDTH / 2 },
      levelBounds: { left: -BAR_WIDTH / 2 - LEVEL_GAP - LEVEL_PADDING - GLYPH_WIDTH * levelLabel.length, right: -BAR_WIDTH / 2 - LEVEL_GAP },
    })); },
    reset() { for (const bar of bars.values()) { bar.displayedRatio = Math.max(0, Math.min(1, bar.health / Math.max(1, bar.maxHealth))); bar.flash = bar.flashCooldown = 0; } },
    dispose() { scene.remove(mesh); geometry.dispose(); material.dispose(); levelAtlas.dispose(); bars.clear(); },
  };
}
