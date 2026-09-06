export interface Card {
  id: string;
  text: string;
}

export interface Deck {
  /** Identificador corto, en mayúsculas, sin guiones (va dentro del código de partida). */
  id: string;
  name: string;
  description: string;
  /** Cartas de respuesta, las que recibe cada jugador en su mano. */
  white: Card[];
  /** Cartas de prompt/pregunta, una por ronda, elegida por el juez. */
  black: Card[];
}
