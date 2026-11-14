import * as THREE from 'three';

export const BLINK_VISUAL_DURATION = .62;
const smooth = THREE.MathUtils.smoothstep;
const vertex = `varying vec2 vUv;varying vec3 vNormal,vView;
void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);vView=-p.xyz;gl_Position=projectionMatrix*p;}`;
function material(fragment, uniforms = {}) {
  return new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    blending: THREE.AdditiveBlending });
}

/** Character-sized light impulses. Only the posed skin is sampled; the live
 * avatar's materials, skeleton, visibility and gameplay position stay intact. */
export function createBlinkVisuals(scene, isVisible, { avatarRoot = null, avatarMeshes = [] } = {}) {
  const root = new THREE.Group(); root.name = 'Teleport · Lichtimpuls'; root.visible = false; scene.add(root);
  let age = BLINK_VISUAL_DURATION, disposed = false;
  const snapshot = avatarMeshes.map(source => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(source.geometry.attributes.position.count * 3), 3));
    if (source.geometry.index) geometry.setIndex(source.geometry.index.clone());
    return { source, geometry };
  });
  const inverse = new THREE.Matrix4(), transform = new THREE.Matrix4(), point = new THREE.Vector3(), origin = new THREE.Vector3();
  const shardGeometry = new THREE.OctahedronGeometry(1, 0), dummy = new THREE.Object3D();
  const pulses = [0, 1].map(index => {
    const group = new THREE.Group(); group.name = index ? 'Ankunft' : 'Start'; root.add(group);
    const bodyMaterial = material(`varying vec3 vNormal,vView;uniform float uOpacity;
      void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),1.6);
        gl_FragColor=vec4(mix(vec3(.24,.88,.92),vec3(.82,1.,1.),rim),uOpacity*(.58+.42*rim));
        #include <colorspace_fragment>
      }`, { uOpacity: { value: 0 } });
    bodyMaterial.polygonOffset = true; bodyMaterial.polygonOffsetFactor = -2; bodyMaterial.polygonOffsetUnits = -2;
    const body = new THREE.Group(); group.add(body);
    const arrivalMaterial = index ? new THREE.MeshBasicMaterial({ color: '#b2ffff', transparent: true,
      opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }) : null;
    snapshot.forEach(({ geometry, source }) => {
      const mesh = index ? (source.isSkinnedMesh
        ? new THREE.SkinnedMesh(source.geometry, arrivalMaterial)
        : new THREE.Mesh(source.geometry, arrivalMaterial)) : new THREE.Mesh(geometry, bodyMaterial);
      if (index) {
        if (source.isSkinnedMesh) { mesh.bindMode = source.bindMode; mesh.bind(source.skeleton, source.bindMatrix); }
        mesh.morphTargetInfluences = source.morphTargetInfluences; mesh.morphTargetDictionary = source.morphTargetDictionary;
        mesh.onBeforeRender = () => {
          mesh.matrixWorld.copy(source.matrixWorld);
          if (source.isSkinnedMesh) mesh.bindMatrixInverse.copy(source.bindMatrixInverse);
        };
        // The live pose prevents a frozen duplicate flickering through the skin.
        mesh.renderOrder = 9;
      }
      mesh.frustumCulled = false; body.add(mesh);
    });
    // A soft, compact flash, not a standing portal or a screen-filling flare.
    const flashMaterial = material(`varying vec2 vUv;uniform float uOpacity;
      void main(){vec2 p=vUv*2.-1.;float r=length(p);
        float glow=exp(-r*r*6.)*(1.-smoothstep(.55,1.,r));
        gl_FragColor=vec4(.38,.95,1.,glow*uOpacity);
        #include <colorspace_fragment>
      }`, { uOpacity: { value: 0 } });
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), flashMaterial); flash.position.y = .9; group.add(flash);
    flash.onBeforeRender = (_renderer, _scene, camera) => {
      // Account for the game's scaled world parent when facing the camera.
      group.getWorldQuaternion(flash.quaternion).invert().multiply(camera.quaternion); flash.updateMatrixWorld(true);
    };
    const ringMaterial = material(`varying vec2 vUv;uniform float uAge,uOpacity;
      void main(){vec2 p=vUv*2.-1.;float r=length(p);float radius=.13+.72*(1.-pow(1.-clamp(uAge/.48,0.,1.),2.));
        float edge=exp(-pow((r-radius)/.014,2.));float halo=exp(-pow((r-radius)/.052,2.))*.22;
        float ground=exp(-r*r*12.)*.12*(1.-smoothstep(.04,.25,uAge));
        gl_FragColor=vec4(.28,.94,1.,(edge+halo+ground)*uOpacity);
        #include <colorspace_fragment>
      }`, { uAge: { value: 0 }, uOpacity: { value: 0 } });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), ringMaterial); ring.rotation.x = -Math.PI / 2; ring.position.y = .065; group.add(ring);
    const shardMaterial = new THREE.MeshBasicMaterial({ color: '#b2ffff', transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const shards = new THREE.InstancedMesh(shardGeometry, shardMaterial, 11); shards.frustumCulled = false;
    shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(shards);
    // Repeatable, uneven placement avoids both confetti and a mechanical wheel.
    const seeds = Array.from({ length: 11 }, (_, i) => ({
      angle: i * 2.399963 + index * .53, distance: .65 + ((i * 7) % 11) / 11 * .7,
      height: .2 + ((i * 5) % 11) / 11 * 1.65, length: .09 + ((i * 3) % 7) / 7 * .16,
    }));
    return { group, body, bodyMaterial, arrivalMaterial, flash, flashMaterial, ringMaterial, shards, shardMaterial, seeds };
  });
  function capturePose() {
    if (!avatarRoot || !snapshot.length) return;
    scene.updateWorldMatrix(true, false); avatarRoot.updateMatrixWorld(true);
    inverse.copy(scene.matrixWorld).invert();
    avatarRoot.getWorldPosition(origin).applyMatrix4(inverse);
    for (const { source, geometry } of snapshot) {
      source.skeleton?.update(); transform.multiplyMatrices(inverse, source.matrixWorld);
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        source.getVertexPosition(i, point).applyMatrix4(transform).sub(origin); positions.setXYZ(i, point.x, point.y, point.z);
      }
      positions.needsUpdate = true; geometry.computeVertexNormals();
    }
  }
  function present() {
    root.visible = age < BLINK_VISUAL_DURATION;
    for (const [index, p] of pulses.entries()) {
      const t = Math.max(0, age - index * .025);
      p.group.visible = root.visible && (!isVisible || isVisible(p.group.position));
      const flash = (index ? smooth(t, 0, .045) : .65 + .35 * smooth(t, 0, .025)) * (1 - smooth(t, .065, .24));
      p.bodyMaterial.uniforms.uOpacity.value = flash * .95;
      if (p.arrivalMaterial) p.arrivalMaterial.opacity = flash * .8;
      // The arrival silhouette stays attached if the player immediately moves.
      if (index && avatarRoot) {
        scene.updateWorldMatrix(true, false); inverse.copy(scene.matrixWorld).invert();
        avatarRoot.getWorldPosition(point).applyMatrix4(inverse); p.body.position.copy(point).sub(p.group.position);
      }
      p.flashMaterial.uniforms.uOpacity.value = flash * .62;
      p.flash.scale.setScalar(.72 + smooth(t, 0, .18) * .3);
      p.ringMaterial.uniforms.uAge.value = t;
      p.ringMaterial.uniforms.uOpacity.value = (1 - smooth(t, .12, .5)) * .86;
      p.shardMaterial.opacity = smooth(t, 0, .025) * (1 - smooth(t, .17, .55));
      const travel = 1 - Math.pow(1 - Math.min(t / .5, 1), 3);
      p.seeds.forEach((s, i) => {
        const distance = .2 + s.distance * travel;
        dummy.position.set(Math.cos(s.angle) * distance, s.height + t * .3, Math.sin(s.angle) * distance);
        dummy.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, point.set(Math.cos(s.angle), .35, Math.sin(s.angle)).normalize());
        const fade = 1 - smooth(t, .2, .57);
        dummy.scale.set(.026 * fade, s.length * (.65 + travel * .6) * fade, .026 * fade);
        dummy.updateMatrix(); p.shards.setMatrixAt(i, dummy.matrix);
      });
      p.shards.instanceMatrix.needsUpdate = true;
    }
  }
  return {
    trigger(from, to) {
      if (disposed) return;
      capturePose(); age = 0; pulses[0].group.position.copy(from); pulses[1].group.position.copy(to); present();
    },
    update(dt) { if (disposed || !(dt > 0) || age >= BLINK_VISUAL_DURATION) return; age = Math.min(BLINK_VISUAL_DURATION, age + dt); present(); },
    reset() { age = BLINK_VISUAL_DURATION; root.visible = false; },
    get telemetry() { return { active: root.visible, age, style: 'light-impulse', silhouetteMeshes: snapshot.length,
      pulses: pulses.map(p => ({ visible: root.visible && p.group.visible, flash: p.bodyMaterial.uniforms.uOpacity.value })) }; },
    dispose() {
      if (disposed) return; disposed = true; root.visible = false; root.removeFromParent();
      const geometries = new Set(), materials = new Set();
      const borrowed = new Set(avatarMeshes.map(mesh => mesh.geometry));
      root.traverse(part => { if (part.geometry && !borrowed.has(part.geometry)) geometries.add(part.geometry); if (part.material) materials.add(part.material); });
      pulses.forEach(p => { p.shards.dispose(); materials.add(p.bodyMaterial); if (p.arrivalMaterial) materials.add(p.arrivalMaterial); });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    },
  };
}
