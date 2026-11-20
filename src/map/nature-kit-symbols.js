import {getNatureDefinition} from './nature-kit-definitions.js';
export function natureMapSymbol(variant){const d=getNatureDefinition(variant);if(!d)return '';
 const w=d.footprint.halfWidth,h=d.footprint.halfDepth,color={forest:'#73835c',snow:'#c3d5d9',desert:'#c1a170'}[d.biome];
 let shape='';
 if(['boulders','ridge','rubble','pillar'].includes(d.form)){shape=`<ellipse rx="${w}" ry="${h}" fill="${color}" stroke="#39483d" stroke-width=".1"/><path d="M${-w*.7} 0 0 ${-h*.8} ${w*.65} ${h*.5} Z" fill="none" stroke="#eff1d0" stroke-opacity=".45" stroke-width=".1"/>`;}
 else if(['arch','ruin','walkway','fence','signpost','lantern'].includes(d.form)){shape=`<rect x="${-w}" y="${-h}" width="${w*2}" height="${h*2}" rx=".12" fill="${['walkway','fence','signpost'].includes(d.form)?'#9d8057':color}" stroke="#3f493e" stroke-width=".12"/>`;if(d.form==='arch')shape=`<rect x="${-w}" y="${-h}" width="1" height="${h*2}" fill="${color}"/><rect x="${w-1}" y="${-h}" width="1" height="${h*2}" fill="${color}"/><path d="M${-w+.5} 0 H${w-.5}" stroke="${color}" stroke-width=".3" stroke-dasharray=".2 .2"/>`;}
 else {for(let i=0;i<7;i++)shape+=`<ellipse rx="${w*.22}" ry="${h*.65}" cy="${-h*.3}" fill="${color}" stroke="#3e5736" stroke-width=".07" transform="rotate(${i*360/7})"/>`;}
 return `<g id="world-object-nature-${variant}">${shape}</g>`;
}
