/**
 * backend/src/routes/admin.routes.ts
 * 
 * Admin API routes untuk membekalkan data mentah ke Dashboard Vite.
 * (Versi MVP: Disasarkan tanpa Auth ketat buat sementara waktu)
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
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
// ================== PEKERJA (EMPLOYEES) ==================

router.get('/employees', async (req: Request, res: Response): Promise<void> => {
  try {
    const snap = await db.collection(COLLECTIONS.EMPLOYEES).get();
    const employees = snap.docs.map(doc => doc.data() as EmployeeRecord);
    
    // Untuk mendapatkan jumlah peranti bagi setiap pekerja
    const devicesSnap = await db.collection(COLLECTIONS.DEVICES).get();
    const devicesList = devicesSnap.docs.map(doc => doc.data());

    const result = employees.map(emp => {
      const activeDevices = devicesList.filter(d => d.employeeId === emp.employeeId && d.status === 'ACTIVE');
      return {
        ...emp,
        devices: activeDevices.length
      };
    });

    // Susun mengikut Abjad
    result.sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('[Admin] Gagal menarik rekod pekerja:', error);
    res.status(500).json({ success: false, error: { message: error instanceof Error ? error.message : String(error) } });
  }
});

router.post('/employees', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, icNumber, department, pin } = req.body;
    if (!name || !icNumber) {
      res.status(400).json({ success: false, error: { message: 'Nama dan IC diperlukan' } });
      return;
    }

    const employeeRef = db.collection(COLLECTIONS.EMPLOYEES).doc();
    
    // Hash lalai PIN jika tidak diberi (contoh: 123456)
    const rawPin = pin || '123456';
    const hashedPin = await bcrypt.hash(rawPin, 10);

    const newEmployee: EmployeeRecord = {
      employeeId: employeeRef.id,
      name,
      icNumber,
      department: department || 'Am',
      projectSiteIds: [],
      photoUrl: '',
      status: 'ACTIVE',
      pin: hashedPin
    };

    await employeeRef.set(newEmployee);
    res.status(201).json({ success: true, data: { ...newEmployee, devices: 0 } });
  } catch (error) {
    console.error('[Admin] Gagal tambah pekerja:', error);
    res.status(500).json({ success: false, error: { message: error instanceof Error ? error.message : String(error) } });
  }
});

router.put('/employees/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { name, icNumber, department, status, revokeDevices } = req.body;
    
    const employeeRef = db.collection(COLLECTIONS.EMPLOYEES).doc(id);
    const doc = await employeeRef.get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: { message: 'Pekerja tidak dijumpai' } });
      return;
    }

    const updateData: Partial<EmployeeRecord> = {};
    if (name) updateData.name = name;
    if (icNumber) updateData.icNumber = icNumber;
    if (department) updateData.department = department;
    if (status) updateData.status = status;

    await employeeRef.update(updateData);

    if (revokeDevices || status === 'INACTIVE') {
      const devicesSnap = await db.collection(COLLECTIONS.DEVICES).where('employeeId', '==', id).get();
      const batch = db.batch();
      devicesSnap.docs.forEach(d => {
        batch.update(d.ref, { status: 'REVOKED' });
      });
      await batch.commit();
    }

    res.status(200).json({ success: true, data: { employeeId: id, ...updateData } });
  } catch (error) {
    console.error('[Admin] Gagal kemaskini pekerja:', error);
    res.status(500).json({ success: false, error: { message: error instanceof Error ? error.message : String(error) } });
  }
});

// ================== LOKASI / TAPAK (SITES) ==================

router.get('/sites', async (req: Request, res: Response): Promise<void> => {
  try {
    const snap = await db.collection(COLLECTIONS.PROJECT_SITES).get();
    const sites = snap.docs.map(doc => doc.data() as ProjectSite);
    
    // Jumlah pekerja yang ditugaskan ke tapak ini
    const empSnap = await db.collection(COLLECTIONS.EMPLOYEES).get();
    const employees = empSnap.docs.map(doc => doc.data() as EmployeeRecord);

    const result = sites.map(site => {
      // Simplification: Assume workers are all for now if site mapping is loose, or map correctly
      const totalWorkers = employees.filter(e => e.projectSiteIds?.includes(site.siteId)).length;
      return {
        ...site,
        workers: totalWorkers > 0 ? totalWorkers : employees.length, // Fallback dummy stat if empty
        active: Math.floor(Math.random() * 5), // Mocked for live dashboard active
      };
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('[Admin] Gagal menarik rekod lokasi:', error);
    res.status(500).json({ success: false, error: { message: error instanceof Error ? error.message : String(error) } });
  }
});

router.post('/sites', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, address, latitude, longitude, geofenceRadius } = req.body;
    if (!name || latitude === undefined || longitude === undefined) {
      res.status(400).json({ success: false, error: { message: 'Nama dan Koordinat diperlukan' } });
      return;
    }

    const siteRef = db.collection(COLLECTIONS.PROJECT_SITES).doc();
    
    const newSite: ProjectSite = {
      siteId: siteRef.id,
      name,
      address: address || '',
      latitude: Number(latitude),
      longitude: Number(longitude),
      geofenceRadius: Number(geofenceRadius) || 150,
      activeShifts: [],
      adminIds: []
    };

    await siteRef.set(newSite);
    res.status(201).json({ success: true, data: { ...newSite, workers: 0, active: 0 } });
  } catch (error) {
    console.error('[Admin] Gagal tambah tapak:', error);
    res.status(500).json({ success: false, error: { message: error instanceof Error ? error.message : String(error) } });
  }
});

router.put('/sites/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { name, address, latitude, longitude, geofenceRadius } = req.body;
    
    const siteRef = db.collection(COLLECTIONS.PROJECT_SITES).doc(id);
    const doc = await siteRef.get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: { message: 'Lokasi tidak dijumpai' } });
      return;
    }

    const updateData: Partial<ProjectSite> = {};
    if (name) updateData.name = name;
    if (address) updateData.address = address;
    if (latitude !== undefined) updateData.latitude = Number(latitude);
    if (longitude !== undefined) updateData.longitude = Number(longitude);
    if (geofenceRadius !== undefined) updateData.geofenceRadius = Number(geofenceRadius);

    await siteRef.update(updateData);

    res.status(200).json({ success: true, data: { siteId: id, ...updateData } });
  } catch (error) {
    console.error('[Admin] Gagal kemaskini tapak:', error);
    res.status(500).json({ success: false, error: { message: error instanceof Error ? error.message : String(error) } });
  }
});

export default router;
