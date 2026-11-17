import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();

  // Vite middleware
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });
  app.use(vite.middlewares);

  // Apenas desenvolvimento local: sem rotas próprias (o envio de e-mail é feito pela Edge Function notify-evaluation).
  app.listen(3000, '127.0.0.1', () => {
    console.log('Server running on port 3000');
  });
}

startServer();
