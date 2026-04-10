/**
 * backend/src/index.ts
 * 
 * Express server entry point.
 * API Gateway for Sistem Kehadiran Pekerja.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import attendanceRoutes from './routes/attendance.routes';
import authRoutes from './routes/auth.routes';
import securityRoutes from './routes/security.routes';
import adminRoutes from './routes/admin.routes'; // Tambahan laluan Admin

const app = express();
const PORT = process.env.PORT || 3001;

// ==================== Middleware ====================

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// Body parser — increased limit for image base64
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(morgan('combined'));

// ==================== Routes ====================

// Health check
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    version: '1.0.0',
    service: 'Kehadiran Backend API',
  });
});

// API v1
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/v1/admin', adminRoutes); // Dashboard Admin Fetch API

// ==================== Error Handling ====================

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint tidak dijumpai',
    },
  });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ralat dalaman pelayan',
      // Don't expose error details to client
    },
  });
});

// ==================== Start Server ====================

app.listen(PORT, () => {
  console.log(`\n🚀 Kehadiran Backend API berjalan di port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔐 Auth: http://localhost:${PORT}/api/v1/auth`);
  console.log(`📋 Attendance: http://localhost:${PORT}/api/v1/attendance`);
  console.log(`🛡️  Security: http://localhost:${PORT}/api/security`);
  console.log('');
});

export default app;
