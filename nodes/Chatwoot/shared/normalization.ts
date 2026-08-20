import type { IDataObject, GenericValue } from 'n8n-workflow';

import type { NormalizedWebhookPayload } from './types';

const CONVERSATION_EVENTS = new Set([
	'conversation_created',
	'conversation_status_changed',
	'conversation_updated',
]);

const MESSAGE_EVENTS = new Set(['message_created', 'message_updated']);
const CONTACT_EVENTS = new Set(['contact_created', 'contact_updated']);
const TYPING_EVENTS = new Set(['conversation_typing_on', 'conversation_typing_off']);

export interface WebhookDeliveryMetadata {
	deliveryId?: string | null;
	signatureVerified?: boolean | null;
}

function asDataObject(value: GenericValue | IDataObject | undefined): IDataObject | null {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}

	return value as IDataObject;
}

function copyWithout(source: IDataObject, excludedKeys: ReadonlySet<string>): IDataObject | null {
	const copy = Object.create(null) as IDataObject;

	for (const [key, value] of Object.entries(source)) {
		if (!excludedKeys.has(key)) {
			copy[key] = value;
		}
	}

	return Object.keys(copy).length > 0 ? copy : null;
}

function nestedObject(source: IDataObject | null, key: string): IDataObject | null {
	return source ? asDataObject(source[key]) : null;
}

function entityType(entity: IDataObject | null): string {
	return typeof entity?.type === 'string' ? entity.type.toLowerCase() : '';
}

function contactFromConversation(conversation: IDataObject | null): IDataObject | null {
	const sender = nestedObject(nestedObject(conversation, 'meta'), 'sender');
	return sender && (entityType(sender) === 'contact' || entityType(sender) === '')
		? sender
		: null;
}

function userFromConversation(conversation: IDataObject | null): IDataObject | null {
	return nestedObject(nestedObject(conversation, 'meta'), 'assignee');
}

function normalizeChangedAttributes(
	value: GenericValue | IDataObject | undefined,
): IDataObject | IDataObject[] | null {
	if (Array.isArray(value)) {
		return value.filter((entry): entry is IDataObject => asDataObject(entry) !== null);
	}

	return asDataObject(value);
}

export function normalizeWebhookPayload(
	raw: IDataObject,
	metadata: WebhookDeliveryMetadata = {},
): NormalizedWebhookPayload {
	const event = typeof raw.event === 'string' ? raw.event : null;
	let account = asDataObject(raw.account);
	let inbox = asDataObject(raw.inbox);
	let conversation = asDataObject(raw.conversation);
	let contact = asDataObject(raw.contact);
	let message: IDataObject | null = null;
	let user = asDataObject(raw.user);

	if (event && CONVERSATION_EVENTS.has(event)) {
		conversation = copyWithout(raw, new Set(['event', 'changed_attributes']));
		contact ??= contactFromConversation(conversation);
		user ??= userFromConversation(conversation);
	}

	if (event && MESSAGE_EVENTS.has(event)) {
		message = copyWithout(raw, new Set(['event']));
		const sender = asDataObject(raw.sender);
		const senderType = entityType(sender);
		contact ??= contactFromConversation(conversation);
		if (!contact && sender && (senderType === 'contact' || senderType === '')) {
			contact = sender;
		}
		if (!user && sender && senderType !== 'contact' && senderType !== '') {
			user = sender;
		}
	}

	if (event && CONTACT_EVENTS.has(event)) {
		contact = copyWithout(raw, new Set(['event', 'changed_attributes']));
	}

	if (event === 'webwidget_triggered') {
		conversation = asDataObject(raw.current_conversation);
	}

	if (event && TYPING_EVENTS.has(event)) {
		contact ??= contactFromConversation(conversation);
	}

	account ??= nestedObject(conversation, 'account');
	inbox ??= nestedObject(message, 'inbox');

	return {
		event,
		account,
		inbox,
		conversation,
		contact,
		message,
		user,
		changedAttributes: normalizeChangedAttributes(raw.changed_attributes),
		eventInfo: asDataObject(raw.event_info),
		isPrivate:
			typeof raw.is_private === 'boolean'
				? raw.is_private
				: typeof raw.private === 'boolean'
					? raw.private
					: null,
		deliveryId: metadata.deliveryId ?? null,
		signatureVerified: metadata.signatureVerified ?? null,
		raw,
	};
}
