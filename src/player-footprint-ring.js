import * as THREE from 'three';
export function createPlayerFootprintRing(root,{heightAt}){
 let lastDirection=0;const group=new THREE.Group();group.name='Spieler · Bodenring mit Blickrichtung';root.add(group);
 const material=new THREE.MeshBasicMaterial({color:'#dbd4a8',transparent:true,opacity:.62,depthWrite:false,side:THREE.DoubleSide});
 const shade=new THREE.MeshBasicMaterial({color:'#183b37',transparent:true,opacity:.35,depthWrite:false,side:THREE.DoubleSide});
 for(const [inner,outer,m]of [[.545,.63,shade],[.575,.603,material]]){const mesh=new THREE.Mesh(new THREE.RingGeometry(inner,outer,64).rotateX(-Math.PI/2),m);mesh.renderOrder=2;group.add(mesh);}
 const arrowGeo=new THREE.BufferGeometry();arrowGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.10,0,.64,0,0,.86,.10,0,.64,0,0,.70],3));arrowGeo.setIndex([0,1,3,1,2,3]);arrowGeo.computeVertexNormals();
 const arrow=new THREE.Mesh(arrowGeo,material);arrow.renderOrder=3;group.add(arrow);
 group.traverse(n=>{n.userData.ignoreVision=true;if(n.material)n.material.userData.ignoreVision=true;});
 return {update(player,direction,visible=true){lastDirection=direction;group.visible=visible;if(!visible)return;group.position.set(player.x,heightAt(player.x,player.z)+.12,player.z);group.rotation.y=direction;
   // Tilt the whole small marker to the local ground plane, retaining its yaw.
   const dx=(heightAt(player.x+.3,player.z)-heightAt(player.x-.3,player.z))/.6,dz=(heightAt(player.x,player.z+.3)-heightAt(player.x,player.z-.3))/.6;
   group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-dx,1,-dz).normalize());group.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),direction));
  },inspect:()=>({visible:group.visible,radius:.603,bodyRadius:.42,direction:lastDirection}),dispose(){group.traverse(n=>n.geometry?.dispose());material.dispose();shade.dispose();group.removeFromParent();}};
}
