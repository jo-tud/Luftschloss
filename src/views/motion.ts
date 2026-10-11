/**
 * Systemeinstellung „Bewegung reduzieren“: Kamerafahrten springen dann ans Ziel, die Aufbau-Animation
 * zeigt die Teile gleich an ihrem Platz, das Verbindungsdetail steht still auseinandergezogen.
 */
export function reducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Dauer einer Kamerafahrt in ms, bei reduzierter Bewegung sofort */
export function motionMs(ms: number): number {
  return reducedMotion() ? 1 : ms
}
