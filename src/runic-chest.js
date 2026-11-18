/** Deterministic per-round seal state. Charge is integrated analytically so
 * frame rate does not change the opening time (~5.9 seconds uninterrupted). */
export const chestOpening = definition => definition.chestOpening ?? (definition.variant === 'kit-tripo-rare-chest' ? 'rune' : 'instant');
export const RUNIC_CHEST = Object.freeze({radius:2.8,grace:1.25,decay:.09});
const integral=t=>.08*t+.02*Math.min(t,3)**2+.12*Math.max(0,t-3);
export function createRunicCharge() {return {progress:0,streak:0,away:0,active:false,phase:0};}
export function stepRunicCharge(state,dt,inside) {
  if(!Number.isFinite(dt)||dt<=0||state.progress>=1)return false;
  state.active=inside;
  if(inside) {
    const before=state.streak;state.streak+=dt;state.away=0;
    state.progress=Math.min(1,state.progress+integral(state.streak)-integral(before));
  } else {
    const before=state.away;state.away+=dt;state.streak=0;
    state.progress=Math.max(0,state.progress-RUNIC_CHEST.decay*(Math.max(0,state.away-RUNIC_CHEST.grace)-Math.max(0,before-RUNIC_CHEST.grace)));
  }
  state.phase+=dt*(inside?.5+Math.min(3,state.streak)*1.1:.25);
  return state.progress>=1;
}
export function rollRunicRarity(random=Math.random) {
  const value=Math.min(1,Math.max(0,random()));return value<.65?'rare':value<.95?'epic':'legendary';
}
