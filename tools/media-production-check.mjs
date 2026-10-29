const retryDelays = [500, 1500];
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const retryableStatus = status => status === 408 || status === 429 || (status >= 500 && status <= 599);

export async function verifyProductionMediaEntry(entry, origin, { fetchImpl = fetch, sleep = wait } = {}) {
	const url = `${origin}/${entry.path}`;
	for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
		let response;
		try {
			response = await fetchImpl(url, {
				method: "HEAD",
				redirect: "follow",
				signal: AbortSignal.timeout(20_000),
			});
		} catch (error) {
			if (attempt === retryDelays.length) throw new Error(`${entry.path}: ${error.message}`, { cause: error });
			await sleep(retryDelays[attempt]);
			continue;
		}
		if (retryableStatus(response.status) && attempt < retryDelays.length) {
			await sleep(retryDelays[attempt]);
			continue;
		}
		const remoteBytes = Number(response.headers.get("content-length"));
		if (!response.ok || remoteBytes !== entry.bytes) {
			throw new Error(`${response.status} ${entry.path}: local ${entry.bytes}, remote ${remoteBytes || "unknown"}`);
		}
		return;
	}
}
