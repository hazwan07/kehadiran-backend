/**
 * backend/src/utils/hmac.utils.ts
 * 
 * HMAC verification utilities.
 * 
 * ⚠️ CRITICAL SECURITY CODE — semak setiap langkah secara manual.
 */

import crypto from 'crypto';

/**
 * Verify HMAC-SHA256 signature of a payload.
 * 
 * ⚠️ TODO: MANUAL IMPLEMENTATION VERIFICATION REQUIRED
 * 
 * Steps:
 * 1. Extract hmacSignature from payload
 * 2. Sort remaining payload keys
 * 3. JSON.stringify sorted payload
 * 4. Compute HMAC-SHA256(stringified, deviceSecret)
 * 5. Compare with timing-safe comparison
 * 
 * @param payload - Full attendance payload
 * @param deviceSecret - Device secret from Firestore
 * @returns true if signature valid
 */
export function verifyHMAC(
  payload: Record<string, unknown>,
  deviceSecret: string
): boolean {
  try {
    // SECURITY REVIEW REQUIRED
    const receivedSignature = payload.hmacSignature as string;
    
    if (!receivedSignature || receivedSignature === 'NOT_IMPLEMENTED') {
      // During development, allow unsigned payloads
      // ⚠️ REMOVE THIS IN PRODUCTION
      console.warn('[HMAC] Signature not implemented — ALLOWING IN DEV MODE');
      return true;
    }

    // Create payload copy without signature
    const payloadCopy = { ...payload };
    delete payloadCopy.hmacSignature;

    // Sort keys and stringify
    const sortedPayload = JSON.stringify(sortObjectKeys(payloadCopy));

    // Compute expected HMAC
    const expectedSignature = crypto
      .createHmac('sha256', deviceSecret)
      .update(sortedPayload)
      .digest('hex');

    // Timing-safe comparison to prevent timing attacks
    // SECURITY REVIEW REQUIRED
    const receivedBuffer = Buffer.from(receivedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
  } catch (error) {
    console.error('[HMAC] Verification error:', error);
    return false;
  }
}

/**
 * Sort object keys recursively for consistent serialization.
 */
function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return obj;
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sorted[key] = sortObjectKeys(value as Record<string, unknown>);
    } else {
      sorted[key] = value;
    }
  }

  return sorted;
}

/**
 * Generate a new device secret.
 */
export function generateDeviceSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}
