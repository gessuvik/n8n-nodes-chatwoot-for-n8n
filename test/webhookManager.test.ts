import { describe, expect, it } from 'vitest';

import type {
	ChatwootWebhook,
	ChatwootWebhookApi,
	ChatwootWebhookInput,
	ManagedWebhookState,
} from '../nodes/Chatwoot/shared/types';
import {
	checkManagedWebhook,
	ensureManagedWebhook,
	managedWebhookName,
	removeManagedWebhook,
	WebhookOwnershipConflictError,
} from '../nodes/Chatwoot/shared/webhookManager';

class FakeWebhookApi implements ChatwootWebhookApi {
	created = 0;

	deleted: number[] = [];

	nextId = 1;

	updated = 0;

	constructor(public webhooks: ChatwootWebhook[] = []) {
		this.nextId = Math.max(0, ...webhooks.map((webhook) => webhook.id)) + 1;
	}

	async list(): Promise<ChatwootWebhook[]> {
		return structuredClone(this.webhooks);
	}

	async create(input: ChatwootWebhookInput): Promise<ChatwootWebhook> {
		this.created += 1;
		const webhook: ChatwootWebhook = {
			...structuredClone(input),
			id: this.nextId++,
			secret: `secret-${this.nextId}`,
		};
		this.webhooks.push(webhook);
		return structuredClone(webhook);
	}

	async update(id: number, input: ChatwootWebhookInput): Promise<ChatwootWebhook> {
		this.updated += 1;
		const index = this.webhooks.findIndex((webhook) => webhook.id === id);
		const webhook = { ...this.webhooks[index], ...structuredClone(input) };
		this.webhooks[index] = webhook;
		return structuredClone(webhook);
	}

	async delete(id: number): Promise<void> {
		this.deleted.push(id);
		this.webhooks = this.webhooks.filter((webhook) => webhook.id !== id);
	}
}

function config(url: string, state: ManagedWebhookState = {}) {
	return { event: 'message_created' as const, state, url };
}

function managedWebhook(url: string, id = 1, event = 'message_created'): ChatwootWebhook {
	return {
		id,
		name: managedWebhookName(url),
		secret: `secret-${id}`,
		subscriptions: [event],
		url,
	};
}

describe('managed Chatwoot webhook lifecycle', () => {
	it('creates a webhook and persists its ID and secret', async () => {
		const api = new FakeWebhookApi();
		const state: ManagedWebhookState = {};

		expect(await checkManagedWebhook(api, config('https://n8n.example/webhook/a', state))).toBe(
			false,
		);
		const result = await ensureManagedWebhook(
			api,
			config('https://n8n.example/webhook/a', state),
		);

		expect(result.action).toBe('created');
		expect(api.created).toBe(1);
		expect(state.chatwootWebhookId).toBe(result.webhook.id);
		expect(state.chatwootWebhookSecret).toBe(result.webhook.secret);
	});

	it('reuses the same webhook on repeated activation without creating a duplicate', async () => {
		const url = 'https://n8n.example/webhook/a';
		const api = new FakeWebhookApi([managedWebhook(url)]);
		const state: ManagedWebhookState = {};

		expect(await checkManagedWebhook(api, config(url, state))).toBe(true);
		expect((await ensureManagedWebhook(api, config(url, state))).action).toBe('reused');
		expect(api.created).toBe(0);
		expect(api.webhooks).toHaveLength(1);
	});

	it('updates only its own webhook when the selected event changes', async () => {
		const url = 'https://n8n.example/webhook/a';
		const api = new FakeWebhookApi([managedWebhook(url, 1, 'conversation_created')]);

		expect(await checkManagedWebhook(api, config(url))).toBe(false);
		const result = await ensureManagedWebhook(api, config(url));

		expect(result.action).toBe('updated');
		expect(result.webhook.subscriptions).toEqual(['message_created']);
		expect(api.updated).toBe(1);
	});

	it('never changes or deletes a manually created webhook at the same URL', async () => {
		const url = 'https://n8n.example/webhook/a';
		const api = new FakeWebhookApi([
			{ id: 9, name: 'Created manually', subscriptions: ['message_created'], url },
		]);

		await expect(checkManagedWebhook(api, config(url))).rejects.toBeInstanceOf(
			WebhookOwnershipConflictError,
		);
		await expect(ensureManagedWebhook(api, config(url))).rejects.toBeInstanceOf(
			WebhookOwnershipConflictError,
		);
		expect(await removeManagedWebhook(api, config(url))).toEqual({
			removed: false,
			skippedForeign: true,
		});
		expect(api.deleted).toEqual([]);
	});

	it('isolates multiple workflows and removes only the requested webhook', async () => {
		const urlA = 'https://n8n.example/webhook/a';
		const urlB = 'https://n8n.example/webhook/b';
		const api = new FakeWebhookApi([managedWebhook(urlA, 1), managedWebhook(urlB, 2)]);

		expect(await removeManagedWebhook(api, config(urlA))).toEqual({
			removed: true,
			skippedForeign: false,
		});
		expect(api.deleted).toEqual([1]);
		expect(api.webhooks).toEqual([managedWebhook(urlB, 2)]);
	});

	it('treats an already removed webhook as a successful cleanup', async () => {
		const state: ManagedWebhookState = {
			chatwootWebhookId: 50,
			chatwootWebhookSecret: 'old-secret',
		};
		const api = new FakeWebhookApi();

		expect(await removeManagedWebhook(api, config('https://n8n.example/webhook/a', state))).toEqual(
			{ removed: false, skippedForeign: false },
		);
		expect(state).toEqual({});
	});

	it('surfaces Chatwoot HTTP and timeout failures without creating a duplicate', async () => {
		const api = new FakeWebhookApi();
		api.list = async () => {
			throw new Error('ETIMEDOUT');
		};

		await expect(ensureManagedWebhook(api, config('https://n8n.example/webhook/a'))).rejects.toThrow(
			'ETIMEDOUT',
		);
		expect(api.created).toBe(0);
	});
});
