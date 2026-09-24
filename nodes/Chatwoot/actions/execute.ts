import type { IDataObject, IExecuteFunctions, IHttpRequestMethods } from 'n8n-workflow';

import {
	chatwootApiRequest,
	getChatwootCredentialConfig,
	type ChatwootRequestOptions,
} from '../shared/api';
import {
	coerceCustomAttributeValue,
	extractArray,
	extractStringArray,
	filterConversationsByActivity,
	findExactContact,
	isDataObject,
	parseCommaSeparated,
	parseJsonObject,
	requirePositiveInteger,
	simplifyChatwootResponse,
	toUnixSeconds,
	uniqueStrings,
	type CustomAttributeDefinition,
} from './helpers';

export interface ChatwootApiCallTrace extends IDataObject {
	method: IHttpRequestMethods;
	endpoint: string;
}

export interface ChatwootActionResult {
	data: unknown;
	raw: unknown;
	trace: ChatwootApiCallTrace[];
}

interface PaginatedResult {
	items: IDataObject[];
	raw: IDataObject;
}

type ExactMatchField = 'email' | 'identifier' | 'phone_number';

function ensureFields(fields: IDataObject, label: string): void {
	if (Object.keys(fields).length === 0) {
		throw new Error(`Selecciona al menos un campo en ${label}.`);
	}
}

function ensureConfirmed(value: unknown, action: string): void {
	if (value !== true) {
		throw new Error(`Activa la confirmación antes de ${action}.`);
	}
}

function optionalString(value: unknown): string | undefined {
	const normalized = String(value ?? '').trim();
	return normalized.length > 0 ? normalized : undefined;
}

function contactIdentityBody(context: IExecuteFunctions, itemIndex: number): IDataObject {
	const body: IDataObject = {
		inbox_id: requirePositiveInteger(context.getNodeParameter('inboxId', itemIndex), 'Inbox ID'),
		blocked: context.getNodeParameter('blocked', itemIndex, false) as boolean,
	};

	const values: Array<[string, unknown]> = [
		['name', context.getNodeParameter('name', itemIndex, '')],
		['email', context.getNodeParameter('email', itemIndex, '')],
		['phone_number', context.getNodeParameter('phoneNumber', itemIndex, '')],
		['identifier', context.getNodeParameter('identifier', itemIndex, '')],
		['source_id', context.getNodeParameter('sourceId', itemIndex, '')],
		['avatar_url', context.getNodeParameter('avatarUrl', itemIndex, '')],
	];
	for (const [key, value] of values) {
		const normalized = optionalString(value);
		if (normalized !== undefined) body[key] = normalized;
	}

	if (!['name', 'email', 'phone_number', 'identifier'].some((key) => body[key] !== undefined)) {
		throw new Error('Completa al menos Name, Email, Phone Number o External Identifier.');
	}
	return body;
}

async function findAttributeDefinition(
	request: (
		method: IHttpRequestMethods,
		endpoint: string,
		options?: ChatwootRequestOptions,
	) => Promise<unknown>,
	basePath: string,
	attributeModel: 'contact_attribute' | 'conversation_attribute',
	attributeReference: string,
): Promise<CustomAttributeDefinition> {
	const response = await request('GET', `${basePath}/custom_attribute_definitions`, {
		qs: { attribute_model: attributeModel },
	});
	const definition = extractArray(response).find(
		(candidate) =>
			String(candidate.attribute_key) === attributeReference ||
			String(candidate.id) === attributeReference ||
			String(candidate.attribute_display_name) === attributeReference,
	) as CustomAttributeDefinition | undefined;
	if (!definition) {
		throw new Error(
			`Chatwoot no devolvió una definición ${attributeModel === 'contact_attribute' ? 'de contacto' : 'de conversación'} para "${attributeReference}". Recarga el dropdown y verifica que el atributo todavía exista.`,
		);
	}
	return definition;
}

async function resolveAttributeKeys(
	request: (
		method: IHttpRequestMethods,
		endpoint: string,
		options?: ChatwootRequestOptions,
	) => Promise<unknown>,
	basePath: string,
	attributeModel: 'contact_attribute' | 'conversation_attribute',
	references: string[],
): Promise<string[]> {
	const response = await request('GET', `${basePath}/custom_attribute_definitions`, {
		qs: { attribute_model: attributeModel },
	});
	const definitions = extractArray(response);
	return uniqueStrings(
		references.map((reference) => {
			const definition = definitions.find(
				(candidate) =>
					String(candidate.attribute_key) === reference ||
					String(candidate.id) === reference ||
					String(candidate.attribute_display_name) === reference,
			);
			if (!definition?.attribute_key) {
				throw new Error(`Chatwoot no encontró el atributo "${reference}".`);
			}
			return String(definition.attribute_key);
		}),
	);
}

async function resolveLabelTitles(
	request: (
		method: IHttpRequestMethods,
		endpoint: string,
		options?: ChatwootRequestOptions,
	) => Promise<unknown>,
	basePath: string,
	values: string[],
): Promise<string[]> {
	if (!values.some((value) => /^\d+$/.test(value))) return values;
	const response = await request('GET', `${basePath}/labels`);
	const labels = extractArray(response);
	return values.map((value) => {
		if (!/^\d+$/.test(value)) return value;
		const label = labels.find((candidate) => String(candidate.id) === value);
		if (!label?.title) throw new Error(`Chatwoot no encontró la etiqueta con ID ${value}.`);
		return String(label.title);
	});
}

async function findExactContactThroughApi(
	request: (
		method: IHttpRequestMethods,
		endpoint: string,
		options?: ChatwootRequestOptions,
	) => Promise<unknown>,
	basePath: string,
	field: ExactMatchField,
	value: string,
): Promise<{ contact?: IDataObject; pages: unknown[] }> {
	const pages: unknown[] = [];
	for (let page = 1; page <= 1000; page++) {
		const response = await request('GET', `${basePath}/contacts/search`, {
			qs: { q: value, page, include_contact_inboxes: true },
		});
		pages.push(response);
		const candidates = extractArray(response);
		const contact = findExactContact(candidates, field, value);
		if (contact) return { contact, pages };

		const hasMore =
			isDataObject(response) && isDataObject(response.meta)
				? response.meta.has_more
				: undefined;
		if (hasMore === false || candidates.length === 0) break;
	}
	return { pages };
}

async function paginateByPage(
	request: (
		method: IHttpRequestMethods,
		endpoint: string,
		options?: ChatwootRequestOptions,
	) => Promise<unknown>,
	endpoint: string,
	query: IDataObject,
	returnAll: boolean,
	limit: number,
): Promise<PaginatedResult> {
	const items: IDataObject[] = [];
	const pages: unknown[] = [];
	const target = returnAll ? Number.POSITIVE_INFINITY : limit;

	for (let page = 1; page <= 1000 && items.length < target; page++) {
		const response = await request('GET', endpoint, { qs: { ...query, page } });
		pages.push(response);
		const pageItems = extractArray(response);
		if (pageItems.length === 0) break;
		items.push(...pageItems);
		if (
			isDataObject(response) &&
			isDataObject(response.meta) &&
			response.meta.has_more === false
		) {
			break;
		}
	}

	return { items: items.slice(0, target), raw: { pages } };
}

async function paginateMessages(
	request: (
		method: IHttpRequestMethods,
		endpoint: string,
		options?: ChatwootRequestOptions,
	) => Promise<unknown>,
	endpoint: string,
	returnAll: boolean,
	limit: number,
): Promise<PaginatedResult> {
	const pages: unknown[] = [];
	let messages: IDataObject[] = [];
	let before: number | undefined;
	const target = returnAll ? Number.POSITIVE_INFINITY : limit;

	for (let page = 0; page < 1000 && messages.length < target; page++) {
		const response = await request('GET', endpoint, before ? { qs: { before } } : {});
		pages.push(response);
		const pageMessages = extractArray(response);
		if (pageMessages.length === 0) break;
		messages = [...pageMessages, ...messages];
		const firstId = Number(pageMessages[0]?.id);
		if (!Number.isInteger(firstId) || firstId <= 0 || firstId === before) break;
		before = firstId;
	}

	const deduplicated = [...new Map(messages.map((message) => [String(message.id), message])).values()];
	return {
		items: returnAll ? deduplicated : deduplicated.slice(Math.max(0, deduplicated.length - limit)),
		raw: { pages },
	};
}

export async function executeChatwootOperation(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<ChatwootActionResult> {
	const resource = String(context.getNodeParameter('resource', itemIndex));
	const operation = String(context.getNodeParameter('operation', itemIndex));
	const { accountId } = await getChatwootCredentialConfig(context);
	const basePath = `/api/v1/accounts/${accountId}`;
	const trace: ChatwootApiCallTrace[] = [];

	const request = async (
		method: IHttpRequestMethods,
		endpoint: string,
		options: ChatwootRequestOptions = {},
	): Promise<unknown> => {
		trace.push({ method, endpoint });
		context.logger.debug('Executing Chatwoot API action', {
			resource,
			operation,
			method,
			endpoint,
		});
		return chatwootApiRequest(context, method, endpoint, options);
	};

	let raw: unknown;
	let data: unknown;

	if (resource === 'contact') {
		if (operation === 'create') {
			const body = contactIdentityBody(context, itemIndex);
			raw = await request('POST', `${basePath}/contacts`, { body });
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'get') {
			const id = requirePositiveInteger(context.getNodeParameter('contactId', itemIndex), 'Contact ID');
			raw = await request('GET', `${basePath}/contacts/${id}`);
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'getMany' || operation === 'search') {
			const returnEveryRecord = context.getNodeParameter('returnAll', itemIndex, false) as boolean;
			const requestedLimit = returnEveryRecord
				? 10000
				: requirePositiveInteger(context.getNodeParameter('limit', itemIndex, 50), 'Limit');
			const sortField = String(context.getNodeParameter('contactSort', itemIndex, 'name'));
			const sortDirection = String(context.getNodeParameter('sortDirection', itemIndex, 'asc'));
			const sort = sortDirection === 'desc' ? `-${sortField}` : sortField;
			const query: IDataObject = { sort, include_contact_inboxes: true };
			let endpoint = `${basePath}/contacts`;
			if (operation === 'search') {
				endpoint = `${basePath}/contacts/search`;
				query.q = String(context.getNodeParameter('query', itemIndex));
			}
			const result = await paginateByPage(
				request,
				endpoint,
				query,
				returnEveryRecord,
				requestedLimit,
			);
			raw = result.raw;
			data = result.items;
		} else if (operation === 'findExact') {
			const field = context.getNodeParameter('matchBy', itemIndex) as ExactMatchField;
			const value = String(context.getNodeParameter('matchValue', itemIndex)).trim();
			const result = await findExactContactThroughApi(request, basePath, field, value);
			raw = { pages: result.pages };
			if (!result.contact) {
				if (context.getNodeParameter('failIfNotFound', itemIndex, true) as boolean) {
					throw new Error(`No existe un contacto cuyo campo ${field} sea exactamente "${value}".`);
				}
				data = { found: false, matchBy: field, matchValue: value };
			} else {
				data = { found: true, contact: result.contact };
			}
		} else if (operation === 'update') {
			const id = requirePositiveInteger(context.getNodeParameter('contactId', itemIndex), 'Contact ID');
			const fields = context.getNodeParameter('contactUpdateFields', itemIndex, {}) as IDataObject;
			ensureFields(fields, 'Fields to Update');
			raw = await request('PATCH', `${basePath}/contacts/${id}`, { body: fields });
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'upsert') {
			const field = context.getNodeParameter('matchBy', itemIndex) as ExactMatchField;
			const value = String(context.getNodeParameter('matchValue', itemIndex)).trim();
			const fields = {
				...(context.getNodeParameter('upsertFields', itemIndex, {}) as IDataObject),
				[field]: value,
			};
			const found = await findExactContactThroughApi(request, basePath, field, value);
			if (found.contact) {
				const id = requirePositiveInteger(found.contact.id, 'Contact ID encontrado');
				const response = await request('PATCH', `${basePath}/contacts/${id}`, { body: fields });
				raw = { searchPages: found.pages, updateResponse: response };
				data = { action: 'updated', contact: simplifyChatwootResponse(response) };
			} else {
				const inboxId = requirePositiveInteger(context.getNodeParameter('inboxId', itemIndex), 'Inbox ID');
				const response = await request('POST', `${basePath}/contacts`, {
					body: { inbox_id: inboxId, ...fields },
				});
				raw = { searchPages: found.pages, createResponse: response };
				data = { action: 'created', contact: simplifyChatwootResponse(response) };
			}
		} else if (operation === 'setBlocked') {
			const id = requirePositiveInteger(context.getNodeParameter('contactId', itemIndex), 'Contact ID');
			raw = await request('PATCH', `${basePath}/contacts/${id}`, {
				body: { blocked: context.getNodeParameter('blockedState', itemIndex) as boolean },
			});
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'getCustomAttribute' || operation === 'setCustomAttribute') {
			const id = requirePositiveInteger(context.getNodeParameter('contactId', itemIndex), 'Contact ID');
			const attributeReference = String(context.getNodeParameter('attributeKey', itemIndex));
			const definition = await findAttributeDefinition(
				request,
				basePath,
				'contact_attribute',
				attributeReference,
			);
			const key = String(definition.attribute_key);
			if (operation === 'getCustomAttribute') {
				raw = await request('GET', `${basePath}/contacts/${id}`);
				const contact = simplifyChatwootResponse(raw);
				const attributes = isDataObject(contact) && isDataObject(contact.custom_attributes)
					? contact.custom_attributes
					: {};
				data = {
					contactId: id,
					attributeKey: key,
					exists: Object.prototype.hasOwnProperty.call(attributes, key),
					value: attributes[key] ?? null,
				};
			} else {
				const value = coerceCustomAttributeValue(
					context.getNodeParameter('attributeValue', itemIndex),
					definition.attribute_display_type,
				);
				raw = await request('PATCH', `${basePath}/contacts/${id}`, {
					body: { custom_attributes: { [key]: value } },
				});
				data = simplifyChatwootResponse(raw);
			}
		} else if (operation === 'removeCustomAttributes') {
			const id = requirePositiveInteger(context.getNodeParameter('contactId', itemIndex), 'Contact ID');
			const references = uniqueStrings(
				context.getNodeParameter('attributeKeys', itemIndex) as unknown[],
			);
			if (references.length === 0) throw new Error('Selecciona al menos un atributo para eliminar.');
			const keys = await resolveAttributeKeys(
				request,
				basePath,
				'contact_attribute',
				references,
			);
			raw = await request('POST', `${basePath}/contacts/${id}/destroy_custom_attributes`, {
				body: { custom_attributes: keys },
			});
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'setAdditionalAttribute') {
			const id = requirePositiveInteger(context.getNodeParameter('contactId', itemIndex), 'Contact ID');
			const selectedKey = String(context.getNodeParameter('additionalAttributeKey', itemIndex));
			const key =
				selectedKey === '__custom__'
					? String(context.getNodeParameter('customAdditionalAttributeKey', itemIndex)).trim()
					: selectedKey;
			if (!key) throw new Error('Custom Key no puede estar vacío.');
			raw = await request('PATCH', `${basePath}/contacts/${id}`, {
				body: {
					additional_attributes: {
						[key]: context.getNodeParameter('additionalAttributeValue', itemIndex),
					},
				},
			});
			data = simplifyChatwootResponse(raw);
		} else if (
			['getLabels', 'addLabels', 'removeLabels', 'replaceLabels'].includes(operation)
		) {
			const id = requirePositiveInteger(context.getNodeParameter('contactId', itemIndex), 'Contact ID');
			const endpoint = `${basePath}/contacts/${id}/labels`;
			if (operation === 'getLabels') {
				raw = await request('GET', endpoint);
				data = simplifyChatwootResponse(raw);
			} else {
				const selected = await resolveLabelTitles(
					request,
					basePath,
					uniqueStrings(context.getNodeParameter('labels', itemIndex) as unknown[]),
				);
				let finalLabels = selected;
				let existingResponse: unknown;
				if (operation !== 'replaceLabels') {
					existingResponse = await request('GET', endpoint);
					const existing = extractStringArray(existingResponse);
					finalLabels =
						operation === 'addLabels'
							? uniqueStrings([...existing, ...selected])
							: existing.filter((label) => !selected.includes(label));
				}
				const response = await request('POST', endpoint, { body: { labels: finalLabels } });
				raw = existingResponse
					? { existingLabelsResponse: existingResponse, updateResponse: response }
					: response;
				data = simplifyChatwootResponse(response);
			}
		} else if (operation === 'getConversations') {
			const id = requirePositiveInteger(context.getNodeParameter('contactId', itemIndex), 'Contact ID');
			raw = await request('GET', `${basePath}/contacts/${id}/conversations`);
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'createContactInbox') {
			const id = requirePositiveInteger(context.getNodeParameter('contactId', itemIndex), 'Contact ID');
			const body: IDataObject = {
				inbox_id: requirePositiveInteger(context.getNodeParameter('inboxId', itemIndex), 'Inbox ID'),
			};
			const sourceId = optionalString(context.getNodeParameter('sourceId', itemIndex, ''));
			if (sourceId) body.source_id = sourceId;
			raw = await request('POST', `${basePath}/contacts/${id}/contact_inboxes`, { body });
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'merge') {
			ensureConfirmed(context.getNodeParameter('confirmMerge', itemIndex), 'fusionar contactos');
			const baseContactId = requirePositiveInteger(
				context.getNodeParameter('baseContactId', itemIndex),
				'Base Contact ID',
			);
			const mergeeContactId = requirePositiveInteger(
				context.getNodeParameter('mergeeContactId', itemIndex),
				'Contact to Merge and Delete',
			);
			if (baseContactId === mergeeContactId) {
				throw new Error('Los dos contactos de la fusión deben ser diferentes.');
			}
			raw = await request('POST', `${basePath}/actions/contact_merge`, {
				body: { base_contact_id: baseContactId, mergee_contact_id: mergeeContactId },
			});
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'delete') {
			ensureConfirmed(context.getNodeParameter('confirmDeletion', itemIndex), 'eliminar el contacto');
			const id = requirePositiveInteger(context.getNodeParameter('contactId', itemIndex), 'Contact ID');
			raw = await request('DELETE', `${basePath}/contacts/${id}`);
			data = simplifyChatwootResponse(raw);
		} else {
			throw new Error(`La operación de contacto "${operation}" no está implementada.`);
		}
	} else if (resource === 'conversation') {
		if (operation === 'create') {
			const body: IDataObject = {
				inbox_id: requirePositiveInteger(context.getNodeParameter('inboxId', itemIndex), 'Inbox ID'),
				contact_id: requirePositiveInteger(context.getNodeParameter('contactId', itemIndex), 'Contact ID'),
				status: String(context.getNodeParameter('status', itemIndex, 'open')),
			};
			const sourceId = optionalString(context.getNodeParameter('sourceId', itemIndex, ''));
			const initialMessage = optionalString(context.getNodeParameter('initialMessage', itemIndex, ''));
			if (sourceId) body.source_id = sourceId;
			if (initialMessage) body.message = { content: initialMessage };
			raw = await request('POST', `${basePath}/conversations`, { body });
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'get') {
			const id = requirePositiveInteger(
				context.getNodeParameter('conversationId', itemIndex),
				'Conversation ID',
			);
			raw = await request('GET', `${basePath}/conversations/${id}`);
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'getMany') {
			const returnEveryRecord = context.getNodeParameter('returnAll', itemIndex, false) as boolean;
			const requestedLimit = returnEveryRecord
				? 10000
				: requirePositiveInteger(context.getNodeParameter('limit', itemIndex, 50), 'Limit');
			const query = context.getNodeParameter('conversationFilters', itemIndex, {}) as IDataObject;
			const activityRange = context.getNodeParameter('activityRange', itemIndex, {}) as IDataObject;
			const result = await paginateByPage(
				request,
				`${basePath}/conversations`,
				query,
				returnEveryRecord,
				requestedLimit,
			);
			raw = result.raw;
			data = filterConversationsByActivity(result.items, activityRange);
		} else {
			const id = requirePositiveInteger(
				context.getNodeParameter('conversationId', itemIndex),
				'Conversation ID',
			);
			const conversationPath = `${basePath}/conversations/${id}`;
			if (operation === 'setStatus') {
				const status = String(context.getNodeParameter('status', itemIndex));
				const body: IDataObject = { status };
				if (status === 'snoozed') {
					const snoozedUntil = toUnixSeconds(context.getNodeParameter('snoozedUntil', itemIndex, ''));
					if (snoozedUntil !== undefined) body.snoozed_until = snoozedUntil;
				}
				raw = await request('POST', `${conversationPath}/toggle_status`, { body });
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'setPriority') {
				raw = await request('POST', `${conversationPath}/toggle_priority`, {
					body: { priority: context.getNodeParameter('priority', itemIndex) },
				});
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'assignAgent') {
				raw = await request('POST', `${conversationPath}/assignments`, {
					body: {
						assignee_id: requirePositiveInteger(
							context.getNodeParameter('agentId', itemIndex),
							'Agent ID',
						),
					},
				});
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'unassignAgent') {
				raw = await request('POST', `${conversationPath}/assignments`, {
					body: { assignee_id: null },
				});
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'assignTeam') {
				raw = await request('POST', `${conversationPath}/assignments`, {
					body: {
						team_id: requirePositiveInteger(
							context.getNodeParameter('teamId', itemIndex),
							'Team ID',
						),
					},
				});
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'unassignTeam') {
				raw = await request('POST', `${conversationPath}/assignments`, {
					body: { team_id: 0 },
				});
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'getCustomAttribute' || operation === 'setCustomAttribute') {
				const attributeReference = String(context.getNodeParameter('attributeKey', itemIndex));
				const definition = await findAttributeDefinition(
					request,
					basePath,
					'conversation_attribute',
					attributeReference,
				);
				const key = String(definition.attribute_key);
				if (operation === 'getCustomAttribute') {
					raw = await request('GET', conversationPath);
					const conversation = simplifyChatwootResponse(raw);
					const attributes =
						isDataObject(conversation) && isDataObject(conversation.custom_attributes)
							? conversation.custom_attributes
							: {};
					data = {
						conversationId: id,
						attributeKey: key,
						exists: Object.prototype.hasOwnProperty.call(attributes, key),
						value: attributes[key] ?? null,
					};
				} else {
					const value = coerceCustomAttributeValue(
						context.getNodeParameter('attributeValue', itemIndex),
						definition.attribute_display_type,
					);
					const currentResponse = await request('GET', conversationPath);
					const currentConversation = simplifyChatwootResponse(currentResponse);
					const currentAttributes =
						isDataObject(currentConversation) && isDataObject(currentConversation.custom_attributes)
							? currentConversation.custom_attributes
							: {};
					const updateResponse = await request('POST', `${conversationPath}/custom_attributes`, {
						body: {
							custom_attributes: { ...currentAttributes, [key]: value },
							merge: true,
						},
					});
					raw = { currentConversationResponse: currentResponse, updateResponse };
					data = simplifyChatwootResponse(updateResponse);
				}
			} else if (operation === 'removeCustomAttributes') {
				const references = uniqueStrings(
					context.getNodeParameter('attributeKeys', itemIndex) as unknown[],
				);
				if (references.length === 0) {
					throw new Error('Selecciona al menos un atributo para eliminar.');
				}
				const keys = await resolveAttributeKeys(
					request,
					basePath,
					'conversation_attribute',
					references,
				);
				raw = await request('POST', `${conversationPath}/destroy_custom_attributes`, {
					body: { custom_attributes: keys },
				});
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'replaceCustomAttributes') {
				const attributes = parseJsonObject(
					context.getNodeParameter('customAttributesJson', itemIndex, '{}'),
				);
				raw = await request('POST', `${conversationPath}/custom_attributes`, {
					body: { custom_attributes: attributes, merge: false },
				});
				data = simplifyChatwootResponse(raw);
			} else if (
				['getLabels', 'addLabels', 'removeLabels', 'replaceLabels'].includes(operation)
			) {
				const endpoint = `${conversationPath}/labels`;
				if (operation === 'getLabels') {
					raw = await request('GET', endpoint);
					data = simplifyChatwootResponse(raw);
				} else {
					const selected = await resolveLabelTitles(
						request,
						basePath,
						uniqueStrings(context.getNodeParameter('labels', itemIndex) as unknown[]),
					);
					let finalLabels = selected;
					let existingResponse: unknown;
					if (operation !== 'replaceLabels') {
						existingResponse = await request('GET', endpoint);
						const existing = extractStringArray(existingResponse);
						finalLabels =
							operation === 'addLabels'
								? uniqueStrings([...existing, ...selected])
								: existing.filter((label) => !selected.includes(label));
					}
					const response = await request('POST', endpoint, { body: { labels: finalLabels } });
					raw = existingResponse
						? { existingLabelsResponse: existingResponse, updateResponse: response }
						: response;
					data = simplifyChatwootResponse(response);
				}
			} else if (operation === 'mute' || operation === 'unmute') {
				raw = await request('POST', `${conversationPath}/${operation}`);
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'markRead') {
				raw = await request('POST', `${conversationPath}/update_last_seen`);
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'markUnread') {
				raw = await request('POST', `${conversationPath}/unread`);
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'delete') {
				ensureConfirmed(
					context.getNodeParameter('confirmDeletion', itemIndex),
					'eliminar la conversación',
				);
				raw = await request('DELETE', conversationPath);
				data = simplifyChatwootResponse(raw);
			} else {
				throw new Error(`La operación de conversación "${operation}" no está implementada.`);
			}
		}
	} else if (resource === 'message') {
		const conversation = requirePositiveInteger(
			context.getNodeParameter('conversationId', itemIndex),
			'Conversation ID',
		);
		const messagesPath = `${basePath}/conversations/${conversation}/messages`;
		if (operation === 'getMany') {
			const returnEveryRecord = context.getNodeParameter('returnAll', itemIndex, false) as boolean;
			const requestedLimit = returnEveryRecord
				? 10000
				: requirePositiveInteger(context.getNodeParameter('limit', itemIndex, 20), 'Limit');
			const result = await paginateMessages(
				request,
				messagesPath,
				returnEveryRecord,
				requestedLimit,
			);
			raw = result.raw;
			data = result.items;
		} else if (operation === 'send') {
			const options = context.getNodeParameter('messageOptions', itemIndex, {}) as IDataObject;
			const body: IDataObject = {
				content: context.getNodeParameter('content', itemIndex),
				message_type: 'outgoing',
				private: false,
				content_type: options.content_type ?? 'text',
			};
			if (Number(options.in_reply_to) > 0) {
				body.content_attributes = { in_reply_to: Number(options.in_reply_to) };
			}
			raw = await request('POST', messagesPath, { body });
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'addNote') {
			raw = await request('POST', messagesPath, {
				body: {
					content: context.getNodeParameter('content', itemIndex),
					message_type: 'outgoing',
					private: true,
					content_type: 'text',
				},
			});
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'createIncoming') {
			const body: IDataObject = {
				content: context.getNodeParameter('content', itemIndex),
				message_type: 'incoming',
				private: false,
				content_type: 'text',
			};
			const sourceId = optionalString(context.getNodeParameter('messageSourceId', itemIndex, ''));
			const externalCreatedAt = optionalString(
				context.getNodeParameter('externalCreatedAt', itemIndex, ''),
			);
			if (sourceId) body.source_id = sourceId;
			if (externalCreatedAt) body.external_created_at = externalCreatedAt;
			raw = await request('POST', messagesPath, { body });
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'sendWhatsAppTemplate') {
			const parameterCollection = context.getNodeParameter(
				'templateBodyParameters',
				itemIndex,
				{},
			) as IDataObject;
			const parameters = Array.isArray(parameterCollection.parameters)
				? parameterCollection.parameters.filter(isDataObject)
				: [];
			const bodyParameters: IDataObject = {};
			for (const parameter of parameters) {
				const key = String(parameter.key ?? '').trim();
				if (key) bodyParameters[key] = String(parameter.value ?? '');
			}
			const header = context.getNodeParameter('templateHeader', itemIndex, {}) as IDataObject;
			const processedParams: IDataObject = { body: bodyParameters };
			if (optionalString(header.media_url)) {
				processedParams.header = {
					media_url: String(header.media_url),
					media_type: String(header.media_type ?? 'image'),
				};
			}
			raw = await request('POST', messagesPath, {
				body: {
					content: context.getNodeParameter('templateContent', itemIndex),
					message_type: 'outgoing',
					private: false,
					template_params: {
						name: context.getNodeParameter('templateName', itemIndex),
						category: context.getNodeParameter('templateCategory', itemIndex),
						language: context.getNodeParameter('templateLanguage', itemIndex),
						content_mode: 'rendered',
						processed_params: processedParams,
					},
				},
			});
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'updateStatus') {
			const messageId = requirePositiveInteger(
				context.getNodeParameter('messageId', itemIndex),
				'Message ID',
			);
			const body: IDataObject = {
				status: context.getNodeParameter('messageStatus', itemIndex),
			};
			const externalError = optionalString(context.getNodeParameter('externalError', itemIndex, ''));
			if (externalError) body.external_error = externalError;
			raw = await request('PATCH', `${messagesPath}/${messageId}`, { body });
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'delete') {
			ensureConfirmed(context.getNodeParameter('confirmDeletion', itemIndex), 'eliminar el mensaje');
			const messageId = requirePositiveInteger(
				context.getNodeParameter('messageId', itemIndex),
				'Message ID',
			);
			raw = await request('DELETE', `${messagesPath}/${messageId}`);
			data = simplifyChatwootResponse(raw);
		} else {
			throw new Error(`La operación de mensaje "${operation}" no está implementada.`);
		}
	} else if (resource === 'customAttribute') {
		const endpoint = `${basePath}/custom_attribute_definitions`;
		if (operation === 'getMany') {
			const model = optionalString(context.getNodeParameter('attributeModelFilter', itemIndex, ''));
			raw = await request('GET', endpoint, model ? { qs: { attribute_model: model } } : {});
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'create') {
			const displayType = Number(context.getNodeParameter('attributeDisplayType', itemIndex));
			const body: IDataObject = {
				attribute_display_name: context.getNodeParameter('attributeDisplayName', itemIndex),
				attribute_key: context.getNodeParameter('attributeDefinitionKey', itemIndex),
				attribute_model: context.getNodeParameter('attributeModel', itemIndex),
				attribute_display_type: displayType,
				attribute_description: context.getNodeParameter('attributeDescription', itemIndex, ''),
			};
			if (displayType === 6) {
				body.attribute_values = parseCommaSeparated(
					context.getNodeParameter('attributeValues', itemIndex, ''),
				);
			}
			if (displayType === 0) {
				Object.assign(
					body,
					context.getNodeParameter('textValidation', itemIndex, {}) as IDataObject,
				);
			}
			raw = await request('POST', endpoint, {
				body: { custom_attribute_definition: body },
			});
			data = simplifyChatwootResponse(raw);
		} else {
			const id = requirePositiveInteger(
				context.getNodeParameter('attributeDefinitionId', itemIndex),
				'Attribute Definition ID',
			);
			if (operation === 'get') {
				raw = await request('GET', `${endpoint}/${id}`);
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'update') {
				const fields = context.getNodeParameter('attributeUpdateFields', itemIndex, {}) as IDataObject;
				ensureFields(fields, 'Fields to Update');
				if (typeof fields.attribute_values === 'string') {
					fields.attribute_values = parseCommaSeparated(fields.attribute_values);
				}
				raw = await request('PATCH', `${endpoint}/${id}`, {
					body: { custom_attribute_definition: fields },
				});
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'delete') {
				ensureConfirmed(
					context.getNodeParameter('confirmDeletion', itemIndex),
					'eliminar la definición',
				);
				raw = await request('DELETE', `${endpoint}/${id}`);
				data = simplifyChatwootResponse(raw);
			} else {
				throw new Error(`La operación de atributo "${operation}" no está implementada.`);
			}
		}
	} else if (resource === 'label') {
		const endpoint = `${basePath}/labels`;
		if (operation === 'getMany') {
			raw = await request('GET', endpoint);
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'create') {
			raw = await request('POST', endpoint, {
				body: {
					label: {
					title: context.getNodeParameter('labelTitle', itemIndex),
					description: context.getNodeParameter('labelDescription', itemIndex, ''),
					color: context.getNodeParameter('labelColor', itemIndex),
					show_on_sidebar: context.getNodeParameter('showOnSidebar', itemIndex),
					},
				},
			});
			data = simplifyChatwootResponse(raw);
		} else {
			const id = requirePositiveInteger(context.getNodeParameter('labelId', itemIndex), 'Label ID');
			if (operation === 'get') {
				raw = await request('GET', `${endpoint}/${id}`);
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'update') {
				const fields = context.getNodeParameter('labelUpdateFields', itemIndex, {}) as IDataObject;
				ensureFields(fields, 'Fields to Update');
				raw = await request('PATCH', `${endpoint}/${id}`, { body: { label: fields } });
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'delete') {
				ensureConfirmed(context.getNodeParameter('confirmDeletion', itemIndex), 'eliminar la etiqueta');
				raw = await request('DELETE', `${endpoint}/${id}`);
				data = simplifyChatwootResponse(raw);
			} else {
				throw new Error(`La operación de etiqueta "${operation}" no está implementada.`);
			}
		}
	} else if (resource === 'agent') {
		const endpoint = `${basePath}/agents`;
		if (operation === 'getMany') {
			raw = await request('GET', endpoint);
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'create') {
			raw = await request('POST', endpoint, {
				body: {
					agent: {
					name: context.getNodeParameter('agentName', itemIndex),
					email: context.getNodeParameter('agentEmail', itemIndex),
					role: context.getNodeParameter('agentRole', itemIndex),
					availability: context.getNodeParameter('agentAvailability', itemIndex),
					auto_offline: context.getNodeParameter('agentAutoOffline', itemIndex),
					},
				},
			});
			data = simplifyChatwootResponse(raw);
		} else {
			const id = requirePositiveInteger(context.getNodeParameter('agentId', itemIndex), 'Agent ID');
			if (operation === 'update') {
				const fields = context.getNodeParameter('agentUpdateFields', itemIndex, {}) as IDataObject;
				ensureFields(fields, 'Fields to Update');
				raw = await request('PATCH', `${endpoint}/${id}`, { body: { agent: fields } });
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'delete') {
				ensureConfirmed(context.getNodeParameter('confirmDeletion', itemIndex), 'remover el agente');
				raw = await request('DELETE', `${endpoint}/${id}`);
				data = simplifyChatwootResponse(raw);
			} else {
				throw new Error(`La operación de agente "${operation}" no está implementada.`);
			}
		}
	} else if (resource === 'team') {
		const endpoint = `${basePath}/teams`;
		if (operation === 'getMany') {
			raw = await request('GET', endpoint);
			data = simplifyChatwootResponse(raw);
		} else if (operation === 'create') {
			raw = await request('POST', endpoint, {
				body: {
					team: {
					name: context.getNodeParameter('teamName', itemIndex),
					description: context.getNodeParameter('teamDescription', itemIndex, ''),
					allow_auto_assign: context.getNodeParameter('teamAutoAssign', itemIndex),
					},
				},
			});
			data = simplifyChatwootResponse(raw);
		} else {
			const id = requirePositiveInteger(context.getNodeParameter('teamId', itemIndex), 'Team ID');
			const teamPath = `${endpoint}/${id}`;
			if (operation === 'get') {
				raw = await request('GET', teamPath);
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'update') {
				const fields = context.getNodeParameter('teamUpdateFields', itemIndex, {}) as IDataObject;
				ensureFields(fields, 'Fields to Update');
				raw = await request('PATCH', teamPath, { body: { team: fields } });
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'delete') {
				ensureConfirmed(context.getNodeParameter('confirmDeletion', itemIndex), 'eliminar el equipo');
				raw = await request('DELETE', teamPath);
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'getMembers') {
				raw = await request('GET', `${teamPath}/team_members`);
				data = simplifyChatwootResponse(raw);
			} else if (['addMembers', 'replaceMembers', 'removeMembers'].includes(operation)) {
				const userIds = (context.getNodeParameter('agentIds', itemIndex) as unknown[]).map((value) =>
					requirePositiveInteger(value, 'Agent ID'),
				);
				if (userIds.length === 0 && operation !== 'replaceMembers') {
					throw new Error('Selecciona al menos un agente.');
				}
				const method: IHttpRequestMethods =
					operation === 'addMembers' ? 'POST' : operation === 'replaceMembers' ? 'PATCH' : 'DELETE';
				raw = await request(method, `${teamPath}/team_members`, { body: { user_ids: userIds } });
				data = simplifyChatwootResponse(raw);
			} else {
				throw new Error(`La operación de equipo "${operation}" no está implementada.`);
			}
		}
	} else if (resource === 'inbox') {
		const endpoint = `${basePath}/inboxes`;
		if (operation === 'getMany') {
			raw = await request('GET', endpoint);
			data = simplifyChatwootResponse(raw);
		} else {
			const id = requirePositiveInteger(context.getNodeParameter('inboxId', itemIndex), 'Inbox ID');
			if (operation === 'get') {
				raw = await request('GET', `${endpoint}/${id}`);
				data = simplifyChatwootResponse(raw);
			} else if (operation === 'update') {
				const fields = context.getNodeParameter('inboxUpdateFields', itemIndex, {}) as IDataObject;
				ensureFields(fields, 'Fields to Update');
				raw = await request('PATCH', `${endpoint}/${id}`, { body: fields });
				data = simplifyChatwootResponse(raw);
			} else {
				throw new Error(`La operación de inbox "${operation}" no está implementada.`);
			}
		}
	} else {
		throw new Error(`El recurso Chatwoot "${resource}" no está implementado.`);
	}

	return { data, raw, trace };
}
