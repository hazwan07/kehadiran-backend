/**
 * backend/src/routes/admin.routes.ts
 * 
 * Admin API routes untuk membekalkan data mentah ke Dashboard Vite.
 * (Versi MVP: Disasarkan tanpa Auth ketat buat sementara waktu)
 */

import { Router, Request, Response } from 'express';
import { db, COLLECTIONS } from '../config/firebase.config';
import type { AttendanceRecord, EmployeeRecord, ProjectSite } from '../types/attendance.types';

const router = Router();

/**
 * GET /api/v1/admin/attendance
 *
 * Mengembalikan semua rekod kehadiran tercantum sekali dengan
 * butiran Employee dan Project Site.
 */
router.get('/attendance', async (req: Request, res: Response): Promise<void> => {
  try {
    // Dapatkan Kehadiran dengan Susunan Tarikh Menurun
    const attendanceSnap = await db
      .collection(COLLECTIONS.ATTENDANCE_RECORDS)
      .orderBy('serverTimestamp', 'desc')
      .limit(200)
      .get();
      
    // Cache map untuk Pekerja dan Tapak
    const cachedEmployees = new Map<string, string>();
    const cachedSites = new Map<string, string>();

    const mergedRecords = [];

    // Lakukan gelung (Loop)
    for (const doc of attendanceSnap.docs) {
      const record = doc.data() as AttendanceRecord;
      
      // Ambil Nama Pekerja
      let employeeName = 'Tidak Diketahui';
      if (cachedEmployees.has(record.employeeId)) {
        employeeName = cachedEmployees.get(record.employeeId)!;
      } else {
        const empDoc = await db.collection(COLLECTIONS.EMPLOYEES).doc(record.employeeId).get();
        if (empDoc.exists) {
          employeeName = (empDoc.data() as EmployeeRecord).name;
          cachedEmployees.set(record.employeeId, employeeName);
        }
      }

      // Ambil Nama Tapak
      let siteName = 'Tidak Diketahui';
      if (cachedSites.has(record.projectSiteId)) {
        siteName = cachedSites.get(record.projectSiteId)!;
      } else {
        const siteDoc = await db.collection(COLLECTIONS.PROJECT_SITES).doc(record.projectSiteId).get();
        if (siteDoc.exists) {
          siteName = (siteDoc.data() as ProjectSite).name;
          cachedSites.set(record.projectSiteId, siteName);
        }
      }

      // Cantumkan
      mergedRecords.push({
        id: record.attendanceId,
        time: record.serverTimestamp,
        name: employeeName,
        site: siteName,
        distance: record.distanceFromSite,
        accuracy: record.gpsAccuracy,
        score: record.anomalyScore,
        status: record.status,
        type: record.checkType,
      });
    }

    res.status(200).json({
      success: true,
      data: mergedRecords
    });
  } catch (error) {
    console.error('[Admin] Gagal menarik rekod kehadiran:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Gagal mengekstrak data pangkalan' }
    });
  }
});

export default router;
