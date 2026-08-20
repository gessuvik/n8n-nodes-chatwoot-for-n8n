import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { executeChatwootOperation } from './actions/execute';
import {
	getAgents,
	getAllCustomAttributes,
	getContactCustomAttributes,
	getConversationCustomAttributes,
	getInboxes,
	getLabelIds,
	getLabels,
	getTeams,
} from './actions/loadOptions';
import {
	API_NOTICE_PROPERTIES,
	OPERATION_PROPERTIES,
	RESOURCE_OPTIONS,
} from './actions/operations';
import { ACTION_PROPERTIES } from './actions/properties';
import { isDataObject } from './actions/helpers';

function outputObject(value: unknown): IDataObject {
	if (value === undefined || value === null || value === '') return { success: true };
	if (isDataObject(value)) return { ...value };
	if (Array.isArray(value)) return { values: value };
	return { value: value as never };
}

export class Chatwoot implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Chatwoot',
		name: 'chatwoot',
		icon: {
			light: 'file:../../icons/chatwoot.svg',
			dark: 'file:../../icons/chatwoot.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Read and change Chatwoot without manual HTTP requests',
		defaults: { name: 'Chatwoot' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'chatwootApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: RESOURCE_OPTIONS,
				default: 'contact',
			},
			...OPERATION_PROPERTIES,
			...API_NOTICE_PROPERTIES,
			...ACTION_PROPERTIES,
		],
	};

	methods = {
		loadOptions: {
			getAgents,
			getAllCustomAttributes,
			getContactCustomAttributes,
			getConversationCustomAttributes,
			getInboxes,
			getLabelIds,
			getLabels,
			getTeams,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const inputItems = this.getInputData();
		const outputItems: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex++) {
			try {
				const result = await executeChatwootOperation(this, itemIndex);
				const outputOptions = this.getNodeParameter('outputOptions', itemIndex, {}) as IDataObject;
				const responseMode = String(outputOptions.responseMode ?? 'simplified');
				const includeApiDetails = outputOptions.includeApiDetails === true;
				const selectedOutput = responseMode === 'raw' ? result.raw : result.data;
				const values = Array.isArray(selectedOutput) ? selectedOutput : [selectedOutput];

				for (const value of values) {
					const json = outputObject(value);
					if (includeApiDetails) {
						json._chatwootApi = { calls: result.trace };
					}
					outputItems.push({ json, pairedItem: { item: itemIndex } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					outputItems.push({
						json: {
							error: error instanceof Error ? error.message : 'Error desconocido de Chatwoot',
						},
						pairedItem: { item: itemIndex },
						error: error as NodeOperationError,
					});
					continue;
				}

				if (error instanceof NodeOperationError) {
					throw new NodeOperationError(this.getNode(), error, { itemIndex });
				}
				throw new NodeOperationError(
					this.getNode(),
					error instanceof Error ? error : new Error(String(error)),
					{ itemIndex },
				);
			}
		}

		return [outputItems];
	}
}
