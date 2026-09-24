import type { IDataObject } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { normalizeWebhookPayload } from '../nodes/Chatwoot/shared/normalization';
import { CHATWOOT_EVENTS } from '../nodes/Chatwoot/shared/types';
import { webhookFixtures } from './fixtures/webhookFixtures';

function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object') {
		Object.freeze(value);
		for (const child of Object.values(value)) {
			deepFreeze(child);
		}
	}
	return value;
}

describe('normalizeWebhookPayload', () => {
	it.each(CHATWOOT_EVENTS)('normalizes %s and preserves raw', (event) => {
		const fixture = webhookFixtures[event];
		const result = normalizeWebhookPayload(fixture, {
			deliveryId: `delivery-${event}`,
			signatureVerified: true,
		});

		expect(result.event).toBe(event);
		expect(result.raw).toBe(fixture);
		expect(result.deliveryId).toBe(`delivery-${event}`);
		expect(result.signatureVerified).toBe(true);
	});

	it.each(['conversation_created', 'conversation_status_changed', 'conversation_updated'])(
		'exposes conversation and contact for %s',
		(event) => {
			const result = normalizeWebhookPayload(webhookFixtures[event]);

			expect(result.conversation?.id).toBe(42);
			expect(result.contact?.id).toBe(7);
			expect(result.account?.id).toBe(1);
		},
	);

	it.each(['message_created', 'message_updated'])('exposes message fields for %s', (event) => {
		const result = normalizeWebhookPayload(webhookFixtures[event]);

		expect(result.message?.id).toBe(99);
		expect(result.message?.content).toContain('Hello from Chatwoot');
		expect(result.conversation?.id).toBe(42);
		expect(result.contact?.id).toBe(7);
		expect(result.isPrivate).toBe(false);
	});

	it('recognizes the current contact sender shape even when type is absent', () => {
		const result = normalizeWebhookPayload({
			event: 'message_created',
			id: 100,
			sender: { email: 'ana@example.com', id: 7, name: 'Ana Example' },
		});

		expect(result.contact?.id).toBe(7);
		expect(result.user).toBeNull();
	});

	it.each(['contact_created', 'contact_updated'])('exposes contact fields for %s', (event) => {
		const result = normalizeWebhookPayload(webhookFixtures[event]);

		expect(result.contact?.id).toBe(7);
		expect(result.contact?.email).toBe('ana@example.com');
	});

	it('maps webwidget current_conversation and event_info', () => {
		const result = normalizeWebhookPayload(webhookFixtures.webwidget_triggered);

		expect(result.conversation?.id).toBe(42);
		expect(result.eventInfo?.referer).toBe('https://example.com/pricing');
	});

	it.each(['conversation_typing_on', 'conversation_typing_off'])(
		'maps typing user for %s',
		(event) => {
			const result = normalizeWebhookPayload(webhookFixtures[event]);

			expect(result.user?.id).toBe(3);
			expect(result.conversation?.id).toBe(42);
			expect(typeof result.isPrivate).toBe('boolean');
		},
	);

	it('keeps changed attributes without rewriting values', () => {
		const result = normalizeWebhookPayload(webhookFixtures.conversation_status_changed);

		expect(result.changedAttributes).toEqual([
			{ status: { current_value: 'resolved', previous_value: 'open' } },
		]);
	});

	it('handles an empty payload', () => {
		const result = normalizeWebhookPayload({});

		expect(result).toMatchObject({
			account: null,
			changedAttributes: null,
			contact: null,
			conversation: null,
			event: null,
			inbox: null,
			message: null,
			raw: {},
			user: null,
		});
	});

	it('handles missing fields and an unknown future event', () => {
		const raw: IDataObject = { event: 'future_event', new_field: { preserved: true } };
		const result = normalizeWebhookPayload(raw);

		expect(result.event).toBe('future_event');
		expect(result.conversation).toBeNull();
		expect(result.raw).toEqual(raw);
	});

	it('does not mutate the original payload', () => {
		const frozen = deepFreeze(structuredClone(webhookFixtures.message_created));
		const before = JSON.stringify(frozen);

		normalizeWebhookPayload(frozen);

		expect(JSON.stringify(frozen)).toBe(before);
	});
});
