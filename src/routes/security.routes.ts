/**
 * backend/src/routes/security.routes.ts
 * 
 * Security event logging routes.
 * Receives security events from mobile app.
 * Append-only to Firestore security_events collection.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, COLLECTIONS } from '../config/firebase.config';

const router = Router();

/**
 * POST /api/security/events
 * 
 * Receive security event logs from app.
 * Return 200 always — jangan block app untuk ini.
 */
router.post('/events', async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId, deviceUUID, eventType, metadata, timestamp } = req.body;

    const eventId = uuidv4();

    await db.collection(COLLECTIONS.SECURITY_EVENTS).doc(eventId).set({
      eventId,
      employeeId: employeeId || 'unknown',
      deviceUUID: deviceUUID || 'unknown',
      eventType: eventType || 'UNKNOWN',
      metadata: metadata || {},
      timestamp: timestamp || Date.now(),
      resolvedAt: null,
      resolvedBy: null,
    });

    res.status(200).json({ success: true, eventId });
  } catch (error) {
    // Always return 200 — don't block app for logging failures
    console.error('[Security] Failed to log event:', error);
    res.status(200).json({ success: true, eventId: 'failed' });
  }
});

/**
 * GET /api/security/events
 * 
 * List security events (admin only).
 * TODO: Add admin auth middleware.
 */
router.get('/events', async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = '50', eventType } = req.query;
    const limitNum = Math.min(100, parseInt(limit as string));

    let query = db
      .collection(COLLECTIONS.SECURITY_EVENTS)
      .orderBy('timestamp', 'desc')
      .limit(limitNum);

    if (eventType) {
      query = query.where('eventType', '==', eventType);
    }

    const snapshot = await query.get();
    const events = snapshot.docs.map((doc) => doc.data());

    res.status(200).json({ success: true, data: events });
  } catch (error) {
    console.error('[Security] List events error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Gagal mendapatkan senarai event' },
    });
  }
});

export default router;
