import assert from "node:assert/strict";
import test from "node:test";
import { verifyProductionMediaEntry } from "./media-production-check.mjs";

const entry = { path: "assets/video/mp4/example.mp4", bytes: 1234 };
const origin = "https://example.test";
const response = (status = 200, bytes = entry.bytes) => new Response(null, {
	status, headers: bytes === null ? {} : { "content-length": String(bytes) },
});

function mock(outcomes) {
	const calls = [];
	const delays = [];
	return {
		calls, delays,
		options: {
			fetchImpl: async (url, options) => {
				calls.push({ url, ...options });
				const outcome = outcomes[Math.min(calls.length - 1, outcomes.length - 1)];
				if (outcome instanceof Error) throw outcome;
				return outcome;
			},
			sleep: async delay => { delays.push(delay); },
		},
	};
}

test("recovers after a connection reset with fresh HEAD timeout signals", async () => {
	const networkError = new TypeError("fetch failed", { cause: Object.assign(new Error("reset"), { code: "ECONNRESET" }) });
	const state = mock([networkError, response()]);
	await verifyProductionMediaEntry(entry, origin, state.options);
	assert.equal(state.calls.length, 2);
	assert.deepEqual(state.delays, [500]);
	for (const call of state.calls) {
		assert.equal(call.url, `${origin}/${entry.path}`);
		assert.equal(call.method, "HEAD");
		assert.equal(call.redirect, "follow");
		assert.ok(call.signal instanceof AbortSignal);
	}
	assert.notEqual(state.calls[0].signal, state.calls[1].signal);
});

test("a persistent network failure still rejects after exactly three attempts", async () => {
	const state = mock([new TypeError("fetch failed")]);
	await assert.rejects(verifyProductionMediaEntry(entry, origin, state.options), /example\.mp4: fetch failed/);
	assert.equal(state.calls.length, 3);
	assert.deepEqual(state.delays, [500, 1500]);
});

test("timeout can recover within the same three-attempt limit", async () => {
	const state = mock([new DOMException("timed out", "TimeoutError"), response()]);
	await verifyProductionMediaEntry(entry, origin, state.options);
	assert.equal(state.calls.length, 2);
});

for (const status of [408, 429, 500, 502, 503, 599]) {
	test(`HTTP ${status} retries and can recover`, async () => {
		const state = mock([response(status), response(status), response()]);
		await verifyProductionMediaEntry(entry, origin, state.options);
		assert.equal(state.calls.length, 3);
		assert.deepEqual(state.delays, [500, 1500]);
	});
}

test("persistent HTTP 503 still blocks", async () => {
	const state = mock([response(503)]);
	await assert.rejects(verifyProductionMediaEntry(entry, origin, state.options), /503 assets\/video/);
	assert.equal(state.calls.length, 3);
});

for (const status of [403, 404]) {
	test(`HTTP ${status} blocks without retry`, async () => {
		const state = mock([response(status), response()]);
		await assert.rejects(verifyProductionMediaEntry(entry, origin, state.options), new RegExp(`^Error: ${status} assets/video`));
		assert.equal(state.calls.length, 1);
		assert.deepEqual(state.delays, []);
	});
}

for (const bytes of [1233, null]) {
	test(`incorrect content-length (${bytes}) blocks without retry`, async () => {
		const state = mock([response(200, bytes), response()]);
		await assert.rejects(verifyProductionMediaEntry(entry, origin, state.options), /200 assets\/video\/mp4\/example.mp4: local 1234, remote (1233|unknown)/);
		assert.equal(state.calls.length, 1);
		assert.deepEqual(state.delays, []);
	});
}
