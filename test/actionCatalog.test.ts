import { describe, expect, it } from 'vitest';

import {
	API_NOTICE_PROPERTIES,
	OPERATION_CATALOG,
	OPERATION_PROPERTIES,
	RESOURCE_OPTIONS,
} from '../nodes/Chatwoot/actions/operations';

describe('Chatwoot action catalog', () => {
	it('exposes eight resources and 75 concrete operations', () => {
		expect(RESOURCE_OPTIONS).toHaveLength(8);
		expect(Object.values(OPERATION_CATALOG).flat()).toHaveLength(75);
	});

	it('has one operation selector and one under-the-hood notice for every operation', () => {
		expect(OPERATION_PROPERTIES).toHaveLength(8);
		expect(API_NOTICE_PROPERTIES).toHaveLength(75);
	});

	it('does not duplicate operation values inside a resource', () => {
		for (const operations of Object.values(OPERATION_CATALOG)) {
			const values = operations.map((operation) => operation.value);
			expect(new Set(values).size).toBe(values.length);
		}
	});

	it('documents an official HTTP method and account-scoped path for every operation', () => {
		for (const operation of Object.values(OPERATION_CATALOG).flat()) {
			expect(['GET', 'POST', 'PATCH', 'DELETE']).toContain(operation.method);
			expect(operation.path).toContain('/api/v1/accounts/{account_id}');
		}
	});

	it('marks replacing labels and custom attributes explicitly', () => {
		expect(
			OPERATION_CATALOG.contact.find((operation) => operation.value === 'replaceLabels')
				?.description,
		).toContain('replace');
		expect(
			OPERATION_CATALOG.conversation.find(
				(operation) => operation.value === 'replaceCustomAttributes',
			)?.description,
		).toContain('replaces');
	});
});
