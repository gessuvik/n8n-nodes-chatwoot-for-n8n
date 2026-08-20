import type { IDataObject } from 'n8n-workflow';

export const CHATWOOT_EVENTS = [
	'conversation_created',
	'conversation_status_changed',
	'conversation_updated',
	'message_created',
	'message_updated',
	'webwidget_triggered',
	'contact_created',
	'contact_updated',
	'conversation_typing_on',
	'conversation_typing_off',
] as const;

export type ChatwootEvent = (typeof CHATWOOT_EVENTS)[number];

export interface ChatwootWebhook {
	id: number;
	name: string;
	url: string;
	subscriptions: string[];
	secret?: string | null;
	account_id?: number;
}

export interface ChatwootWebhookInput {
	name: string;
	url: string;
	subscriptions: ChatwootEvent[];
}

export interface ChatwootWebhookApi {
	list(): Promise<ChatwootWebhook[]>;
	create(input: ChatwootWebhookInput): Promise<ChatwootWebhook>;
	update(id: number, input: ChatwootWebhookInput): Promise<ChatwootWebhook>;
	delete(id: number): Promise<void>;
}

export interface ManagedWebhookState extends IDataObject {
	chatwootWebhookEvent?: string;
	chatwootWebhookId?: number;
	chatwootWebhookName?: string;
	chatwootWebhookSecret?: string;
	chatwootWebhookUrl?: string;
}

export interface NormalizedWebhookPayload extends IDataObject {
	account: IDataObject | null;
	changedAttributes: IDataObject | IDataObject[] | null;
	contact: IDataObject | null;
	conversation: IDataObject | null;
	deliveryId: string | null;
	event: string | null;
	eventInfo: IDataObject | null;
	inbox: IDataObject | null;
	isPrivate: boolean | null;
	message: IDataObject | null;
	raw: IDataObject;
	signatureVerified: boolean | null;
	user: IDataObject | null;
}
