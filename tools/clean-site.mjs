import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const siteDirectory = path.join(root, "_site");

if (path.dirname(siteDirectory) !== root || path.basename(siteDirectory) !== "_site") {
	throw new Error(`Refusing to clean unexpected path: ${siteDirectory}`);
}

fs.rmSync(siteDirectory, { recursive: true, force: true });
