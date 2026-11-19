import * as THREE from 'three';

/** Small, anchored materialization; no floor marker, aerial world or travel trail. */
export function createArrivalTeleport(parent, { reducedMotion = false } = {}) {
  const group = new THREE.Group(); group.name = 'Ankunft · Materialisierung'; parent.add(group);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'rgba(255,255,255,1)'); gradient.addColorStop(.25,'rgba(255,255,255,.55)'); gradient.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,64,64);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = (color) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({map:texture,color,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false})); group.add(s); return s; };
  const glow = sprite('#9ccfff'), core = sprite('#e8e3ff');
  const sparks = Array.from({length:reducedMotion?8:20},()=>sprite('#b7b4ff'));
  let previous = 'ground'; group.visible = false;
  return {
    update(position, arrival) {
      const appearing = arrival.stage === 'teleport';
      if (appearing && previous !== 'teleport') group.position.copy(position);
      group.visible = appearing || (!arrival.active && arrival.settled < 1);
      const age = appearing ? arrival.progress * .8 : .8 + arrival.settled * .7;
      const strength = age < .38 ? Math.sin(age/.38*Math.PI/2) : Math.max(0,1-(age-.38)/1.12)**2;
      glow.position.y = 1; glow.scale.set(3.2,4.5,1); glow.material.opacity = strength * .48;
      core.position.y = 1; core.scale.set(1.4,3,1); core.material.opacity = strength * .72;
      for (let i=0;i<sparks.length;i++) {
        const a=i*2.399, r=.25 + age*(reducedMotion?.35:1.25)*(1+i%3*.2);
        sparks[i].position.set(Math.cos(a)*r,.2+(i%5)*.28+age*.65,Math.sin(a)*r);
        sparks[i].scale.set(.06,.18,1); sparks[i].material.opacity=strength*.8;
      }
      previous = arrival.stage;
    },
    inspect: () => ({active:group.visible,position:group.position.toArray(),particles:sparks.length,opacity:glow.material.opacity}),
  };
}
