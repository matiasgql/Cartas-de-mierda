/**
 * Capa fina sobre Trystero.
 *
 * Trystero arma una conexión WebRTC real entre los celulares (los datos
 * viajan directo entre dispositivos) usando infraestructura pública
 * (trackers de BitTorrent) solo para el "apretón de manos" inicial. No hay
 * ningún servidor propio: `joinRoom` con el mismo `roomCode` en dos
 * celulares alcanza para que se encuentren.
 *
 * `appId` namespacea las salas para que no choquen con las de otras apps
 * que también usan Trystero sobre los mismos trackers públicos.
 */
import { joinRoom, selfId, type Room } from "trystero/torrent";

const APP_ID = "cartas-de-mesa-v1";

/**
 * Trackers públicos de BitTorrent que soportan WebSocket (necesarios para
 * que Trystero pueda usarlos desde el navegador). `tracker.btorrent.xyz`
 * solo, se cae o queda bloqueado en algunas redes; con varios de respaldo
 * alcanza con que uno funcione. `relayRedundancy` controla a cuántos se
 * conecta en simultáneo (si se pasa `relayUrls`, se usan todos los de la
 * lista en vez de un subconjunto al azar).
 */
const RELAY_URLS = [
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.webtorrent.dev",
  "wss://open.ftorrent.com",
];

export type { Room };
export { selfId };

export function connectToRoom(roomCode: string): Room {
  return joinRoom(
    {
      appId: APP_ID,
      relayUrls: RELAY_URLS,
      relayRedundancy: 3,
      rtcConfig: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          {
            urls: [
              "turn:openrelay.metered.ca:80",
              "turn:openrelay.metered.ca:443",
              "turn:openrelay.metered.ca:443?transport=tcp",
            ],
            username: "openrelayproject",
            credential: "openrelayproject",
          },
        ],
      },
    },
    `sala-${roomCode.toLowerCase()}`
  );
}

/**
 * Identidad persistente por dispositivo (no por conexión). El `peerId` de
 * Trystero cambia cada vez que alguien entra a la sala (por ejemplo, si se
 * le cierra la app y vuelve a entrar); este `token` en cambio se guarda en
 * el celular y permite que el anfitrión reconozca "ah, este es el mismo
 * jugador de antes" y le devuelva su puntaje y no lo duplique en la lista.
 */
const TOKEN_KEY = "cartas-de-mesa:token";

/**
 * crypto.randomUUID() solo existe en contextos seguros: HTTPS, o
 * localhost/127.0.0.1. Desde el celu por IP de red (http://192.168.x.x:4321)
 * el navegador NO lo considera seguro y crypto.randomUUID no existe ahí,
 * aunque crypto.getRandomValues sí. Por eso armamos el UUID a mano con esa
 * API si hace falta.
 */
function randomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versión 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getDeviceToken(): string {
  if (typeof localStorage === "undefined") return randomUUID();
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = randomUUID();
    localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

const NAME_KEY = "cartas-de-mesa:nombre";

export function saveDeviceName(name: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(NAME_KEY, name);
}

export function loadDeviceName(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(NAME_KEY) ?? "";
}
