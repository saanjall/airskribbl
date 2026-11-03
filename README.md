# AirSkribbl

A multiplayer party game: draw in the air with your finger, and your friends guess in real time.

## Run it

Needs Node 22.9 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173. To try multiplayer on one machine, open a second tab: each tab is its own player.

`npm install` also copies the MediaPipe runtime into `client/public/mediapipe` and downloads the hand model (about 8 MB). If that download fails, the browser fetches the model from Google instead. Run `npm run setup:mediapipe` to retry.

## Run a production build

```bash
npm run build
npm start
```

The server hosts the game and the built client together on http://localhost:3001 (set `PORT` to change it).

Browsers only share a webcam on `localhost` or HTTPS, so friends on other devices need an HTTPS deployment or tunnel. Without one they can still guess and draw with a mouse or touch.

Rooms live in memory, so restarting the server ends all games, and the server must run as a single instance.

## Deploy

`render.yaml` sets up a Render web service. In Render, choose New, then Blueprint, and connect this repository. Hosts must support WebSockets, serve HTTPS, and install dev dependencies at build time, because Vite is one.

## How to draw

The camera preview in the corner shows your hand skeleton and a dashed box. That box is the canvas: your finger draws while it is inside. Other players only ever receive the drawing, never the video.

| Gesture | Action |
| --- | --- |
| Raise your hand and hold it up | Get ready (the camera panel says Ready) |
| Point with your index finger | Draw |
| Curl your finger or close your hand | Lift the pen |
| Hold your finger still for a moment | Finish the line or place the shape; curl and point to start again |
| Open palm, held briefly | Pause drawing |
| With the eraser selected, swipe your open hand | Wipe the canvas, like cleaning a window |

To draw a shape, pick the line, rectangle, circle or triangle tool. Drag with the mouse, or point and move your finger, then let go, curl your finger or hold still to place it. A circle grows from where you start, with its edge at your finger. Placing a shape switches back to the brush, so pick the tool again for another one.

To fill an area, pick the bucket. With your hand, point inside a closed shape and hold for a moment, then move to the next one. Hand fill ignores open areas so a pause can't flood the picture; to fill the background, click it with the mouse. Fill spreads through any gap in a line, so close your shapes first.

Lowering your hand for more than about a second means raising it again before you can draw.

## AI judge (optional)

Copy `.env.example` to `.env` and set `GEMINI_API_KEY`. Gemini then writes the end-of-round comment, working from the word, the number of correct guesses and the stroke count. It does not see the picture. Without a key, or if a request fails, built-in lines are used.

## Tests

```bash
npm test
```

Covers gesture logic in `client/test` and the game server, over real sockets, in `server/test`.

## Layout

- `client/src/tracking`: webcam, MediaPipe and gesture recognition. `gestures.js` is pure logic.
- `client/src/drawing`: canvas engine, board, toolbar and network batching.
- `client/src/game`: lobby, game screen, chat and the socket connection.
- `server/src/Room.js`: all authoritative game state, with no socket code.
- `server/src/app.js`: Express and Socket.IO wiring.
- `shared/constants.js`: values both sides must agree on.
