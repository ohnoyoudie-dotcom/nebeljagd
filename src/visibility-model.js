/** 2D tactical line of sight. Static blocker cells make the cost local to the
 * observer, independent of island size. Walls keep their rotated corner shape. */
export function createSightModel({ obstacles = [], radius = 18, samples = 512, cellSize = 16 } = {}) {
  if (!(Number.isFinite(radius) && radius > 0)) throw new Error('Sichtradius muss positiv sein.');
  const cells = new Map(), observer = { x: 0, y: 0, z: 0 }, distances = new Float32Array(samples);
  let nearby = [];
  const tau = Math.PI * 2;
  const finite = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
  const bounds = body => 'radius' in body
    ? [body.x - body.radius, body.x + body.radius, body.z - body.radius, body.z + body.radius]
    : [body.minX, body.maxX, body.minZ, body.maxZ];
  for (const body of obstacles) {
    const b = bounds(body);
    if (!b.every(Number.isFinite)) continue;
    for (let x = Math.floor(b[0] / cellSize); x <= Math.floor(b[1] / cellSize); x++) {
      for (let z = Math.floor(b[2] / cellSize); z <= Math.floor(b[3] / cellSize); z++) {
        const key = `${x},${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(body);
      }
    }
  }
  function rayDistance(dx, dz, maximum = radius) {
    let closest = maximum;
    for (const body of nearby) {
      if ('radius' in body) {
        const ox = observer.x - body.x, oz = observer.z - body.z;
        const projection = ox * dx + oz * dz;
        const c = ox * ox + oz * oz - body.radius * body.radius;
        const discriminant = projection * projection - c;
        if (discriminant < 0) continue;
        const entry = -projection - Math.sqrt(discriminant), exit = -projection + Math.sqrt(discriminant);
        if (exit >= 0) closest = Math.min(closest, Math.max(0, entry));
      } else {
        const polygon = body.corners ?? [
          { x: body.minX, z: body.minZ }, { x: body.maxX, z: body.minZ },
          { x: body.maxX, z: body.maxZ }, { x: body.minX, z: body.maxZ },
        ];
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i], b = polygon[(i + 1) % polygon.length];
          const ex = b.x - a.x, ez = b.z - a.z, den = dx * ez - dz * ex;
          if (Math.abs(den) < 1e-9) continue;
          const px = a.x - observer.x, pz = a.z - observer.z;
          const t = (px * ez - pz * ex) / den, u = (px * dz - pz * dx) / den;
          if (t >= 0 && u >= 0 && u <= 1) closest = Math.min(closest, t);
        }
      }
    }
    return closest;
  }
  function update(point) {
    if (!finite(point)) return;
    observer.x = point.x; observer.y = point.y ?? 0; observer.z = point.z;
    const candidates = new Set();
    for (let x = Math.floor((point.x - radius) / cellSize); x <= Math.floor((point.x + radius) / cellSize); x++) {
      for (let z = Math.floor((point.z - radius) / cellSize); z <= Math.floor((point.z + radius) / cellSize); z++) {
        for (const body of cells.get(`${x},${z}`) ?? []) candidates.add(body);
      }
    }
    // A tree or wall far below eye level cannot hide a traveller on a ridge.
    nearby = [...candidates].filter(body => (body.maxY ?? Infinity) >= observer.y + .85 && (body.minY ?? -Infinity) <= observer.y + 2.3);
    for (let i = 0; i < samples; i++) {
      const angle = i / samples * tau;
      distances[i] = rayDistance(Math.cos(angle), Math.sin(angle));
    }
  }
  function isVisible(point, { concealed = false, local = false } = {}) {
    if (local) return true;
    if (concealed || !finite(point)) return false;
    const dx = point.x - observer.x, dz = point.z - observer.z, distance = Math.hypot(dx, dz);
    if (distance > radius) return false;
    if (distance < 1e-7) return true;
    return rayDistance(dx / distance, dz / distance, distance) >= distance - .025;
  }
  update(observer);
  return { radius, samples, distances, observer, update, isVisible,
    distanceAtAngle(angle) { return rayDistance(Math.cos(angle), Math.sin(angle)); },
    get nearbyCount() { return nearby.length; },
  };
}
