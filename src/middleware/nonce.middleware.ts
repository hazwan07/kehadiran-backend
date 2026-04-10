/**
 * backend/src/middleware/nonce.middleware.ts
 * 
 * Anti-replay protection middleware.
 * 
 * ⚠️ SEMAK MANUAL — Ini adalah anti-replay protection kritikal.
 * JANGAN simplify atau skip.
 * 
 * Rules:
 * - Sebelum proses request: semak nonce dalam store
 * - Jika ada: return 409 "Duplicate request detected"
 * - Jika tiada: simpan nonce dengan TTL 300 saat
 * - Semak juga: abs(serverTime - clientTimestamp) > 300000ms → reject
 */

import { Request, Response, NextFunction } from 'express';

// ==================== Nonce Store ====================
// Development: In-memory Map
// Production: Redis dengan TTL

interface NonceEntry {
  nonce: string;
  expiresAt: number;
}

const nonceStore: Map<string, NonceEntry> = new Map();

// Cleanup expired nonces periodically (every minute)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of nonceStore.entries()) {
    if (now > entry.expiresAt) {
      nonceStore.delete(key);
    }
  }
}, 60000);

const NONCE_TTL_MS = 300 * 1000; // 5 minit
const MAX_TIMESTAMP_DRIFT_MS = 300 * 1000; // 5 minit

/**
 * Anti-replay middleware.
 * 
 * ⚠️ CRITICAL SECURITY MIDDLEWARE
 * 
 * Checks:
 * 1. Nonce exists in request body
 * 2. Nonce has not been used before (within TTL window)
 * 3. Client timestamp is within acceptable drift of server time
 */
export async function checkNonce(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { nonce, clientTimestamp } = req.body;

    // ---- Validate nonce presence ----
    if (!nonce || typeof nonce !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_NONCE',
          message: 'Nonce tidak ditemui dalam permintaan',
        },
      });
      return;
    }

    // ---- Validate client timestamp presence ----
    if (!clientTimestamp || typeof clientTimestamp !== 'number') {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TIMESTAMP',
          message: 'Timestamp pelanggan tidak ditemui',
        },
      });
      return;
    }

    // ---- Check timestamp drift ----
    // ⚠️ SEMAK MANUAL: Pastikan threshold 300s sesuai dengan keperluan
    const serverTime = Date.now();
    const drift = Math.abs(serverTime - clientTimestamp);

    if (drift > MAX_TIMESTAMP_DRIFT_MS) {
      console.warn(
        `[Nonce] Timestamp drift too large: ${drift}ms ` +
        `(server=${serverTime}, client=${clientTimestamp})`
      );
      res.status(400).json({
        success: false,
        error: {
          code: 'TIMESTAMP_DRIFT',
          message: 'Masa peranti tidak segerak. Sila semak tetapan tarikh dan masa.',
        },
      });
      return;
    }

    // ---- Check nonce uniqueness ----
    if (nonceStore.has(nonce)) {
      console.warn(`[Nonce] Duplicate nonce detected: ${nonce}`);
      res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_REQUEST',
          message: 'Permintaan duplikasi dikesan. Kehadiran mungkin sudah direkod.',
        },
      });
      return;
    }

    // ---- Store nonce with TTL ----
    nonceStore.set(nonce, {
      nonce,
      expiresAt: serverTime + NONCE_TTL_MS,
    });

    next();
  } catch (error) {
    console.error('[Nonce] Middleware error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'NONCE_CHECK_ERROR',
        message: 'Ralat semakan keselamatan',
      },
    });
  }
}
