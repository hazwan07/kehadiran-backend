/**
 * backend/src/config/firebase.config.ts
 * 
 * Firebase Admin SDK initialization.
 * Uses service account for server-side operations.
 */

import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin
// In production, use GOOGLE_APPLICATION_CREDENTIALS env var
// pointing to service-account.json
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'kehadiran-dev.appspot.com',
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  } else {
    // Development fallback — use project ID only
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'kehadiran-dev',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'kehadiran-dev.appspot.com',
    });
    console.warn('[Firebase] Running without service account credentials — development mode');
  }
}

export const db = admin.firestore();
export const storage = admin.storage();
export const auth = admin.auth();

// Collection references
export const COLLECTIONS = {
  EMPLOYEES: 'employees',
  DEVICES: 'devices',
  PROJECT_SITES: 'project_sites',
  ATTENDANCE_RECORDS: 'attendance_records',
  AUDIT_LOG: 'audit_log',
  SECURITY_EVENTS: 'security_events',
  NONCE_STORE: 'nonce_store',
} as const;

export default admin;
