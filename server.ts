import express from 'express';
import { createServer as createViteServer } from 'vite';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  app.use(express.json());

  // Email route
  app.post('/api/send-evaluation-notification', async (req, res) => {
    const { evaluation } = req.body;
    
    // Setup transporter (use environment variables)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    try {
      await transporter.sendMail({
        from: '"Sistema de Qualidade Aeternu" <no-reply@aeternu.co.ao>',
        to: process.env.MANAGER_EMAIL,
        subject: `Nova Avaliação Submetida: ${evaluation.reference}`,
        text: `Uma nova avaliação foi submetida.\n\nReferência: ${evaluation.reference}\nCliente: ${evaluation.clientNameInput || evaluation.clientName}\nPontuação: ${evaluation.satisfactionRating}/5\nComentário: ${evaluation.comment}`,
      });
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Email error:', error);
      res.status(500).json({ success: false, error: 'Failed to send email' });
    }
  });

  // Vite middleware
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });
  app.use(vite.middlewares);

  app.listen(3000, () => {
    console.log('Server running on port 3000');
  });
}

startServer();
