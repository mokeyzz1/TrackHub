import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*', // Allow all origins for local development
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// API routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Track Hub API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      performances: '/api/performances',
      ncaaPerformances: '/api/performances/ncaa',
      athleteSearch: '/api/athletes/search?q=<name>',
      athleteDetails: '/api/athletes/:id',
      athletePerformances: '/api/athletes/:id/performances',
      schoolSearch: '/api/schools/search?q=<name>',
      schoolDetails: '/api/schools/:id',
      events: '/api/events',
    },
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Track Hub API server running on http://localhost:${PORT}`);
  console.log(`📊 Database: SQLite (track_hub.db)`);
  console.log(`📍 API Documentation: http://localhost:${PORT}\n`);
});

export default app;
