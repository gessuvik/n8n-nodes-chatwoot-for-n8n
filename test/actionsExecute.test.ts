import type { IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import { executeChatwootOperation } from '../nodes/Chatwoot/actions/execute';
import { OPERATION_CATALOG } from '../nodes/Chatwoot/actions/operations';

type Responder = (options: IHttpRequestOptions) => unknown | Promise<unknown>;

function createContext(parameters: Record<string, unknown>, responder: Responder) {
	const httpRequestWithAuthentication = vi.fn(
		async (_credentialName: string, options: IHttpRequestOptions) => responder(options),
	);
	const context = {
		getNodeParameter(name: string, _itemIndex: number, fallback?: unknown) {
			return Object.prototype.hasOwnProperty.call(parameters, name) ? parameters[name] : fallback;
		},
		async getCredentials() {
			return {
				accountId: 7,
				baseUrl: 'https://chatwoot.example.com',
				accessToken: 'never-logged',
				ignoreSslIssues: false,
			};
		},
		getNode() {
			return {
				id: 'chatwoot-action-test',
				name: 'Chatwoot',
				type: 'n8n-nodes-chatwoot-for-n8n.chatwoot',
				typeVersion: 1,
				position: [0, 0],
				parameters: {},
			};
		},
		helpers: { httpRequestWithAuthentication },
		logger: { debug: vi.fn() },
	} as unknown as IExecuteFunctions;
	return { context, httpRequestWithAuthentication };
}

function requestOptions(mock: ReturnType<typeof vi.fn>, index: number): IHttpRequestOptions {
	return mock.mock.calls[index][1] as IHttpRequestOptions;
}

const commonParameters: Record<string, unknown> = {
	contactId: 11,
	conversationId: 22,
	messageId: 33,
	inboxId: 44,
	labelId: 55,
	agentId: 66,
	teamId: 77,
	attributeDefinitionId: 88,
	name: 'Alice',
	email: 'alice@example.com',
	phoneNumber: '+595981123456',
	identifier: 'lead-001',
	sourceId: '',
	avatarUrl: '',
	blocked: false,
	contactUpdateFields: { name: 'Alice Updated' },
	matchBy: 'email',
	matchValue: 'alice@example.com',
	failIfNotFound: false,
	upsertFields: { name: 'Alice' },
	contactSort: 'name',
	sortDirection: 'asc',
	returnAll: false,
	limit: 1,
	attributeKey: 'score',
	attributeValue: '42',
	attributeKeys: ['score'],
	additionalAttributeKey: 'city',
	additionalAttributeValue: 'Asunción',
	blockedState: true,
	labels: ['new-label'],
	baseContactId: 11,
	mergeeContactId: 12,
	confirmMerge: true,
	confirmDeletion: true,
	status: 'open',
	initialMessage: '',
	conversationFilters: {},
	priority: 'high',
	customAttributesJson: '{}',
	content: 'Hello',
	messageOptions: {},
	messageSourceId: 'external-1',
	externalCreatedAt: '',
	templateName: 'welcome',
	templateCategory: 'UTILITY',
	templateLanguage: 'es',
	templateContent: 'Hola Alice',
	templateBodyParameters: { parameters: [{ key: '1', value: 'Alice' }] },
	templateHeader: {},
	messageStatus: 'delivered',
	externalError: '',
	attributeModelFilter: '',
	attributeDisplayName: 'Score',
	attributeDefinitionKey: 'score',
	attributeModel: 1,
	attributeDisplayType: 1,
	attributeDescription: 'Lead score',
	attributeValues: '',
	textValidation: {},
	attributeUpdateFields: { attribute_display_name: 'New Score' },
	labelTitle: 'priority',
	labelDescription: 'Priority leads',
	labelColor: '#1f93ff',
	showOnSidebar: true,
	labelUpdateFields: { title: 'priority-updated' },
	agentName: 'Support Agent',
	agentEmail: 'support@example.com',
	agentRole: 'agent',
	agentAvailability: 'offline',
	agentAutoOffline: true,
	agentUpdateFields: { availability: 'online' },
	teamName: 'Support',
	teamDescription: 'Support team',
	teamAutoAssign: true,
	teamUpdateFields: { name: 'Support L2' },
	agentIds: [66],
	inboxUpdateFields: { greeting_enabled: true },
};

function genericResponder(options: IHttpRequestOptions): unknown {
	const url = String(options.url);
	if (options.method === 'GET' && url.endsWith('/custom_attribute_definitions')) {
		return [
			{
				id: 88,
				attribute_key: 'score',
				attribute_display_name: 'Score',
				attribute_display_type: 'number',
				attribute_model: 'contact_attribute',
			},
		];
	}
	if (options.method === 'GET' && url.endsWith('/contacts/search')) {
		return { meta: { has_more: false }, payload: [] };
	}
	if (options.method === 'GET' && /\/contacts\?*$/.test(url)) return { payload: [] };
	if (options.method === 'GET' && url.endsWith('/labels')) return { payload: ['existing'] };
	if (options.method === 'GET' && url.endsWith('/messages')) return { payload: [] };
	if (options.method === 'GET' && url.endsWith('/conversations')) {
		return { data: { payload: [] } };
	}
	if (options.method === 'GET' && /\/contacts\/\d+$/.test(url)) {
		return { payload: { id: 11, custom_attributes: { score: 5 } } };
	}
	if (options.method === 'GET' && /\/conversations\/\d+$/.test(url)) {
		return { id: 22, custom_attributes: { score: 5 } };
	}
	if (options.method === 'GET') return [];
	return { id: 1, payload: { id: 1 } };
}

describe('Chatwoot action execution', () => {
	it('sets a typed contact attribute without replacing other keys', async () => {
		const { context, httpRequestWithAuthentication } = createContext(
			{
				...commonParameters,
				resource: 'contact',
				operation: 'setCustomAttribute',
			},
			genericResponder,
		);

		await executeChatwootOperation(context, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
		expect(requestOptions(httpRequestWithAuthentication, 0)).toMatchObject({
			method: 'GET',
			qs: { attribute_model: 'contact_attribute' },
		});
		expect(requestOptions(httpRequestWithAuthentication, 1)).toMatchObject({
			method: 'PATCH',
			body: { custom_attributes: { score: 42 } },
		});
	});

	it('sets conversation attributes with Chatwoot merge mode enabled', async () => {
		const { context, httpRequestWithAuthentication } = createContext(
			{
				...commonParameters,
				resource: 'conversation',
				operation: 'setCustomAttribute',
			},
			(options) => {
				if (String(options.url).endsWith('/custom_attribute_definitions')) {
					return [
						{
							attribute_key: 'score',
							attribute_display_type: 'number',
							attribute_model: 'conversation_attribute',
						},
					];
				}
				if (options.method === 'GET') {
					return { custom_attributes: { untouched: 'yes' } };
				}
				return { custom_attributes: { score: 42, untouched: 'yes' } };
			},
		);

		await executeChatwootOperation(context, 0);

		expect(requestOptions(httpRequestWithAuthentication, 2).body).toEqual({
			custom_attributes: { untouched: 'yes', score: 42 },
			merge: true,
		});
	});

	it('adds labels by reading and merging the existing list first', async () => {
		const { context, httpRequestWithAuthentication } = createContext(
			{
				...commonParameters,
				resource: 'conversation',
				operation: 'addLabels',
				labels: ['new-label', 'existing'],
			},
			(options) =>
				options.method === 'GET'
					? { payload: ['existing', 'vip'] }
					: { payload: ['existing', 'vip', 'new-label'] },
		);

		await executeChatwootOperation(context, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
		expect(requestOptions(httpRequestWithAuthentication, 1).body).toEqual({
			labels: ['existing', 'vip', 'new-label'],
		});
	});

	it('replaces labels explicitly without an unnecessary read', async () => {
		const { context, httpRequestWithAuthentication } = createContext(
			{
				...commonParameters,
				resource: 'contact',
				operation: 'replaceLabels',
				labels: ['only-this'],
			},
			() => ({ payload: ['only-this'] }),
		);

		await executeChatwootOperation(context, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
		expect(requestOptions(httpRequestWithAuthentication, 0)).toMatchObject({
			method: 'POST',
			body: { labels: ['only-this'] },
		});
	});

	it('updates an exact email match during upsert', async () => {
		const { context, httpRequestWithAuthentication } = createContext(
			{
				...commonParameters,
				resource: 'contact',
				operation: 'upsert',
			},
			(options) => {
				if (options.method === 'GET') {
					return { payload: [{ id: 91, email: 'Alice@Example.com' }], meta: { has_more: false } };
				}
				return { payload: { id: 91, email: 'alice@example.com', name: 'Alice' } };
			},
		);

		const result = await executeChatwootOperation(context, 0);

		expect(result.data).toMatchObject({ action: 'updated' });
		expect(requestOptions(httpRequestWithAuthentication, 1)).toMatchObject({
			method: 'PATCH',
			body: { name: 'Alice', email: 'alice@example.com' },
		});
		expect(requestOptions(httpRequestWithAuthentication, 1).url).toContain('/contacts/91');
	});

	it('creates a contact during upsert when there is no exact match', async () => {
		const { context, httpRequestWithAuthentication } = createContext(
			{
				...commonParameters,
				resource: 'contact',
				operation: 'upsert',
			},
			(options) =>
				options.method === 'GET'
					? { payload: [], meta: { has_more: false } }
					: { payload: { contact: { id: 92 } } },
		);

		const result = await executeChatwootOperation(context, 0);

		expect(result.data).toMatchObject({ action: 'created' });
		expect(requestOptions(httpRequestWithAuthentication, 1)).toMatchObject({
			method: 'POST',
			body: { inbox_id: 44, name: 'Alice', email: 'alice@example.com' },
		});
	});

	it('builds WhatsApp template parameters without requiring manual JSON', async () => {
		const { context, httpRequestWithAuthentication } = createContext(
			{
				...commonParameters,
				resource: 'message',
				operation: 'sendWhatsAppTemplate',
				templateHeader: {
					media_type: 'image',
					media_url: 'https://example.com/header.png',
				},
			},
			() => ({ id: 101 }),
		);

		await executeChatwootOperation(context, 0);

		expect(requestOptions(httpRequestWithAuthentication, 0).body).toMatchObject({
			content: 'Hola Alice',
			template_params: {
				name: 'welcome',
				category: 'UTILITY',
				language: 'es',
				processed_params: {
					body: { '1': 'Alice' },
					header: {
						media_type: 'image',
						media_url: 'https://example.com/header.png',
					},
				},
			},
		});
	});

	it('wraps administrative payloads in the resource key required by Chatwoot', async () => {
		const cases = [
			{
				resource: 'customAttribute',
				operation: 'create',
				wrapper: 'custom_attribute_definition',
				expected: { attribute_key: 'score', attribute_model: 1, attribute_display_type: 1 },
			},
			{
				resource: 'label',
				operation: 'create',
				wrapper: 'label',
				expected: { title: 'priority', color: '#1f93ff', show_on_sidebar: true },
			},
			{
				resource: 'agent',
				operation: 'create',
				wrapper: 'agent',
				expected: { email: 'support@example.com', role: 'agent', auto_offline: true },
			},
			{
				resource: 'team',
				operation: 'create',
				wrapper: 'team',
				expected: { name: 'Support', allow_auto_assign: true },
			},
		] as const;

		for (const testCase of cases) {
			const { context, httpRequestWithAuthentication } = createContext(
				{
					...commonParameters,
					resource: testCase.resource,
					operation: testCase.operation,
				},
				genericResponder,
			);

			await executeChatwootOperation(context, 0);

			const body = requestOptions(httpRequestWithAuthentication, 0).body as Record<
				string,
				unknown
			>;
			expect(body).toHaveProperty(testCase.wrapper);
			expect(body[testCase.wrapper]).toMatchObject(testCase.expected);
		}
	});

	it('does not call Chatwoot when a destructive action is unconfirmed', async () => {
		const { context, httpRequestWithAuthentication } = createContext(
			{
				...commonParameters,
				resource: 'conversation',
				operation: 'delete',
				confirmDeletion: false,
			},
			genericResponder,
		);

		await expect(executeChatwootOperation(context, 0)).rejects.toThrow('confirmación');
		expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
	});

	it('uses Chatwoot dash syntax for descending contact sorting', async () => {
		const { context, httpRequestWithAuthentication } = createContext(
			{
				...commonParameters,
				resource: 'contact',
				operation: 'getMany',
				contactSort: 'last_activity_at',
				sortDirection: 'desc',
			},
			() => ({ payload: [] }),
		);

		await executeChatwootOperation(context, 0);

		expect(requestOptions(httpRequestWithAuthentication, 0).qs).toMatchObject({
			sort: '-last_activity_at',
		});
	});

	it('dispatches every operation in the public catalog to an executor', async () => {
		for (const [resource, operations] of Object.entries(OPERATION_CATALOG)) {
			for (const operation of operations) {
				const { context } = createContext(
					{
						...commonParameters,
						resource,
						operation: operation.value,
					},
					genericResponder,
				);

				await expect(executeChatwootOperation(context, 0)).resolves.toMatchObject({
					trace: expect.any(Array),
				});
			}
		}
	});
});
