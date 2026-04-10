/**
 * backend/src/middleware/auth.middleware.ts
 * 
 * JWT authentication middleware.
 * Verifies token and attaches employee data to request.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db, COLLECTIONS } from '../config/firebase.config';
import type { EmployeeRecord } from '../types/attendance.types';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

interface JWTPayload {
  employeeId: string;
  iat: number;
  exp: number;
}

/**
 * Verify JWT token dari Authorization header.
 * Attach decoded employee data ke req.employee.
 * Return 401 jika invalid.
 */
export async function verifyJWT(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: { code: 'MISSING_TOKEN', message: 'Token pengesahan tidak ditemui' },
      });
      return;
    }

    const token = authHeader.split(' ')[1];

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

    // Fetch employee record from Firestore
    const employeeDoc = await db.collection(COLLECTIONS.EMPLOYEES).doc(decoded.employeeId).get();

    if (!employeeDoc.exists) {
      res.status(401).json({
        success: false,
        error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Akaun pekerja tidak dijumpai' },
      });
      return;
    }

    const employee = employeeDoc.data() as EmployeeRecord;

    if (employee.status !== 'ACTIVE') {
      res.status(401).json({
        success: false,
        error: { code: 'ACCOUNT_INACTIVE', message: 'Akaun tidak aktif. Hubungi HR.' },
      });
      return;
    }

    // Attach to request
    req.employee = employee;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Sesi tamat tempoh. Sila log masuk semula.' },
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Token tidak sah' },
      });
      return;
    }

    console.error('[Auth] JWT verification failed:', error);
    res.status(500).json({
      success: false,
      error: { code: 'AUTH_ERROR', message: 'Ralat pengesahan' },
    });
  }
}

/**
 * Generate JWT token for employee login.
 */
export function generateJWT(employeeId: string): string {
  return jwt.sign(
    { employeeId },
    JWT_SECRET,
    { expiresIn: '8h' } // 1 shift
  );
}
