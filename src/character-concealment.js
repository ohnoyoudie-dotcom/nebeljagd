import * as THREE from 'three';

export const CHARACTER_CONCEALMENT_STYLE = 'textured-hidden-character-v3';
export const CONCEALED_BODY_OPACITY = .40;

/** Shared by the textured skin and its local read-through, so snow still covers
 * the same animated feet. The clipping plane is in world metres. */
export function applyCharacterSnowClip(material, height, strength) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey?.call(material) ?? '';
  material.onBeforeCompile = function (shader, renderer) {
    previous?.call(this, shader, renderer);
    shader.uniforms.uCharacterSnowClipHeight = height;
    shader.uniforms.uCharacterSnowClipStrength = strength;
    shader.vertexShader = `varying vec3 vCharacterSnowWorld;\n${shader.vertexShader}`
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vCharacterSnowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = `uniform float uCharacterSnowClipHeight;
      uniform float uCharacterSnowClipStrength;
      varying vec3 vCharacterSnowWorld;\n${shader.fragmentShader}`
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (uCharacterSnowClipStrength > .01) {
          float snowEdge = sin(vCharacterSnowWorld.x * 17.3 + vCharacterSnowWorld.z * 11.7) * .010
            + sin(vCharacterSnowWorld.x * 31.1 - vCharacterSnowWorld.z * 23.9) * .005;
          if (vCharacterSnowWorld.y < uCharacterSnowClipHeight + snowEdge) discard;
        }`);
  };
  material.customProgramCacheKey = () => `${previousKey}|character-snow-clip-v1`;
  return material;
}

/** Local presentation only: no gameplay visibility, enemy material, skeleton,
 * source texture or equipment is modified. Shared mask/contour materials and
 * per-skin textured fill materials reuse the animated geometry.
 * Only the fill's existing faint baseline is drawn outside concealment. */
export function createCharacterConcealment({ meshes, materials, snowClipHeight, snowClipStrength }) {
  const entries = [...materials];
  const blendUniform = { value: 0 }, baselineUniform = { value: .045 };
  const hiddenTint = { value: new THREE.Color('#e3ebe5') };
  const originalShadows = new Map(meshes.map(mesh => [mesh, mesh.castShadow]));
  const overlays = [], bodyHooks = [], fillMaterials = [];
  const material = applyCharacterSnowClip(new THREE.MeshBasicMaterial({
    color: '#b0cbbb', transparent: true, opacity: 1,
    depthTest: false, depthWrite: false, toneMapped: false,
    side: THREE.FrontSide,
  }), snowClipHeight, snowClipStrength);
  const snowCompile = material.onBeforeCompile;
  const snowKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    snowCompile.call(this, shader, renderer);
    shader.uniforms.uLocalConcealmentBlend = blendUniform;
    shader.uniforms.uLocalSilhouetteBaseline = baselineUniform;
    shader.uniforms.uLocalConcealmentTint = hiddenTint;
    shader.fragmentShader = `uniform float uLocalConcealmentBlend, uLocalSilhouetteBaseline;
      uniform vec3 uLocalConcealmentTint;\n${shader.fragmentShader}`
      .replace('#include <opaque_fragment>', `
        // Keep texture/alpha-map coverage and clothing detail in the read-through.
        diffuseColor.a *= mix(uLocalSilhouetteBaseline, .30, uLocalConcealmentBlend);
        outgoingLight = mix(outgoingLight, uLocalConcealmentTint, uLocalConcealmentBlend * .30);
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${snowKey}|${CHARACTER_CONCEALMENT_STYLE}:overlay`;
  const maskMaterial = applyCharacterSnowClip(new THREE.MeshBasicMaterial({
    colorWrite: false, depthTest: false, depthWrite: false, transparent: true,
    stencilWrite: true, stencilWriteMask: 1, stencilFuncMask: 1, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.ReplaceStencilOp,
  }), snowClipHeight, snowClipStrength);
  const outlineMaterial = applyCharacterSnowClip(new THREE.MeshBasicMaterial({
    color: '#e3ebe5', transparent: true, opacity: 0, depthTest: false, depthWrite: false,
    toneMapped: false, side: THREE.BackSide,
    stencilWrite: true, stencilWriteMask: 0, stencilFuncMask: 1, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
  }), snowClipHeight, snowClipStrength);
  const viewport = { value: new THREE.Vector2(1, 1) }, outlinePixels = { value: 1.5 };
  outlineMaterial.defines = { LOCAL_CONCEALMENT_OUTLINE: 1 };
  const outlineCompile = outlineMaterial.onBeforeCompile;
  const outlineKey = outlineMaterial.customProgramCacheKey();
  outlineMaterial.onBeforeCompile = function (shader, renderer) {
    outlineCompile.call(this, shader, renderer);
    shader.uniforms.uLocalOutlineViewport = viewport;
    shader.uniforms.uLocalOutlinePixels = outlinePixels;
    shader.vertexShader = `uniform vec2 uLocalOutlineViewport;
      uniform float uLocalOutlinePixels;\n${shader.vertexShader}`
      .replace('defined ( USE_ENVMAP ) || defined ( USE_SKINNING )',
        'defined ( USE_ENVMAP ) || defined ( USE_SKINNING ) || defined ( LOCAL_CONCEALMENT_OUTLINE )')
      .replace('#include <project_vertex>', `#include <project_vertex>
        // BackSide flips the view normal; undo that for outward extrusion.
        vec2 localOutlineDirection = (projectionMatrix * vec4(-transformedNormal, 0.0)).xy * uLocalOutlineViewport;
        localOutlineDirection /= max(length(localOutlineDirection), .001);
        gl_Position.xy += localOutlineDirection * (2.0 * uLocalOutlinePixels / uLocalOutlineViewport) * gl_Position.w;`);
  };
  outlineMaterial.customProgramCacheKey = () => `${outlineKey}|${CHARACTER_CONCEALMENT_STYLE}:contour`;
  for (const [bodyMaterial] of entries) {
    const previous = bodyMaterial.onBeforeCompile;
    const previousCacheKey = bodyMaterial.customProgramCacheKey;
    const previousKey = bodyMaterial.customProgramCacheKey?.call(bodyMaterial) ?? '';
    bodyMaterial.onBeforeCompile = function (shader, renderer) {
      previous?.call(this, shader, renderer);
      shader.uniforms.uLocalConcealmentBlend = blendUniform;
      shader.fragmentShader = `uniform float uLocalConcealmentBlend;\n${shader.fragmentShader}`
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.95), uLocalConcealmentBlend * .40);`);
    };
    bodyMaterial.customProgramCacheKey = () => `${previousKey}|${CHARACTER_CONCEALMENT_STYLE}:body`;
    bodyHooks.push({ bodyMaterial, previous, previousCacheKey, own: bodyMaterial.onBeforeCompile });
    bodyMaterial.needsUpdate = true;
  }
  for (const original of meshes) for (const [role, layerMaterial, order] of [
    ['mask', maskMaterial, 6], ['outline', outlineMaterial, 7], ['fill', material, 8],
  ]) {
    // Read-through must retain the character's actual skin and clothing colours,
    // including the parts occluded by grass. A solid fill loses those details.
    const makeFill = source => {
      const fill = material.clone();
      fill.map = source.map; fill.alphaMap = source.alphaMap;
      fill.alphaTest = source.alphaTest ?? 0;
      fill.color.copy(source.color ?? new THREE.Color('#ffffff'));
      fill.onBeforeCompile = material.onBeforeCompile;
      fill.customProgramCacheKey = material.customProgramCacheKey;
      fillMaterials.push(fill); return fill;
    };
    const actualMaterial = role === 'fill'
      ? (Array.isArray(original.material) ? original.material.map(makeFill) : makeFill(original.material)) : layerMaterial;
    const overlay = original.isSkinnedMesh
      ? new THREE.SkinnedMesh(original.geometry, actualMaterial)
      : new THREE.Mesh(original.geometry, actualMaterial);
    overlay.name = `${original.name} · local concealment ${role}`;
    overlay.position.copy(original.position);
    overlay.quaternion.copy(original.quaternion);
    overlay.scale.copy(original.scale);
    if (original.isSkinnedMesh) {
      overlay.bindMode = original.bindMode;
      overlay.bind(original.skeleton, original.bindMatrix);
      overlay.bindMatrixInverse.copy(original.bindMatrixInverse);
    }
    // Morph targets and any animated mesh transforms follow the original skin.
    overlay.morphTargetInfluences = original.morphTargetInfluences;
    overlay.morphTargetDictionary = original.morphTargetDictionary;
    overlay.onBeforeRender = renderer => {
      overlay.matrixWorld.copy(original.matrixWorld);
      if (original.isSkinnedMesh) overlay.bindMatrixInverse.copy(original.bindMatrixInverse);
      if (role === 'outline' && renderer) {
        renderer.getDrawingBufferSize(viewport.value);
        outlinePixels.value = 1.5 * renderer.getPixelRatio();
      }
    };
    overlay.frustumCulled = false;
    overlay.castShadow = overlay.receiveShadow = false;
    overlay.renderOrder = order;
    overlay.userData.localSilhouette = true;
    overlay.userData.concealmentLayer = role;
    overlay.userData.ignoreVision = true;
    overlay.visible = role === 'fill';
    original.parent.add(overlay);
    overlays.push(overlay);
  }
  let blend = 0;
  const state = { style: CHARACTER_CONCEALMENT_STYLE, active: false, blend: 0,
    bodyOpacity: 1, fillOpacity: 0, outlineOpacity: 0, color: '#e3ebe5', outline: 'stencil-contour', outlineWidthPixels: 1.5,
    localOnly: true, depthTest: false, snowClipped: false, baselineOpacity: .045, materialsRestored: true };
  function apply() {
    const bodyOpacity = 1 - blend * (1 - CONCEALED_BODY_OPACITY);
    const translucent = blend > 0;
    for (const [bodyMaterial, original] of entries) {
      const transparent = original.transparent || translucent;
      if (bodyMaterial.transparent !== transparent) {
        bodyMaterial.transparent = transparent;
        bodyMaterial.needsUpdate = true;
      }
      bodyMaterial.opacity = original.opacity * bodyOpacity;
      bodyMaterial.depthWrite = original.depthWrite && !translucent;
    }
    for (const [mesh, castShadow] of originalShadows) mesh.castShadow = castShadow && !translucent;
    blendUniform.value = blend;
    outlineMaterial.opacity = blend * .55;
    const overlayVisible = blend > 0 || baselineUniform.value > .001;
    for (const overlay of overlays) overlay.visible = overlay.userData.concealmentLayer === 'fill' ? overlayVisible : blend > 0;
    Object.assign(state, { blend, bodyOpacity, fillOpacity: blend * .30, outlineOpacity: blend * .55,
      baselineOpacity: baselineUniform.value * (1 - blend),
      materialsRestored: blend === 0 && entries.every(([bodyMaterial, original]) =>
        bodyMaterial.opacity === original.opacity && bodyMaterial.transparent === original.transparent
        && bodyMaterial.depthWrite === original.depthWrite) });
    return state;
  }
  function update(dt, { concealed = false, inDanger = false, snowClipped = false } = {}) {
    const delta = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, .1));
    const target = concealed ? 1 : 0;
    blend = THREE.MathUtils.lerp(blend, target, 1 - Math.exp(-delta * 10));
    if (Math.abs(blend - target) < .002) blend = target;
    const baseline = snowClipped ? 0 : inDanger ? .14 : .045;
    baselineUniform.value = THREE.MathUtils.lerp(baselineUniform.value, baseline, 1 - Math.exp(-delta * 6));
    state.active = Boolean(concealed); state.snowClipped = Boolean(snowClipped);
    return apply();
  }
  function reset() {
    blend = 0; baselineUniform.value = .045; state.active = false; state.snowClipped = false;
    return apply();
  }
  return { update, inspect: () => state, material, outlineMaterial, maskMaterial, reset,
    dispose() {
      reset();
      for (const overlay of overlays) overlay.removeFromParent();
      for (const { bodyMaterial, previous, previousCacheKey, own } of bodyHooks) {
        // A later vision hook may wrap this hook. Leave that chain intact with
        // a zero blend rather than removing someone else's material behavior.
        if (bodyMaterial.onBeforeCompile !== own) continue;
        bodyMaterial.onBeforeCompile = previous;
        bodyMaterial.customProgramCacheKey = previousCacheKey;
        bodyMaterial.needsUpdate = true;
      }
      for (const fill of fillMaterials) fill.dispose();
      material.dispose(); maskMaterial.dispose(); outlineMaterial.dispose();
    },
  };
}
