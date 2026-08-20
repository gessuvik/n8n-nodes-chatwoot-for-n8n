import { describe, expect, it } from 'vitest';

import {
	coerceCustomAttributeValue,
	extractArray,
	extractStringArray,
	findExactContact,
	parseCommaSeparated,
	parseJsonObject,
	requirePositiveInteger,
	simplifyChatwootResponse,
	toUnixSeconds,
	uniqueStrings,
} from '../nodes/Chatwoot/actions/helpers';

describe('Chatwoot action response helpers', () => {
	it('extracts arrays returned directly', () => {
		expect(extractArray([{ id: 1 }, { id: 2 }])).toEqual([{ id: 1 }, { id: 2 }]);
	});

	it('extracts contact and label payload envelopes', () => {
		expect(extractArray({ payload: [{ id: 1 }] })).toEqual([{ id: 1 }]);
		expect(extractStringArray({ payload: ['lead', 'vip'] })).toEqual(['lead', 'vip']);
	});

	it('extracts nested conversation data payloads', () => {
		expect(extractArray({ data: { payload: [{ id: 9 }] } })).toEqual([{ id: 9 }]);
	});

	it('unwraps the common Chatwoot response envelopes', () => {
		expect(simplifyChatwootResponse({ payload: { id: 1 } })).toEqual({ id: 1 });
		expect(simplifyChatwootResponse({ data: { payload: [{ id: 2 }] } })).toEqual([{ id: 2 }]);
	});

	it('turns an empty successful response into an explicit success object', () => {
		expect(simplifyChatwootResponse(undefined)).toEqual({ success: true });
		expect(simplifyChatwootResponse('')).toEqual({ success: true });
	});
});

describe('Chatwoot custom attribute conversion', () => {
	it.each([
		['number', '42.5', 42.5],
		['currency', '19,95', 19.95],
		['percent', 7, 7],
		[1, '12', 12],
	])('converts %s values to numbers', (type, input, expected) => {
		expect(coerceCustomAttributeValue(input, type)).toBe(expected);
	});

	it.each([
		['true', true],
		['false', false],
		['sí', true],
		['no', false],
		[1, true],
		[0, false],
	])('converts checkbox value %s', (input, expected) => {
		expect(coerceCustomAttributeValue(input, 'checkbox')).toBe(expected);
	});

	it('converts a date to the ISO value used by the Chatwoot UI', () => {
		expect(coerceCustomAttributeValue('2026-08-19', 'date')).toBe(
			'2026-08-19T00:00:00.000Z',
		);
	});

	it('keeps text, link, and list values as strings', () => {
		expect(coerceCustomAttributeValue(123, 'text')).toBe('123');
		expect(coerceCustomAttributeValue('VIP', 'list')).toBe('VIP');
	});

	it('rejects invalid typed values with a human message', () => {
		expect(() => coerceCustomAttributeValue('maybe', 'checkbox')).toThrow('checkbox');
		expect(() => coerceCustomAttributeValue('abc', 'number')).toThrow('número');
		expect(() => coerceCustomAttributeValue('not-a-date', 'date')).toThrow('fecha');
	});
});

describe('Chatwoot action input helpers', () => {
	it('matches email case-insensitively but identifiers exactly', () => {
		const contacts = [
			{ id: 1, email: 'Alice@Example.com', identifier: 'Lead-001' },
			{ id: 2, email: 'bob@example.com', identifier: 'lead-001' },
		];
		expect(findExactContact(contacts, 'email', 'alice@example.com')?.id).toBe(1);
		expect(findExactContact(contacts, 'identifier', 'Lead-001')?.id).toBe(1);
		expect(findExactContact(contacts, 'identifier', 'LEAD-001')).toBeUndefined();
	});

	it('parses comma-separated values without blanks or surrounding whitespace', () => {
		expect(parseCommaSeparated('lead, VIP, , customer')).toEqual(['lead', 'VIP', 'customer']);
	});

	it('parses JSON objects and rejects arrays', () => {
		expect(parseJsonObject('{"priority":"high"}')).toEqual({ priority: 'high' });
		expect(() => parseJsonObject('[]')).toThrow('objeto');
	});

	it('validates positive integer IDs', () => {
		expect(requirePositiveInteger('12', 'Contact ID')).toBe(12);
		expect(() => requirePositiveInteger(0, 'Contact ID')).toThrow('mayor que cero');
		expect(() => requirePositiveInteger(1.5, 'Contact ID')).toThrow('entero');
	});

	it('converts snooze dates to Unix seconds', () => {
		expect(toUnixSeconds('2026-08-19T12:00:00.000Z')).toBe(1787140800);
		expect(toUnixSeconds('')).toBeUndefined();
	});

	it('deduplicates and trims labels without changing their case', () => {
		expect(uniqueStrings([' lead ', 'VIP', 'lead', ''])).toEqual(['lead', 'VIP']);
	});
});
