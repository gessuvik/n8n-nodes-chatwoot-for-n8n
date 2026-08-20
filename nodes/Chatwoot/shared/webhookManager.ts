import { createHash } from 'crypto';

import type {
	ChatwootEvent,
	ChatwootWebhook,
	ChatwootWebhookApi,
	ChatwootWebhookInput,
	ManagedWebhookState,
} from './types';
import { InvalidWebhookResponseError } from './webhookResponse';

export { InvalidWebhookResponseError } from './webhookResponse';

export class WebhookOwnershipConflictError extends Error {}

export interface WebhookLifecycleConfiguration {
	event: ChatwootEvent;
	state: ManagedWebhookState;
	url: string;
}

export interface EnsureWebhookResult {
	action: 'created' | 'reused' | 'updated';
	webhook: ChatwootWebhook;
}

export interface RemoveWebhookResult {
	removed: boolean;
	skippedForeign: boolean;
}

export function managedWebhookName(url: string): string {
	const fingerprint = createHash('sha256').update(url).digest('hex').slice(0, 16);
	return `n8n Chatwoot Trigger [${fingerprint}]`;
}

function desiredWebhook(config: WebhookLifecycleConfiguration): ChatwootWebhookInput {
	return {
		name: managedWebhookName(config.url),
		url: config.url,
		subscriptions: [config.event],
	};
}

function sameSubscriptions(webhook: ChatwootWebhook, event: ChatwootEvent): boolean {
	return webhook.subscriptions.length === 1 && webhook.subscriptions[0] === event;
}

function findWebhookAtUrl(webhooks: ChatwootWebhook[], url: string): ChatwootWebhook | undefined {
	return webhooks.find((webhook) => webhook.url === url);
}

function isOwnedWebhook(webhook: ChatwootWebhook, url: string): boolean {
	return webhook.url === url && webhook.name === managedWebhookName(url);
}

function assertValidWebhook(webhook: ChatwootWebhook, expectedUrl: string): void {
	if (
		!Number.isInteger(webhook.id) ||
		webhook.id <= 0 ||
		webhook.url !== expectedUrl ||
		!Array.isArray(webhook.subscriptions)
	) {
		throw new InvalidWebhookResponseError(
			'Chatwoot respondió sin un ID, URL o lista de suscripciones válida.',
		);
	}
}

function persistState(
	state: ManagedWebhookState,
	webhook: ChatwootWebhook,
	event: ChatwootEvent,
): void {
	state.chatwootWebhookId = webhook.id;
	state.chatwootWebhookName = webhook.name;
	state.chatwootWebhookUrl = webhook.url;
	state.chatwootWebhookEvent = event;

	if (typeof webhook.secret === 'string' && webhook.secret !== '') {
		state.chatwootWebhookSecret = webhook.secret;
	} else {
		delete state.chatwootWebhookSecret;
	}
}

export function clearManagedWebhookState(state: ManagedWebhookState): void {
	delete state.chatwootWebhookId;
	delete state.chatwootWebhookName;
	delete state.chatwootWebhookUrl;
	delete state.chatwootWebhookEvent;
	delete state.chatwootWebhookSecret;
}

function ownershipConflict(url: string): WebhookOwnershipConflictError {
	return new WebhookOwnershipConflictError(
		`La URL ${url} ya pertenece a un webhook que esta integración no creó. No se modificó ni eliminó.`,
	);
}

export async function checkManagedWebhook(
	api: ChatwootWebhookApi,
	config: WebhookLifecycleConfiguration,
): Promise<boolean> {
	const webhooks = await api.list();
	const webhook = findWebhookAtUrl(webhooks, config.url);

	if (!webhook) {
		clearManagedWebhookState(config.state);
		return false;
	}
	if (!isOwnedWebhook(webhook, config.url)) {
		throw ownershipConflict(config.url);
	}

	assertValidWebhook(webhook, config.url);
	persistState(config.state, webhook, config.event);
	return sameSubscriptions(webhook, config.event);
}

export async function ensureManagedWebhook(
	api: ChatwootWebhookApi,
	config: WebhookLifecycleConfiguration,
): Promise<EnsureWebhookResult> {
	const existing = findWebhookAtUrl(await api.list(), config.url);
	const desired = desiredWebhook(config);

	if (existing && !isOwnedWebhook(existing, config.url)) {
		throw ownershipConflict(config.url);
	}

	if (existing) {
		assertValidWebhook(existing, config.url);
		if (sameSubscriptions(existing, config.event)) {
			persistState(config.state, existing, config.event);
			return { action: 'reused', webhook: existing };
		}

		const updatedResponse = await api.update(existing.id, desired);
		const updated =
			updatedResponse.secret === undefined && existing.secret
				? { ...updatedResponse, secret: existing.secret }
				: updatedResponse;
		assertValidWebhook(updated, config.url);
		persistState(config.state, updated, config.event);
		return { action: 'updated', webhook: updated };
	}

	const created = await api.create(desired);
	assertValidWebhook(created, config.url);
	persistState(config.state, created, config.event);
	return { action: 'created', webhook: created };
}

export async function removeManagedWebhook(
	api: ChatwootWebhookApi,
	config: WebhookLifecycleConfiguration,
): Promise<RemoveWebhookResult> {
	const existing = findWebhookAtUrl(await api.list(), config.url);

	if (!existing) {
		clearManagedWebhookState(config.state);
		return { removed: false, skippedForeign: false };
	}
	if (!isOwnedWebhook(existing, config.url)) {
		clearManagedWebhookState(config.state);
		return { removed: false, skippedForeign: true };
	}

	await api.delete(existing.id);
	clearManagedWebhookState(config.state);
	return { removed: true, skippedForeign: false };
}
