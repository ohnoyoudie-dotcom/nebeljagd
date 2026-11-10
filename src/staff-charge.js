// Poison and gravity use the same linear hold/release charge, independent of
// their different maximum ranges. Pause is handled by the simulation clock.
export const STAFF_CHARGE_SECONDS = 3;
export function chargedStaffRange(heldSeconds, maximum) {
  return maximum * Math.min(1, Math.max(0, heldSeconds) / STAFF_CHARGE_SECONDS);
}
