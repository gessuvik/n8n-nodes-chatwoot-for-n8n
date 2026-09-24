import { describe, expect, it } from 'vitest';

import { ChatwootApi } from '../credentials/ChatwootApi.credentials';
import { describeChatwootError } from '../nodes/Chatwoot/shared/errors';
import { normalizeBaseUrl } from '../nodes/Chatwoot/shared/url';

describe('Chatwoot credentials and API errors', () => {
	it('uses the official api_access_token header and account webhook endpoint', () => {
		const credential = new ChatwootApi();

		expect(credential.authenticate).toMatchObject({
			properties: { headers: { api_access_token: '={{$credentials.accessToken}}' } },
		});
		expect(credential.test.request.url).toContain('$credentials.accountId');
	});

	it('normalizes Chatwoot Cloud and self-hosted Base URLs', () => {
		expect(normalizeBaseUrl('https://app.chatwoot.com/')).toBe('https://app.chatwoot.com');
		expect(normalizeBaseUrl('https://support.example.com/chatwoot///')).toBe(
			'https://support.example.com/chatwoot',
		);
		expect(normalizeBaseUrl('http://chatwoot.internal:3000')).toBe('http://chatwoot.internal:3000');
	});

	it.each([
		'not-a-url',
		'ftp://chatwoot.example.com',
		'https://user:password@chatwoot.example.com',
		'https://chatwoot.example.com?token=secret',
	])('rejects unsafe or invalid Base URL %s', (url) => {
		expect(normalizeBaseUrl(url)).toBeNull();
	});

	it('turns incorrect credentials into a human error', () => {
		const result = describeChatwootError(
			{ httpCode: '401', message: 'Request failed with status code 401' },
			'/api/v1/accounts/1/webhooks',
		);

		expect(result.message).toBe('Chatwoot rechazó las credenciales.');
		expect(result.description).toContain('HTTP 401');
		expect(result.description).toContain('API Access Token');
	});

	it('explains permission, validation, HTTP, and timeout errors', () => {
		expect(describeChatwootError({ statusCode: 403 }, '/webhooks').message).toContain(
			'no permitió',
		);
		expect(describeChatwootError({ statusCode: 422 }, '/webhooks').message).toContain(
			'rechazó la configuración',
		);
		expect(describeChatwootError({ code: 'ETIMEDOUT' }, '/webhooks').message).toContain(
			'no respondió a tiempo',
		);
	});

	it('redacts tokens from upstream error messages', () => {
		const result = describeChatwootError(
			{ message: 'api_access_token=super-secret-value was rejected' },
			'/webhooks',
		);

		expect(result.description).not.toContain('super-secret-value');
		expect(result.description).toContain('[REDACTED]');
	});
});
