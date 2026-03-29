import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import webhookRoutes from './routes/webhooks';
import accessRoutes from './routes/access';
import mentorsRoutes from './routes/mentors';

dotenv.config();

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use('/webhooks', express.raw({ type: 'application/json', limit: '10mb' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req: express.Request, res: express.Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/webhooks', webhookRoutes);
  app.use('/access', accessRoutes);
  app.use('/mentors', mentorsRoutes);

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
  });

  app.use('*', (_req: express.Request, res: express.Response) => {
    res.status(404).json({ error: 'Route not found' });
  });

  return app;
}

const app = createApp();

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

export default app;
