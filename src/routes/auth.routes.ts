/**
 * backend/src/routes/auth.routes.ts
 * 
 * Authentication routes — login, verify token.
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db, COLLECTIONS } from '../config/firebase.config';
import { generateJWT, verifyJWT } from '../middleware/auth.middleware';
import { isLockedOut, trackFailedAttempt, resetFailedAttempts } from '../middleware/rateLimit.middleware';
import type { EmployeeRecord } from '../types/attendance.types';

const router = Router();

/**
 * POST /api/v1/auth/login
 * 
 * Login with Employee ID + PIN.
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId, pin } = req.body;

    // Validate input
    if (!employeeId || !pin) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CREDENTIALS',
          message: 'Sila masukkan ID pekerja dan PIN',
        },
      });
      return;
    }

    // Check lockout
    const lockoutStatus = isLockedOut(employeeId);
    if (lockoutStatus.locked) {
      res.status(429).json({
        success: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: `Akaun dikunci. Cuba selepas ${lockoutStatus.remainingMinutes} minit.`,
        },
      });
      return;
    }

    // Fetch employee
    const employeeDoc = await db.collection(COLLECTIONS.EMPLOYEES).doc(employeeId).get();

    if (!employeeDoc.exists) {
      trackFailedAttempt(employeeId);
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'ID pekerja atau PIN tidak sah',
        },
      });
      return;
    }

    const employee = employeeDoc.data() as EmployeeRecord;

    // Check account status
    if (employee.status !== 'ACTIVE') {
      res.status(401).json({
        success: false,
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'Akaun tidak aktif. Hubungi HR.',
        },
      });
      return;
    }

    // Verify PIN with bcrypt
    const isValidPin = await bcrypt.compare(pin, employee.pin);
    if (!isValidPin) {
      const result = trackFailedAttempt(employeeId);
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: result.locked
            ? `Terlalu banyak percubaan gagal. Akaun dikunci ${result.remainingMinutes} minit.`
            : 'ID pekerja atau PIN tidak sah',
        },
      });
      return;
    }

    // Success — reset failed attempts and generate token
    resetFailedAttempts(employeeId);

    const token = generateJWT(employeeId);

    // Sanitize employee data (remove sensitive fields)
    const { pin: _, ...safeEmployee } = employee;

    res.status(200).json({
      success: true,
      data: {
        token,
        employee: safeEmployee,
        deviceRegistered: true,
      },
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Ralat sistem' },
    });
  }
});

/**
 * GET /api/v1/auth/verify
 * 
 * Verify current token is still valid.
 */
router.get('/verify', verifyJWT, (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      employee: req.employee,
      valid: true,
    },
  });
});

export default router;
