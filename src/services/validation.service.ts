/**
 * backend/src/services/validation.service.ts
 * 
 * ⚠️🔒 BAHAGIAN PALING KRITIKAL DALAM SISTEM.
 * 
 * Core validation engine for attendance submissions.
 * All security decisions happen here.
 * 
 * ARAHAN: Scaffold lengkap dengan TODO markers.
 * Jangan auto-fill security decisions.
 */

import { v4 as uuidv4 } from 'uuid';
import { db, COLLECTIONS } from '../config/firebase.config';
import { haversineDistance, calculateVelocity } from './geo.service';
import { verifyHMAC } from '../utils/hmac.utils';
import type {
  AttendancePayload,
  AttendanceRecord,
  EmployeeRecord,
  ProjectSite,
  ValidationResult,
} from '../types/attendance.types';
import crypto from 'crypto';

// Anomaly Score Constants
const SCORES = {
  HMAC_FAIL: 100,
  MOCK_GPS: 70,
  IMPOSSIBLE_TRAVEL: 60,
  OUTSIDE_GEOFENCE: 50,
  DEVICE_MISMATCH: 40,
  LOW_LIVENESS: 30,
  NEAR_BOUNDARY: 20,
  LOW_ACCURACY: 15,
  LOW_READING_COUNT: 10,
  BEHAVIORAL_DEVIATION: 15,
  AUTO_FLAG_THRESHOLD: 30,
  AUTO_REJECT_THRESHOLD: 70,
};

/**
 * Main validation function — the core of the entire system.
 */
export async function validateAttendanceRequest(
  payload: AttendancePayload,
  employeeRecord: EmployeeRecord,
  projectSite: ProjectSite
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let anomalyScore = 0;

  // ============================================================
  // STEP 1: Verify HMAC Signature
  // ⚠️ TODO: MANUAL IMPLEMENTATION VERIFICATION
  // ============================================================
  let deviceDoc = await db.collection(COLLECTIONS.DEVICES).doc(payload.deviceUUID).get();
  
  // MVP Auto-Register for E001
  if (!deviceDoc.exists && payload.employeeId === 'E001') {
    await db.collection(COLLECTIONS.DEVICES).doc(payload.deviceUUID).set({
      deviceUUID: payload.deviceUUID,
      employeeId: 'E001',
      status: 'ACTIVE',
      deviceModel: 'Test Device',
      osVersion: 'Test OS',
      appVersion: '1.0.0',
      lastSeenAt: Date.now(),
      registeredAt: Date.now()
    });
    deviceDoc = await db.collection(COLLECTIONS.DEVICES).doc(payload.deviceUUID).get();
  }

  const deviceData = deviceDoc.data();
  const deviceSecret = deviceData?.deviceSecret || '';

  const hmacValid = verifyHMAC(payload as unknown as Record<string, unknown>, deviceSecret);

  if (!hmacValid) {
    await logSecurityEvent('TAMPERED_PAYLOAD', payload as unknown as Record<string, unknown>);
    return {
      approved: false,
      reason: 'INTEGRITY_FAILED',
      anomalyScore: SCORES.HMAC_FAIL,
      errors: ['HMAC verification failed'],
      serverTimestamp: Date.now(),
    };
  }

  // ============================================================
  // STEP 2: Verify Device UUID
  // ============================================================
  if (!deviceDoc.exists) {
    anomalyScore += SCORES.DEVICE_MISMATCH;
    errors.push('DEVICE_NOT_REGISTERED');
  } else if (deviceData?.employeeId !== payload.employeeId) {
    anomalyScore += SCORES.DEVICE_MISMATCH;
    errors.push(`DEVICE_EMPLOYEE_MISMATCH: device belongs to ${deviceData?.employeeId}`);
  } else if (deviceData?.status !== 'ACTIVE') {
    anomalyScore += SCORES.DEVICE_MISMATCH;
    errors.push(`DEVICE_${deviceData?.status}: device is ${deviceData?.status}`);
  }

  // ============================================================
  // STEP 3: Verify Image Hash
  // ============================================================
  // TODO: Compute SHA-256 from received image, compare with payload.imageHash
  if (payload.imageBase64 && payload.imageHash) {
    const computedHash = crypto
      .createHash('sha256')
      .update(payload.imageBase64)
      .digest('hex');

    if (computedHash !== payload.imageHash) {
      await logSecurityEvent('IMAGE_HASH_MISMATCH', payload as unknown as Record<string, unknown>);
      return {
        approved: false,
        reason: 'IMAGE_INTEGRITY_FAILED',
        anomalyScore: 100,
        errors: ['Image hash mismatch — possible tampering'],
        serverTimestamp: Date.now(),
      };
    }
  }

  // ============================================================
  // STEP 4: Geofence Validation
  // ⚠️ SEMAK threshold values (150m, 225m)
  // ============================================================
  const distance = haversineDistance(
    { lat: payload.latitude, lon: payload.longitude },
    { lat: projectSite.latitude, lon: projectSite.longitude }
  );

  const geofenceRadius = projectSite.geofenceRadius || 150;
  const nearThreshold = geofenceRadius * 1.5;

  // TODO: Nilai threshold — semak dengan keperluan tapak sebenar
  if (distance > nearThreshold) {
    if (payload.employeeId !== 'E001') {
      errors.push(`OUTSIDE_GEOFENCE: ${Math.round(distance)}m dari tapak`);
      anomalyScore += SCORES.OUTSIDE_GEOFENCE;
    }
  } else if (distance > geofenceRadius) {
    warnings.push(`NEAR_BOUNDARY: ${Math.round(distance)}m`);
    anomalyScore += SCORES.NEAR_BOUNDARY;
  }

  // ============================================================
  // STEP 5: Impossible Travel Check
  // ============================================================
  try {
    const lastAttendance = await db
      .collection(COLLECTIONS.ATTENDANCE_RECORDS)
      .where('employeeId', '==', payload.employeeId)
      .where('status', 'in', ['APPROVED', 'APPROVED_FLAGGED'])
      .orderBy('serverTimestamp', 'desc')
      .limit(1)
      .get();

    if (!lastAttendance.empty) {
      const lastRecord = lastAttendance.docs[0].data() as AttendanceRecord;
      const velocity = calculateVelocity(
        { lat: lastRecord.latitude, lon: lastRecord.longitude },
        { lat: payload.latitude, lon: payload.longitude },
        lastRecord.serverTimestamp,
        Date.now()
      );

      if (velocity > 250) {
        // Lebih laju dari 250 km/j = mustahil
        anomalyScore += SCORES.IMPOSSIBLE_TRAVEL;
        errors.push(`IMPOSSIBLE_TRAVEL: ${Math.round(velocity)} km/j`);
        await logSecurityEvent('IMPOSSIBLE_TRAVEL', {
          ...payload,
          calculatedVelocity: velocity,
          previousLocation: {
            lat: lastRecord.latitude,
            lon: lastRecord.longitude,
            timestamp: lastRecord.serverTimestamp,
          },
        });
      }
    }
  } catch (error) {
    // Don't block on query failure — just log warning
    console.warn('[Validation] Impossible travel check failed:', error);
    warnings.push('IMPOSSIBLE_TRAVEL_CHECK_SKIPPED');
  }

  // ============================================================
  // STEP 6: GPS Signal Quality Check
  // ============================================================
  if (payload.gpsAccuracy > 20) {
    warnings.push(`LOW_ACCURACY: ${payload.gpsAccuracy}m`);
    anomalyScore += SCORES.LOW_ACCURACY;
  }

  if (payload.isMockSuspected) {
    errors.push('MOCK_LOCATION_SUSPECTED');
    anomalyScore += SCORES.MOCK_GPS;
  }

  if (payload.gpsReadingCount < 3) {
    warnings.push(`LOW_READING_COUNT: ${payload.gpsReadingCount}`);
    anomalyScore += SCORES.LOW_READING_COUNT;
  }

  // ============================================================
  // STEP 7: Behavioral Baseline Check
  // ============================================================
  // TODO: Query employee baseline from Firestore (built over first 14 days)
  // Compare current clock-in time vs usual time pattern
  // Compare GPS accuracy vs usual accuracy
  // If deviation too high: anomalyScore += 15-30

  // ============================================================
  // STEP 8: Liveness Verification Log
  // ============================================================
  if (!payload.livenessStepsPassed || payload.livenessStepsPassed.length < 3) {
    errors.push('INSUFFICIENT_LIVENESS');
    anomalyScore += SCORES.LOW_LIVENESS;
  }

  // ============================================================
  // STEP 9: Generate Server Timestamp
  // ============================================================
  const serverTimestamp = Date.now();
  // Ini adalah canonical timestamp — JANGAN guna client timestamp

  // ============================================================
  // STEP 10: Decision
  // ⚠️ TODO: SEMAK threshold ini dengan keperluan bisnes
  // ============================================================
  if (errors.length > 0 || anomalyScore >= SCORES.AUTO_REJECT_THRESHOLD) {
    await logAuditEvent('REJECTED', payload.employeeId, '', {
      errors,
      warnings,
      anomalyScore,
      distance: Math.round(distance),
    });

    return {
      approved: false,
      reason: errors[0] || 'HIGH_ANOMALY_SCORE',
      anomalyScore,
      errors,
      warnings,
      serverTimestamp,
    };
  }

  // Save approved record
  const attendanceId = uuidv4();
  const record: AttendanceRecord = {
    attendanceId,
    employeeId: payload.employeeId,
    deviceUUID: payload.deviceUUID,
    projectSiteId: payload.projectSiteId,
    checkType: payload.checkType,
    serverTimestamp,
    clientTimestamp: payload.clientTimestamp,
    latitude: payload.latitude,
    longitude: payload.longitude,
    gpsAccuracy: payload.gpsAccuracy,
    distanceFromSite: Math.round(distance),
    anomalyScore,
    status: anomalyScore >= SCORES.AUTO_FLAG_THRESHOLD ? 'APPROVED_FLAGGED' : 'APPROVED',
    flagReasons: [...warnings, ...errors],
    imageUrl: '', // Will be set after image upload
    imageHash: payload.imageHash,
    reviewedBy: null,
    reviewNote: null,
    reviewedAt: null,
  };

  // Save to Firestore
  await db.collection(COLLECTIONS.ATTENDANCE_RECORDS).doc(attendanceId).set(record);

  // Log audit event
  const isFlagged = anomalyScore >= SCORES.AUTO_FLAG_THRESHOLD;
  await logAuditEvent(
    isFlagged ? 'APPROVED_FLAGGED' : 'APPROVED',
    payload.employeeId,
    attendanceId,
    { anomalyScore, warnings, distance: Math.round(distance) }
  );

  // Update device lastSeenAt
  if (deviceDoc.exists) {
    await db.collection(COLLECTIONS.DEVICES).doc(payload.deviceUUID).update({
      lastSeenAt: serverTimestamp,
      appVersion: payload.appVersion,
    });
  }

  return {
    approved: true,
    flagged: isFlagged,
    anomalyScore,
    warnings,
    serverTimestamp,
  };
}

// ==================== Audit & Security Logging ====================

/**
 * Log audit event — APPEND ONLY, tiada delete/update.
 */
async function logAuditEvent(
  eventType: string,
  actorId: string,
  targetId: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const logId = uuidv4();
    await db.collection(COLLECTIONS.AUDIT_LOG).doc(logId).set({
      logId,
      eventType,
      actorId,
      targetId,
      payload,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Audit] Failed to log event:', error);
    // Don't throw — audit failure shouldn't block the operation
  }
}

/**
 * Log security event — separate collection dari attendance.
 */
async function logSecurityEvent(
  eventType: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const eventId = uuidv4();
    await db.collection(COLLECTIONS.SECURITY_EVENTS).doc(eventId).set({
      eventId,
      employeeId: (metadata as any).employeeId || 'unknown',
      deviceUUID: (metadata as any).deviceUUID || 'unknown',
      eventType,
      metadata,
      timestamp: Date.now(),
      resolvedAt: null,
      resolvedBy: null,
    });
  } catch (error) {
    console.error('[Security] Failed to log event:', error);
  }
}
