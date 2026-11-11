import * as THREE from 'three';

const TAU = Math.PI * 2;
const SHELL_COUNT = 24;
const VISUAL_RADIUS = 1.3;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

/** Analytically integrated angular acceleration: identical at any frame rate.
 * The surface pattern a*5+r*19+spin*5 moves inward at every fixed angle. */
export function gravityVortexMotion(age, rules, out = {}) {
  const elapsed = Math.max(0, age - rules.warning);
  const progress = clamp(elapsed / rules.pullDuration);
  const growth = smooth(progress);
  const burst = age >= rules.warning + rules.pullDuration
    ? clamp((age - rules.warning - rules.pullDuration) / rules.afterglow) : -1;
  out.progress = progress;
  out.spinSpeed = 1.1 + 9 * progress ** 2;
  out.spin = rules.pullDuration * (1.1 * progress + 3 * progress ** 3)
    + Math.max(0, elapsed - rules.pullDuration) * 10.1;
  out.sphereHeight = .13 + growth * 1.60;
  out.sphereRadius = .10 + growth * .65;
  out.burst = burst;
  out.fade = burst < 0 ? 1 : 1 - smooth(burst);
  return out;
}

/** Reference-painted ground and sphere maps are borrowed from the app loader.
 * One sample per surface replaces procedural stripes; no lights or postprocess. */
export function createGravityVortex(parent, rules, { heightAt = null, textures = null } = {}) {
  const geometries = new Set(), materials = new Set(), objects = [];
  const geo = value => (geometries.add(value), value);
  const mat = value => (materials.add(value), value);
  const add = object => { parent.add(object); objects.push(object); return object; };
  const clock = { value: 0 }, spin = { value: 0 }, growth = { value: 0 };
  const state = gravityVortexMotion(0, rules);
  const positions = [], uvs = [], indices = [], radialHeights = [];
  const segments = 96, rings = 20;
  for (let ring = 0; ring <= rings; ring++) for (let segment = 0; segment <= segments; segment++) {
    const radius = ring / rings, angle = segment / segments * TAU;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    // The raised outer lip makes a shallow depression without cutting terrain.
    const y = .025 + .26 * radius ** .7;
    // Extra transparent space lets curved wisps cross the gameplay boundary;
    // the mesh's circular perimeter never becomes the visible silhouette.
    positions.push(x * rules.radius * VISUAL_RADIUS, y, z * rules.radius * VISUAL_RADIUS); radialHeights.push(y);
    uvs.push(x * .5 + .5, z * .5 + .5);
    if (ring < rings && segment < segments) {
      const i = ring * (segments + 1) + segment;
      indices.push(i, i + 1, i + segments + 1, i + 1, i + segments + 2, i + segments + 1);
    }
  }
  const surfaceGeometry = geo(new THREE.BufferGeometry());
  surfaceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  surfaceGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  surfaceGeometry.setIndex(indices);
  const surfaceMat = mat(new THREE.ShaderMaterial({ name: 'Gravitation · gefüllte einwärts fließende Spirale',
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false,
    uniforms: { uSpin: spin, uFade: { value: 1 }, uGround: { value: textures?.ground ?? null },
      uTextured: { value: textures?.ground ? 1 : 0 } },
    vertexShader: `varying vec2 vUv;uniform float uSpin;
      void main(){vUv=uv;vec3 p=position;vec2 xy=uv*2.-1.;float r=length(xy);
        p.y+=sin(atan(xy.y,xy.x+.000001)*5.+r*15.+uSpin*5.)*.008*sin(r*3.14159);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float uSpin,uFade,uTextured;uniform sampler2D uGround;
      void main(){vec2 p=(vUv*2.-1.)*1.3;float r=length(p),a=atan(p.y,p.x+.000001);
        float c=cos(uSpin),s=sin(uSpin);
        vec2 q=vec2(c*p.x-s*p.y,s*p.x+c*p.y);
        // Sample the painted interior, avoiding its baked bright circular rim.
        // The same broad colored arms continue through the feathered wisps.
        vec2 uv=vec2(.495,.503)+vec2(q.x,-q.y)*vec2(.423,.4185)/(1.+.22*r*r);
        vec4 paint=texture2D(uGround,uv);
        if(uTextured<.5)paint=vec4(.07,.012,.14,1.);
        float curl=pow(.5+.5*sin(a*5.+r*7.+uSpin*5.),3.);
        float edge=.96+.055*sin(a*7.+uSpin)+.025*sin(a*13.-uSpin*.6)+curl*.22;
        float feather=1.-smoothstep(edge-.22,edge+.025,r);
        gl_FragColor=vec4(paint.rgb,paint.a*.97*uFade*feather);
        #include <colorspace_fragment>
      }`,
  }));
  const surface = add(new THREE.Mesh(surfaceGeometry, surfaceMat));
  surface.name = 'Gravitationsfeld · gefärbter Bodenstrudel'; surface.renderOrder = -10;
  const sphereMat = mat(new THREE.ShaderMaterial({ name: 'Gravitation · anschwellende Energiekugel',
    side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uAge: clock, uGrowth: growth, uOrb: { value: textures?.orb ?? null },
      uTextured: { value: textures?.orb ? 1 : 0 } },
    vertexShader: `varying vec3 vNormal,vView;varying vec2 vUv;uniform float uAge,uGrowth;
      void main(){vUv=uv;vec3 p=position*(1.+sin(position.y*14.+position.x*7.+uAge*13.)*.012*pow(uGrowth,4.));
        vec3 n=normal;
        #ifdef USE_INSTANCING
          p=(instanceMatrix*vec4(p,1.)).xyz;n=mat3(instanceMatrix)*n;
        #endif
        vec4 view=modelViewMatrix*vec4(p,1.);vNormal=normalize(normalMatrix*n);vView=-view.xyz;
        gl_Position=projectionMatrix*view;}`,
    fragmentShader: `varying vec3 vNormal,vView;varying vec2 vUv;uniform float uAge,uGrowth,uTextured;uniform sampler2D uOrb;
      void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),4.5);
        vec3 paint=texture2D(uOrb,vUv).rgb;
        if(uTextured<.5)paint=vec3(.009,.003,.023);
        float light=max(0.,dot(normalize(vNormal),normalize(vec3(-.3,.7,.6))));
        float crack=smoothstep(.015,.18,paint.b);
        vec3 color=paint*(.85+light*.15)*(1.+uGrowth*.6)+vec3(.40,.045,.78)*rim;
        color+=vec3(.28,.035,.65)*crack*(.4+.6*uGrowth);
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`,
  }));
  const sphere = add(new THREE.Mesh(geo(new THREE.SphereGeometry(1, 32, 20)), sphereMat));
  sphere.name = 'Gravitationsfeld · Singularität';
  const cap = add(new THREE.Mesh(geo(new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, Math.PI*.50)), sphereMat));
  cap.name = 'Gravitation · aufbrechende obere Kugelschale'; cap.visible = false;
  const neckMat = mat(new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    side: THREE.DoubleSide, forceSinglePass: true, blending: THREE.NormalBlending, toneMapped: false,
    uniforms: { uSpin: spin, uFade: { value: 0 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float uSpin,uFade;
      void main(){float thread=pow(.5+.5*cos(vUv.x*18.84956-vUv.y*6.+uSpin*5.),4.);
        gl_FragColor=vec4(.42,.07,.82,(.15+thread*.6)*uFade);
        #include <colorspace_fragment>
      }`,
  }));
  const neck = add(new THREE.Mesh(geo(new THREE.CylinderGeometry(.15, .055, 1, 24, 1, true)), neckMat));
  neck.name = 'Gravitation · Energieverbindung zur Kugel';
  const shell = add(new THREE.InstancedMesh(geo(new THREE.SphereGeometry(1, 8, 5, 0, .95, .45, .9)), sphereMat, SHELL_COUNT));
  shell.name = 'Gravitation · zerplatzende Kugelschale'; shell.frustumCulled = false; shell.count = 0;
  shell.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const transform = new THREE.Object3D();
  const lastCenter = new THREE.Vector3(NaN, NaN, NaN);
  let disposed = false;
  function conform(center) {
    if (!heightAt || lastCenter.equals(center)) return;
    lastCenter.copy(center);
    const attribute = surfaceGeometry.attributes.position;
    for (let i = 0; i < attribute.count; i++) attribute.setY(i,
      radialHeights[i] + heightAt(center.x + attribute.getX(i), center.z + attribute.getZ(i)) - center.y);
    attribute.needsUpdate = true; surfaceGeometry.computeBoundingSphere();
  }
  function update(center, age) {
    conform(center); gravityVortexMotion(age, rules, state);
    clock.value = age; spin.value = state.spin; growth.value = state.progress;
    surfaceMat.uniforms.uFade.value = state.fade;
    sphere.visible = state.burst < 0;
    sphere.position.y = state.sphereHeight; sphere.scale.setScalar(state.sphereRadius);
    sphere.rotation.y = -state.spin * .55;
    cap.visible = state.burst >= 0 && state.burst < .28;
    cap.position.y = state.sphereHeight + Math.max(0, state.burst) * .28;
    cap.scale.setScalar(state.sphereRadius * (1 + Math.max(0, state.burst) * .14));
    cap.rotation.set(-.18, -state.spin * .55, .15);
    const connectionHeight = Math.max(.02, state.sphereHeight - state.sphereRadius * .45);
    neck.visible = state.burst < 0 && state.progress > .04;
    neck.position.y = connectionHeight * .5; neck.scale.set(1, connectionHeight, 1);
    neckMat.uniforms.uFade.value = smooth(state.progress * 5) * .8;
    shell.visible = state.burst >= 0 && state.burst < .85;
    shell.count = shell.visible ? SHELL_COUNT : 0;
    if (shell.visible) {
      const t = state.burst;
      for (let i = 0; i < SHELL_COUNT; i++) {
        const a = i * 2.399963, y = 1 - (i + .5) / SHELL_COUNT * 2, radius = Math.sqrt(1 - y * y);
        const distance = .56 + t * (4.0 + i % 3 * .65);
        transform.position.set(Math.cos(a) * radius * distance,
          Math.max(.08, state.sphereHeight + y * distance * .45 + Math.sin(t * Math.PI) * .8 - t * t * 1.6),
          Math.sin(a) * radius * distance);
        transform.rotation.set(i + t * 5, a + t * 3, t * (i % 2 ? 4 : -4));
        transform.scale.setScalar((.42 + i % 3 * .08) * (1 - smooth(t / .85)));
        transform.updateMatrix(); shell.setMatrixAt(i, transform.matrix);
      }
      shell.instanceMatrix.needsUpdate = true;
    }
    return state;
  }
  return { update,
    get telemetry() { return { spin: state.spin, spinSpeed: state.spinSpeed, sphereHeight: sphere.position.y,
      sphereRadius: sphere.scale.x, sphereVisible: sphere.visible, shellCount: shell.count,
      surfaceOpacity: surfaceMat.uniforms.uFade.value * .97, shallowDepth: .26,
      visualRadius: rules.radius * VISUAL_RADIUS,
      artwork: textures?.ground && textures?.orb ? 'gravity-reference-v1' : null,
      capVisible: cap.visible }; },
    dispose() {
      if (disposed) return;
      objects.forEach(object => object.removeFromParent()); shell.dispose();
      geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); disposed = true;
    },
  };
}
