export interface ChatwootErrorDescription {
	description: string;
	message: string;
	statusCode?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function firstNumber(...values: unknown[]): number | undefined {
	for (const value of values) {
		const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
		if (Number.isInteger(parsed) && parsed >= 100 && parsed <= 599) {
			return parsed;
		}
	}

	return undefined;
}

function safeMessage(value: unknown): string | undefined {
	if (typeof value !== 'string' || value.trim() === '') {
		return undefined;
	}

	return value
		.replace(/api_access_token\s*[:=]\s*[^\s,;]+/gi, 'api_access_token=[REDACTED]')
		.replace(/(bearer\s+)[a-z\d._~+/-]+/gi, '$1[REDACTED]')
		.slice(0, 500);
}

function extractApiMessage(error: Record<string, unknown>): string | undefined {
	const response = asRecord(error.response);
	const cause = asRecord(error.cause);
	const responseBody = asRecord(response?.body);
	const causeResponse = asRecord(cause?.response);
	const causeBody = asRecord(causeResponse?.body);

	return safeMessage(
		responseBody?.message ??
			responseBody?.error ??
			causeBody?.message ??
			causeBody?.error ??
			error.description ??
			error.message,
	);
}

export function describeChatwootError(
	errorValue: unknown,
	endpoint: string,
): ChatwootErrorDescription {
	const error = asRecord(errorValue) ?? {};
	const response = asRecord(error.response);
	const cause = asRecord(error.cause);
	const causeResponse = asRecord(cause?.response);
	const statusCode = firstNumber(
		error.httpCode,
		error.statusCode,
		response?.statusCode,
		response?.status,
		cause?.statusCode,
		causeResponse?.status,
	);
	const apiMessage = extractApiMessage(error);
	const errorCode = String(error.code ?? cause?.code ?? '');
	const looksLikeTimeout =
		/timeout|timed out/i.test(apiMessage ?? '') || /ETIMEDOUT|ESOCKETTIMEDOUT/i.test(errorCode);

	let message: string;
	let suggestion: string;

	if (looksLikeTimeout) {
		message = 'Chatwoot no respondió a tiempo.';
		suggestion = 'Verifica que la Base URL sea accesible desde n8n e inténtalo nuevamente.';
	} else if (statusCode === 401) {
		message = 'Chatwoot rechazó las credenciales.';
		suggestion = 'Verifica el API Access Token y el Account ID.';
	} else if (statusCode === 403) {
		message = 'Chatwoot no permitió administrar los webhooks.';
		suggestion = 'Usa el token de un administrador que tenga acceso a esta cuenta.';
	} else if (statusCode === 404) {
		message = 'Chatwoot no encontró la cuenta o el webhook solicitado.';
		suggestion = 'Verifica la Base URL y el Account ID.';
	} else if (statusCode === 409 || statusCode === 422) {
		message = 'Chatwoot rechazó la configuración del webhook.';
		suggestion = 'Comprueba que la URL no esté ocupada por un webhook creado manualmente.';
	} else if (statusCode === 429) {
		message = 'Chatwoot limitó temporalmente las solicitudes.';
		suggestion = 'Espera un momento y vuelve a activar el workflow.';
	} else {
		message = 'No se pudo completar la operación en Chatwoot.';
		suggestion = 'Verifica la Base URL, las credenciales y la conectividad.';
	}

	const details = [
		statusCode ? `HTTP ${statusCode}` : null,
		`endpoint ${endpoint}`,
		apiMessage ? `Chatwoot: ${apiMessage}` : null,
		suggestion,
	].filter((value): value is string => Boolean(value));

	return { message, description: details.join(' · '), statusCode };
}
