import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const mediaDirectory = path.join(root, "src", "assets", "video", "mp4");
const manifestScript = path.join(root, "tools", "media-manifest.mjs");
const remoteDirectory = "domains/luxuryband.ru/public_html/assets/video/mp4";
const host = process.env.SPRINTHOST_HOST;
const user = process.env.SPRINTHOST_USER;
const port = process.env.SPRINTHOST_PORT || "22";
const inputs = process.argv.slice(2);

function fail(message) {
	console.error(message);
	process.exit(1);
}

function run(command, args) {
	const result = spawnSync(command, args, { stdio: "inherit" });
	if (result.status !== 0) fail(`${command} failed with exit code ${result.status}`);
}

if (!host || !user) {
	fail("Set SPRINTHOST_HOST and SPRINTHOST_USER before uploading media.");
}
if (!inputs.length) {
	fail("Usage: npm run media:upload -- src/assets/video/mp4/<name>.mp4");
}

run("ssh", ["-p", port, `${user}@${host}`, `mkdir -p ${remoteDirectory}`]);

for (const input of inputs) {
	const file = path.resolve(root, input);
	const relative = path.relative(mediaDirectory, file);
	const name = path.basename(file);
	if (relative.startsWith("..") || path.isAbsolute(relative)) fail(`File is outside ${mediaDirectory}: ${input}`);
	if (!/^[a-z0-9][a-z0-9.-]*\.mp4$/.test(name)) fail(`Unsafe video filename: ${name}`);
	if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(`Video file not found: ${file}`);

	const temporaryName = `.${name}.uploading-${process.pid}`;
	run("scp", ["-P", port, file, `${user}@${host}:${remoteDirectory}/${temporaryName}`]);
	run("ssh", [
		"-p",
		port,
		`${user}@${host}`,
		`mv ${remoteDirectory}/${temporaryName} ${remoteDirectory}/${name}`,
	]);
	console.log(`Uploaded: https://luxuryband.ru/assets/video/mp4/${name}`);
}

run(process.execPath, [manifestScript, "--write"]);
run(process.execPath, [manifestScript, "--check-production"]);
console.log("Commit media/manifest.json after the site code references the uploaded video.");
