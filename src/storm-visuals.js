import * as THREE from 'three';

const noise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
float cloud(vec2 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.07)*.15;}`;

/** A compact translucent cloud, terrain footprint and fixed ribbon buffer.
 * No lights, textures, full-screen passes or allocations during animation. */
export function createStormVisuals(scene, rules, ground, isVisible) {
  const group = new THREE.Group(); group.name = 'Gewitter · kompaktes Auge'; group.visible = false; scene.add(group);
  const footprintGeometry = new THREE.CircleGeometry(rules.radius, 96); footprintGeometry.rotateX(-Math.PI / 2);
  const footprintMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float uOpacity;
      void main(){float r=length(vUv*2.-1.);float rim=1.-smoothstep(.007,.018,abs(r-.98));
      gl_FragColor=vec4(mix(vec3(.10,.16,.22),vec3(.52,.69,.77),rim),uOpacity*(.035*(1.-r*r)+rim*.24));
      #include <colorspace_fragment>
      }`,
  });
  const footprint = new THREE.Mesh(footprintGeometry, footprintMaterial); footprint.name = 'Gewitter · dezente Wirkungsfläche'; group.add(footprint);
  const cloudGeometry = new THREE.CircleGeometry(1, 64); cloudGeometry.rotateX(-Math.PI / 2);
  const cp = cloudGeometry.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setY(i, .25 * (1 - Math.hypot(cp.getX(i), cp.getZ(i))));
  const cloudMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    toneMapped: false, forceSinglePass: true,
    uniforms: { uAge: { value: 0 }, uOpacity: { value: 0 }, uFlash: { value: 0 },
      uCutouts: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) }, uCutoutCount: { value: 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float uAge,uOpacity,uFlash;
      uniform vec3 uCutouts[8];uniform int uCutoutCount;${noise}
      void main(){vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);
      float turn=a+r*3.4-uAge*.28;vec2 q=vec2(cos(turn),sin(turn))*r;
      float billow=cloud(q*5.+vec2(uAge*.045,0.));
      float feather=1.-smoothstep(.48+billow*.28,.88+billow*.12,r);
      float fold=cloud(q*9.+vec2(.7,-.3));
      vec3 shade=mix(vec3(.055,.075,.105),vec3(.24,.29,.34),smoothstep(.2,.8,billow));
      shade+=vec3(.035,.045,.06)*fold;
      float eye=exp(-r*r*65.);float vein=pow(max(0.,1.-abs(fold-.52)*18.),3.);
      shade+=vec3(.13,.32,.49)*eye*(.55+vein)+vec3(.10,.16,.21)*uFlash*billow;
      float alpha=feather*(.28+.48*billow)*uOpacity;
      for(int i=0;i<8;i++){if(i>=uCutoutCount)break;
        float clear=smoothstep(uCutouts[i].z*.45,uCutouts[i].z,distance(gl_FragCoord.xy,uCutouts[i].xy));
        alpha*=mix(.10,1.,clear);}
      gl_FragColor=vec4(shade,alpha);
      #include <colorspace_fragment>
      }`,
  });
  const eye = new THREE.Mesh(cloudGeometry, cloudMaterial); eye.name = 'Gewitterauge · transparente Wolkenfalten';
  eye.scale.set(1.75, 1, 1.55); eye.position.y = 3.4; group.add(eye);
  // Screen-space feathering reveals bodies underneath the compact cloud.
  // Only already-visible actors are supplied; this cannot expose hidden foes.
  const protectedPoints = [], screenSize = new THREE.Vector2(), head = new THREE.Vector3(), feet = new THREE.Vector3();
  eye.onBeforeRender = (renderer, _scene, camera) => {
    renderer.getDrawingBufferSize(screenSize);
    for (let i = 0; i < protectedPoints.length; i++) {
      const p = protectedPoints[i];
      feet.set(p.x-group.position.x, (p.y ?? ground(p))-group.position.y, p.z-group.position.z);
      head.copy(feet); head.y += 2.35;
      group.localToWorld(feet).project(camera); group.localToWorld(head).project(camera);
      const x = (head.x+feet.x)*.25+.5, y = (head.y+feet.y)*.25+.5;
      const radius = Math.max(8, Math.hypot((head.x-feet.x)*screenSize.x, (head.y-feet.y)*screenSize.y)*.36);
      cloudMaterial.uniforms.uCutouts.value[i].set(x*screenSize.x, y*screenSize.y, radius);
    }
    cloudMaterial.uniforms.uCutoutCount.value = protectedPoints.length;
  };

  const capacity = 24, segments = 14, vertices = capacity * segments * 6;
  const positions = new Float32Array(vertices * 3), colors = new Float32Array(vertices * 3);
  const boltGeometry = new THREE.BufferGeometry();
  boltGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  boltGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const boltMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false, blending: THREE.AdditiveBlending });
  const bolts = new THREE.Mesh(boltGeometry, boltMaterial); bolts.name = 'Gewitter · verzweigte Einschläge'; bolts.frustumCulled = false; group.add(bolts);
  const slots = Array.from({ length: capacity }, () => ({ life: 0 })); let cursor = 0, flash = 0;
  const sparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.085), new THREE.MeshBasicMaterial({ color: '#d1efff', toneMapped: false }), capacity);
  sparks.frustumCulled = false; group.add(sparks); const transform = new THREE.Object3D();
  function segment(slot, index, ax, ay, az, bx, by, bz, width) {
    // Ribbon width lies across the bolt's horizontal direction.
    const offset = (slot * segments + index) * 18;
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz) || 1;
    const wx = Math.abs(dx) + Math.abs(dz) < .01 ? width : dz / length * width;
    const wz = Math.abs(dx) + Math.abs(dz) < .01 ? 0 : -dx / length * width;
    positions.set([ax-wx,ay,az-wz, ax+wx,ay,az+wz, bx+wx,by,bz+wz,
      ax-wx,ay,az-wz, bx+wx,by,bz+wz, bx-wx,by,bz-wz], offset);
  }
  function strike(point, seed, lag = 0) {
    if (lag >= .24 || isVisible && !isVisible(point)) return;
    const slot = cursor++ % capacity, entry = slots[slot]; entry.life = .24 - lag;
    entry.x = point.x - group.position.x; entry.y = point.y - group.position.y; entry.z = point.z - group.position.z;
    let ax = 0, ay = 3.4, az = 0;
    for (let i = 0; i < 8; i++) {
      const t = (i + 1) / 8, bend = Math.sin(t * Math.PI) * .22;
      const bx = entry.x * t + Math.sin(seed * 7 + i * 13) * bend;
      const by = 3.4 + (entry.y - 3.4) * t;
      const bz = entry.z * t + Math.cos(seed * 9 + i * 7) * bend;
      segment(slot, i, ax, ay, az, bx, by, bz, .026);
      ax = bx; ay = by; az = bz;
    }
    for (let i = 0; i < 6; i++) {
      const t = .3 + (i % 3) * .12, side = i < 3 ? 1 : -1;
      segment(slot, 8+i, entry.x*t+side*(i%3)*.12, 3.4+(entry.y-3.4)*t, entry.z*t,
        entry.x*(t+.12)+side*(i%3+1)*.12, 3.4+(entry.y-3.4)*(t+.12), entry.z*(t+.12)+side*.13, .011);
    }
    boltGeometry.attributes.position.needsUpdate = true; flash = 1;
    paint();
  }
  function paint() {
    for (let i = 0; i < capacity; i++) {
      const s = slots[i], intensity = s.life > 0 ? Math.min(1, s.life / .12) : 0;
      for (let v = i * segments * 18; v < (i + 1) * segments * 18; v += 3) {
        colors[v] = .65 * intensity; colors[v+1] = .85 * intensity; colors[v+2] = intensity;
      }
      transform.position.set(s.x ?? 0, s.y ?? 0, s.z ?? 0); transform.scale.setScalar(intensity * (1 + (1-intensity)*2));
      transform.updateMatrix(); sparks.setMatrixAt(i, transform.matrix);
    }
    boltGeometry.attributes.color.needsUpdate = true; sparks.instanceMatrix.needsUpdate = true;
  }
  function hide() { group.visible = false; slots.forEach(s => { s.life = 0; }); flash = 0; paint(); }
  return {
    protect(points) { protectedPoints.length = 0; for (const p of points) { if (protectedPoints.length === 8) break; protectedPoints.push(p); } },
    start(center) {
      hide(); group.position.copy(center);
      const a = footprintGeometry.attributes.position;
      for (let i = 0; i < a.count; i++) a.setY(i, ground({ x: center.x+a.getX(i), z: center.z+a.getZ(i) }) - center.y + .07);
      a.needsUpdate = true; footprintGeometry.computeBoundingSphere();
    },
    strike, hide,
    update(dt) {
      let changed = false;
      for (const s of slots) if (s.life > 0) { s.life = Math.max(0, s.life - dt); changed = true; }
      flash = Math.max(0, flash - dt * 7); if (changed) paint();
    },
    show(center, age) {
      group.visible = !isVisible || isVisible(center);
      const opacity = Math.min(1, age / rules.warning) * THREE.MathUtils.clamp(1 - (age - rules.warning - rules.duration) / rules.fade, 0, 1);
      cloudMaterial.uniforms.uAge.value = age; cloudMaterial.uniforms.uOpacity.value = opacity;
      cloudMaterial.uniforms.uFlash.value = flash; footprintMaterial.uniforms.uOpacity.value = opacity;
    },
    get telemetry() { return { style: 'compact-storm-eye', visible: group.visible, cloudRadius: 1.75,
      capacity, bolts: slots.filter(s => s.life > 0).length, draws: group.visible ? 4 : 0 }; },
    dispose() { scene.remove(group); for (const mesh of [footprint, eye, bolts, sparks]) {
      mesh.geometry.dispose(); mesh.material.dispose(); } sparks.dispose(); },
  };
}
