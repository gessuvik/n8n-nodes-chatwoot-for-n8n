import type { IDataObject } from 'n8n-workflow';

export interface CustomAttributeDefinition extends IDataObject {
	id?: number;
	attribute_display_name?: string;
	attribute_display_type?: string | number;
	attribute_key?: string;
	attribute_model?: string | number;
	attribute_values?: string[];
}

export function isDataObject(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractArray(response: unknown): IDataObject[] {
	if (Array.isArray(response)) return response.filter(isDataObject);
	if (!isDataObject(response)) return [];

	if (Array.isArray(response.payload)) return response.payload.filter(isDataObject);
	if (Array.isArray(response.data)) return response.data.filter(isDataObject);
	if (isDataObject(response.data) && Array.isArray(response.data.payload)) {
		return response.data.payload.filter(isDataObject);
	}

	return [];
}

export function extractStringArray(response: unknown): string[] {
	if (Array.isArray(response)) return response.map(String);
	if (!isDataObject(response)) return [];
	if (Array.isArray(response.payload)) return response.payload.map(String);
	if (Array.isArray(response.data)) return response.data.map(String);
	if (isDataObject(response.data) && Array.isArray(response.data.payload)) {
		return response.data.payload.map(String);
	}
	return [];
}

export function simplifyChatwootResponse(response: unknown): unknown {
	if (response === undefined || response === null || response === '') return { success: true };
	if (!isDataObject(response)) return response;

	if (response.payload !== undefined) return response.payload;
	if (isDataObject(response.data) && response.data.payload !== undefined) {
		return response.data.payload;
	}

	return response;
}

export function parseCommaSeparated(value: unknown): string[] {
	return String(value ?? '')
		.split(',')
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

export function parseJsonObject(value: unknown): IDataObject {
	const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
	if (!isDataObject(parsed)) {
		throw new Error('El valor JSON debe ser un objeto, por ejemplo {"prioridad":"alta"}.');
	}
	return parsed;
}

function parseBoolean(value: unknown): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') {
		if (value === 1) return true;
		if (value === 0) return false;
	}

	const normalized = String(value).trim().toLowerCase();
	if (['true', '1', 'yes', 'y', 'si', 'sí', 'on'].includes(normalized)) return true;
	if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
	throw new Error(`No se pudo convertir "${String(value)}" a checkbox (true/false).`);
}

function parseNumber(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	const normalized = String(value).trim().replace(',', '.');
	const parsed = Number(normalized);
	if (!Number.isFinite(parsed)) {
		throw new Error(`No se pudo convertir "${String(value)}" a número.`);
	}
	return parsed;
}

function parseDate(value: unknown): string {
	const date = value instanceof Date ? value : new Date(String(value));
	if (Number.isNaN(date.getTime())) {
		throw new Error(`No se pudo convertir "${String(value)}" a fecha.`);
	}
	return date.toISOString();
}

export function coerceCustomAttributeValue(value: unknown, displayType: unknown): unknown {
	const normalizedType = String(displayType ?? 'text').toLowerCase();

	switch (normalizedType) {
		case '1':
		case '2':
		case '3':
		case 'number':
		case 'currency':
		case 'percent':
			return parseNumber(value);
		case '5':
		case 'date':
			return parseDate(value);
		case '7':
		case 'checkbox':
			return parseBoolean(value);
		case '0':
		case '4':
		case '6':
		case 'text':
		case 'link':
		case 'list':
		default:
			return String(value);
	}
}

export function findExactContact(
	contacts: IDataObject[],
	field: 'email' | 'identifier' | 'phone_number',
	value: string,
): IDataObject | undefined {
	const expected = field === 'email' ? value.trim().toLowerCase() : value.trim();
	return contacts.find((contact) => {
		const candidate = String(contact[field] ?? '').trim();
		return field === 'email' ? candidate.toLowerCase() === expected : candidate === expected;
	});
}

export function requirePositiveInteger(value: unknown, label: string): number {
	const numericValue = Number(value);
	if (!Number.isInteger(numericValue) || numericValue <= 0) {
		throw new Error(`${label} debe ser un número entero mayor que cero.`);
	}
	return numericValue;
}

export function toUnixSeconds(value: unknown): number | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const timestamp = new Date(String(value)).getTime();
	if (Number.isNaN(timestamp)) throw new Error('Snoozed Until debe contener una fecha válida.');
	return Math.floor(timestamp / 1000);
}

export interface ActivityRangeWindow {
	from?: number;
	to?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toEpochMilliseconds(value: unknown): number | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) return undefined;
		// Chatwoot serializes last_activity_at as Unix seconds; treat large numbers as milliseconds.
		return value < 1_000_000_000_000 ? value * 1000 : value;
	}
	const text = String(value).trim();
	if (text === '') return undefined;
	if (/^\d{1,16}$/.test(text)) {
		const numeric = Number(text);
		if (!Number.isFinite(numeric)) return undefined;
		return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
	}
	const parsed = Date.parse(text);
	return Number.isNaN(parsed) ? undefined : parsed;
}

export function resolveActivityRange(range: IDataObject, now: number): ActivityRangeWindow {
	const relative = isDataObject(range.relative) ? range.relative : {};
	const absolute = isDataObject(range.absolute) ? range.absolute : {};

	if (Object.keys(relative).length > 0) {
		const fromDays = Number(relative.fromDays);
		const toDays = Number(relative.toDays);
		if (!Number.isFinite(fromDays) || !Number.isFinite(toDays) || fromDays < 0 || toDays < 0) {
			throw new Error('From y To (days ago) deben ser números mayores o iguales a cero.');
		}
		if (fromDays < toDays) {
			throw new Error(
				`Rango inválido: From (${fromDays} días) debe ser mayor o igual a To (${toDays} días).`,
			);
		}
		return {
			from: now - fromDays * MS_PER_DAY,
			to: now - toDays * MS_PER_DAY,
		};
	}

	if (Object.keys(absolute).length > 0) {
		const from = toEpochMilliseconds(absolute.from);
		const to = toEpochMilliseconds(absolute.to);
		if (from !== undefined && to !== undefined && from > to) {
			throw new Error('La fecha From debe ser anterior o igual a To.');
		}
		return { from, to };
	}

	return {};
}

export function filterConversationsByActivity(
	items: IDataObject[],
	range: IDataObject,
	now: number = Date.now(),
): IDataObject[] {
	const { from, to } = resolveActivityRange(range, now);
	if (from === undefined && to === undefined) return items;
	return items.filter((item) => {
		const activity = toEpochMilliseconds(item.last_activity_at);
		if (activity === undefined) return false;
		if (from !== undefined && activity < from) return false;
		if (to !== undefined && activity > to) return false;
		return true;
	});
}

export function uniqueStrings(values: unknown[]): string[] {
	return [
		...new Set(
			values
				.map(String)
				.map((value) => value.trim())
				.filter(Boolean),
		),
	];
}

export function valueToDataObject(value: unknown): IDataObject {
	if (isDataObject(value)) return value;
	if (Array.isArray(value)) return { values: value };
	return { value: value as never };
}
