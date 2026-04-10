/**
 * backend/src/middleware/rateLimit.middleware.ts
 * 
 * Rate limiting middleware.
 * - Max 10 requests per 10 minit per deviceUUID
 * - Max 3 gagal berturutan per employeeId → lock 15 minit
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// ==================== Per-Device Rate Limiter ====================

/**
 * Rate limit: 10 requests per 10 minutes per device UUID.
 */
export const deviceRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minit
  max: 10,
  keyGenerator: (req: Request): string => {
    // Use device UUID from body or IP as fallback
    return req.body?.deviceUUID || req.ip || 'unknown';
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Terlalu banyak percubaan. Sila cuba selepas 10 minit.',
      },
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==================== Failed Attempt Tracker ====================

// In-memory store for development — use Redis in production
const failedAttempts: Map<string, { count: number; lockedUntil: number | null }> = new Map();

/**
 * Track failed login/submission attempts.
 * Lock employee for 15 minutes after 3 consecutive failures.
 */
export function trackFailedAttempt(employeeId: string): {
  locked: boolean;
  remainingMinutes?: number;
} {
  const now = Date.now();
  const record = failedAttempts.get(employeeId) || { count: 0, lockedUntil: null };

  // Check if currently locked
  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingMs = record.lockedUntil - now;
    return {
      locked: true,
      remainingMinutes: Math.ceil(remainingMs / 60000),
    };
  }

  // If was locked but expired, reset
  if (record.lockedUntil && now >= record.lockedUntil) {
    record.count = 0;
    record.lockedUntil = null;
  }

  // Increment count
  record.count++;

  // Lock after 3 failures
  if (record.count >= 3) {
    record.lockedUntil = now + (15 * 60 * 1000); // 15 minit
    failedAttempts.set(employeeId, record);
    return { locked: true, remainingMinutes: 15 };
  }

  failedAttempts.set(employeeId, record);
  return { locked: false };
}

/**
 * Reset failed attempts on successful action.
 */
export function resetFailedAttempts(employeeId: string): void {
  failedAttempts.delete(employeeId);
}

/**
 * Check if employee is currently locked out.
 */
export function isLockedOut(employeeId: string): {
  locked: boolean;
  remainingMinutes?: number;
} {
  const record = failedAttempts.get(employeeId);
  if (!record?.lockedUntil) return { locked: false };

  const now = Date.now();
  if (now >= record.lockedUntil) {
    // Lock expired
    failedAttempts.delete(employeeId);
    return { locked: false };
  }

  return {
    locked: true,
    remainingMinutes: Math.ceil((record.lockedUntil - now) / 60000),
  };
}
