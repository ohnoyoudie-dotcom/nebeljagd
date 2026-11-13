import sunStaffUrl from '../assets/imported/tripo-sun-staff/runtime/sun-staff.glb?url&inline';
import sunStaffInspection from '../assets/imported/tripo-sun-staff/inspections/sun-staff.json' with { type: 'json' };
import soulStaffUrl from '../assets/imported/tripo-soul-staff/runtime/soul-staff.glb?url&inline';
import soulStaffInspection from '../assets/imported/tripo-soul-staff/inspections/soul-staff.json' with { type: 'json' };
import meteorStaffUrl from '../assets/imported/tripo-meteor-staff/runtime/meteor-staff.glb?url&inline';
import meteorStaffInspection from '../assets/imported/tripo-meteor-staff/inspections/meteor-staff.json' with { type: 'json' };
import hourglassStaffUrl from '../assets/imported/tripo-hourglass-staff/runtime/hourglass-staff.glb?url&inline';
import hourglassStaffInspection from '../assets/imported/tripo-hourglass-staff/inspections/hourglass-staff.json' with { type: 'json' };
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import swordUrl from '../assets/imported/tripo-weapons/runtime/sword.glb?url&inline';
import lavaStaffUrl from '../assets/imported/tripo-weapons/runtime/lava-staff.glb?url&inline';
import crystalStaffUrl from '../assets/imported/tripo-weapons/runtime/crystal-staff.glb?url&inline';
import poisonStaffUrl from '../assets/imported/tripo-extra-weapons/runtime/poison-staff.glb?url&inline';
import moonStaffUrl from '../assets/imported/tripo-extra-weapons/runtime/moon-staff.glb?url&inline';
import starStaffUrl from '../assets/imported/tripo-star-moon/runtime/star-staff.glb?url&inline';
import starStaffInspection from '../assets/imported/tripo-star-moon/inspections/star-staff.json' with { type: 'json' };
import gravityStaffUrl from '../assets/imported/tripo-gravity-staff/runtime/gravity-staff.glb?url&inline';
import gravityStaffInspection from '../assets/imported/tripo-gravity-staff/inspections/gravity-staff.json' with { type: 'json' };
import ornateBowUrl from '../assets/imported/tripo-extra-weapons/runtime/ornate-bow.glb?url&inline';
import ornateBowInspection from '../assets/imported/tripo-extra-weapons/inspections/ornate-bow.json' with { type: 'json' };
import poisonStaffInspection from '../assets/imported/tripo-extra-weapons/inspections/poison-staff.json' with { type: 'json' };
import moonStaffInspection from '../assets/imported/tripo-extra-weapons/inspections/moon-staff.json' with { type: 'json' };
import { TRIPO_WEAPON_VARIANTS, DEFAULT_WEAPON_VARIANTS } from './weapons.js';

import lightningStaffUrl from '../assets/imported/tripo-lightning-staff/runtime/lightning-staff.glb?url&inline';
import lightningStaffInspection from '../assets/imported/tripo-lightning-staff/inspections/lightning-staff.json' with { type: 'json' };

const SOURCES = {
  'kit-tripo-soul-staff': { url: soulStaffUrl, name: 'Seelenrichterstab · Tripo', tip: soulStaffInspection.normalization.tipPoint, source: 'assets/inbox/Seelenrichterstab.glb' },
  'kit-tripo-sun-staff': { url: sunStaffUrl, name: 'Sonnenstab · Tripo', tip: sunStaffInspection.normalization.tipPoint, source: 'assets/inbox/Sonnenstab.glb' },
  'kit-tripo-meteor-staff': { url: meteorStaffUrl, name: 'Meteorstab · Tripo', tip: meteorStaffInspection.normalization.tipPoint, source: 'assets/inbox/Meteorstab.glb' },
  'kit-tripo-hourglass-staff': { url: hourglassStaffUrl, name: 'Sanduhrstab · Tripo', tip: hourglassStaffInspection.normalization.tipPoint, source: 'assets/inbox/Sanduhrenstab.glb' },
  'kit-tripo-lightning-staff': { url: lightningStaffUrl, name: 'Blitzstab · Tripo', tip: lightningStaffInspection.normalization.tipPoint,
    source: 'assets/inbox/fantasy thunder staff 3d model.glb' },
  'kit-tripo-sword': { url: swordUrl, name: 'Schwert · Tripo' },
  'kit-tripo-lava-staff': { url: lavaStaffUrl, name: 'Lavastab · Tripo' },
  'kit-tripo-crystal-staff': { url: crystalStaffUrl, name: 'Kristallstab · Tripo' },
  'kit-tripo-poison-staff': { url: poisonStaffUrl, name: 'Giftstab · Tripo', tip: poisonStaffInspection.normalization.tipPoint },
  'kit-tripo-star-staff': { url: starStaffUrl, name: 'Sternstab · Tripo', tip: starStaffInspection.normalization.tipPoint,
    source: 'assets/inbox/arcane star staff 3d model.glb' },
  'kit-tripo-gravity-staff': { url: gravityStaffUrl, name: 'Gravitationsstab · Tripo', tip: gravityStaffInspection.normalization.tipPoint,
    source: 'assets/inbox/fantasy voidstaff 3d model.glb' },
  'kit-tripo-moon-staff': { url: moonStaffUrl, name: 'Mondstab · Tripo', tip: moonStaffInspection.normalization.tipPoint },
  'kit-tripo-ornate-bow': { url: ornateBowUrl, name: 'Verzierter Bogen · Tripo' },
};

/** Prepared assets point up (+Y), with the visible grip at the origin. These
 * immutable prototypes own geometry/textures; createWeapons clones materials
 * per pickup/held visual. Inline URLs also work in the offline single-file game. */
export async function loadTripoWeapons(placements = []) {
  const kitDefaults = Object.values(DEFAULT_WEAPON_VARIANTS).filter(variant => TRIPO_WEAPON_VARIANTS[variant]);
  const variants = [...new Set([...kitDefaults, ...placements
    .filter(object => TRIPO_WEAPON_VARIANTS[object.variant] === (object.kind ?? object.type))
    .map(object => object.variant)])];
  const prototypes = {};
  const results = await Promise.allSettled(variants.map(async variant => {
    const { scene } = await new GLTFLoader().loadAsync(SOURCES[variant].url);
    prototypes[variant] = scene;
    const bounds = new THREE.Box3().setFromObject(scene);
    if (bounds.isEmpty() || bounds.max.y <= 0 || bounds.min.y >= 0) {
      throw new Error(`Die Tripo-Waffe ${variant} enthält keinen gültigen Griffursprung.`);
    }
    scene.name = SOURCES[variant].name;
    if (SOURCES[variant].source) scene.userData.weaponSource = SOURCES[variant].source;
    if (SOURCES[variant].tip) scene.userData.weaponTipPoint = [...SOURCES[variant].tip];
    if (variant === 'kit-tripo-ornate-bow') {
      const rig = ornateBowInspection.normalization.bowRig;
      if (!rig || !Array.isArray(rig.stringLower) || !Array.isArray(rig.stringUpper)) {
        throw new Error('Der verzierte Bogen benötigt seine gemessenen Sehnenanker.');
      }
      scene.userData.bowRig = JSON.parse(JSON.stringify(rig));
    }
    scene.traverse(part => {
      if (!part.isMesh) return;
      part.castShadow = true;
      part.receiveShadow = true;
    });
  }));
  const failed = results.find(result => result.status === 'rejected');
  if (failed) { disposeTripoWeaponPrototypes(prototypes); throw failed.reason; }
  return prototypes;
}

/** Call only after every controller using these prototypes has been disposed. */
export function disposeTripoWeaponPrototypes(prototypes) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  for (const prototype of Object.values(prototypes)) prototype.traverse(part => {
    if (!part.isMesh) return;
    geometries.add(part.geometry);
    for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}
