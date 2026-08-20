import { describe, expect, it } from 'vitest';

import {
	InvalidWebhookResponseError,
	unwrapWebhook,
	unwrapWebhookList,
} from '../nodes/Chatwoot/shared/webhookResponse';

const webhook = {
	id: 12,
	name: 'n8n Chatwoot Trigger [abc]',
	secret: 'webhook-secret',
	subscriptions: ['message_created'],
	url: 'https://n8n.example/webhook/chatwoot',
};

describe('Chatwoot webhook API response shapes', () => {
	it('unwraps the current Chatwoot list response', () => {
		expect(unwrapWebhookList({ payload: { webhooks: [webhook] } })).toEqual([webhook]);
	});

	it('unwraps the current Chatwoot create and update response', () => {
		expect(unwrapWebhook({ payload: { webhook } })).toEqual(webhook);
	});

	it('accepts direct legacy response shapes for version compatibility', () => {
		expect(unwrapWebhookList([webhook])).toEqual([webhook]);
		expect(unwrapWebhook(webhook)).toEqual(webhook);
	});

	it('rejects unexpected list and item responses', () => {
		expect(() => unwrapWebhookList({ payload: {} })).toThrow(InvalidWebhookResponseError);
		expect(() => unwrapWebhook({ payload: { webhook: null } })).toThrow(
			InvalidWebhookResponseError,
		);
	});
});
