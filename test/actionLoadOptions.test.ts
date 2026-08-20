import type { IHttpRequestOptions, ILoadOptionsFunctions } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import {
	getAgents,
	getAllCustomAttributes,
	getContactCustomAttributes,
	getInboxes,
	getLabelIds,
	getLabels,
	getTeams,
} from '../nodes/Chatwoot/actions/loadOptions';

function createLoadOptionsContext(response: unknown) {
	const httpRequestWithAuthentication = vi.fn(async () => response);
	const context = {
		async getCredentials() {
			return {
				accountId: 7,
				baseUrl: 'https://chatwoot.example.com/',
				accessToken: 'secret',
				ignoreSslIssues: false,
			};
		},
		getNode() {
			return {
				id: 'load-options-test',
				name: 'Chatwoot',
				type: 'n8n-nodes-chatwoot-for-n8n.chatwoot',
				typeVersion: 1,
				position: [0, 0],
				parameters: {},
			};
		},
		helpers: { httpRequestWithAuthentication },
	} as unknown as ILoadOptionsFunctions;
	return { context, httpRequestWithAuthentication };
}

function sentOptions(mock: ReturnType<typeof vi.fn>): IHttpRequestOptions {
	return mock.mock.calls[0][1] as IHttpRequestOptions;
}

describe('Chatwoot action dropdowns', () => {
	it('loads inboxes from a payload envelope and sorts their names', async () => {
		const { context, httpRequestWithAuthentication } = createLoadOptionsContext({
			payload: [
				{ id: 2, name: 'Sales', channel_type: 'Channel::Api' },
				{ id: 1, name: 'Help', channel_type: 'Channel::Whatsapp' },
			],
		});

		await expect(getInboxes.call(context)).resolves.toEqual([
			{ name: 'Help (Channel::Whatsapp)', value: 1 },
			{ name: 'Sales (Channel::Api)', value: 2 },
		]);
		expect(sentOptions(httpRequestWithAuthentication).url).toBe(
			'https://chatwoot.example.com/api/v1/accounts/7/inboxes',
		);
	});

	it('uses label titles for assignment dropdowns and IDs for label management', async () => {
		const response = {
			payload: [{ id: 4, title: 'vip', description: 'Important lead' }],
		};
		const titles = createLoadOptionsContext(response);
		const ids = createLoadOptionsContext(response);

		expect(await getLabels.call(titles.context)).toEqual([
			{ name: 'vip', value: 'vip', description: 'Important lead' },
		]);
		expect(await getLabelIds.call(ids.context)).toEqual([
			{ name: 'vip', value: 4, description: 'Important lead' },
		]);
	});

	it('loads agents and teams returned as direct arrays', async () => {
		const agents = createLoadOptionsContext([
			{ id: 2, name: 'Zoe', email: 'zoe@example.com' },
			{ id: 1, name: 'Ana', email: 'ana@example.com' },
		]);
		const teams = createLoadOptionsContext([{ id: 3, name: 'Support', description: 'L1' }]);

		expect(await getAgents.call(agents.context)).toEqual([
			{ name: 'Ana — ana@example.com', value: 1 },
			{ name: 'Zoe — zoe@example.com', value: 2 },
		]);
		expect(await getTeams.call(teams.context)).toEqual([
			{ name: 'Support', value: 3, description: 'L1' },
		]);
	});

	it('filters contact attribute dropdowns by model and keeps the machine key as value', async () => {
		const { context, httpRequestWithAuthentication } = createLoadOptionsContext([
			{
				id: 8,
				attribute_display_name: 'Lead Score',
				attribute_key: 'lead_score',
				attribute_display_type: 'number',
				attribute_model: 'contact_attribute',
				attribute_description: 'Scoring',
			},
		]);

		expect(await getContactCustomAttributes.call(context)).toEqual([
			{
				name: 'Lead Score — lead_score (number)',
				value: 'lead_score',
				description: 'contact_attribute: Scoring',
			},
		]);
		expect(sentOptions(httpRequestWithAuthentication).qs).toEqual({
			attribute_model: 'contact_attribute',
		});
	});

	it('uses definition IDs in the definition-management dropdown', async () => {
		const { context } = createLoadOptionsContext([
			{
				id: 8,
				attribute_display_name: 'Lead Score',
				attribute_key: 'lead_score',
				attribute_display_type: 'number',
				attribute_model: 'contact_attribute',
			},
		]);

		expect((await getAllCustomAttributes.call(context))[0]?.value).toBe(8);
	});
});
