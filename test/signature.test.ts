import { createHmac } from 'crypto';

import { describe, expect, it } from 'vitest';

import { verifyChatwootSignature } from '../nodes/Chatwoot/shared/signature';

const secret = 'chatwoot-webhook-secret';
const timestamp = '1776664800';
const rawBody = '{"event":"message_created","id":99}';

function signatureFor(body: string): string {
	return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

describe('verifyChatwootSignature', () => {
	it('accepts the official timestamp.raw_body HMAC format', () => {
		const result = verifyChatwootSignature({
			enabled: true,
			headers: {
				'X-Chatwoot-Signature': signatureFor(rawBody),
				'X-Chatwoot-Timestamp': timestamp,
			},
			nowSeconds: Number(timestamp),
			rawBody: Buffer.from(rawBody),
			secret,
		});

		expect(result).toEqual({ accepted: true, verified: true });
	});

	it('rejects a modified body', () => {
		const result = verifyChatwootSignature({
			enabled: true,
			headers: {
				'x-chatwoot-signature': signatureFor(rawBody),
				'x-chatwoot-timestamp': timestamp,
			},
			nowSeconds: Number(timestamp),
			rawBody: `${rawBody} `,
			secret,
		});

		expect(result).toMatchObject({ accepted: false, reason: 'invalid-signature' });
	});

	it('rejects a timestamp older than five minutes', () => {
		const result = verifyChatwootSignature({
			enabled: true,
			headers: {
				'x-chatwoot-signature': signatureFor(rawBody),
				'x-chatwoot-timestamp': timestamp,
			},
			nowSeconds: Number(timestamp) + 301,
			rawBody,
			secret,
		});

		expect(result).toMatchObject({ accepted: false, reason: 'stale-timestamp' });
	});

	it('rejects signed delivery when the raw body is unavailable', () => {
		const result = verifyChatwootSignature({
			enabled: true,
			headers: {
				'x-chatwoot-signature': signatureFor(rawBody),
				'x-chatwoot-timestamp': timestamp,
			},
			nowSeconds: Number(timestamp),
			rawBody: undefined,
			secret,
		});

		expect(result).toMatchObject({ accepted: false, reason: 'missing-raw-body' });
	});

	it('stays compatible with older Chatwoot versions that return no secret', () => {
		const result = verifyChatwootSignature({
			enabled: true,
			headers: {},
			rawBody,
			secret: undefined,
		});

		expect(result).toEqual({ accepted: true, verified: false });
	});

	it('allows the user to disable verification explicitly', () => {
		const result = verifyChatwootSignature({
			enabled: false,
			headers: {},
			rawBody,
			secret,
		});

		expect(result).toEqual({ accepted: true, verified: false });
	});
});
