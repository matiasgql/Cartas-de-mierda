/**
 * Código de sala para el modo P2P.
 *
 * A diferencia del viejo modo sin servidor, este código ya NO codifica el
 * mazo, la semilla ni la cantidad de jugadores: es solo un identificador de
 * sala para Trystero (ver `room.ts`). Todo el estado real de la partida
 * (mazo elegido, mano de cada uno, ronda actual, puntajes) vive en memoria
 * del anfitrión y viaja en vivo por WebRTC.
 *
 * Alfabeto sin caracteres ambiguos (sin 0/O, 1/I/L) para que sea fácil de
 * transcribir de palabra o a los gritos desde el otro lado de la mesa.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 5;

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidRoomCode(raw: string): boolean {
  const code = normalizeRoomCode(raw);
  return code.length >= 4 && code.length <= 12;
}
