import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const mediaDirectory = path.join(root, "src", "assets", "video", "mp4");
const manifestFile = path.join(root, "media", "manifest.json");
const publicOrigin = "https://luxuryband.ru";
const options = new Set(process.argv.slice(2));

function sha256(file) {
	const hash = crypto.createHash("sha256");
	hash.update(fs.readFileSync(file));
	return hash.digest("hex");
}

function localEntries() {
	if (!fs.existsSync(mediaDirectory)) {
		throw new Error(`Local media directory is missing: ${mediaDirectory}`);
	}
	return fs.readdirSync(mediaDirectory)
		.filter(name => name.endsWith(".mp4"))
		.sort()
		.map(name => {
			const file = path.join(mediaDirectory, name);
			return {
				path: `assets/video/mp4/${name}`,
				bytes: fs.statSync(file).size,
				sha256: sha256(file),
			};
		});
}

function readManifest() {
	return JSON.parse(fs.readFileSync(manifestFile, "utf8"));
}

function writeManifest() {
	const manifest = {
		version: 1,
		origin: publicOrigin,
		files: localEntries(),
	};
	fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
	fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
	console.log(`Media manifest: ${manifest.files.length} file(s), ${manifestFile}`);
}

async function checkProduction() {
	const manifest = readManifest();
	const failures = [];
	let cursor = 0;
	const workers = Array.from({ length: 8 }, async () => {
		while (cursor < manifest.files.length) {
			const entry = manifest.files[cursor++];
			const url = `${manifest.origin}/${entry.path}`;
			try {
				const response = await fetch(url, {
					method: "HEAD",
					redirect: "follow",
					signal: AbortSignal.timeout(20_000),
				});
				const remoteBytes = Number(response.headers.get("content-length"));
				if (!response.ok || remoteBytes !== entry.bytes) {
					failures.push(`${response.status} ${entry.path}: local ${entry.bytes}, remote ${remoteBytes || "unknown"}`);
				}
			} catch (error) {
				failures.push(`${entry.path}: ${error.message}`);
			}
		}
	});
	await Promise.all(workers);
	if (failures.length) {
		throw new Error(`Production media check failed:\n${failures.join("\n")}`);
	}
	console.log(`Production media: ${manifest.files.length} file(s) verified on ${manifest.origin}.`);
}

if (options.has("--write")) writeManifest();
if (options.has("--check-production")) await checkProduction();
if (!["--write", "--check-production"].some(option => options.has(option))) {
	console.error("Usage: node tools/media-manifest.mjs --write | --check-production");
	process.exit(2);
}
