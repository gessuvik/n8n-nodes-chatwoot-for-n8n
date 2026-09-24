import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { describeChatwootError } from './errors';
import type { ChatwootWebhookApi, ChatwootWebhookInput } from './types';
import { normalizeBaseUrl } from './url';
import { unwrapWebhook, unwrapWebhookList } from './webhookResponse';

const REQUEST_TIMEOUT_MS = 15_000;

export interface ChatwootCredentialConfig {
	accountId: number;
	baseUrl: string;
	ignoreSslIssues: boolean;
}

export type ChatwootApiContext = IHookFunctions | IExecuteFunctions | ILoadOptionsFunctions;

export interface ChatwootRequestOptions {
	body?: IDataObject;
	qs?: IDataObject;
	ignoreNotFound?: boolean;
}

export async function getChatwootCredentialConfig(
	context: ChatwootApiContext,
): Promise<ChatwootCredentialConfig> {
	const credentials = await context.getCredentials('chatwootApi');
	const accountId = Number(credentials.accountId);
	const baseUrl = normalizeBaseUrl(String(credentials.baseUrl ?? ''));

	if (!Number.isInteger(accountId) || accountId <= 0) {
		throw new NodeOperationError(
			context.getNode(),
			'El Account ID de Chatwoot debe ser un número entero mayor que cero.',
		);
	}

	if (!baseUrl) {
		throw new NodeOperationError(
			context.getNode(),
			'La Base URL de Chatwoot debe ser una URL HTTP o HTTPS válida y sin credenciales.',
		);
	}

	return {
		accountId,
		baseUrl,
		ignoreSslIssues: credentials.ignoreSslIssues === true,
	};
}

export async function chatwootApiRequest<T = unknown>(
	context: ChatwootApiContext,
	method: IHttpRequestMethods,
	endpoint: string,
	requestOptions: ChatwootRequestOptions = {},
): Promise<T> {
	const config = await getChatwootCredentialConfig(context);
	const options: IHttpRequestOptions = {
		method,
		url: `${config.baseUrl}${endpoint}`,
		json: true,
		timeout: REQUEST_TIMEOUT_MS,
		skipSslCertificateValidation: config.ignoreSslIssues,
	};

	if (requestOptions.body !== undefined) options.body = requestOptions.body;
	if (requestOptions.qs !== undefined) options.qs = requestOptions.qs;

	try {
		return (await context.helpers.httpRequestWithAuthentication.call(
			context,
			'chatwootApi',
			options,
		)) as T;
	} catch (error) {
		const details = describeChatwootError(error, endpoint);
		if (requestOptions.ignoreNotFound && details.statusCode === 404) {
			return undefined as T;
		}
		throw new NodeOperationError(context.getNode(), details.message, {
			description: details.description,
		});
	}
}

export function createChatwootWebhookApi(context: IHookFunctions): ChatwootWebhookApi {
	const getEndpoint = async (): Promise<string> => {
		const { accountId } = await getChatwootCredentialConfig(context);
		return `/api/v1/accounts/${accountId}/webhooks`;
	};

	return {
		async list() {
			return unwrapWebhookList(
				await chatwootApiRequest<unknown>(context, 'GET', await getEndpoint()),
			);
		},
		async create(input: ChatwootWebhookInput) {
			return unwrapWebhook(
				await chatwootApiRequest<unknown>(context, 'POST', await getEndpoint(), {
					body: input as unknown as IDataObject,
				}),
			);
		},
		async update(id: number, input: ChatwootWebhookInput) {
			return unwrapWebhook(
				await chatwootApiRequest<unknown>(context, 'PATCH', `${await getEndpoint()}/${id}`, {
					body: input as unknown as IDataObject,
				}),
			);
		},
		async delete(id: number) {
			await chatwootApiRequest<unknown>(context, 'DELETE', `${await getEndpoint()}/${id}`, {
				ignoreNotFound: true,
			});
		},
	};
}
