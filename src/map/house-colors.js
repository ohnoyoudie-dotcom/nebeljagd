/** Quiet mineral colours for the existing stone and plaster surfaces. These
 * affect only the house's owned material/vertex colours, never shared textures. */
export const HOUSE_STONE_COLORS = Object.freeze([
  {id:'natural',label:'Naturstein',color:'#ffffff'},
  {id:'sand',label:'Sandstein',color:'#ead1ac'},
  {id:'slate',label:'Schiefergrau',color:'#a5b1bf'},
  {id:'moss',label:'Moosgrau',color:'#adba9f'},
].map(Object.freeze));
export const HOUSE_WALL_COLORS = Object.freeze([
  {id:'style',label:'Fassadenstil',color:null},
  {id:'chalk',label:'Kalkweiß',color:'#e3decd'},
  {id:'sand',label:'Sandbeige',color:'#cdb388'},
  {id:'sage',label:'Salbei',color:'#a4b09a'},
  {id:'clay',label:'Lehm',color:'#c09a86'},
].map(Object.freeze));
export function getHouseMaterialColors(object = {}) {
  return {
    stone: HOUSE_STONE_COLORS.find(option => option.id === object.houseStoneColor) ?? HOUSE_STONE_COLORS[0],
    wall: HOUSE_WALL_COLORS.find(option => option.id === object.houseWallColor) ?? HOUSE_WALL_COLORS[0],
  };
}
