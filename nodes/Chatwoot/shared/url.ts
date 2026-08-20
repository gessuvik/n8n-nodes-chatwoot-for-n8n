export function normalizeBaseUrl(value: string): string | null {
	let parsed: URL;
	try {
		parsed = new URL(value.trim());
	} catch {
		return null;
	}

	if (!['http:', 'https:'].includes(parsed.protocol)) {
		return null;
	}
	if (parsed.username || parsed.password || parsed.search || parsed.hash) {
		return null;
	}

	const pathname = parsed.pathname.replace(/\/+$/, '');
	return `${parsed.origin}${pathname}`;
}
