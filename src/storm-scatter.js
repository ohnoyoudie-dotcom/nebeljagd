/** Sample the whole disk independently, once per cast. Square-root radii keep
 * the density even across its area; no angular progression links the waves. */
export function createStormScatter(radius, count, random = Math.random) {
  return Array.from({ length: count }, () => {
    const angle = random() * Math.PI * 2;
    const distance = radius * .94 * Math.sqrt(random());
    return { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance,
      seed: Math.floor(random() * 1000000) };
  });
}
