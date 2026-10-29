import * as THREE from 'three';
import { sampleTerrainPaint } from './map/terrain-paint.js';

export const TERRAIN_PAINT_BUDGET = Object.freeze({ low: 16 * 1024 * 1024, high: 32 * 1024 * 1024 });
const srgbBytes = Uint8Array.from({ length: 4097 }, (_, i) => {
  const value = i / 4096;
  return Math.round((value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055) * 255);
});
const toByte = value => srgbBytes[Math.max(0, Math.min(4096, Math.round(value * 4096)))];

/** Texel centres cover the same world coordinates in adjacent geometry chunks.
 * Resolution adapts to the visible paint budget, never the total island area. */
export function terrainPaintTextureSize(bounds, quality = 'high', budgetBytes = Infinity) {
  const metersX = Math.max(.1, bounds.maxX - bounds.minX), metersZ = Math.max(.1, bounds.maxZ - bounds.minZ);
  const texelsPerMeter = quality === 'low' ? 2 : 4, maximum = quality === 'low' ? 256 : 512;
  let width = Math.min(maximum, Math.max(4, Math.ceil(metersX * texelsPerMeter)));
  let height = Math.min(maximum, Math.max(4, Math.ceil(metersZ * texelsPerMeter)));
  const scale = Math.min(1, Math.sqrt(Math.max(96, budgetBytes) / (width * height * 6)));
  width = Math.max(4, Math.floor(width * scale)); height = Math.max(4, Math.floor(height * scale));
  return { width, height, bytes: width * height * 6, metersPerTexel: Math.max(metersX / width, metersZ / height) };
}

/** Pure byte baking also runs in Node tests, without Canvas or WebGL. */
export function bakeTerrainPaint(index, bounds, width, height, pavingMask = null, snowMask = null, snowWeightAt = null) {
  const bytes = new Uint8Array(width * height * 4), sample = {};
  const sx = (bounds.maxX - bounds.minX) / width, sz = (bounds.maxZ - bounds.minZ) / height;
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
    sampleTerrainPaint(index, bounds.minX + (column + .5) * sx, bounds.minZ + (row + .5) * sz, sample, 'shared-paving');
    const offset = (row * width + column) * 4;
    bytes[offset] = toByte(sample.r); bytes[offset + 1] = toByte(sample.g); bytes[offset + 2] = toByte(sample.b);
    bytes[offset + 3] = Math.round(sample.alpha * 255);
    if (pavingMask) pavingMask[row * width + column] = Math.round(sample.paving * 255);
    if (snowMask) {
      const x = bounds.minX + (column + .5) * sx, z = bounds.minZ + (row + .5) * sz;
      const baseSnow = snowWeightAt ? THREE.MathUtils.clamp(snowWeightAt(x, z), 0, 1) : 0;
      const paintedSnow = (sample.snow ?? 0) * sample.alpha;
      const finalSnow = baseSnow * (1 - sample.alpha) + paintedSnow;
      snowMask[row * width + column] = Math.round(THREE.MathUtils.clamp(finalSnow, 0, 1) * 255);
    }
  }
  return bytes;
}

export function createTerrainPaintMaterial(baseMaterial, index, bounds, pavingTexture, snowWeightAt = null) {
  const material = baseMaterial.clone();
  const empty = new THREE.DataTexture(new Uint8Array(4), 1, 1); empty.needsUpdate = true;
  const paintUniform = { value: empty }, pavingMaskUniform = { value: empty }, snowMaskUniform = { value: empty },
    boundsUniform = { value: new THREE.Vector4(bounds.minX, bounds.minZ, bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) };
  let texture = null, maskTexture = null, snowMaskTexture = null, textureSize = null, bakeCount = 0, totalBakeMs = 0, maximumBakeMs = 0;
  material.onBeforeCompile = shader => {
    shader.uniforms.uTerrainPaint = paintUniform; shader.uniforms.uTerrainPaintBounds = boundsUniform;
    shader.uniforms.uTerrainPavingMask = pavingMaskUniform; shader.uniforms.uTerrainSnowMask = snowMaskUniform;
    shader.uniforms.uTerrainPaving = { value: pavingTexture };
    shader.vertexShader = `uniform sampler2D uTerrainSnowMask; uniform vec4 uTerrainPaintBounds; varying vec2 vTerrainPaintPosition;
      ${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
        vTerrainPaintPosition = (modelMatrix * vec4(position, 1.)).xz;
        vec2 terrainSnowUvVertex = (vTerrainPaintPosition - uTerrainPaintBounds.xy) / uTerrainPaintBounds.zw;
        float terrainSnowVertex = texture2D(uTerrainSnowMask, terrainSnowUvVertex).r;
        float terrainSnowBroadVertex = sin(vTerrainPaintPosition.x*.145 + sin(vTerrainPaintPosition.y*.082)*1.9)
          * cos(vTerrainPaintPosition.y*.118-vTerrainPaintPosition.x*.046);
        float terrainSnowMidVertex = sin(vTerrainPaintPosition.x*.39 + vTerrainPaintPosition.y*.21
          + sin(vTerrainPaintPosition.y*.15)*1.45);
        transformed.y += terrainSnowVertex * (.132 + terrainSnowBroadVertex*.052 + terrainSnowMidVertex*.024);
      `);
    shader.fragmentShader = `uniform sampler2D uTerrainPaint; uniform sampler2D uTerrainPavingMask; uniform sampler2D uTerrainSnowMask; uniform sampler2D uTerrainPaving; uniform vec4 uTerrainPaintBounds; varying vec2 vTerrainPaintPosition;
      float terrainSnowRelief(vec2 p) {
        float broad = sin(p.x*.29 + sin(p.y*.13)*1.9) * cos(p.y*.24-p.x*.08);
        float drift = sin(p.x*.78+p.y*.31+sin(p.y*.22)*1.7);
        float wind = sin(dot(p,vec2(.86,.50))*1.42 + sin(dot(p,vec2(-.24,.97))*.33)*1.8);
        float fine = sin(p.x*4.2-p.y*3.1)*sin(p.y*4.6+p.x*1.9);
        float micro = sin(p.x*13.7+p.y*8.9)*sin(p.y*16.1-p.x*5.7);
        return broad*.44 + drift*.21 + wind*.23 + fine*.08 + micro*.04;
      }
      float terrainSnowMicro(vec2 p) {
        float a = sin(p.x*17.3+p.y*11.2)*sin(p.y*15.9-p.x*6.3);
        float b = sin(p.x*29.7-p.y*22.1)*sin(p.y*33.5+p.x*12.9);
        return a*.7+b*.3;
      }
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec2 terrainPaintUV = (vTerrainPaintPosition - uTerrainPaintBounds.xy) / uTerrainPaintBounds.zw;
      vec4 terrainPaint = texture2D(uTerrainPaint, terrainPaintUV);
      float terrainPavingMix = texture2D(uTerrainPavingMask, terrainPaintUV).r;
      float terrainSnowMix = texture2D(uTerrainSnowMask, terrainPaintUV).r * terrainPaint.a;
      vec3 terrainPaving = clamp(texture2D(uTerrainPaving, vTerrainPaintPosition / 3.5).rgb / vec3(.32, .35, .28), .35, 1.5);
      terrainPaint.rgb *= mix(vec3(1.), terrainPaving, terrainPavingMix);
      float snowRelief = terrainSnowRelief(vTerrainPaintPosition);
      float snowMicro = terrainSnowMicro(vTerrainPaintPosition);
      float snowShade = 1.0 + snowRelief*.135 + snowMicro*.018;
      vec3 deepSnowTone = vec3(.885,.925,.955);
      vec3 ridgeSnowTone = vec3(1.060,1.068,1.072);
      terrainPaint.rgb = mix(terrainPaint.rgb, terrainPaint.rgb * mix(deepSnowTone, ridgeSnowTone, smoothstep(-.55,.55,snowRelief)) * snowShade, terrainSnowMix);
      float snowCrystal = pow(max(0.0,snowMicro),18.0) * smoothstep(.35,.9,terrainSnowMix) * .020;
      terrainPaint.rgb += vec3(snowCrystal);
      diffuseColor.rgb = mix(diffuseColor.rgb, terrainPaint.rgb, terrainPaint.a);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      float terrainMicroRough = abs(terrainSnowMicro(vTerrainPaintPosition));
      roughnessFactor = mix(roughnessFactor, .965 - terrainMicroRough*.022, terrainSnowMix * .90);
    `);
  };
  material.customProgramCacheKey = () => 'nebeljagd-terrain-paint-v6-microcrystal-snow';
  material.name = 'Nebeljagd · gemalter Boden aus Kartendaten';
  function release() {
    texture?.dispose(); maskTexture?.dispose(); snowMaskTexture?.dispose();
    texture = null; maskTexture = null; snowMaskTexture = null; textureSize = null;
    paintUniform.value = empty; pavingMaskUniform.value = empty; snowMaskUniform.value = empty;
  }
  return { material, bounds,
    matches(quality, budgetBytes) {
      const next = terrainPaintTextureSize(bounds, quality, budgetBytes);
      return Boolean(texture && textureSize.width === next.width && textureSize.height === next.height);
    },
    ensure(quality, budgetBytes) {
      const next = terrainPaintTextureSize(bounds, quality, budgetBytes);
      if (texture && textureSize.width === next.width && textureSize.height === next.height) return;
      const started = performance.now();
      release();
      const mask = new Uint8Array(next.width * next.height), snowMask = new Uint8Array(next.width * next.height);
      texture = new THREE.DataTexture(bakeTerrainPaint(index, bounds, next.width, next.height, mask, snowMask, snowWeightAt), next.width, next.height, THREE.RGBAFormat, THREE.UnsignedByteType);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false; texture.flipY = false; texture.needsUpdate = true;
      texture.name = 'Nebeljagd · lokaler Bodenfarbauftrag';
      maskTexture = new THREE.DataTexture(mask, next.width, next.height, THREE.RedFormat, THREE.UnsignedByteType);
      maskTexture.magFilter = maskTexture.minFilter = THREE.LinearFilter;
      maskTexture.generateMipmaps = false; maskTexture.flipY = false; maskTexture.unpackAlignment = 1; maskTexture.needsUpdate = true;
      maskTexture.name = 'Nebeljagd · gemalte Pflastergewichtung';
      snowMaskTexture = new THREE.DataTexture(snowMask, next.width, next.height, THREE.RedFormat, THREE.UnsignedByteType);
      snowMaskTexture.magFilter = snowMaskTexture.minFilter = THREE.LinearFilter;
      snowMaskTexture.generateMipmaps = false; snowMaskTexture.flipY = false; snowMaskTexture.unpackAlignment = 1; snowMaskTexture.needsUpdate = true;
      snowMaskTexture.name = 'Nebeljagd · gemalte Schneegewichtung';
      paintUniform.value = texture; pavingMaskUniform.value = maskTexture; snowMaskUniform.value = snowMaskTexture; textureSize = next; bakeCount++;
      const elapsed = performance.now() - started; totalBakeMs += elapsed; maximumBakeMs = Math.max(maximumBakeMs, elapsed);
    },
    release,
    dispose() { release(); empty.dispose(); },
    get stats() { return { resident: Boolean(texture), bytes: textureSize?.bytes ?? 0,
      width: textureSize?.width ?? 0, height: textureSize?.height ?? 0, bakeCount,
      snowRelief: true, snowMaskResident: Boolean(snowMaskTexture), snowVisualDepthMeters: .208, snowMicroRelief: true, snowCrystalHighlights: true,
      totalBakeMs, maximumBakeMs, metersPerTexel: textureSize?.metersPerTexel ?? 0 }; },
  };
}
