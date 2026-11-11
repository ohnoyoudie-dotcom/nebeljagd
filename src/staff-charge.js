// Both thrown staffs grow at the same speed in metres, from 0 to 20m in 3s.
// Pause is handled by the simulation clock.
export const STAFF_CHARGE_SECONDS = 3;
export const STAFF_THROW_RANGE = 20;
export function chargedStaffRange(heldSeconds, maximum) {
  return maximum * Math.min(1, Math.max(0, heldSeconds) / STAFF_CHARGE_SECONDS);
}
