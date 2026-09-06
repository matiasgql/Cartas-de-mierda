/**
 * Generador de números pseudoaleatorios determinístico (mulberry32).
 *
 * Todo el "multijugador sin servidor" de la app se apoya en esto: si dos
 * celulares usan la misma semilla (seed), obtienen exactamente el mismo
 * mezclado de cartas sin necesidad de comunicarse entre sí.
 */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates usando un rng determinístico. No muta el array original. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Genera una semilla nueva y razonablemente única para crear partidas. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}
