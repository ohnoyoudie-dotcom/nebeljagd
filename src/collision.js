/** Static spatial grid. Rebuilt only when the world is constructed. */
export function createCollisionIndex(circles, walls, cellSize = 4) {
  const cells = new Map();
  function insert(body, minX, maxX, minZ, maxZ) {
    for (let x = Math.floor(minX / cellSize); x <= Math.floor(maxX / cellSize); x++) {
      for (let z = Math.floor(minZ / cellSize); z <= Math.floor(maxZ / cellSize); z++) {
        const key = `${x},${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(body);
      }
    }
  }
  for (const c of circles) insert(c, c.x - c.radius, c.x + c.radius, c.z - c.radius, c.z + c.radius);
  for (const w of walls) insert(w, w.minX, w.maxX, w.minZ, w.maxZ);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const epsilon = 1e-9;

  function slabInterval(origin, delta, minimum, maximum) {
    if (Math.abs(delta) < epsilon) return origin >= minimum - epsilon && origin <= maximum + epsilon
      ? [-Infinity, Infinity] : null;
    const a = (minimum - origin) / delta, b = (maximum - origin) / delta;
    return a < b ? [a, b] : [b, a];
  }

  function rectangleInterval(start, delta, minX, maxX, minZ, maxZ) {
    const x = slabInterval(start.x, delta.x, minX, maxX);
    const z = slabInterval(start.z, delta.z, minZ, maxZ);
    if (!x || !z) return null;
    const entry = Math.max(x[0], z[0]), exit = Math.min(x[1], z[1]);
    return entry <= exit + epsilon ? [entry, exit] : null;
  }

  function circleInterval(start, delta, x, z, radius) {
    const dx = start.x - x, dz = start.z - z;
    const a = delta.x * delta.x + delta.z * delta.z;
    const c = dx * dx + dz * dz - radius * radius;
    if (a < epsilon * epsilon) return c <= epsilon ? [-Infinity, Infinity] : null;
    const b = dx * delta.x + dz * delta.z;
    const discriminant = b * b - a * c;
    if (discriminant < -epsilon) return null;
    const root = Math.sqrt(Math.max(0, discriminant));
    return [(-b - root) / a, (-b + root) / a];
  }

  function normalAt(body, point, delta) {
    let x, z;
    if ('radius' in body) {
      x = point.x - body.x; z = point.z - body.z;
    } else {
      x = point.x - clamp(point.x, body.minX, body.maxX);
      z = point.z - clamp(point.z, body.minZ, body.maxZ);
      if (Math.hypot(x, z) < epsilon) {
        const distances = [Math.abs(point.x - body.minX), Math.abs(body.maxX - point.x),
          Math.abs(point.z - body.minZ), Math.abs(body.maxZ - point.z)];
        const nearest = Math.min(...distances);
        // At an exact corner both adjacent face normals contribute.
        x = (Math.abs(distances[1] - nearest) < epsilon ? 1 : 0)
          - (Math.abs(distances[0] - nearest) < epsilon ? 1 : 0);
        z = (Math.abs(distances[3] - nearest) < epsilon ? 1 : 0)
          - (Math.abs(distances[2] - nearest) < epsilon ? 1 : 0);
      }
    }
    let length = Math.hypot(x, z);
    if (length < epsilon) {
      x = -delta.x; z = -delta.z; length = Math.hypot(x, z);
      if (length < epsilon) { x = -1; z = 0; length = 1; }
    }
    return { x: x / length, z: z / length };
  }

  return {
    /**
     * Sweep a projectile sphere along a finite segment and return its earliest contact.
     * Circle bodies are vertical cylinders; walls are X/Z rectangles with rounded
     * swept-radius corners. Optional minY/maxY delimit either collider's height.
     * Missing heights are unbounded, so callers can adopt height metadata gradually.
     * `point` is the projectile centre at contact, not a point pushed into the surface.
     */
    traceSegment(start, end, radius = .06) {
      if (![start.x, start.z, end.x, end.z].every(Number.isFinite)) return null;
      const projectileRadius = Math.max(0, Number.isFinite(radius) ? radius : .06);
      const delta = { x: end.x - start.x, y: (end.y ?? 0) - (start.y ?? 0), z: end.z - start.z };
      const nearby = new Set();
      for (let x = Math.floor((Math.min(start.x, end.x) - projectileRadius) / cellSize);
        x <= Math.floor((Math.max(start.x, end.x) + projectileRadius) / cellSize); x++) {
        for (let z = Math.floor((Math.min(start.z, end.z) - projectileRadius) / cellSize);
          z <= Math.floor((Math.max(start.z, end.z) + projectileRadius) / cellSize); z++) {
          for (const body of cells.get(`${x},${z}`) || []) nearby.add(body);
        }
      }
      let closest = null;
      for (const body of nearby) {
        const height = slabInterval(start.y ?? 0, delta.y,
          (body.minY ?? -Infinity) - projectileRadius, (body.maxY ?? Infinity) + projectileRadius);
        if (!height) continue;
        let intervals;
        if ('radius' in body) {
          intervals = [circleInterval(start, delta, body.x, body.z, body.radius + projectileRadius)];
        } else {
          // Exact rectangle ⊕ disc: two face strips and four rounded corner discs.
          // Expanded-AABB-only tests would spuriously hit empty space at corners.
          intervals = [
            rectangleInterval(start, delta, body.minX - projectileRadius, body.maxX + projectileRadius, body.minZ, body.maxZ),
            rectangleInterval(start, delta, body.minX, body.maxX, body.minZ - projectileRadius, body.maxZ + projectileRadius),
          ];
          if (projectileRadius > 0) for (const x of [body.minX, body.maxX]) for (const z of [body.minZ, body.maxZ]) {
            intervals.push(circleInterval(start, delta, x, z, projectileRadius));
          }
        }
        for (const interval of intervals) {
          if (!interval) continue;
          const t = Math.max(0, interval[0], height[0]);
          const exit = Math.min(1, interval[1], height[1]);
          if (t > exit + epsilon || (closest && t >= closest.t)) continue;
          const point = { x: start.x + delta.x * t, y: (start.y ?? 0) + delta.y * t, z: start.z + delta.z * t };
          closest = { t, point, normal: normalAt(body, point, delta),
            type: body.type ?? ('radius' in body ? 'circle' : 'wall'), collider: body };
        }
      }
      return closest;
    },
    resolve(position, radius) {
      // Fixed simulation steps keep displacement below the player radius, preventing tunnelling.
      for (let pass = 0; pass < 4; pass++) {
        const nearby = new Set();
        for (let x = Math.floor((position.x - radius) / cellSize); x <= Math.floor((position.x + radius) / cellSize); x++) {
          for (let z = Math.floor((position.z - radius) / cellSize); z <= Math.floor((position.z + radius) / cellSize); z++) {
            for (const body of cells.get(`${x},${z}`) || []) nearby.add(body);
          }
        }
        let changed = false;
        for (const body of nearby) {
          if ('radius' in body) {
            const dx = position.x - body.x, dz = position.z - body.z;
            const d = Math.hypot(dx, dz), minimum = body.radius + radius;
            if (d >= minimum) continue;
            position.x = body.x + (d > 1e-7 ? dx / d : 1) * minimum;
            position.z = body.z + (d > 1e-7 ? dz / d : 0) * minimum;
          } else {
            const dx = position.x - clamp(position.x, body.minX, body.maxX);
            const dz = position.z - clamp(position.z, body.minZ, body.maxZ);
            const d = Math.hypot(dx, dz);
            if (d >= radius) continue;
            if (d > 1e-7) {
              position.x += dx / d * (radius - d);
              position.z += dz / d * (radius - d);
            } else {
              const distances = [position.x - body.minX, body.maxX - position.x, position.z - body.minZ, body.maxZ - position.z];
              const side = distances.indexOf(Math.min(...distances));
              if (side === 0) position.x = body.minX - radius;
              if (side === 1) position.x = body.maxX + radius;
              if (side === 2) position.z = body.minZ - radius;
              if (side === 3) position.z = body.maxZ + radius;
            }
          }
          changed = true;
        }
        if (!changed) break;
      }
      return position;
    },
    get size() { return circles.length + walls.length; },
  };
}
