import { createHmac, timingSafeEqual } from 'node:crypto';

export const HMAC_WINDOW_MS = 5 * 60 * 1000; // 5-minute replay window

export function signIngestPayload(
  secret: string,
  timestampMs: number,
  nonce: string,
  rawBody: string
): string {
  return createHmac('sha256', secret)
    .update(`${timestampMs}.${nonce}.${rawBody}`)
    .digest('hex');
}

export interface HmacCheckResult {
  ok: boolean;
  code?: 'MISSING_HEADERS' | 'INVALID_TIMESTAMP' | 'EXPIRED_WINDOW' | 'REPLAY_NONCE' | 'BAD_SIGNATURE';
  message?: string;
}

export function verifyHmacRequest(params: {
  secret: string;
  timestampHeader: string | undefined;
  nonceHeader: string | undefined;
  signatureHeader: string | undefined;
  rawBody: string;
  nowMs?: number;
  consumeNonce: (nonce: string, expiresAtMs: number) => boolean;
}): HmacCheckResult {
  const { secret, timestampHeader, nonceHeader, signatureHeader, rawBody, consumeNonce } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (!timestampHeader || !nonceHeader || !signatureHeader) {
    return {
      ok: false,
      code: 'MISSING_HEADERS',
      message: 'Missing required X-OSN-Timestamp, X-OSN-Nonce, or X-OSN-Signature headers.',
    };
  }

  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || ts <= 0) {
    return {
      ok: false,
      code: 'INVALID_TIMESTAMP',
      message: 'Timestamp header must be epoch milliseconds.',
    };
  }

  if (Math.abs(nowMs - ts) > HMAC_WINDOW_MS) {
    return {
      ok: false,
      code: 'EXPIRED_WINDOW',
      message: 'Request timestamp outside the 5-minute HMAC window.',
    };
  }

  const expected = signIngestPayload(secret, ts, nonceHeader, rawBody);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader.trim().toLowerCase(), 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return {
      ok: false,
      code: 'BAD_SIGNATURE',
      message: 'HMAC-SHA256 signature verification failed.',
    };
  }

  const fresh = consumeNonce(nonceHeader, nowMs + HMAC_WINDOW_MS);
  if (!fresh) {
    return {
      ok: false,
      code: 'REPLAY_NONCE',
      message: 'Nonce has already been used within the replay protection window.',
    };
  }

  return { ok: true };
}
