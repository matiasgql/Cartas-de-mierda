import { getDeck, type Card } from "../../data/decks";
import { createRng, shuffle } from "../rng";

/**
 * El anfitrión (quien crea la sala) es la única fuente de verdad de la
 * partida: mazo, manos, ronda, juez y puntajes viven acá. El resto de los
 * celulares son "vistas": solo mandan intenciones (jugar una carta, elegir
 * ganadora, pasar de ronda) y reciben de vuelta un estado ya armado para
 * pintar en pantalla. Esto evita tener que poner de acuerdo a N celulares
 * sobre "qué pasó primero" — hay un solo lugar que decide.
 *
 * Si el anfitrión cierra la app, la partida se corta (no hay migración de
 * anfitrión todavía); es la contra de no depender de un servidor real.
 */

export const MIN_PLAYERS = 3;

export type Phase = "lobby" | "playing" | "judging" | "roundEnd" | "gameOver";

interface PlayerRecord {
  token: string;
  peerId: string;
  name: string;
  score: number;
  hand: Card[];
  connected: boolean;
}

interface RevealedSubmission {
  subId: string;
  card: Card;
}

export interface PlayerView {
  name: string;
  score: number;
  connected: boolean;
  isJudge: boolean;
  isYou: boolean;
  hasPlayed: boolean;
}

export interface PersonalizedState {
  phase: Phase;
  roomCode: string;
  deckName: string;
  round: number;
  targetScore: number;
  players: PlayerView[];
  judgeName: string;
  isJudge: boolean;
  blackCard: Card | null;
  hand: Card[];
  hasPlayed: boolean;
  submittedCount: number;
  totalToSubmit: number;
  reveal: RevealedSubmission[] | null;
  winner: { name: string; card: Card } | null;
  gameOverRanking: { name: string; score: number }[] | null;
  canStart: boolean;
}

export class HostEngine {
  private deckId: string;
  private handSize: number;
  private targetScore: number;
  private roomCode: string;

  private whitePool: Card[] = [];
  private blackPool: Card[] = [];

  private order: string[] = [];
  private players = new Map<string, PlayerRecord>();

  private judgeIdx = 0;
  private round = 0;
  private phase: Phase = "lobby";
  private blackCard: Card | null = null;

  private pendingSubs = new Map<string, Card>();
  private submissions = new Map<string, { token: string; card: Card }>();
  private revealOrder: string[] = [];
  private lastWinner: { name: string; card: Card } | null = null;

  constructor(deckId: string, handSize: number, targetScore: number, roomCode: string) {
    this.deckId = deckId;
    this.handSize = handSize;
    this.targetScore = targetScore;
    this.roomCode = roomCode;
  }

  private refillWhite() {
    const deck = getDeck(this.deckId)!;
    this.whitePool = shuffle(deck.white, createRng(Math.floor(Math.random() * 0xffffffff)));
  }

  private refillBlack() {
    const deck = getDeck(this.deckId)!;
    this.blackPool = shuffle(deck.black, createRng(Math.floor(Math.random() * 0xffffffff)));
  }

  private drawWhite(): Card {
    if (this.whitePool.length === 0) this.refillWhite();
    return this.whitePool.pop()!;
  }

  private drawBlack(): Card {
    if (this.blackPool.length === 0) this.refillBlack();
    return this.blackPool.pop()!;
  }

  /** Llamado cuando llega un mensaje "join" (nuevo jugador o reconexión de uno viejo). */
  addOrUpdatePlayer(token: string, peerId: string, name: string) {
    const existing = this.players.get(token);
    if (existing) {
      existing.peerId = peerId;
      existing.connected = true;
      if (name) existing.name = name;
      return;
    }

    const record: PlayerRecord = {
      token,
      peerId,
      name: name || `Jugador ${this.order.length + 1}`,
      score: 0,
      hand: [],
      connected: true,
    };
    this.players.set(token, record);
    this.order.push(token);

    // Alguien se suma con la partida ya arrancada: le damos mano completa
    // y entra en la rotación de jueces a partir de la próxima vuelta.
    if (this.phase !== "lobby") {
      for (let i = 0; i < this.handSize; i++) record.hand.push(this.drawWhite());
    }
  }

  markDisconnected(peerId: string) {
    for (const p of this.players.values()) {
      if (p.peerId === peerId) p.connected = false;
    }
    // Si el que faltaba jugar era justo el que se desconectó, no dejamos la
    // ronda trabada esperando una carta que nunca va a llegar.
    this.checkReadyForJudging();
  }

  private currentJudgeToken(): string | null {
    if (this.order.length === 0) return null;
    return this.order[this.judgeIdx % this.order.length];
  }

  canStart(): boolean {
    return (
      this.phase === "lobby" &&
      this.order.filter((t) => this.players.get(t)?.connected).length >= MIN_PLAYERS
    );
  }

  start() {
    if (!this.canStart()) return;
    for (const token of this.order) {
      const p = this.players.get(token)!;
      p.hand = [];
      for (let i = 0; i < this.handSize; i++) p.hand.push(this.drawWhite());
    }
    this.judgeIdx = 0;
    this.round = 1;
    this.blackCard = this.drawBlack();
    this.pendingSubs.clear();
    this.phase = "playing";
  }

  /** Un jugador (no juez) juega una carta de su mano. */
  playCard(token: string, cardId: string) {
    if (this.phase !== "playing") return;
    if (token === this.currentJudgeToken()) return;
    if (this.pendingSubs.has(token)) return;

    const p = this.players.get(token);
    if (!p) return;
    const idx = p.hand.findIndex((c) => c.id === cardId);
    if (idx === -1) return;

    const [card] = p.hand.splice(idx, 1);
    this.pendingSubs.set(token, card);
    this.checkReadyForJudging();
  }

  private checkReadyForJudging() {
    if (this.phase !== "playing") return;
    const judge = this.currentJudgeToken();
    const stillMissing = this.order.filter(
      (t) => t !== judge && this.players.get(t)?.connected && !this.pendingSubs.has(t)
    );
    // Necesitamos al menos una carta jugada para poder juzgar algo.
    if (stillMissing.length === 0 && this.pendingSubs.size > 0) this.moveToJudging();
  }

  private moveToJudging() {
    const entries = shuffle([...this.pendingSubs.entries()], createRng(Math.floor(Math.random() * 0xffffffff)));
    this.submissions.clear();
    this.revealOrder = [];
    entries.forEach(([token, card], i) => {
      const subId = `s${i}`;
      this.submissions.set(subId, { token, card });
      this.revealOrder.push(subId);
    });
    this.phase = "judging";
  }

  /** El juez elige la carta ganadora (por su id anónimo de la ronda, no por jugador). */
  pickWinner(judgeToken: string, subId: string) {
    if (this.phase !== "judging") return;
    if (judgeToken !== this.currentJudgeToken()) return;
    const sub = this.submissions.get(subId);
    if (!sub) return;

    const winner = this.players.get(sub.token);
    if (winner) winner.score += 1;
    this.lastWinner = { name: winner?.name ?? "?", card: sub.card };

    const reachedTarget = this.targetScore > 0 && (winner?.score ?? 0) >= this.targetScore;
    this.phase = reachedTarget ? "gameOver" : "roundEnd";
  }

  /** Cualquiera puede pedir pasar a la próxima ronda; el anfitrión avanza en el primer pedido. */
  advance(_token: string) {
    if (this.phase !== "roundEnd") return;
    this.nextRound();
  }

  private nextRound() {
    for (const token of this.order) {
      const p = this.players.get(token)!;
      while (p.hand.length < this.handSize) p.hand.push(this.drawWhite());
    }
    this.judgeIdx = (this.judgeIdx + 1) % this.order.length;
    this.round += 1;
    this.blackCard = this.drawBlack();
    this.pendingSubs.clear();
    this.submissions.clear();
    this.revealOrder = [];
    this.phase = "playing";
  }

  getAllTokens(): string[] {
    return [...this.order];
  }

  tokenForPeer(peerId: string): string | undefined {
    for (const [token, p] of this.players.entries()) {
      if (p.peerId === peerId) return token;
    }
    return undefined;
  }

  peerForToken(token: string): string | undefined {
    return this.players.get(token)?.peerId;
  }

  getStateFor(token: string): PersonalizedState {
    const deck = getDeck(this.deckId)!;
    const judgeToken = this.currentJudgeToken();
    const me = this.players.get(token);
    const nonJudgeConnected = this.order.filter(
      (t) => t !== judgeToken && this.players.get(t)?.connected
    ).length;

    const showReveal = this.phase === "judging" || this.phase === "roundEnd" || this.phase === "gameOver";

    return {
      phase: this.phase,
      roomCode: this.roomCode,
      deckName: deck.name,
      round: this.round,
      targetScore: this.targetScore,
      players: this.order.map((t) => {
        const p = this.players.get(t)!;
        return {
          name: p.name,
          score: p.score,
          connected: p.connected,
          isJudge: t === judgeToken,
          isYou: t === token,
          hasPlayed: this.pendingSubs.has(t),
        };
      }),
      judgeName: judgeToken ? this.players.get(judgeToken)?.name ?? "" : "",
      isJudge: token === judgeToken,
      blackCard: this.blackCard,
      hand: me ? me.hand : [],
      hasPlayed: this.pendingSubs.has(token),
      submittedCount: this.pendingSubs.size,
      totalToSubmit: nonJudgeConnected,
      reveal: showReveal ? this.revealOrder.map((subId) => ({ subId, card: this.submissions.get(subId)!.card })) : null,
      winner: this.phase === "roundEnd" || this.phase === "gameOver" ? this.lastWinner : null,
      gameOverRanking:
        this.phase === "gameOver"
          ? [...this.players.values()].sort((a, b) => b.score - a.score).map((p) => ({ name: p.name, score: p.score }))
          : null,
      canStart: this.canStart(),
    };
  }
}
