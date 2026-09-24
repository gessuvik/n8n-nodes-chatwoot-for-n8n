import type { ChatwootWebhook } from './types';

export class InvalidWebhookResponseError extends Error {}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function wrappedPayload(response: unknown): Record<string, unknown> | null {
	return asRecord(asRecord(response)?.payload);
}

export function unwrapWebhookList(response: unknown): ChatwootWebhook[] {
	const value = Array.isArray(response) ? response : wrappedPayload(response)?.webhooks;

	if (!Array.isArray(value)) {
		throw new InvalidWebhookResponseError(
			'Chatwoot respondió sin la lista esperada en payload.webhooks.',
		);
	}

	return value as ChatwootWebhook[];
}

export function unwrapWebhook(response: unknown): ChatwootWebhook {
	const wrapped = wrappedPayload(response);
	const value =
		wrapped !== null && Object.prototype.hasOwnProperty.call(wrapped, 'webhook')
			? wrapped.webhook
			: response;
	const webhook = asRecord(value);

	if (!webhook) {
		throw new InvalidWebhookResponseError(
			'Chatwoot respondió sin el webhook esperado en payload.webhook.',
		);
	}

	return webhook as unknown as ChatwootWebhook;
}
