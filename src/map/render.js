import { RARITIES, WEAPON_TYPES } from '../loot-tiers.js';
import { getWorldmapStats, validateWorldmap } from './model.js';
import { biomePreset } from './landscape.js';
import { getEnvironmentKitDefinition } from './environment-kit-definitions.js';
import { getObjectFootprintRadius } from './objects.js';
import { barrierSections } from './barriers.js';

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
const number = value => Math.round(value * 1000) / 1000;
const points = list => list.map(([x, z]) => `${number(x)},${number(z)}`).join(' ');
const feature = (type, id) => `id="feature-${type}-${escape(id)}" data-feature-type="${type}" data-feature-id="${escape(id)}"`;
const biomePattern = { snow: 'mountain', forest: 'forest', meadow: 'meadow', heath: 'heath', marsh: 'marsh', volcanic: 'ash', dunes: 'dune' };
const objectLayerOrder = { grass: 0, flower: 1, rock: 2, mound: 2, wall: 2, fence: 2, ruin: 3, house: 4, tree: 5, bush: 6, shrine: 7, crate: 7, wagon: 7, barrel: 7, well: 7, heart: 8, chest: 8, bow: 8, sword: 8, fireStaff: 8, iceStaff: 8 };
const objectHitRadius = { tree: 2.8, house: 11, flower: 1.5, grass: 3.5, rock: 1.8, mound: 6.5, wall: 1.7, fence: 1.7, crate: .6, wagon: 1.7, barrel: .65, well: 1.5, bush: 1.5, ruin: 7, shrine: 2, heart: 1.5, chest: 1.5, bow: 1.5, sword: 1.5, fireStaff: 1.5, iceStaff: 1.5 };

// Symbols use the same metre scale and +z/front direction as the 3D assets.
// Reusing a symbol preserves every independently editable placement without
// repeating thousands of copies of the source paths in the exported SVG.
function castleMapSymbol() {
  const definition = getEnvironmentKitDefinition('house', 'kit-tripo-castle');
  const { halfWidth, halfDepth } = definition.footprint;
  const pieces = ['<g id="world-object-house-tripo-castle"><rect x="' + number(-halfWidth)
    + '" y="' + number(-halfDepth) + '" width="' + number(halfWidth * 2) + '" height="'
    + number(halfDepth * 2) + '" fill="#bda77f" stroke="#655b47" stroke-width=".5"/>'];
  // Match the measured walls and furniture proxies, including real doorway
  // gaps, rather than drawing the castle as a tiny generic cottage.
  for (const wall of definition.walls) pieces.push('<rect x="' + number(wall.minX)
    + '" y="' + number(wall.minZ) + '" width="' + number(wall.maxX - wall.minX)
    + '" height="' + number(wall.maxZ - wall.minZ) + '" fill="'
    + (wall.type === 'furniture' ? '#80694b' : '#ece0bd') + '"/>');
  pieces.push('</g>');
  return pieces.join('');
}
const objectSymbols = [
  castleMapSymbol(),
  '<g id="world-object-wagon"><rect x="-.8" y="-1.1" width=".16" height=".8" rx=".05" fill="#343a39"/><rect x=".64" y="-1.1" width=".16" height=".8" rx=".05" fill="#343a39"/><path d="M-.4,.2V1.45M.4,.2V1.45" stroke="#8f6946" stroke-width=".12"/><rect x="-.58" y="-1.4" width="1.16" height="1.75" fill="#bd945e" stroke="#69503b" stroke-width=".15"/><path d="M-.25,-1.3V.2M.25,-1.3V.2" stroke="#89653f" stroke-width=".07"/></g>',
  '<g id="world-object-barrel"><ellipse rx=".43" ry=".45" fill="#97714b" stroke="#3f443f" stroke-width=".12"/><path d="M-.2,-.36V.36M.2,-.36V.36" stroke="#c3a574" stroke-width=".07"/><circle cy="-.08" r=".075" fill="#59452e"/></g>',
  '<g id="world-object-well"><circle cx="-.18" r=".94" fill="#b5b0a0" stroke="#676f66" stroke-width=".13"/><circle cx="-.18" r=".6" fill="#31454b"/><path d="M-1.06,-.77H.78V.78H-1.06Z" fill="#96724a" fill-opacity=".7" stroke="#654c38" stroke-width=".13"/><path d="M-1.08,0H.8M.8,.12H1.12" stroke="#ddc292" stroke-width=".14"/></g>',
  '<g id="world-object-rock-tripo-01"><path d="M-.96,-.25-.52,-.78 .45,-.85 .98,-.13 .72,.64-.4,.8-.95,.34Z" fill="#9b9d8b" stroke="#626c5b" stroke-width=".13"/><path d="M-.52,-.78 .15,-.12 .98,-.13M.15,-.12-.4,.8" fill="none" stroke="#c0c2a7" stroke-width=".1"/></g>',
  '<g id="world-object-rock-tripo-02"><path d="M-.9,-.36-.55,-1.05 .4,-1 .9,-.32 .68,.88-.18,1.05-.85,.5Z" fill="#8e9285" stroke="#596356" stroke-width=".14"/><path d="M-.55,-1.05 .25,-.15 .68,.88M.25,-.15-.85,.5" fill="none" stroke="#b7b9a4" stroke-width=".11"/></g>',
  '<g id="world-object-rock-tripo-03"><path d="M-1.1,-.3-.65,-1.23 .45,-1.25 1.14,-.4 .9,.65 .1,1.28-.9,.87Z" fill="#747e6a" stroke="#4c5c4b" stroke-width=".15"/><path d="M-.65,-1.23 .2,-.5 1.14,-.4M.2,-.5-.3,.5 .1,1.28M-.3,.5-.9,.87" fill="none" stroke="#abb79a" stroke-width=".12"/></g>',
  '<g id="world-object-house-tripo-tavern"><rect x="-11" y="-8.89" width="22" height="17.78" rx=".35" fill="#926b47" stroke="#493a2e" stroke-width=".45"/><path d="M-10.4,-8H-2.35M0,-8H10.4V8H1.4M-1.5,8H-10.4V-8M2.9,-8V-3.5M2.9,-1.1V0H4.7M6.8,0H10.4" fill="none" stroke="#d6c39b" stroke-width=".5"/><path d="M-1.5,8H1.4M-2.35,-8H0" stroke="#f4e6bc" stroke-width=".7"/><path d="M-8.7,-2H-4.7V.86H-8.7ZM-8.7,2.2H-4.7V5.05H-8.7ZM-7.6,-7.4H-2.5V-5.5H-7.6Z" fill="#644b35" stroke="#bf9966" stroke-width=".2"/></g>',
  '<g id="world-object-wall"><rect x="-1.6" y="-.31" width="3.2" height=".62" fill="#8b9387" stroke="#4d5d53" stroke-width=".13"/><path d="M-.8,-.31V.31M0,-.31V.31M.8,-.31V.31" stroke="#535c50" stroke-width=".1"/></g>',
  '<g id="world-object-fence"><path d="M-1.6,-.16H1.6M-1.6,.16H1.6M-1.4,-.28V.28M0,-.28V.28M1.4,-.28V.28" stroke="#b08b54" stroke-width=".2"/></g>',
  '<g id="world-object-crate"><rect x="-.43" y="-.43" width=".86" height=".86" fill="#9e784d" stroke="#5e4931" stroke-width=".12"/><path d="M-.35,-.35 .35,.35M-.35,.35 .35,-.35" stroke="#e0bd7e" stroke-width=".1"/></g>',
  '<g id="world-object-house-kit"><rect x="-1.86" y="-1.565" width="3.72" height="3.13" fill="#b59161" stroke="#654d35" stroke-width=".2"/><path d="M-.45,1.565H.45" stroke="#e8d6ad" stroke-width=".28"/></g>',
  '<g id="world-object-house-taverne"><rect x="-11" y="-8.5" width="22" height="17" rx=".35" fill="#8d6544" stroke="#493a2e" stroke-width=".45"/><path d="M-10.8,-8.3H10.8M-10.8,8.3H-3.5M.3,8.3H10.8M-10.8,-8.3V8.3M10.8,-8.3V8.3M3.35,-8.2V-6.3M3.35,-4.1V-1.1M3.35,1.1V4.1M3.35,6.3V8.2M4.8,-2.8H10.8M4.8,2.8H10.8" fill="none" stroke="#d1ad77" stroke-width=".28"/><path d="M-3.4,8.52H.25" stroke="#f0dcb3" stroke-width=".65"/><path d="M-8,-6.5H-.8V-.7H-8ZM5,-7H9V-3H5ZM5,3H9V7H5Z" fill="none" stroke="#654c38" stroke-width=".22"/></g>',
  '<g id="world-object-ruin-kit"><rect x="-1.45" y="-.385" width=".7" height=".77" fill="#89907e" stroke="#535c50" stroke-width=".12"/><rect x=".75" y="-.385" width=".7" height=".77" fill="#89907e" stroke="#535c50" stroke-width=".12"/><path d="M-1.1,0H1.1" stroke="#b3b79e" stroke-width=".35" stroke-dasharray=".3 .2"/></g>',
  '<g id="world-object-tree-autumn"><circle r="2.3" fill="#a46636" stroke="#754f30" stroke-width=".3"/><circle cx="-.7" cy="-.5" r="1.5" fill="#d79846"/><circle cx=".7" cy=".6" r="1.3" fill="#b87c37"/></g>',
  '<g id="world-object-tree"><circle r="2.7" fill="#356448" stroke="#244735" stroke-width=".5"/><circle cx="-.8" cy="-.8" r="1.7" fill="#568158"/><circle cx=".8" cy=".7" r="1.25" fill="#456f48"/></g>',
  '<g id="world-object-tree-birch"><circle r="2.35" fill="#75936a" stroke="#425c49" stroke-width=".45"/><circle cx="-.6" cy="-.8" r="1.4" fill="#9db780"/><circle r=".28" fill="#e6ddc4"/></g>',
  '<g id="world-object-tree-pine"><path d="M0,-3.5 2.6,1.8 1.3,1.8 2.1,3H-2.1L-1.3,1.8H-2.6Z" fill="#2b5847" stroke="#1b443b" stroke-width=".4"/><path d="M0,-2.8V2.4" stroke="#75916d" stroke-width=".35"/></g>',
  '<g id="world-object-tree-rei"><path d="M-2.9,-.5C-3.6,-3.8 1.3,-4.3 2,-2.2C5,-1.8 3.6,2.3 1.5,2.2C-.4,4.1-3.7,2.1-2.9,-.5Z" fill="#6b875d" stroke="#365944" stroke-width=".45"/><path d="M-1.7,-1.5Q0,-3 1.4,-1.4" fill="none" stroke="#a1b379" stroke-width=".45"/></g>',
  '<g id="world-object-house"><rect x="-8" y="-7" width="16" height="14" rx=".3" fill="#ad8152" stroke="#5c4937" stroke-width=".7"/><path d="M-8,0H8M0,-7V7" fill="none" stroke="#d5ba82" stroke-width=".45"/><path d="M-8,-7 0,0 8,-7M-8,7 0,0 8,7" fill="none" stroke="#7c694c" stroke-width=".4"/><path d="M-1.5,7H1.5" stroke="#ede1b7" stroke-width="1.7"/><rect x="-2.2" y="7.2" width="4.4" height="1.8" fill="#d9c49a" stroke="#776549" stroke-width=".35"/></g>',
  '<g id="world-object-flower"><circle r="1" fill="#69835c" fill-opacity=".55"/><circle cx="-.42" cy="-.26" r=".34" fill="currentColor"/><circle cx=".45" cy="-.32" r=".29" fill="currentColor"/><circle cx=".07" cy=".45" r=".31" fill="currentColor"/><circle cx="-.42" cy="-.26" r=".11" fill="#dfb85d"/><circle cx=".45" cy="-.32" r=".1" fill="#dfb85d"/><circle cx=".07" cy=".45" r=".1" fill="#dfb85d"/></g>',
  '<g id="world-object-grass"><path d="M-.95,-.25Q-.75,-1.1 .1,-.85Q1.1,-.9 .92,.2Q.7,1.1-.15,.9Q-1.1,.85-.95,-.25Z" fill="#557c48" fill-opacity=".72" stroke="#43673b" stroke-width=".08"/><path d="M-.5,.3-.45,-.1-.35,.3M.15,.1 .2,-.35 .3,.1" fill="none" stroke="#a1b779" stroke-width=".06"/></g>',
  '<g id="world-object-rock"><path d="M-1.7,.5-1,-1.4 .7,-1.7 1.8,-.25 1.1,1.4-.8,1.6Z" fill="#92968a" stroke="#5b655c" stroke-width=".35"/><path d="M-1,-1.4 .2,-.1 1.8,-.25M.2,-.1-.8,1.6" fill="none" stroke="#bac0af" stroke-width=".25"/></g>',
  '<g id="world-object-mound-ridge" fill="#606955" stroke="#3e4a3d" stroke-width=".2"><path id="world-object-mound-ridge-base" d="M-6,-1.35H-4.1V-2.1H-2V-2.5H.7V-2.15H3.5V-1.55H6V1.7H3.5V2.35H.7V2.5H-2V2.2H-4.1V1.6H-6Z" /><use href="#world-object-mound-ridge-base" transform="scale(.86)" fill="#557946" stroke="#90a56a" stroke-width=".15"/><path d="M-4.5,.6-3.9,-.6-3.4,.5M-.7,.5-.1,-.8 .4,.4M2.3,.6 2.8,-.5 3.3,.6" fill="none" stroke="#9bb772" stroke-width=".3" stroke-linecap="round"/></g>',
  '<g id="world-object-mound-knoll" fill="#606955" stroke="#3e4a3d" stroke-width=".2"><path id="world-object-mound-knoll-base" d="M-3,-1.3H-1.8V-2.2H-.5V-2.5H1.25V-2.1H2.25V-1.15H3V1.1H2.25V1.85H1.25V2.5H-.5V2.1H-1.8V1.25H-3Z" /><use href="#world-object-mound-knoll-base" transform="scale(.85)" fill="#557946" stroke="#90a56a" stroke-width=".15"/><path d="M-1.8,.6-1.2,-.6-.7,.5M.1,.7 .6,-.7 1.2,.4" fill="none" stroke="#9bb772" stroke-width=".3" stroke-linecap="round"/></g>',
  '<g id="world-object-bush"><circle cx="-.7" cy=".1" r="1.1" fill="#5a7b48"/><circle cx=".6" cy=".15" r="1.2" fill="#668851"/><circle cy="-.6" r="1.1" fill="#7c955b"/><circle r=".35" fill="#8ca96a"/></g>',
  '<g id="world-object-ruin"><path d="M-6,5V-5H-1M2,-5H6V5H1M-2,5H-6" fill="none" stroke="#707b70" stroke-width="1.8"/><path d="M-5,-4H-1M3,-4H5V0" fill="none" stroke="#c4c9b4" stroke-width=".55"/><path d="M-2,-1 1,-2 3,1 0,3Z" fill="#90998a"/></g>',
  '<g id="world-object-shrine"><circle r="1.8" fill="#88958b" stroke="#536b60" stroke-width=".4"/><path d="M0,-1.5 1,0 0,1.5-1,0Z" fill="#c9a1df" stroke="#745683" stroke-width=".3"/></g>',
  '<g id="world-object-heart"><path d="M0,1.1C-2,-.2-1.2,-1.9 0,-.85C1.2,-1.9 2,-.2 0,1.1Z" fill="#d37673" stroke="#7b454a" stroke-width=".25"/></g>',
  '<g id="world-object-chest"><rect x="-1.4" y="-.9" width="2.8" height="1.8" rx=".3" fill="#966535" stroke="#4d3826" stroke-width=".25"/><path d="M-.8,-.9V.9M.8,-.9V.9M-1.4,-.25H1.4" stroke="#e1bb62" stroke-width=".25"/><rect x="-.25" y="-.45" width=".5" height=".7" fill="#f4d173"/></g>',
  '<g id="world-object-fireStaff"><path d="M-.6,1.5 .5,-.85" stroke="#ae7848" stroke-width=".4"/><path d="M.1,-.65Q-.25,-1.1 .4,-1.8Q.3,-1.15 .9,-1.6Q1.7,-.7 .65,-.5Z" fill="#ff9d43" stroke="#ba513a" stroke-width=".15"/></g>',
  '<g id="world-object-iceStaff"><path d="M-.6,1.5 .5,-.85" stroke="#9cacc1" stroke-width=".4"/><path d="M.5,-1.85 .5,-.5M-.15,-1.2H1.15M.05,-1.65 .95,-.75M.05,-.75 .95,-1.65" stroke="#9ce5ff" stroke-width=".3"/></g>',
  '<g id="world-object-bow"><path d="M-.6,-1.3Q2,0-.6,1.3Z" fill="none" stroke="#b79158" stroke-width=".35"/><path d="M-1.4,0H1.5M.8,-.4 1.5,0 .8,.4" fill="none" stroke="#ece0b7" stroke-width=".2"/></g>',
  '<g id="world-object-sword"><path d="M-.25,-1.5 .25,-1.5 .35,.6-.35,.6Z" fill="#c9d4cd" stroke="#5c7270" stroke-width=".18"/><path d="M-.8,.6H.8M0,.6V1.6" stroke="#c4a267" stroke-width=".4"/></g>',
];

function objectSymbol(item) {
  if (item.kind === 'house' && item.variant === 'kit-tripo-castle') return 'house-tripo-castle';
  if (item.kind === 'rock' && /^kit-tripo-0[123]$/.test(item.variant)) return `rock-tripo-${item.variant.slice(-2)}`;
  if (item.kind === 'house' && item.variant === 'kit-tripo-tavern') return 'house-tripo-tavern';
  if (item.kind === 'house' && item.variant === 'kit-taverne') return 'house-taverne';
  if (item.kind === 'house' && item.variant === 'kit-timber') return 'house-kit';
  if (item.kind === 'ruin' && item.variant === 'kit-arch') return 'ruin-kit';
  if (item.kind === 'tree' && item.variant === 'kit-oak-autumn') return 'tree-autumn';
  if (item.kind === 'tree' && item.variant.startsWith('kit-pine-')) return 'tree-pine';
  if (item.kind === 'mound') return `mound-${item.variant}`;
  if (item.kind === 'tree') {
    if (item.variant === 'pine' || item.variant === 'birch') return `tree-${item.variant}`;
    if (item.variant === 'rei-tree01' || item.variant === 'rei-tree02') return 'tree-rei';
  }
  return item.kind;
}

function objectSvg(item) {
  if (!Object.hasOwn(objectLayerOrder, item.kind)) return '';
  const radius = item.radius ?? (item.variant === 'kit-tripo-castle' ? getObjectFootprintRadius(item.kind, item.variant)
    : item.kind === 'mound' && item.variant === 'knoll' ? 3.91 : ['kit-taverne', 'kit-tripo-tavern'].includes(item.variant) ? 14.5 : item.variant === 'kit-timber' ? 2.45 : item.variant === 'kit-arch' ? 1.5 : objectHitRadius[item.kind]);
  const patch = item.kind === 'grass' || item.kind === 'flower';
  const tint = item.kind === 'flower' ? ({ 'rei-red': '#c77c7c', 'rei-gold': '#e0bd64' }[item.variant] ?? '#e7e4cb') : undefined;
  const tier = WEAPON_TYPES.includes(item.kind) ? (RARITIES[item.rarity] ?? RARITIES.common) : null;
  const halo = tier ? `<circle r="1.9" fill="${tier.color}" fill-opacity=".16" stroke="${tier.color}" stroke-width=".25"/>` : '';
  const transform = `translate(${number(item.position[0])} ${number(item.position[1])}) rotate(${number(-item.rotation * 180 / Math.PI)}) scale(${number(item.scale)})`;
  if (item.kind === 'grass' && item.vegetation) {
    const settings = item.vegetation, tint = escape(settings.color ?? '#6e934d');
    return `    <g ${feature('object', item.id)} data-object-kind="grass" data-object-variant="${escape(item.variant)}" transform="${transform}"><title>${escape(item.name)} · Höhe ${number((settings.height ?? 1) * 100)} % · Dichte ${number((settings.density ?? 1) * 100)} %</title><circle r="${number(radius)}" fill="${tint}" fill-opacity="${number(.12 + .6 * (settings.density ?? 1))}" stroke="${tint}" stroke-width=".15" stroke-dasharray=".5 .4"/><path d="M-.6,.5-.4,-.6-.2,.5M.1,.4 .3,-.8 .5,.4" transform="scale(${number(radius * .55)})" fill="none" stroke="#d4dca0" stroke-width=".15" pointer-events="none"/></g>`;
  }
  return `    <g ${feature('object', item.id)} data-object-kind="${item.kind}" data-object-variant="${escape(item.variant)}"${tier ? ` data-rarity="${tier.id}"` : ''} transform="${transform}"><title>${escape(item.name)}${tier ? ` · ${tier.label}` : ''} · ${escape(item.id)}</title>${halo}<circle r="${number(Math.max(.8, radius))}" fill="transparent" pointer-events="all"/><use href="#world-object-${objectSymbol(item)}"${patch ? ` transform="scale(${number(radius)})"` : ''}${tint ? ` color="${tint}"` : ''}/></g>`;
}

/** One selectable, editable centreline. Visible strokes use exactly the solid
 * sections used by the runtime; the wider transparent hit area also permits
 * selecting a line at its doorway without painting across that opening. */
export function barrierSvg(barrier) {
  const definition = getEnvironmentKitDefinition(barrier.kind, barrier.variant);
  if (!['wall', 'fence'].includes(barrier.kind) || !definition) return '';
  const thickness = definition.footprint.halfDepth * 2 * barrier.scale;
  const stone = barrier.kind === 'wall';
  const line = points(barrier.points);
  const path = barrierSections(barrier).map(({ a, b }) => `M${number(a[0])},${number(a[1])}L${number(b[0])},${number(b[1])}`).join(' ');
  return `    <g ${feature('barrier', barrier.id)} data-barrier-kind="${escape(barrier.kind)}" data-barrier-variant="${escape(barrier.variant)}"><title>${escape(barrier.name)} · ${stone ? 'Steinmauer' : 'Holzzaun'}</title><polyline class="barrier-hit" points="${line}" fill="none" stroke="transparent" stroke-width="14" vector-effect="non-scaling-stroke" pointer-events="stroke"/><path class="barrier-outline" d="${path}" fill="none" stroke="${stone ? '#405447' : '#59432e'}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linecap="butt" pointer-events="none"/><path class="barrier-solid" d="${path}" fill="none" stroke="${stone ? '#b9b59c' : '#b78c53'}" stroke-width="${number(thickness)}" stroke-linecap="butt" pointer-events="none"/><path class="barrier-detail" d="${path}" fill="none" stroke="${stone ? '#646d5f' : '#63462c'}" stroke-width="${number(thickness * .4)}" stroke-dasharray="${stone ? '.12 1' : '.28 2.4'}" stroke-linecap="butt" pointer-events="none"/></g>`;
}

function placeIcon(place) {
  const fill = '#f3e4bd';
  if (place.kind === 'village') return `<path d="M-12,0 -5,-7 2,0 2,11 -12,11Z M2,-5 9,-12 16,-5 16,6 2,6Z M-5,-12 0,-17 5,-12 5,-4 -5,-4Z" fill="${fill}" stroke="#324c42" stroke-width="2"/>`;
  if (place.kind === 'ruin') return `<path d="M-13,-12 -5,-12 -5,-7 5,-7 5,-12 13,-12 13,12 -13,12Z M-4,12 -4,3 4,3 4,12" fill="${fill}" stroke="#534e40" stroke-width="2.5" stroke-linejoin="round"/>`;
  if (place.kind === 'shrine') return '<path d="M0,-15 11,0 0,15 -11,0Z" fill="#e8e0b5" stroke="#53675c" stroke-width="2.5"/><path d="M0,-6 4,0 0,6 -4,0Z" fill="#7c69a6"/>';
  if (place.kind === 'harbor') return `<circle r="14" fill="${fill}" stroke="#325861" stroke-width="2"/><path d="M0,-7V9 M-9,2Q-9,11 0,11Q9,11 9,2 M-5,-2H5" fill="none" stroke="#325861" stroke-width="2"/><circle cy="-9" r="3" fill="none" stroke="#325861" stroke-width="2"/>`;
  return `<path d="M-8,11 -4,-9 2,-15 9,11Z" fill="${fill}" stroke="#575746" stroke-width="2"/><path d="M1,-8 3,5" stroke="#9b9175" stroke-width="2"/>`;
}

/** A dependency-free, editable SVG. Geometry stays in the JSON x/z coordinate system. */
export function renderWorldmapSvg(map, options = {}) {
  // The editor validates on commit/import and can reuse its trusted result
  // while dragging. Public exports validate by default; imported data must
  // never opt into this fast path before its structural validation succeeds.
  if (!options.validated) {
    const validation = validateWorldmap(map);
    if (!validation.valid) throw new Error(`Ungültige Weltkarte: ${validation.errors.join(' ')}`);
  }
  const { showGrid = false, showSpawns = true, showZone = false, showLabels = true, showPlaces = true, showObjects = true, editor = false } = options;
  const objectKinds = Array.isArray(options.showObjectKinds) ? new Set(options.showObjectKinds) : null;
  const { minX, minZ, maxX, maxZ } = map.bounds;
  const width = maxX - minX, height = maxZ - minZ;
  const stats = getWorldmapStats(map);
  const terrain = map.landscape?.terrain ?? [], paintedBiomes = map.landscape?.biomes ?? [], windZones = map.landscape?.windZones ?? [];
  const zoneRadius = Number.isFinite(options.zoneRadius) ? Math.max(0, Math.min(1e7, options.zoneRadius)) : map.zone.initialRadius;
  const coast = points(map.island.points);
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="${minX} ${minZ} ${width} ${height}" role="img" aria-labelledby="worldmap-title worldmap-description">`,
    `  <title id="worldmap-title">${escape(map.name)}</title>`,
    `  <desc id="worldmap-description">Editierbare schematische Fantasy-Insel: ${stats.regionCount} grobe Regionen, Wege, Flüsse und wichtige Orte. Nord ist oben. Ein Koordinatenschritt entspricht einem geplanten Meter. ${escape(map.description ?? '')}</desc>`,
    '  <defs>',
    `    <clipPath id="world-island-clip"><use href="#feature-island-${escape(map.island.id)}"/></clipPath>`,
    '    <linearGradient id="world-sea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#142a3c"/><stop offset="1" stop-color="#0c1c2e"/></linearGradient>',
    '    <pattern id="world-grid" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100,0H0V100" fill="none" stroke="#d0e2d4" stroke-width=".7" opacity=".3"/></pattern>',
    '    <pattern id="world-pattern-mountain" width="115" height="100" patternUnits="userSpaceOnUse"><path d="M12,55 31,21 51,55 M27,29 32,37 36,31 M64,86 83,48 105,86" fill="none" stroke="#536c7a" stroke-width="2.1" opacity=".38"/></pattern>',
    '    <pattern id="world-pattern-forest" width="100" height="95" patternUnits="userSpaceOnUse"><path d="M20,17 8,40H32Z M20,34 5,58H35Z M66,48 52,73H80Z M66,65 49,91H83Z" fill="#234d40" opacity=".26"/></pattern>',
    '    <pattern id="world-pattern-meadow" width="120" height="100" patternUnits="userSpaceOnUse"><path d="M18,30 21,22 24,30 M74,76 77,68 80,76" fill="none" stroke="#426c49" stroke-width="2" opacity=".3"/></pattern>',
    '    <pattern id="world-pattern-heath" width="115" height="95" patternUnits="userSpaceOnUse"><path d="M20,35Q32,19 44,35 M65,77Q77,61 89,77" fill="none" stroke="#8c7c3f" stroke-width="2" opacity=".3"/><circle cx="80" cy="20" r="2" fill="#8c7c3f" opacity=".35"/></pattern>',
    '    <pattern id="world-pattern-marsh" width="105" height="95" patternUnits="userSpaceOnUse"><path d="M13,42Q27,49 42,42 M18,35V19 M26,36V12 M34,35V23 M65,83Q78,89 93,83" fill="none" stroke="#246a69" stroke-width="2" opacity=".4"/></pattern>',
    '    <pattern id="world-pattern-ash" width="115" height="100" patternUnits="userSpaceOnUse"><path d="M8,57 30,22 54,57Z M69,88 84,59 105,88Z" fill="#514e4b" opacity=".22"/><path d="M31,24 26,41 37,47 29,57" fill="none" stroke="#ce976a" stroke-width="2" opacity=".55"/></pattern>',
    '    <pattern id="world-pattern-dune" width="115" height="95" patternUnits="userSpaceOnUse"><path d="M9,35Q28,14 50,35 M60,80Q82,57 106,80" fill="none" stroke="#a78651" stroke-width="2" opacity=".35"/></pattern>',
    ...objectSymbols.map(symbol => `    ${symbol}`),
    ...terrain.map(stamp => `    <radialGradient id="world-terrain-${escape(stamp.id)}"><stop offset="0" stop-color="${escape(stamp.color)}" stop-opacity="${number(stamp.strength)}"/><stop offset="${number(stamp.hardness * 100)}%" stop-color="${escape(stamp.color)}" stop-opacity="${number(stamp.strength)}"/><stop offset="100%" stop-color="${escape(stamp.color)}" stop-opacity="${stamp.hardness >= .999 ? number(stamp.strength) : 0}"/></radialGradient>`),
    ...paintedBiomes.map(stamp => {
      const color = biomePreset(stamp.presetId)?.terrain?.color ?? '#78a866';
      const softness = Number.isFinite(stamp.softness) ? Math.max(0, Math.min(1, stamp.softness)) : .6;
      const inner = (1 - softness) * 100, alpha = Math.max(.08, Math.min(.32, (stamp.strength ?? 1) * .26));
      return `    <radialGradient id="world-biome-${escape(stamp.id)}"><stop offset="0" stop-color="${escape(color)}" stop-opacity="${number(alpha)}"/><stop offset="${number(inner)}%" stop-color="${escape(color)}" stop-opacity="${number(alpha)}"/><stop offset="100%" stop-color="${escape(color)}" stop-opacity="0"/></radialGradient>`;
    }),
    '  </defs>',
    '  <g id="sea" data-layer="sea" inkscape:groupmode="layer" inkscape:label="Meer">',
    `    <rect x="${minX}" y="${minZ}" width="${width}" height="${height}" fill="url(#world-sea)"/>`,
    `    <use href="#feature-island-${escape(map.island.id)}" fill="none" stroke="#2d7291" stroke-width="29" opacity=".25" stroke-linejoin="round"/>`,
    `    <use href="#feature-island-${escape(map.island.id)}" fill="none" stroke="#4d9baf" stroke-width="13" opacity=".4" stroke-linejoin="round"/>`,
    '  </g>',
    '  <g id="island" data-layer="island" inkscape:groupmode="layer" inkscape:label="Inselumriss" fill="#c9c59b" stroke="#e2d6aa" stroke-width="6" stroke-linejoin="round">',
    `    <polygon ${feature('island', map.island.id)} points="${coast}"><title>${escape(map.island.name)}</title></polygon>`,
    '  </g>',
    '  <g id="regions" data-layer="regions" inkscape:groupmode="layer" inkscape:label="Regionen" clip-path="url(#world-island-clip)">',
  ];
  for (const region of map.regions) {
    out.push(`    <g ${feature('region', region.id)}><title>${escape(region.name)}</title>`);
    out.push(`      <polygon points="${points(region.points)}" fill="${region.color}" stroke="#38564c" stroke-width="2" stroke-opacity=".4"/>`);
    const pattern = biomePattern[region.biome];
    if (pattern) out.push(`      <polygon points="${points(region.points)}" fill="url(#world-pattern-${pattern})" pointer-events="none"/>`);
    out.push('    </g>');
  }
  out.push('  </g>');
  if (map.landscape) {
    out.push(`  <metadata id="landscape-settings">${escape(JSON.stringify(map.landscape))}</metadata>`);
    out.push('  <g id="terrain-paint" data-layer="terrain-paint" inkscape:groupmode="layer" inkscape:label="Gemalter Boden" clip-path="url(#world-island-clip)">');
    for (const stamp of terrain) out.push(`    <g ${feature('terrain', stamp.id)} transform="translate(${number(stamp.position[0])} ${number(stamp.position[1])})"><title>${escape(stamp.name)} · ${escape(stamp.type)}</title><circle r="${number(stamp.radius)}" fill="url(#world-terrain-${escape(stamp.id)})" pointer-events="all"/></g>`);
    out.push('  </g>');
    if (paintedBiomes.length) {
      out.push('  <g id="biome-paint" data-layer="biome-paint" inkscape:groupmode="layer" inkscape:label="Gemalte Biome" clip-path="url(#world-island-clip)" pointer-events="none">');
      for (const stamp of paintedBiomes) {
        const color = biomePreset(stamp.presetId)?.terrain?.color ?? '#78a866';
        out.push(`    <g transform="translate(${number(stamp.position[0])} ${number(stamp.position[1])})"><circle r="${number(stamp.radius)}" fill="url(#world-biome-${escape(stamp.id)})" stroke="${escape(color)}" stroke-opacity=".45" stroke-width=".8" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/></g>`);
      }
      out.push('  </g>');
    }
  }
  out.push('  <g id="rivers" data-layer="rivers" inkscape:groupmode="layer" inkscape:label="Flüsse" clip-path="url(#world-island-clip)" fill="none" stroke-linecap="round" stroke-linejoin="round">');
  for (const river of map.rivers) out.push(`    <g ${feature('river', river.id)}><title>${escape(river.name)}</title><polyline points="${points(river.points)}" stroke="#315f6a" stroke-width="${number(river.width + 4)}"/><polyline points="${points(river.points)}" stroke="#72b0ba" stroke-width="${number(river.width)}"/><polyline points="${points(river.points)}" stroke="#9dcbd0" stroke-width="1.5" opacity=".6" pointer-events="none"/></g>`);
  out.push('  </g>', '  <g id="paths" data-layer="paths" inkscape:groupmode="layer" inkscape:label="Wege und Brücken" clip-path="url(#world-island-clip)" fill="none" stroke-linecap="round" stroke-linejoin="round">');
  for (const path of [...map.paths].sort((a, b) => Number(a.kind === 'bridge') - Number(b.kind === 'bridge'))) {
    const bridge = path.kind === 'bridge', trail = path.kind === 'trail';
    out.push(`    <g ${feature('path', path.id)}><title>${escape(path.name)}</title>`);
    if (bridge) out.push(`      <polyline points="${points(path.points)}" stroke="#594e3b" stroke-width="${number(path.width + 5)}"/><polyline points="${points(path.points)}" stroke="#d4bc8d" stroke-width="${number(path.width)}" stroke-dasharray="3 3"/>`);
    else out.push(`      <polyline points="${points(path.points)}" stroke="#6b7351" stroke-opacity=".38" stroke-width="${number(path.width + 3)}"${trail ? ' stroke-dasharray="4 8"' : ''}/><polyline points="${points(path.points)}" stroke="${trail ? '#c7c79e' : '#d8cda3'}" stroke-width="${number(path.width)}"${trail ? ' stroke-dasharray="4 8"' : ''}/>`);
    out.push('    </g>');
  }
  out.push('  </g>');
  if (showGrid) out.push(`  <g id="grid" pointer-events="none"><rect x="${minX}" y="${minZ}" width="${width}" height="${height}" fill="url(#world-grid)"/></g>`);
  out.push('  <g id="spawn-areas" data-layer="spawn-areas" inkscape:groupmode="layer" inkscape:label="Startbereiche">');
  if (showSpawns) for (const spawn of map.spawnAreas) out.push(`    <g ${feature('spawn', spawn.id)}><title>${escape(spawn.name)} · ${spawn.capacity} Startplätze</title><circle cx="${number(spawn.position[0])}" cy="${number(spawn.position[1])}" r="${number(spawn.radius)}" fill="#f5edc4" fill-opacity=".08" stroke="#f3e4b0" stroke-width="1.6" stroke-dasharray="5 5"/><text x="${number(spawn.position[0])}" y="${number(spawn.position[1] + 5)}" fill="#f9edc8" font-size="13" font-weight="600" text-anchor="middle" pointer-events="none">${spawn.capacity}</text></g>`);
  out.push('  </g>', '  <g id="places" data-layer="places" inkscape:groupmode="layer" inkscape:label="Wichtige Orte">');
  if (showPlaces) for (const place of map.places) out.push(`    <g ${feature('place', place.id)} transform="translate(${number(place.position[0])} ${number(place.position[1])})"><title>${escape(place.name)}</title>${placeIcon(place)}</g>`);
  // Real placements sit above the broad start discs and schematic village
  // markers, so the latter cannot intercept selecting a house or a tree.
  out.push('  </g>');
  if (map.landscape) {
    out.push('  <g id="wind-zones" data-layer="wind-zones" inkscape:groupmode="layer" inkscape:label="Lokale Windzonen">');
    for (const zone of windZones) {
      const length = Math.min(12, zone.radius * .55), dx = Math.sin(zone.direction) * length, dz = -Math.cos(zone.direction) * length;
      out.push(`    <g ${feature('wind', zone.id)} transform="translate(${number(zone.position[0])} ${number(zone.position[1])})"><title>${escape(zone.name)} · Wind ${number(zone.strength * 100)} %</title><circle r="${number(zone.radius)}" fill="#92cfdf" fill-opacity=".035" stroke="#8ad0df" stroke-width="1.5" stroke-dasharray="5 4" vector-effect="non-scaling-stroke" pointer-events="stroke"/><circle r="${number(zone.radius * (1 - zone.falloff))}" fill="none" stroke="#8ad0df" stroke-opacity=".25" stroke-width=".8" pointer-events="none"/><path d="M0,0L${number(dx)},${number(dz)}M${number(dx - Math.sin(zone.direction + .55) * 3)},${number(dz + Math.cos(zone.direction + .55) * 3)}L${number(dx)},${number(dz)}L${number(dx - Math.sin(zone.direction - .55) * 3)},${number(dz + Math.cos(zone.direction - .55) * 3)}" fill="none" stroke="#8ad0df" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="stroke"/></g>`);
    }
    out.push('  </g>');
  }
  out.push('  <g id="world-objects" data-layer="world-objects" inkscape:groupmode="layer" inkscape:label="Weltobjekte" clip-path="url(#world-island-clip)">');
  if (showObjects) {
    const objects = (map.objects ?? []).filter(item => !objectKinds || objectKinds.has(item.kind));
    objects.sort((a, b) => (objectLayerOrder[a.kind] ?? 0) - (objectLayerOrder[b.kind] ?? 0));
    for (const item of objects) out.push(objectSvg(item));
  }
  out.push('  </g>');
  // Preserve authored routes and openings in the editable SVG, while keeping
  // files without barrier routes byte-for-byte compatible with older exports.
  if (map.barriers?.length) {
    out.push(`  <metadata id="barrier-settings">${escape(JSON.stringify(map.barriers))}</metadata>`);
    out.push('  <g id="barriers" data-layer="barriers" inkscape:groupmode="layer" inkscape:label="Mauern und Zäune" clip-path="url(#world-island-clip)">');
    if (showObjects) for (const barrier of map.barriers) {
      if (!objectKinds || objectKinds.has(barrier.kind)) out.push(barrierSvg(barrier));
    }
    out.push('  </g>');
  }
  out.push('  <g id="zone" data-layer="zone" inkscape:groupmode="layer" inkscape:label="Nebelzone" pointer-events="none">');
  if (showZone) out.push(`    <path d="M${minX},${minZ}H${maxX}V${maxZ}H${minX}Z M${number(map.zone.center[0] - zoneRadius)},${number(map.zone.center[1])} a${number(zoneRadius)},${number(zoneRadius)} 0 1,0 ${number(zoneRadius * 2)},0 a${number(zoneRadius)},${number(zoneRadius)} 0 1,0 ${number(-zoneRadius * 2)},0Z" fill="#4e346e" fill-rule="evenodd" opacity=".52"/><circle cx="${number(map.zone.center[0])}" cy="${number(map.zone.center[1])}" r="${number(zoneRadius)}" fill="none" stroke="#d4a3ed" stroke-width="3" stroke-dasharray="12 7"/>`);
  out.push('  </g>', '  <g id="labels" data-layer="labels" inkscape:groupmode="layer" inkscape:label="Beschriftungen" pointer-events="none" font-family="Georgia, serif" text-anchor="middle">');
  if (showLabels) {
    for (const region of map.regions) out.push(`    <text x="${number(region.label[0])}" y="${number(region.label[1])}" font-size="${region.name.length > 12 ? '23' : '27'}" font-weight="700" fill="#163b36" stroke="#dce2bf" stroke-opacity=".65" stroke-width="3" paint-order="stroke" letter-spacing="1.4">${escape(region.name)}</text>`);
    for (const place of map.places) out.push(`    <text x="${number(place.position[0])}" y="${number(place.position[1] + 30)}" font-size="14" fill="#1d3935" stroke="#e5e2bb" stroke-width="3.5" paint-order="stroke">${escape(place.name)}</text>`);
  }
  out.push('  </g>', '  <g id="frame" data-layer="frame" inkscape:groupmode="layer" inkscape:label="Rahmen und Maßstab" pointer-events="none" font-family="system-ui, sans-serif" fill="#dfd8ba">');
  if (!editor) {
    out.push(`    <rect x="${minX + 14}" y="${minZ + 14}" width="${width - 28}" height="${height - 28}" rx="8" fill="none" stroke="#c9c09b" stroke-opacity=".4" stroke-width="1.5"/>`);
    out.push(`    <text x="${minX + 36}" y="${minZ + 48}" font-family="Georgia, serif" font-size="26" font-weight="700">NEBELJAGD</text>`);
    out.push(`    <text x="${minX + 36}" y="${minZ + 72}" font-size="12" letter-spacing="1.5">SCHEMATISCH · EDITIERBAR</text>`);
    out.push(`    <g transform="translate(${maxX - 60} ${minZ + 75})"><path d="M0,-30 11,9 0,1 -11,9Z" fill="#d9dbbd"/><path d="M0,-30V20" stroke="#6f9ba0" stroke-width="2"/><text y="-41" text-anchor="middle" font-size="15">N</text></g>`);
    out.push(`    <g transform="translate(${minX + 40} ${maxZ - 64})"><path d="M0,-6V0H200V-6 M100,0V-6" stroke="#dfd8ba" stroke-width="2" fill="none"/><text y="18" font-size="12">0</text><text x="100" y="18" font-size="12" text-anchor="middle">100</text><text x="200" y="18" font-size="12" text-anchor="end">200 m</text></g>`);
    out.push(`    <text x="${maxX - 35}" y="${maxZ - 60}" font-size="13" text-anchor="end">${(stats.landAreaM2 / 1e6).toFixed(2).replace('.', ',')} km² Land · Planungsmaßstab</text><text x="${maxX - 35}" y="${maxZ - 39}" font-size="12" text-anchor="end">${map.gameplay.targetPlayers} Spieler · ${stats.spawnAreaCount} Startbereiche · ${Math.round(stats.matchDurationSeconds / 60)} min Nebelplan</text>`);
  }
  out.push('  </g>', '</svg>');
  return out.join('\n');
}
