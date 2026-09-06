import type { Deck } from "./types";
import { clasico } from "./clasico";
import { picante } from "./picante";

export type { Card, Deck } from "./types";

/**
 * Registro central de mazos. Para agregar un mazo nuevo:
 * 1. Crear src/data/decks/mi-mazo.ts siguiendo el formato de clasico.ts
 * 2. Importarlo y sumarlo acá abajo.
 * El `id` del mazo queda embebido en el código de partida, así que una vez
 * publicado conviene no cambiarlo (rompería códigos ya compartidos).
 */
export const DECKS: Record<string, Deck> = {
  [clasico.id]: clasico,
  [picante.id]: picante,
};

export const DECK_LIST: Deck[] = Object.values(DECKS);

export function getDeck(id: string): Deck | undefined {
  return DECKS[id.toUpperCase()];
}
