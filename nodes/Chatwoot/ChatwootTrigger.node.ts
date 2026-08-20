import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { createChatwootWebhookApi } from './shared/api';
import { normalizeWebhookPayload } from './shared/normalization';
import { getHeader, verifyChatwootSignature } from './shared/signature';
import type { ChatwootEvent, ManagedWebhookState } from './shared/types';
import {
	checkManagedWebhook,
	ensureManagedWebhook,
	InvalidWebhookResponseError,
	removeManagedWebhook,
	WebhookOwnershipConflictError,
} from './shared/webhookManager';

const EVENT_OPTIONS = [
	{
		name: 'Contact Created',
		value: 'contact_created',
		description: 'When a contact is created',
	},
	{
		name: 'Contact Updated',
		value: 'contact_updated',
		description: 'When contact attributes change',
	},
	{
		name: 'Conversation Created',
		value: 'conversation_created',
		description: 'When a conversation is created',
	},
	{
		name: 'Conversation Status Changed',
		value: 'conversation_status_changed',
		description: 'When a conversation status changes',
	},
	{
		name: 'Conversation Typing Off',
		value: 'conversation_typing_off',
		description: 'When an agent stops typing or leaves the conversation',
	},
	{
		name: 'Conversation Typing On',
		value: 'conversation_typing_on',
		description: 'When an agent starts typing',
	},
	{
		name: 'Conversation Updated',
		value: 'conversation_updated',
		description: 'When conversation attributes change',
	},
	{
		name: 'Message Created',
		value: 'message_created',
		description: 'When a message is created',
	},
	{
		name: 'Message Updated',
		value: 'message_updated',
		description: 'When a message is updated',
	},
	{
		name: 'Web Widget Triggered',
		value: 'webwidget_triggered',
		description: 'When an end user opens the live-chat widget',
	},
];

function lifecycleConfiguration(context: IHookFunctions) {
	return {
		event: context.getNodeParameter('event') as ChatwootEvent,
		state: context.getWorkflowStaticData('node') as ManagedWebhookState,
		url: String(context.getNodeWebhookUrl('default')),
	};
}

function assertReachableWebhookUrl(context: IHookFunctions, url: string): void {
	const hostname = new URL(url).hostname.toLowerCase();
	if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
		throw new NodeOperationError(
			context.getNode(),
			'Chatwoot no puede entregar eventos a una URL local de n8n.',
			{
				description:
					'Configura una WEBHOOK_URL pública con HTTPS y vuelve a activar el workflow.',
			},
		);
	}
}

function lifecycleError(context: IHookFunctions, error: unknown): NodeOperationError {
	if (error instanceof NodeOperationError) {
		return error;
	}
	if (error instanceof WebhookOwnershipConflictError) {
		return new NodeOperationError(context.getNode(), 'La URL del webhook ya está ocupada.', {
			description: error.message,
		});
	}
	if (error instanceof InvalidWebhookResponseError) {
		return new NodeOperationError(context.getNode(), 'Chatwoot devolvió una respuesta inesperada.', {
			description: error.message,
		});
	}

	return new NodeOperationError(context.getNode(), 'Falló el lifecycle del webhook de Chatwoot.', {
		description: error instanceof Error ? error.message : 'Error desconocido',
	});
}

function rejectWebhook(
	context: IWebhookFunctions,
	statusCode: number,
	message: string,
): IWebhookResponseData {
	context.getResponseObject().status(statusCode).send(message).end();
	return { noWebhookResponse: true };
}

export class ChatwootTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Chatwoot Trigger',
		name: 'chatwootTrigger',
		icon: {
			light: 'file:../../icons/chatwoot.svg',
			dark: 'file:../../icons/chatwoot.dark.svg',
		},
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts the workflow when a selected Chatwoot event occurs',
		eventTriggerDescription: 'Waiting for a Chatwoot event',
		activationMessage: 'Chatwoot webhook registered automatically',
		defaults: {
			name: 'Chatwoot Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'chatwootApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				options: EVENT_OPTIONS,
				default: 'message_created',
				required: true,
				description: 'Chatwoot event that starts the workflow',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const config = lifecycleConfiguration(this);
				assertReachableWebhookUrl(this, config.url);

				try {
					const exists = await checkManagedWebhook(createChatwootWebhookApi(this), config);
					this.logger.debug('Chatwoot webhook existence checked', {
						event: config.event,
						exists,
						url: config.url,
					});
					return exists;
				} catch (error) {
					throw lifecycleError(this, error);
				}
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const config = lifecycleConfiguration(this);
				assertReachableWebhookUrl(this, config.url);

				try {
					const result = await ensureManagedWebhook(createChatwootWebhookApi(this), config);
					this.logger.info('Chatwoot webhook ready', {
						action: result.action,
						event: config.event,
						webhookId: result.webhook.id,
						url: config.url,
					});
					return true;
				} catch (error) {
					throw lifecycleError(this, error);
				}
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const config = lifecycleConfiguration(this);

				try {
					const result = await removeManagedWebhook(createChatwootWebhookApi(this), config);
					this.logger.info('Chatwoot webhook cleanup finished', {
						removed: result.removed,
						skippedForeign: result.skippedForeign,
						url: config.url,
					});
					return true;
				} catch (error) {
					throw lifecycleError(this, error);
				}
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const request = this.getRequestObject();
		const headers = this.getHeaderData() as Record<string, unknown>;
		const state = this.getWorkflowStaticData('node') as ManagedWebhookState;
		const credentials = await this.getCredentials('chatwootApi');
		const verifySignatures = credentials.verifyWebhookSignatures !== false;

		if (verifySignatures && state.chatwootWebhookSecret && !request.rawBody) {
			await request.readRawBody();
		}

		const body = this.getBodyData();

		const signature = verifyChatwootSignature({
			enabled: verifySignatures,
			headers,
			rawBody:
				request.rawBody === undefined
					? undefined
					: Buffer.isBuffer(request.rawBody)
						? request.rawBody
						: String(request.rawBody),
			secret: state.chatwootWebhookSecret,
		});

		if (!signature.accepted) {
			this.logger.warn('Chatwoot webhook signature rejected', { reason: signature.reason });
			return rejectWebhook(this, 401, 'Firma de webhook de Chatwoot inválida.');
		}
		if (!body || typeof body.event !== 'string') {
			this.logger.warn('Chatwoot webhook rejected because the event field is missing');
			return rejectWebhook(this, 400, 'El payload de Chatwoot no contiene un evento válido.');
		}

		const selectedEvent = this.getNodeParameter('event') as ChatwootEvent;
		if (body.event !== selectedEvent) {
			this.logger.warn('Chatwoot webhook ignored because its event does not match the node', {
				receivedEvent: body.event,
				selectedEvent,
			});
			return { webhookResponse: 'OK' };
		}

		const deliveryId = getHeader(headers, 'x-chatwoot-delivery');
		const normalized = normalizeWebhookPayload(body as IDataObject, {
			deliveryId,
			signatureVerified: signature.verified ? true : null,
		});

		this.logger.debug('Chatwoot webhook received', {
			deliveryId: deliveryId ?? 'not-provided',
			event: body.event,
		});

		return {
			workflowData: [this.helpers.returnJsonArray(normalized)],
		};
	}
}
