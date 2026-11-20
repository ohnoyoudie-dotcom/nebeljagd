import * as THREE from 'three';
import { createAerialLandscape } from './aerial-landscape.js';
import { arrivalMapView } from './map-arrival.js';

/** One static north-up photograph of the loaded map, before actors or loot exist.
 * Readback is done once at load; selection/pan/zoom use only the cached canvas. */
export function captureArrivalLandscape(renderer, world) {
  const scenery=createAerialLandscape(world,{attach:false,sceneryOnly:true});
  const size=Math.min(2048,renderer.capabilities.maxTextureSize);
  const target=new THREE.WebGLRenderTarget(size,size,{depthBuffer:true});
  target.texture.colorSpace=THREE.SRGBColorSpace;
  const previous=renderer.getRenderTarget(),previousAutoClear=renderer.autoClear;
  try {
    const scene=new THREE.Scene();scene.background=new THREE.Color(world.map.landscape?.worldEdge==='floating'?'#344e5d':'#1d424e');
    scene.add(scenery.group);scenery.update(200);
    const sky=new THREE.HemisphereLight('#e4efff','#8c8269',2.1);
    const sun=new THREE.DirectionalLight('#fff0d5',2.3);sun.position.set(-200,500,-160);
    sky.layers.enable(1);sun.layers.enable(1);scene.add(sky,sun);
    const view=arrivalMapView(world.map.bounds,null),half=view.span/2;
    const camera=new THREE.OrthographicCamera(-half,half,half,-half,.1,3000);
    camera.layers.set(1);camera.up.set(0,0,-1);camera.position.set(view.x,1500,view.z);camera.lookAt(view.x,0,view.z);
    renderer.autoClear=true;renderer.setRenderTarget(target);renderer.render(scene,camera);
    const pixels=new Uint8Array(size*size*4);renderer.readRenderTargetPixels(target,0,0,size,size,pixels);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d'),image=ctx.createImageData(size,size),stride=size*4;
    for(let y=0;y<size;y++)image.data.set(pixels.subarray((size-1-y)*stride,(size-y)*stride),y*stride);
    ctx.putImageData(image,0,0);
    return {canvas,metadata:{mode:'rendered-world',resolution:size,houses:world.map.objects.filter(o=>o.kind==='house').length,
      paths:world.map.paths.length,loot:false,...view}};
  } finally {
    renderer.setRenderTarget(previous);renderer.autoClear=previousAutoClear;
    scenery.dispose();target.dispose();
  }
}
