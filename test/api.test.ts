import type { IHookFunctions } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import { createChatwootWebhookApi } from '../nodes/Chatwoot/shared/api';

vi.mock('n8n-workflow', () => ({
	NodeOperationError: class NodeOperationError extends Error {},
}));

const webhook = {
	id: 12,
	name: 'n8n Chatwoot Trigger [abc]',
	secret: 'webhook-secret',
	subscriptions: ['message_created'],
	url: 'https://n8n.example/webhook/chatwoot',
};

function contextWithRequest(request: ReturnType<typeof vi.fn>): IHookFunctions {
	return {
		getCredentials: vi.fn().mockResolvedValue({
			accountId: 1,
			baseUrl: 'https://chatwoot.example.com/',
			ignoreSslIssues: false,
		}),
		getNode: () => ({ name: 'Chatwoot Trigger', type: 'chatwootTrigger' }),
		helpers: { httpRequestWithAuthentication: request },
	} as unknown as IHookFunctions;
}

describe('Chatwoot webhook API client', () => {
	it('uses the account endpoint and unwraps current list and create responses', async () => {
		const request = vi
			.fn()
			.mockResolvedValueOnce({ payload: { webhooks: [webhook] } })
			.mockResolvedValueOnce({ payload: { webhook } });
		const api = createChatwootWebhookApi(contextWithRequest(request));

		expect(await api.list()).toEqual([webhook]);
		expect(
			await api.create({
				name: webhook.name,
				subscriptions: ['message_created'],
				url: webhook.url,
			}),
		).toEqual(webhook);

		expect(request).toHaveBeenNthCalledWith(
			1,
			'chatwootApi',
			expect.objectContaining({
				method: 'GET',
				url: 'https://chatwoot.example.com/api/v1/accounts/1/webhooks',
			}),
		);
		expect(request).toHaveBeenNthCalledWith(
			2,
			'chatwootApi',
			expect.objectContaining({
				body: {
					name: webhook.name,
					subscriptions: ['message_created'],
					url: webhook.url,
				},
				method: 'POST',
			}),
		);
	});

	it('treats a raced 404 delete as an idempotent success', async () => {
		const request = vi.fn().mockRejectedValue({ statusCode: 404 });
		const api = createChatwootWebhookApi(contextWithRequest(request));

		await expect(api.delete(12)).resolves.toBeUndefined();
	});
});
