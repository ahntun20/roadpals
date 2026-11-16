/**
 * Phone verification through Twilio Verify (https://www.twilio.com/docs/verify/api).
 * Twilio generates, sends and checks the 6-digit code; we never store it.
 */
export interface SmsVerifier {
  /** Text a code to the number. Throws SmsError with a user-friendly message on failure. */
  send(phone: string): Promise<void>;
  /** true if the code is correct for that number. */
  check(phone: string, code: string): Promise<boolean>;
}

export class SmsError extends Error {}

export interface TwilioConfig { accountSid: string; authToken: string; serviceSid: string }

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function twilioVerifier(cfg: TwilioConfig, fetchImpl: FetchLike = fetch as unknown as FetchLike): SmsVerifier {
  const base = `https://verify.twilio.com/v2/Services/${cfg.serviceSid}`;
  const headers = {
    authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64')}`,
    'content-type': 'application/x-www-form-urlencoded',
  };
  const post = (path: string, form: Record<string, string>) =>
    fetchImpl(`${base}/${path}`, { method: 'POST', headers, body: new URLSearchParams(form).toString() });

  return {
    async send(phone) {
      const res = await post('Verifications', { To: phone, Channel: 'sms' });
      if (res.ok) return;
      const body = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
      // 60200 = invalid number, 60203 = too many attempts, 60410 = blocked prefix (fraud guard)
      if (body.code === 60200 || res.status === 400) throw new SmsError('That phone number doesn’t look right. Include the country code, e.g. +1 416 555 0123.');
      if (body.code === 60203 || res.status === 429) throw new SmsError('Too many codes sent to this number. Try again in a few minutes.');
      throw new SmsError('Couldn’t send the code right now. Try again shortly.');
    },
    async check(phone, code) {
      const res = await post('VerificationCheck', { To: phone, Code: code });
      if (res.status === 404) return false; // expired, already used or never sent
      if (!res.ok) throw new SmsError('Couldn’t check the code right now. Try again shortly.');
      const body = (await res.json()) as { status?: string };
      return body.status === 'approved';
    },
  };
}
