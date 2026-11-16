import { describe, expect, it } from 'vitest';
import { SmsError, twilioVerifier } from '../src/sms';

type Call = { url: string; body: URLSearchParams; auth: string };

function fakeTwilio(responses: { status: number; body: unknown }[]) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url, body: new URLSearchParams(init.body), auth: init.headers.authorization });
    const r = responses.shift() ?? { status: 500, body: {} };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { calls, fetchImpl };
}

const cfg = { accountSid: 'AC123', authToken: 'secret', serviceSid: 'VA456' };

describe('Twilio Verify', () => {
  it('sends an SMS verification with basic auth', async () => {
    const t = fakeTwilio([{ status: 201, body: { status: 'pending' } }]);
    await twilioVerifier(cfg, t.fetchImpl).send('+14165550123');
    expect(t.calls[0].url).toBe('https://verify.twilio.com/v2/Services/VA456/Verifications');
    expect(t.calls[0].body.get('To')).toBe('+14165550123');
    expect(t.calls[0].body.get('Channel')).toBe('sms');
    expect(t.calls[0].auth).toBe(`Basic ${Buffer.from('AC123:secret').toString('base64')}`);
  });

  it('turns Twilio errors into friendly messages', async () => {
    const bad = fakeTwilio([{ status: 400, body: { code: 60200 } }]);
    await expect(twilioVerifier(cfg, bad.fetchImpl).send('+1')).rejects.toThrow(/country code/);
    const many = fakeTwilio([{ status: 429, body: { code: 60203 } }]);
    await expect(twilioVerifier(cfg, many.fetchImpl).send('+14165550123')).rejects.toBeInstanceOf(SmsError);
  });

  it('checks codes: approved, wrong, expired', async () => {
    const t = fakeTwilio([
      { status: 200, body: { status: 'approved' } },
      { status: 200, body: { status: 'pending' } },
      { status: 404, body: {} },
    ]);
    const v = twilioVerifier(cfg, t.fetchImpl);
    expect(await v.check('+14165550123', '123456')).toBe(true);
    expect(await v.check('+14165550123', '000001')).toBe(false);
    expect(await v.check('+14165550123', '123456')).toBe(false);
    expect(t.calls[0].url).toMatch(/VerificationCheck$/);
    expect(t.calls[0].body.get('Code')).toBe('123456');
  });
});
