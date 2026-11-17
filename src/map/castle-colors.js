/** Restrained mineral palettes shared by the castle renderer and its editor
 * plan. Saved house-builder fields retain their IDs; all castle surfaces stay
 * stone even when a legacy field originally described timber or plaster. */
export const CASTLE_STYLE_LABELS = Object.freeze({
  natural:'Verwitterter Stein', lime:'Kühler Kalkstein', ochre:'Warmer Bruchstein', dark:'Dunkle Burgmauern',
});
export const CASTLE_FLOOR_LABELS = Object.freeze({
  natural:'Zum Stil', sand:'Dunkler Sandstein', slate:'Schieferplatten', moss:'Moosgrauer Stein',
});
export const CASTLE_WALL_LABELS = Object.freeze({
  style:'Zum Stil', chalk:'Kalkgrau', sand:'Grauer Sandstein', sage:'Moosgrau', clay:'Brauner Bruchstein',
});
const styles = Object.freeze({
  natural:{wall:'#777a72',floor:'#68757b',trim:'#909389'},
  lime:{wall:'#84877e',floor:'#758086',trim:'#9b9d92'},
  ochre:{wall:'#81796b',floor:'#746e62',trim:'#a09785'},
  dark:{wall:'#626963',floor:'#56636b',trim:'#7e867f'},
});
const floors = Object.freeze({sand:'#827a67',slate:'#5c6a75',moss:'#667368'});
const walls = Object.freeze({chalk:'#92928a',sand:'#8a806c',sage:'#74806f',clay:'#827167'});
const color = (palette,id,fallback) => Object.hasOwn(palette,id) ? palette[id] : fallback;
function blend(a,b,t) {
  const channels = value => [1,3,5].map(i=>parseInt(value.slice(i,i+2),16));
  const ca=channels(a),cb=channels(b);
  return '#'+ca.map((v,i)=>Math.round(v+(cb[i]-v)*t).toString(16).padStart(2,'0')).join('');
}
export function getCastleMaterialColors(object = {}) {
  const style = color(styles,object.houseStyle,styles.natural);
  const wall = color(walls,object.houseWallColor,style.wall);
  return {
    wall,
    floor:color(floors,object.houseStoneColor,style.floor),
    trim:Object.hasOwn(walls,object.houseWallColor)?blend(wall,'#b5b6a7',.25):style.trim,
    iron:'#343b3b',
  };
}
