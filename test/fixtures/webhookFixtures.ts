import type { IDataObject } from 'n8n-workflow';

const account = { id: 1, name: 'Acme Support' };
const inbox = { id: 2, name: 'WhatsApp Support' };
const contact = {
	additional_attributes: {},
	custom_attributes: { plan: 'pro' },
	email: 'ana@example.com',
	id: 7,
	identifier: 'customer-7',
	name: 'Ana Example',
	phone_number: '+595981000000',
	thumbnail: '',
	type: 'contact',
};
const user = {
	available_name: 'Agent One',
	avatar_url: '',
	id: 3,
	name: 'Agent One',
	thumbnail: '',
	type: 'user',
};

const conversation = {
	account,
	additional_attributes: { initiated_at: { timestamp: '2026-08-19T12:00:00Z' } },
	agent_last_seen_at: 1_776_664_800,
	can_reply: true,
	channel: 'Channel::Api',
	contact_inbox: {
		contact_id: 7,
		created_at: '2026-08-19T12:00:00Z',
		hmac_verified: false,
		id: 11,
		inbox_id: 2,
		source_id: 'customer-7',
		updated_at: '2026-08-19T12:00:00Z',
	},
	contact_last_seen_at: 0,
	created_at: 1_776_664_800,
	custom_attributes: {},
	id: 42,
	inbox_id: 2,
	labels: ['vip'],
	last_activity_at: 1_776_664_800,
	messages: [],
	meta: {
		assignee: user,
		assignee_type: 'User',
		hmac_verified: false,
		sender: contact,
		team: null,
	},
	priority: null,
	snoozed_until: null,
	status: 'open',
	timestamp: 1_776_664_800,
	unread_count: 1,
	updated_at: 1_776_664_800.25,
	waiting_since: 1_776_664_800,
};

const message = {
	account,
	additional_attributes: {},
	content: 'Hello from Chatwoot',
	content_attributes: {},
	content_type: 'text',
	conversation,
	created_at: '2026-08-19T12:01:00.000Z',
	id: 99,
	inbox,
	message_type: 'incoming',
	private: false,
	sender: { ...contact, account },
	source_id: 'wamid.example-99',
};

export const webhookFixtures: Record<string, IDataObject> = {
	conversation_created: {
		...conversation,
		event: 'conversation_created',
	},
	conversation_status_changed: {
		...conversation,
		changed_attributes: [
			{ status: { current_value: 'resolved', previous_value: 'open' } },
		],
		event: 'conversation_status_changed',
		status: 'resolved',
	},
	conversation_updated: {
		...conversation,
		changed_attributes: [
			{ priority: { current_value: 'high', previous_value: null } },
		],
		event: 'conversation_updated',
		priority: 'high',
	},
	message_created: {
		...message,
		event: 'message_created',
	},
	message_updated: {
		...message,
		content: 'Hello from Chatwoot (edited)',
		event: 'message_updated',
	},
	webwidget_triggered: {
		account,
		contact: { ...contact, account },
		current_conversation: conversation,
		event: 'webwidget_triggered',
		event_info: {
			browser: { browser_name: 'Chrome', device_name: 'Desktop' },
			browser_language: 'en',
			initiated_at: { timestamp: '2026-08-19T12:00:00Z' },
			referer: 'https://example.com/pricing',
			widget_language: 'en',
		},
		id: 11,
		inbox,
		source_id: 'customer-7',
	},
	contact_created: {
		...contact,
		account,
		avatar: '',
		blocked: false,
		event: 'contact_created',
	},
	contact_updated: {
		...contact,
		account,
		avatar: '',
		blocked: false,
		changed_attributes: [
			{ name: { current_value: 'Ana Updated', previous_value: 'Ana Example' } },
		],
		event: 'contact_updated',
		name: 'Ana Updated',
	},
	conversation_typing_on: {
		conversation,
		event: 'conversation_typing_on',
		is_private: false,
		user: { email: 'agent@example.com', id: 3, name: 'Agent One', type: 'user' },
	},
	conversation_typing_off: {
		conversation,
		event: 'conversation_typing_off',
		is_private: true,
		user: { email: 'agent@example.com', id: 3, name: 'Agent One', type: 'user' },
	},
};
