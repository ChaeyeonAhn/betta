/** Convert stage velocity (down is positive) into pitch in the 3D scene (up is positive). */
export function swimmingPitch(vx: number, vy: number) {
  if (vy === 0) return 0;
  const pitch = Math.atan2(-vy, Math.abs(vx));
  // Settle toward level as the fish slows to a stop.
  return pitch * Math.min(1, Math.hypot(vx, vy) / 20);
}
