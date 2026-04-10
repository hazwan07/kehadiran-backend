/**
 * backend/src/types/attendance.types.ts
 * 
 * Shared types for backend attendance system.
 */

export interface AttendancePayload {
  employeeId: string;
  deviceUUID: string;
  appVersion: string;
  latitude: number;
  longitude: number;
  gpsAccuracy: number;
  gpsReadingCount: number;
  isMockSuspected: boolean;
  imageBase64: string;
  imageHash: string;
  livenessStepsPassed: string[];
  nonce: string;
  clientTimestamp: number;
  hmacSignature: string;
  projectSiteId: string;
  checkType: 'CLOCK_IN' | 'CLOCK_OUT';
  integrityToken?: string;
}

export interface AttendanceRecord {
  attendanceId: string;
  employeeId: string;
  deviceUUID: string;
  projectSiteId: string;
  checkType: 'CLOCK_IN' | 'CLOCK_OUT';
  serverTimestamp: number;
  clientTimestamp: number;
  latitude: number;
  longitude: number;
  gpsAccuracy: number;
  distanceFromSite: number;
  anomalyScore: number;
  status: 'APPROVED' | 'APPROVED_FLAGGED' | 'REJECTED';
  flagReasons: string[];
  imageUrl: string;
  imageHash: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  reviewedAt: number | null;
}

export interface EmployeeRecord {
  employeeId: string;
  name: string;
  icNumber: string;
  department: string;
  projectSiteIds: string[];
  photoUrl: string;
  status: 'ACTIVE' | 'INACTIVE';
  pin?: string; // hashed
}

export interface ProjectSite {
  siteId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  geofenceRadius: number;
  activeShifts: ShiftSchedule[];
  adminIds: string[];
}

export interface ShiftSchedule {
  name: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
}

export interface DeviceRecord {
  deviceUUID: string;
  employeeId: string;
  deviceModel: string;
  osVersion: string;
  appVersion: string;
  registeredAt: number;
  lastSeenAt: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  deviceSecret: string;
}

export interface ValidationResult {
  approved: boolean;
  flagged?: boolean;
  reason?: string;
  anomalyScore: number;
  serverTimestamp?: number;
  errors?: string[];
  warnings?: string[];
}

export interface AuditLogEntry {
  logId: string;
  eventType: string;
  actorId: string;
  targetId: string;
  payload: Record<string, unknown>;
  ipAddress: string;
  timestamp: number;
}

export interface SecurityEvent {
  eventId: string;
  employeeId: string;
  deviceUUID: string;
  eventType: string;
  metadata: Record<string, unknown>;
  timestamp: number;
  resolvedAt: number | null;
  resolvedBy: string | null;
}

// Express Request augmentation
declare global {
  namespace Express {
    interface Request {
      employee?: EmployeeRecord;
      deviceUUID?: string;
    }
  }
}
