/**
 * backend/src/routes/attendance.routes.ts
 * 
 * Attendance API routes.
 */

import { Router, Request, Response } from 'express';
import { verifyJWT } from '../middleware/auth.middleware';
import { deviceRateLimit } from '../middleware/rateLimit.middleware';
import { checkNonce } from '../middleware/nonce.middleware';
import { validateAttendanceRequest } from '../services/validation.service';
import { db, COLLECTIONS } from '../config/firebase.config';
import type { ProjectSite, AttendanceRecord } from '../types/attendance.types';

const router = Router();

/**
 * POST /api/v1/attendance
 * 
 * Submit attendance record.
 * Middleware chain: [verifyJWT, rateLimit, checkNonce]
 */
router.post(
  '/',
  verifyJWT,
  deviceRateLimit,
  checkNonce,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const payload = req.body;
      const employee = req.employee!;

      // Fetch project site
      const siteDoc = await db
        .collection(COLLECTIONS.PROJECT_SITES)
        .doc(payload.projectSiteId)
        .get();

      if (!siteDoc.exists) {
        res.status(400).json({
          success: false,
          error: {
            code: 'SITE_NOT_FOUND',
            message: 'Tapak projek tidak dijumpai',
          },
        });
        return;
      }

      const projectSite = siteDoc.data() as ProjectSite;

      // Validate
      const result = await validateAttendanceRequest(payload, employee, projectSite);

      if (!result.approved) {
        const statusCode = result.reason === 'DUPLICATE_REQUEST' ? 409 : 422;
        res.status(statusCode).json({
          success: false,
          error: {
            code: result.reason || 'VALIDATION_FAILED',
            message: getErrorMessage(result.reason || ''),
            details: {
              anomalyScore: result.anomalyScore,
              errors: result.errors,
              warnings: result.warnings,
            },
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          anomalyScore: result.anomalyScore,
          flagged: result.flagged,
          serverTimestamp: result.serverTimestamp,
          warnings: result.warnings,
        },
      });
    } catch (error) {
      console.error('[Attendance] Submit error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Ralat sistem. Sila cuba lagi.',
        },
      });
    }
  }
);

/**
 * GET /api/v1/attendance/history
 * 
 * Fetch attendance history for authenticated employee.
 * Query params: startDate, endDate, projectSiteId, page, limit
 */
router.get('/history', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const employee = req.employee!;
    const {
      startDate,
      endDate,
      projectSiteId,
      page = '1',
      limit = '50',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, parseInt(limit as string));

    let query = db
      .collection(COLLECTIONS.ATTENDANCE_RECORDS)
      .where('employeeId', '==', employee.employeeId)
      .orderBy('serverTimestamp', 'desc');

    if (projectSiteId) {
      query = query.where('projectSiteId', '==', projectSiteId);
    }

    if (startDate) {
      query = query.where('serverTimestamp', '>=', new Date(startDate as string).getTime());
    }

    if (endDate) {
      query = query.where('serverTimestamp', '<=', new Date(endDate as string).getTime());
    }

    // Pagination
    const offset = (pageNum - 1) * limitNum;
    const snapshot = await query.offset(offset).limit(limitNum).get();

    const records: AttendanceRecord[] = snapshot.docs.map(
      (doc) => doc.data() as AttendanceRecord
    );

    res.status(200).json({
      success: true,
      data: {
        records,
        total: records.length,
        page: pageNum,
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('[Attendance] History error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Gagal mendapatkan rekod kehadiran',
      },
    });
  }
});

// Error message mapper (BM)
function getErrorMessage(reason: string): string {
  const messages: Record<string, string> = {
    INTEGRITY_FAILED: 'Integriti data gagal. Hubungi IT Support.',
    IMAGE_INTEGRITY_FAILED: 'Gambar telah diubahsuai. Sila tangkap semula.',
    DEVICE_NOT_REGISTERED: 'Peranti tidak berdaftar. Hubungi HR.',
    DEVICE_EMPLOYEE_MISMATCH: 'Peranti tidak sepadan. Hubungi IT.',
    OUTSIDE_GEOFENCE: 'Anda berada di luar kawasan tapak.',
    MOCK_LOCATION_SUSPECTED: 'Lokasi palsu dikesan. Matikan VPN/mock location.',
    IMPOSSIBLE_TRAVEL: 'Pergerakan mencurigakan dikesan.',
    INSUFFICIENT_LIVENESS: 'Pengesahan muka tidak lengkap. Cuba lagi.',
    HIGH_ANOMALY_SCORE: 'Terlalu banyak anomali. Hubungi pengurus.',
    DUPLICATE_REQUEST: 'Kehadiran sudah direkod.',
  };
  
  // Cari padanan awalan (starts with) untuk menangani ralat dinamik (e.g. "OUTSIDE_GEOFENCE: 50m")
  for (const key in messages) {
    if (reason.startsWith(key)) {
      return messages[key];
    }
  }
  
  return reason || 'UNDEFINED_REASON_ERROR';
}

export default router;
