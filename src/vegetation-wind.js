import * as THREE from 'three';
import { getLandscape, LANDSCAPE_LIMITS } from './map/landscape.js';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const direction = angle => ({ x: Math.sin(angle), z: -Math.cos(angle) });

/** A shared world-space field. Direction 0 is north (-z), π/2 is east.
 * Only the clock changes each frame; every visible vertex is moved by the GPU.
 * Local circles are priority ordered, with soft borders, including wind shadows.
 */
export function createVegetationWind(map = {}) {
  const maxZones = LANDSCAPE_LIMITS.windZones, maxInteractors = 8;
  const uniforms = {
    uVegetationTime: { value: 0 }, uVegetationEnabled: { value: 1 },
    uVegetationWind: { value: new THREE.Vector2() },
    uVegetationSpeed: { value: 1 }, uVegetationGust: { value: new THREE.Vector3() },
    uVegetationTurbulence: { value: .2 }, uVegetationZoneCount: { value: 0 },
    uVegetationZoneArea: { value: Array.from({ length: maxZones }, () => new THREE.Vector4()) },
    uVegetationZoneWind: { value: Array.from({ length: maxZones }, () => new THREE.Vector2()) },
    uVegetationInteractorCount: { value: 0 },
    uVegetationInteractors: { value: Array.from({ length: maxInteractors }, () => new THREE.Vector3(99999, 99999, 0)) },
    uVegetationInteractorMotion: { value: Array.from({ length: maxInteractors }, () => new THREE.Vector3(0, 1, 0)) },
  };
  let settings, zones;
  function configure(nextMap) {
    const landscape = getLandscape(nextMap);
    settings = { ...landscape.wind }; zones = landscape.windZones.slice(0, maxZones).map(zone => ({ ...zone, position: [...zone.position] }));
    const d = direction(settings.direction);
    uniforms.uVegetationEnabled.value = settings.enabled ? 1 : 0;
    uniforms.uVegetationWind.value.set(d.x * settings.strength, d.z * settings.strength);
    uniforms.uVegetationSpeed.value = settings.speed;
    uniforms.uVegetationGust.value.set(settings.gusts ? settings.gustStrength : 0, settings.gustFrequency, settings.turbulence);
    uniforms.uVegetationTurbulence.value = settings.turbulence;
    uniforms.uVegetationZoneCount.value = zones.length;
    zones.forEach((zone, index) => {
      const local = direction(zone.direction ?? settings.direction);
      uniforms.uVegetationZoneArea.value[index].set(...zone.position, zone.radius, zone.falloff ?? .35);
      uniforms.uVegetationZoneWind.value[index].set(local.x * (zone.strength ?? settings.strength), local.z * (zone.strength ?? settings.strength));
    });
  }
  const declarations = `
uniform float uVegetationTime, uVegetationEnabled, uVegetationSpeed, uVegetationTurbulence;
uniform vec2 uVegetationWind;
uniform vec3 uVegetationGust;
uniform int uVegetationZoneCount;
uniform vec4 uVegetationZoneArea[${maxZones}];
uniform vec2 uVegetationZoneWind[${maxZones}];
uniform int uVegetationInteractorCount;
uniform vec3 uVegetationInteractors[${maxInteractors}];
uniform vec3 uVegetationInteractorMotion[${maxInteractors}];
float vegetationVariation(vec2 p, float salt) {
  return fract(sin(dot(p + salt, vec2(12.9898,78.233))) * 43758.5453);
}
vec2 vegetationInteractionAt(vec2 p) {
  vec2 push = vec2(0.);
  float recoverySeed = vegetationVariation(p, 13.7);
  for (int i = 0; i < ${maxInteractors}; i++) {
    if (i >= uVegetationInteractorCount) break;
    vec3 actor = uVegetationInteractors[i];
    vec3 motion = uVegetationInteractorMotion[i];
    vec2 delta = p - actor.xy;
    float d = length(delta);
    float radius = max(.25, actor.z);
    float motionLength = length(motion.xy);
    if (motionLength < .001 || motion.z <= .001) continue;
    vec2 forward = motion.xy / motionLength;
    vec2 side = vec2(-forward.y, forward.x);
    float along = dot(delta, forward);
    float sideways = abs(dot(delta, side));
    float bodyInfluence = 1. - smoothstep(radius * .18, radius, d);
    float wakeLength = radius * mix(.80, 1.70, recoverySeed);
    float wakeWidth = radius * mix(.55, .88, vegetationVariation(p, 31.2));
    float behind = max(0., -along);
    float wakeInfluence = (1. - smoothstep(wakeWidth * .42, wakeWidth, sideways))
      * (1. - smoothstep(0., wakeLength, behind))
      * (1. - smoothstep(-.05, .18, along));
    float influence = max(bodyInfluence, wakeInfluence * mix(.50, .74, recoverySeed));
    if (influence <= 0.) continue;
    vec2 radial = d > .001 ? delta / d : forward;
    vec2 direction = normalize(forward * .82 + radial * .18);
    push += direction * influence * motion.z * mix(.54, .68, vegetationVariation(p, 59.4));
  }
  return push;
}
vec2 vegetationWindAt(vec2 p) {
  vec2 wind = uVegetationWind;
  for (int i = 0; i < ${maxZones}; i++) {
    if (i >= uVegetationZoneCount) break;
    vec4 area = uVegetationZoneArea[i];
    float distanceToCentre = distance(p, area.xy);
    float border = max(.0001, area.z * area.w);
    float weight = 1. - smoothstep(area.z - border, area.z, distanceToCentre);
    wind = mix(wind, uVegetationZoneWind[i], weight);
  }
  float strength = length(wind);
  if (strength < .00001 || uVegetationEnabled < .5) return vec2(0.);
  vec2 direction = wind / strength;
  float seedA = vegetationVariation(p, 5.1), seedB = vegetationVariation(p, 21.8), seedC = vegetationVariation(p, 44.7);
  float localSpeed = mix(.74, 1.28, seedA);
  float localAmplitude = mix(.76, 1.22, seedB);
  float t = uVegetationTime * uVegetationSpeed * localSpeed;
  float along = dot(p, direction);
  float phase = seedC * 6.28318530718;
  float wave = .68 + .22 * sin(along * .23 + t * .8 + phase)
    + .10 * sin(t * .53 + p.x * .37 - p.y * .29 + phase * .61);
  float gustPhase = .5 + .5 * sin(t * uVegetationGust.y * 6.28318530718 - along * .045 + phase * .37);
  float gust = pow(gustPhase, 4.) * uVegetationGust.x * .8;
  float crossWave = .17 * uVegetationTurbulence * sin(t * 1.13 + p.x * .49 + p.y * .41 + phase);
  return (wind * (wave + gust) + vec2(-direction.y, direction.x) * strength * crossWave) * .18 * localAmplitude;
}
`;
  function apply(material, { response = 1, height = 1, replaceLegacySway = true, interactionResponse = 0 } = {}) {
    if (material.userData.nebeljagdWind === uniforms) return material;
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey.bind(material);
    const responseLiteral = Number(response).toFixed(5), heightLiteral = Math.max(.001, height).toFixed(5), interactionLiteral = Math.max(0, Number(interactionResponse) || 0).toFixed(5);
    material.onBeforeCompile = (shader, renderer) => {
      previous?.call(material, shader, renderer);
      // Retain canopy transparency around the player while replacing only its
      // former private time-based movement, so the global off switch is real.
      if (replaceLegacySway) shader.vertexShader = shader.vertexShader.replace(/float sway = sin\(uCanopyTime[^;]+;\s*transformed\.x \+= sway[^;]+;\s*transformed\.z \+= sin\(uCanopyTime[^;]+;/g, '');
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = declarations + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        mat4 vegetationBasis = modelMatrix;
        #ifdef USE_INSTANCING
          vegetationBasis = modelMatrix * instanceMatrix;
        #endif
        vec3 vegetationRoot = (vegetationBasis * vec4(0., 0., 0., 1.)).xyz;
        float vegetationHeight = clamp(position.y / ${heightLiteral}, 0., 1.);
        vec2 vegetationOffset = vegetationWindAt(vegetationRoot.xz)
          * vegetationHeight * vegetationHeight * ${responseLiteral} * length(vegetationBasis[1].xyz);
        vec2 vegetationInteraction = vegetationInteractionAt(vegetationRoot.xz)
          * pow(vegetationHeight, 1.25) * ${interactionLiteral};
        float curveSeed = vegetationVariation(vegetationRoot.xz, 73.6);
        float curveAngle = vegetationVariation(vegetationRoot.xz, 87.2) * 6.28318530718;
        vec2 vegetationCurve = vec2(cos(curveAngle), sin(curveAngle))
          * mix(.015, .085, curveSeed) * pow(vegetationHeight, 1.8) * ${interactionLiteral};
        vec3 vegetationWorldOffset = vec3(vegetationOffset.x + vegetationInteraction.x + vegetationCurve.x, 0., vegetationOffset.y + vegetationInteraction.y + vegetationCurve.y);
        // Convert the world direction into the instance's rotated/scaled basis.
        // Translation is excluded; y=0 roots are exactly unchanged.
        transformed.x += dot(vegetationWorldOffset, vegetationBasis[0].xyz) / max(.0001, dot(vegetationBasis[0].xyz, vegetationBasis[0].xyz));
        transformed.z += dot(vegetationWorldOffset, vegetationBasis[2].xyz) / max(.0001, dot(vegetationBasis[2].xyz, vegetationBasis[2].xyz));
      `);
    };
    material.customProgramCacheKey = () => `${previousKey()}|nebeljagd-wind-v4-natural-motion:${responseLiteral}:${heightLiteral}:${interactionLiteral}:${replaceLegacySway}`;
    material.userData.nebeljagdWind = uniforms;
    material.userData.nebeljagdWindParameters = { response, height, interactionResponse };
    material.needsUpdate = true;
    return material;
  }
  function sample(x, z, time = uniforms.uVegetationTime.value) {
    if (!settings.enabled) return { x: 0, z: 0 };
    const base = direction(settings.direction);
    let wx = base.x * settings.strength, wz = base.z * settings.strength;
    for (const zone of zones) {
      const border = Math.max(.0001, zone.radius * (zone.falloff ?? .35));
      const weight = 1 - smooth((Math.hypot(x - zone.position[0], z - zone.position[1]) - zone.radius + border) / border);
      const local = direction(zone.direction ?? settings.direction), strength = zone.strength ?? settings.strength;
      wx += (local.x * strength - wx) * weight; wz += (local.z * strength - wz) * weight;
    }
    const strength = Math.hypot(wx, wz);
    if (strength < .00001) return { x: 0, z: 0 };
    const dx = wx / strength, dz = wz / strength, t = time * settings.speed, along = x * dx + z * dz;
    const wave = .68 + .22 * Math.sin(along * .23 + t * .8) + .1 * Math.sin(t * .53 + x * .37 - z * .29);
    const gustPhase = .5 + .5 * Math.sin(t * settings.gustFrequency * TAU - along * .045);
    const gust = settings.gusts ? gustPhase ** 4 * settings.gustStrength * .8 : 0;
    const crossWave = .17 * settings.turbulence * Math.sin(t * 1.13 + x * .49 + z * .41);
    return { x: (wx * (wave + gust) - dz * strength * crossWave) * .18,
      z: (wz * (wave + gust) + dx * strength * crossWave) * .18 };
  }
  function setInteractors(values = []) {
    const count = Math.min(maxInteractors, values.length);
    uniforms.uVegetationInteractorCount.value = count;
    for (let i = 0; i < maxInteractors; i++) {
      const value = i < count ? values[i] : null;
      uniforms.uVegetationInteractors.value[i].set(value?.x ?? 99999, value?.z ?? 99999, value?.radius ?? 0);
      uniforms.uVegetationInteractorMotion.value[i].set(value?.dirX ?? 0, value?.dirZ ?? 1, value?.strength ?? 0);
    }
  }
  configure(map);
  return { configure, apply, sample, uniforms, setInteractors,
    update(time) { uniforms.uVegetationTime.value = Number.isFinite(time) ? time : 0; },
    sampleVertex(x, z, y, time, { height = 1, response = 1 } = {}) {
      const offset = sample(x, z, time), weight = clamp(y / height, 0, 1) ** 2 * response;
      if (weight === 0) return { x: 0, z: 0 };
      return { x: offset.x * weight, z: offset.z * weight };
    },
    get stats() { return { gpu: true, rootAnchored: true, worldSpaceDirection: true,
      zones: zones.length, maximumZones: maxZones, settings: { ...settings }, time: uniforms.uVegetationTime.value,
      interactors: uniforms.uVegetationInteractorCount.value, maximumInteractors: maxInteractors,
      interactionMode: 'forward-biased', forwardWeight: .82, radialWeight: .18,
      firstInteractorStrength: uniforms.uVegetationInteractorMotion.value[0].z,
      curvatureVariation: 'per-instance-grass', windVariation: 'per-instance-phase-speed-amplitude',
      recoveryModel: 'variable-directional-wake' }; },
  };
}
