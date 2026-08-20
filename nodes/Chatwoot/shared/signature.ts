import { createHmac, timingSafeEqual } from 'crypto';

const DEFAULT_MAX_AGE_SECONDS = 5 * 60;

export type SignatureFailureReason =
	| 'invalid-format'
	| 'invalid-signature'
	| 'missing-raw-body'
	| 'missing-signature'
	| 'missing-timestamp'
	| 'stale-timestamp';

export type SignatureVerificationResult =
	| { accepted: true; verified: boolean }
	| { accepted: false; verified: false; reason: SignatureFailureReason };

export interface SignatureVerificationInput {
	enabled: boolean;
	headers: Record<string, unknown>;
	nowSeconds?: number;
	rawBody: Buffer | string | undefined;
	secret: string | undefined;
	toleranceSeconds?: number;
}

export function getHeader(headers: Record<string, unknown>, name: string): string | undefined {
	const wanted = name.toLowerCase();

	for (const [headerName, value] of Object.entries(headers)) {
		if (headerName.toLowerCase() !== wanted) {
			continue;
		}

		if (Array.isArray(value)) {
			return value.length > 0 ? String(value[0]) : undefined;
		}

		return value === undefined || value === null ? undefined : String(value);
	}

	return undefined;
}

export function verifyChatwootSignature(
	input: SignatureVerificationInput,
): SignatureVerificationResult {
	if (!input.enabled || !input.secret) {
		return { accepted: true, verified: false };
	}

	const signature = getHeader(input.headers, 'x-chatwoot-signature');
	const timestamp = getHeader(input.headers, 'x-chatwoot-timestamp');

	if (!signature) {
		return { accepted: false, verified: false, reason: 'missing-signature' };
	}
	if (!timestamp) {
		return { accepted: false, verified: false, reason: 'missing-timestamp' };
	}
	if (!/^sha256=[a-f\d]{64}$/i.test(signature) || !/^\d+$/.test(timestamp)) {
		return { accepted: false, verified: false, reason: 'invalid-format' };
	}
	if (input.rawBody === undefined) {
		return { accepted: false, verified: false, reason: 'missing-raw-body' };
	}

	const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
	const toleranceSeconds = input.toleranceSeconds ?? DEFAULT_MAX_AGE_SECONDS;
	if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
		return { accepted: false, verified: false, reason: 'stale-timestamp' };
	}

	const body = Buffer.isBuffer(input.rawBody) ? input.rawBody : Buffer.from(input.rawBody);
	const expected = `sha256=${createHmac('sha256', input.secret)
		.update(Buffer.concat([Buffer.from(`${timestamp}.`), body]))
		.digest('hex')}`;
	const expectedBuffer = Buffer.from(expected);
	const receivedBuffer = Buffer.from(signature);

	if (
		expectedBuffer.length !== receivedBuffer.length ||
		!timingSafeEqual(expectedBuffer, receivedBuffer)
	) {
		return { accepted: false, verified: false, reason: 'invalid-signature' };
	}

	return { accepted: true, verified: true };
}
