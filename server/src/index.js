import { createApp } from './app.js';

// In dev the port is fixed because Vite proxies to it; PORT is for hosting platforms.
const port = process.argv.includes('--dev') ? 3001 : Number(process.env.PORT) || 3001;
const { server } = createApp();

server.listen(port, () => {
  console.log(`AirSkribbl server listening on http://localhost:${port}`);
  console.log(`Gemini judge: ${process.env.GEMINI_API_KEY ? 'on' : 'off, using built-in lines'}`);
});
