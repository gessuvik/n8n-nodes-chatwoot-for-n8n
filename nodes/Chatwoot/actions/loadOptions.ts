import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { chatwootApiRequest, getChatwootCredentialConfig } from '../shared/api';
import { extractArray } from './helpers';

async function getAccountEndpoint(
	context: ILoadOptionsFunctions,
	resourcePath: string,
): Promise<string> {
	const { accountId } = await getChatwootCredentialConfig(context);
	return `/api/v1/accounts/${accountId}/${resourcePath}`;
}

function sortOptions(options: INodePropertyOptions[]): INodePropertyOptions[] {
	return options.sort((left, right) => left.name.localeCompare(right.name));
}

export async function getInboxes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const response = await chatwootApiRequest(this, 'GET', await getAccountEndpoint(this, 'inboxes'));
	return sortOptions(
		extractArray(response).map((inbox) => ({
			name: `${String(inbox.name ?? `Inbox ${String(inbox.id)}`)} (${String(inbox.channel_type ?? inbox.inbox_type ?? 'inbox')})`,
			value: Number(inbox.id),
		})),
	);
}

export async function getLabels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const response = await chatwootApiRequest(this, 'GET', await getAccountEndpoint(this, 'labels'));
	return sortOptions(
		extractArray(response).map((label) => ({
			name: String(label.title ?? `Label ${String(label.id)}`),
			value: String(label.title ?? ''),
			description: String(label.description ?? ''),
		})),
	);
}

export async function getLabelIds(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const response = await chatwootApiRequest(this, 'GET', await getAccountEndpoint(this, 'labels'));
	return sortOptions(
		extractArray(response).map((label) => ({
			name: String(label.title ?? `Label ${String(label.id)}`),
			value: Number(label.id),
			description: String(label.description ?? ''),
		})),
	);
}

export async function getAgents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const response = await chatwootApiRequest(this, 'GET', await getAccountEndpoint(this, 'agents'));
	return sortOptions(
		extractArray(response).map((agent) => ({
			name: `${String(agent.name ?? `Agent ${String(agent.id)}`)}${agent.email ? ` — ${String(agent.email)}` : ''}`,
			value: Number(agent.id),
		})),
	);
}

export async function getTeams(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const response = await chatwootApiRequest(this, 'GET', await getAccountEndpoint(this, 'teams'));
	return sortOptions(
		extractArray(response).map((team) => ({
			name: String(team.name ?? `Team ${String(team.id)}`),
			value: Number(team.id),
			description: String(team.description ?? ''),
		})),
	);
}

async function getCustomAttributeOptions(
	context: ILoadOptionsFunctions,
	attributeModel?: 'contact_attribute' | 'conversation_attribute',
	valueField: 'attribute_key' | 'id' = 'attribute_key',
): Promise<INodePropertyOptions[]> {
	const response = await chatwootApiRequest(
		context,
		'GET',
		await getAccountEndpoint(context, 'custom_attribute_definitions'),
		attributeModel ? { qs: { attribute_model: attributeModel } } : {},
	);

	return sortOptions(
		extractArray(response).map((attribute) => ({
			name: `${String(attribute.attribute_display_name ?? attribute.attribute_key)} — ${String(attribute.attribute_key)} (${String(attribute.attribute_display_type ?? 'text')})`,
			value: valueField === 'id' ? Number(attribute.id) : String(attribute.attribute_key ?? ''),
			description: `${String(attribute.attribute_model ?? '')}: ${String(attribute.attribute_description ?? '')}`,
		})),
	);
}

export async function getContactCustomAttributes(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return getCustomAttributeOptions(this, 'contact_attribute');
}

export async function getConversationCustomAttributes(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return getCustomAttributeOptions(this, 'conversation_attribute');
}

export async function getAllCustomAttributes(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return getCustomAttributeOptions(this, undefined, 'id');
}
