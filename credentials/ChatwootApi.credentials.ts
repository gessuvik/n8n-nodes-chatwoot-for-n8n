import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ChatwootApi implements ICredentialType {
	name = 'chatwootApi';

	displayName = 'Chatwoot API';

	icon = 'file:../icons/chatwoot.svg' as const;

	documentationUrl = 'https://developers.chatwoot.com/api-reference/introduction';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://app.chatwoot.com',
			placeholder: 'https://chatwoot.example.com',
			required: true,
			description: 'Root URL of Chatwoot Cloud or your self-hosted Chatwoot instance',
		},
		{
			displayName: 'API Access Token',
			name: 'accessToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Personal access token from Chatwoot Profile Settings',
		},
		{
			displayName: 'Account ID',
			name: 'accountId',
			type: 'number',
			typeOptions: { minValue: 1, numberStepSize: 1 },
			default: 1,
			required: true,
			description: 'Numeric account ID shown in the Chatwoot dashboard URL',
		},
		{
			displayName: 'Verify Webhook Signatures',
			name: 'verifyWebhookSignatures',
			type: 'boolean',
			default: true,
			description: 'Whether to verify signed deliveries when Chatwoot returns a webhook secret',
		},
		{
			displayName: 'Ignore SSL Issues (Not Recommended)',
			name: 'ignoreSslIssues',
			type: 'boolean',
			default: false,
			description:
				'Whether to connect to self-hosted Chatwoot instances with an invalid TLS certificate',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				api_access_token: '={{$credentials.accessToken}}',
				Accept: 'application/json',
			},
			skipSslCertificateValidation: '={{$credentials.ignoreSslIssues}}',
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '=/api/v1/accounts/{{$credentials.accountId}}/webhooks',
			method: 'GET',
			skipSslCertificateValidation: '={{$credentials.ignoreSslIssues}}',
		},
		rules: [
			{
				type: 'responseCode',
				properties: {
					value: 401,
					message:
						'Chatwoot rechazó las credenciales. Verifica el API Access Token y el Account ID.',
				},
			},
			{
				type: 'responseCode',
				properties: {
					value: 403,
					message:
						'El token no tiene permiso para administrar webhooks en esta cuenta de Chatwoot.',
				},
			},
			{
				type: 'responseCode',
				properties: {
					value: 404,
					message: 'Chatwoot no encontró esa cuenta. Verifica el Account ID y la Base URL.',
				},
			},
		],
	};
}
