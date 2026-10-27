import * as THREE from 'three';

/** World-space, camera-facing health bars. All actors share a single draw call. */
export function createHealthBars(scene, { capacity = 128 } = {}) {
  const geometry = new THREE.PlaneGeometry(1.9, .26);
  const healthRatios = new Float32Array(capacity);
  const displayedRatios = new Float32Array(capacity);
  const flashes = new Float32Array(capacity);
  const colors = new Float32Array(capacity * 3);
  const healthAttribute = new THREE.InstancedBufferAttribute(healthRatios, 1).setUsage(THREE.DynamicDrawUsage);
  const colorAttribute = new THREE.InstancedBufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage);
  const displayAttribute = new THREE.InstancedBufferAttribute(displayedRatios, 1).setUsage(THREE.DynamicDrawUsage);
  const flashAttribute = new THREE.InstancedBufferAttribute(flashes, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('healthRatio', healthAttribute);
  geometry.setAttribute('healthDisplayRatio', displayAttribute);
  geometry.setAttribute('healthFlash', flashAttribute);
  geometry.setAttribute('healthColor', colorAttribute);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    vertexShader: `
      attribute float healthRatio;
      attribute vec3 healthColor;
      attribute float healthDisplayRatio;
      attribute float healthFlash;
      varying vec2 vUv;
      varying float vHealth;
      varying float vDisplayedHealth;
      varying float vFlash;
      varying vec3 vColor;
      void main() {
        vUv = uv; vHealth = healthRatio; vDisplayedHealth = healthDisplayRatio;
        vFlash = healthFlash; vColor = healthColor;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying float vHealth;
      varying float vDisplayedHealth;
      varying float vFlash;
      varying vec3 vColor;
      void main() {
        vec3 color = mix(vec3(.035, .05, .065), vec3(.95, .85, .62), vFlash * .8);
        float alpha = .96;
        if (vUv.x > .025 && vUv.x < .975 && vUv.y > .17 && vUv.y < .83) {
          float x = (vUv.x - .025) / .95;
          color = vec3(.18, .12, .14);
          if (x < vDisplayedHealth) {
            color = mix(vColor * .72, vColor, smoothstep(.17, .83, vUv.y));
            if (x > vHealth) color = vec3(.95, .63, .25);
            color = mix(color, vec3(1., .95, .78), vFlash * .65);
            float tick = min(abs(x - .25), min(abs(x - .5), abs(x - .75)));
            color *= mix(.45, 1.0, smoothstep(.002, .008, tick));
          }
        }
        gl_FragColor = vec4(color, alpha);
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

  function add(id, { position, health = 100, maxHealth = 100, local = false,
    height = 2.8, color: barColor = '#81d878', visible = true, concealed = false } = {}) {
    if (bars.has(id)) throw new Error(`Lebensbalken bereits vorhanden: ${id}`);
    if (bars.size >= capacity) throw new Error(`Maximal ${capacity} Lebensbalken möglich.`);
    if (!position) throw new Error('Ein Lebensbalken benötigt eine Position.');
    const bar = { id, position, health, maxHealth, local, height, color: barColor, visible, concealed, rendered: false,
      displayedRatio: Math.max(0, Math.min(1, health / Math.max(1, maxHealth))), flash: 0, flashStrength: 0, flashCooldown: 0 };
    bars.set(id, bar); mesh.count = bars.size;
    return bar;
  }

  function set(id, changes) {
    const bar = bars.get(id);
    if (!bar) return false;
    const before = bar.health;
    // IDs are stable; other values can follow live actor state each frame.
    for (const key of ['position', 'health', 'maxHealth', 'height', 'color', 'visible', 'concealed', 'local']) {
      if (key in changes) bar[key] = changes[key];
    }
    const lost = before - bar.health;
    if (lost > 0 && bar.flashCooldown <= 0) {
      bar.flash = .18; bar.flashCooldown = .28;
      bar.flashStrength = Math.min(1, Math.max(.32, lost / Math.max(1, bar.maxHealth) * 5));
    }
    // Healing and a new round never show a delayed "damage" strip.
    if (bar.health > before || changes.snap) {
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
      bar.rendered = bar.local || (bar.visible && !bar.concealed && isVisible(bar.position, { concealed: bar.concealed, local: false }));
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
      color.set(ratio < .3 ? '#f27169' : bar.color).toArray(colors, slot * 3);
      slot++;
    }
    mesh.count = slot;
    mesh.instanceMatrix.needsUpdate = true;
    healthAttribute.needsUpdate = displayAttribute.needsUpdate = flashAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
  }

  return {
    add, set, update,
    remove(id) { const result = bars.delete(id); mesh.count = bars.size; return result; },
    inspect() { return [...bars.values()].map(({ id, health, maxHealth, local, rendered, displayedRatio, flash }) => ({ id, health, maxHealth, local, visible: rendered, displayedRatio, flash })); },
    reset() { for (const bar of bars.values()) { bar.displayedRatio = Math.max(0, Math.min(1, bar.health / Math.max(1, bar.maxHealth))); bar.flash = bar.flashCooldown = 0; } },
    dispose() { scene.remove(mesh); geometry.dispose(); material.dispose(); bars.clear(); },
  };
}
