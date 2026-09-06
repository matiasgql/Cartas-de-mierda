# AGENTS.md — Cartas de Mesa

Guía para que un agente de código (opencode, Claude Code, etc.) pueda seguir
trabajando este proyecto sin tener que releer todo desde cero.

## Qué es esto

Web app mobile-first (Astro + Bun) para jugar juegos de cartas de fiesta
estilo HDP / Amigos de Mierda / Enpalabras entre varios celulares, **sin
backend propio**: la sincronización en vivo se hace por WebRTC punto a
punto (P2P) usando [Trystero](https://github.com/dmotz/trystero), que se
apoya en infraestructura pública (trackers de BitTorrent) solo para el
"apretón de manos" inicial. Un jugador crea la sala y comparte un código
corto; cada otro jugador lo ingresa desde su propio teléfono y la partida se
juega en vivo: elegís tu carta, el anfitrión juzga, todos ven el resultado
y el puntaje al instante. Requiere internet.

Léase primero: la sección "Cómo funciona el multijugador P2P" más abajo.
Es la pieza de diseño más importante del proyecto — casi todo el código gira
alrededor de eso.

> Nota histórica: la primera versión de esta app no usaba red para nada —
> cada celular calculaba su mano con un PRNG sembrado por un código
> compartido, y el grupo se ponía de acuerdo de palabra para avanzar de
> ronda. Se reemplazó por el modo P2P de abajo porque no permitía juzgar
> ganadores ni llevar puntaje compartido.

## Stack

- **Astro** (modo `static`, sin SSR) — páginas `.astro`, cada una con su
  `<script>` de cliente en TypeScript.
- **Bun** como runtime y package manager (`bun install`, `bun run dev`).
- **Tailwind CSS v4** (config "CSS-first" con `@theme` en
  `src/styles/global.css`, no hay `tailwind.config.js`).
- **Sin framework de UI** (nada de React/Vue). Es intencional: la interactividad
  es simple (formularios, mostrar/ocultar, un array de cartas), así que un
  `<script type="module">` por página alcanza y mantiene el bundle mínimo.
  Si a futuro una pantalla se vuelve mucho más compleja, evaluar sumar una
  isla de Preact recién ahí — no antes.

## Comandos

```bash
bun install     # instalar dependencias
bun run dev     # servidor de desarrollo
bun run build   # build estático a dist/
bun run preview # sirve el build de dist/
```

Cuando trabajes con el agente en modo background:

```
astro dev --background
```

Se administra con `astro dev stop`, `astro dev status` y `astro dev logs`.

No hay tests automatizados todavía (ver "Pendientes"). Para validar cambios
en la lógica pura (`src/lib/*`), lo más rápido es escribir un script suelto
tipo `algo.ts` en la raíz y correrlo con `bun run algo.ts` — Bun ejecuta
TypeScript directo, sin paso de compilación. Borrarlo después.

## Cómo funciona el multijugador P2P

Toda la gracia de la app está en `src/lib/p2p/`. Modelo: **anfitrión
autoritativo + vistas tontas**.

1. Quien crea la sala (`crear.astro`) elige mazo, cartas por mano y puntos
   para ganar, genera un código corto random (`roomCode.ts`, ya no codifica
   nada del juego, es solo el id de la sala) y entra a `sala.astro` con
   `?host=1`.
2. `sala.astro` con `host=1` instancia un `HostEngine` (`hostEngine.ts`):
   ese objeto vive **solo en el celular del anfitrión** y es la única
   fuente de verdad — mazo mezclado, mano de cada jugador, ronda actual,
   juez, cartas jugadas y puntaje. El resto de los celulares no calculan
   nada de esto, solo pintan lo que reciben.
3. La conexión entre celulares es `room.ts`, un wrapper de Trystero
   (`joinRoom` sobre la estrategia `torrent`). Todos los celulares que usan
   el mismo código de sala terminan conectados entre sí por WebRTC.
4. Los invitados mandan **intenciones** por acciones de Trystero: `join`
   (nombre + un `token` persistido en `localStorage` para sobrevivir a un
   refresh), `play` (jugar una carta), `winner` (el juez elige ganadora),
   `advance` (pedir pasar de ronda). El anfitrión valida cada una contra el
   estado actual del `HostEngine` y, si es válida, la aplica.
5. Después de cada cambio, el anfitrión llama `broadcastAll()`: le arma un
   `PersonalizedState` distinto a cada jugador (con su propia mano, nunca la
   de los demás) y se lo manda por la acción `state`, dirigida a su
   `peerId`. Los invitados solo escuchan `state` y renderizan.
6. Ronda: el juez no juega carta; cuando el resto ya jugó, la fase pasa a
   `judging` y se muestran las cartas mezcladas (sin decir de quién es cada
   una) para que el juez las lea y elija. Al elegir, se suma el punto, se
   revela quién la jugó, y cualquiera puede pedir `advance` para la
   siguiente ronda (rota el juez, se reparten cartas nuevas).

**Contras conocidas** (documentadas para no "arreglarlas" a medias sin
avisar): no hay migración de anfitrión — si cierra la app, se corta la
partida; depender de los trackers públicos de BitTorrent es gratis pero no
está bajo nuestro control; necesita internet (a diferencia del viejo modo
sin red).

**Al tocar `hostEngine.ts`**: es el módulo más importante del proyecto y no
tiene tests automatizados todavía. Antes de dar un cambio por terminado,
repasar a mano los casos: alguien se desconecta justo cuando falta su
carta (no debe trabar la ronda, ver `checkReadyForJudging`), alguien se une
con la partida ya arrancada, y el mazo blanco/negro se queda sin cartas a
mitad de partida (se reharaja, puede repetir cartas — aceptable).

## Estructura

```
src/
  lib/
    rng.ts             # PRNG determinístico + shuffle (lo usa hostEngine para mezclar mazos)
    p2p/
      room.ts            # wrapper de Trystero (joinRoom) + token/nombre persistidos en localStorage
      roomCode.ts         # generar/validar el código corto de sala
      hostEngine.ts        # motor autoritativo: mazo, manos, ronda, juez, puntaje
      constants.ts          # límites de configuración (cartas por mano)
  data/decks/
    types.ts         # tipos Card / Deck
    clasico.ts       # contenido de un mazo (cartas originales)
    picante.ts        # otro mazo, tono más filoso
    index.ts          # registro central de mazos (DECKS, DECK_LIST, getDeck)
  layouts/
    Layout.astro      # viewport mobile, safe-area, contenedor angosto centrado
  pages/
    index.astro        # home: crear o unirse
    crear.astro          # elegir mazo / mano / meta de puntos + nombre -> genera código, entra como anfitrión
    unirse.astro          # ingresar código + nombre -> entra como invitado
    sala.astro             # pantalla única: lobby -> partida en vivo -> fin (lobby/playing/judging/roundEnd/gameOver)
  styles/global.css        # tokens de Tailwind v4 (@theme) + estilo "carta física"
```

## Convenciones

- **Comentarios y textos de la UI en español (Argentina)**, siempre "vos"
  (no "tú").
- **Lógica pura separada de las páginas**: nada de reglas de negocio dentro
  de un `<script>` de `.astro` más allá de leer inputs, llamar a `src/lib/*`
  y pintar el DOM. Si una página empieza a acumular lógica no trivial, esa
  lógica se va a `src/lib/`.
- **Cada mazo es un archivo propio** en `src/data/decks/`, registrado en
  `index.ts`. El `id` de un mazo (ej. `"CLASICO"`) queda embebido en los
  códigos de partida ya compartidos — no renombrarlo una vez publicado, o
  los códigos viejos dejan de decodificar.
- **DOM sin frameworks**: se usa `document.getElementById` directo. Si un
  loop crea elementos repetidos (mano de cartas, lista de jugadores), se
  arma con `document.createElement` + `className` de Tailwind, no con
  `innerHTML` armado a mano con interpolación de texto (evitar XSS aunque
  el contenido hoy sea siempre texto propio de los mazos).
- **Tailwind v4**: los colores/fonts custom se definen en `@theme` dentro de
  `global.css`, no hay archivo de config JS. Nuevos tokens de diseño van ahí.

## Pendientes / ideas para seguir

- **Tests unitarios reales** para `hostEngine.ts` (hoy solo hay chequeos
  manuales ad-hoc). Sería el primer punto a resolver si el proyecto crece;
  se presta bien a tests porque es una clase sin DOM ni red.
- **Migración de anfitrión**: si quien creó la sala cierra la app, la
  partida se corta para todos. Sería el pendiente más importante en
  robustez — requeriría elegir un nuevo anfitrión entre los peers
  conectados y que le pase el estado (o reconstruirlo desde lo último que
  cada peer tenga).
- **Mazos más grandes**: con partidas muy largas el mazo puede terminar
  reciclándose (`refillWhite`/`refillBlack` vuelven a mezclar todo el
  mazo), lo que puede repetir cartas ya vistas. Aceptable para una partida
  de sobremesa, pero valdría avisar en la UI si se quiere pulir.
- **PWA**: agregar `manifest.json` + ícono para permitir "agregar a
  pantalla de inicio" en el celular (hoy es solo una web mobile-first, no
  instalable).
- **Reconexión más prolija**: hoy si un invitado pierde conexión a mitad de
  ronda queda con `connected: false` y se lo excluye del conteo para
  destrabar la ronda (`checkReadyForJudging`); si vuelve a entrar con el
  mismo `token` recupera su puntaje, pero no hay aviso in-app de "fulano se
  desconectó" más allá de la lista de jugadores.

## Documentación de Astro

Documentación completa: https://docs.astro.build

Consultar antes de tocar temas relacionados:

- [Rutas, páginas dinámicas y middleware](https://docs.astro.build/en/guides/routing/)
- [Componentes de Astro](https://docs.astro.build/en/basics/astro-components/)
- [React, Vue, Svelte u otros frameworks](https://docs.astro.build/en/guides/framework-components/)
- [Content collections](https://docs.astro.build/en/guides/content-collections/)
- [Estilos / Tailwind](https://docs.astro.build/en/guides/styling/)
- [Internacionalización](https://docs.astro.build/en/guides/internationalization/)
