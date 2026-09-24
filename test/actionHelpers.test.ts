import { describe, expect, it } from 'vitest';

import {
	coerceCustomAttributeValue,
	extractArray,
	extractStringArray,
	filterConversationsByActivity,
	findExactContact,
	parseCommaSeparated,
	parseJsonObject,
	requirePositiveInteger,
	resolveActivityRange,
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

describe('Chatwoot conversation activity date range', () => {
	const NOW = Date.UTC(2026, 0, 1); // 2026-01-01T00:00:00Z
	const DAY = 24 * 60 * 60 * 1000;
	const at = (daysAgo: number) => (NOW - daysAgo * DAY) / 1000; // Unix seconds, like Chatwoot

	it('resolves a relative range into an inclusive millisecond window', () => {
		expect(resolveActivityRange({ relative: { fromDays: 30, toDays: 0 } }, NOW)).toEqual({
			from: NOW - 30 * DAY,
			to: NOW,
		});
	});

	it('rejects a relative range where From is before To', () => {
		expect(() => resolveActivityRange({ relative: { fromDays: 5, toDays: 10 } }, NOW)).toThrow(
			'mayor o igual',
		);
	});

	it('resolves an absolute range and tolerates empty bounds', () => {
		expect(
			resolveActivityRange(
				{ absolute: { from: '2026-01-01T00:00:00.000Z', to: '' } },
				NOW,
			),
		).toEqual({ from: NOW });
		expect(() =>
			resolveActivityRange(
				{ absolute: { from: '2026-02-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' } },
				NOW,
			),
		).toThrow('anterior o igual');
	});

	it('returns every item when no range is configured', () => {
		const items = [{ id: 1 }, { id: 2 }];
		expect(filterConversationsByActivity(items, {}, NOW)).toEqual(items);
	});

	it('keeps conversations whose last_activity_at falls inside the relative window', () => {
		const items = [
			{ id: 1, last_activity_at: at(15) },
			{ id: 2, last_activity_at: at(45) },
			{ id: 3, last_activity_at: at(0) },
			{ id: 4, last_activity_at: at(-1) },
		];
		const result = filterConversationsByActivity(
			items,
			{ relative: { fromDays: 30, toDays: 0 } },
			NOW,
		);
		expect(result.map((item) => item.id)).toEqual([1, 3]);
	});

	it('understands ISO strings and millisecond timestamps for last_activity_at', () => {
		const items = [
			{ id: 1, last_activity_at: new Date(NOW - 10 * DAY).toISOString() },
			{ id: 2, last_activity_at: NOW - 40 * DAY }, // already in milliseconds
		];
		const result = filterConversationsByActivity(
			items,
			{ relative: { fromDays: 30, toDays: 0 } },
			NOW,
		);
		expect(result.map((item) => item.id)).toEqual([1]);
	});

	it('drops conversations without a parseable activity timestamp', () => {
		const items = [
			{ id: 1, last_activity_at: at(10) },
			{ id: 2, last_activity_at: null },
			{ id: 3 },
		];
		const result = filterConversationsByActivity(
			items,
			{ relative: { fromDays: 30, toDays: 0 } },
			NOW,
		);
		expect(result.map((item) => item.id)).toEqual([1]);
	});
});
