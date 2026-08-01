import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

if (process.env.PICOCAD_PUBLISH_ACTIVE) process.exit(0);

const REGISTRY = "https://registry.npmjs.org/";
const TOKEN_KEY = "//registry.npmjs.org/:_authToken=";
const NPMRC_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	".npmrc",
);

function run(command, options = {}) {
	return spawnSync(command, { shell: true, ...options });
}

function whoami() {
	const result = run(`pnpm whoami --registry ${REGISTRY}`, {
		encoding: "utf8",
	});

	return result.status === 0 ? result.stdout.trim() : null;
}

function saveToken(token) {
	const lines = existsSync(NPMRC_PATH)
		? readFileSync(NPMRC_PATH, "utf8")
				.split(/\r?\n/)
				.filter((line) => line && !line.startsWith(TOKEN_KEY))
		: [];

	lines.push(`${TOKEN_KEY}${token}`);
	writeFileSync(NPMRC_PATH, `${lines.join("\n")}\n`);
}

async function promptForToken(user) {
	const tokensUrl = `https://www.npmjs.com/settings/${user ?? "your-username"}/tokens`;

	console.log("\nA new npm access token is needed.");
	console.log(`Generate one at: ${tokensUrl}`);
	console.log(
		"(Generate New Token -> Granular Access Token, with read and write access to this package)",
	);

	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const token = (await rl.question("\nPaste the new token: ")).trim();
	rl.close();

	if (!token) {
		console.error("No token provided, aborting.");
		process.exit(1);
	}

	saveToken(token);
	console.log("Token saved to the projects .npmrc file.");
}

function publish() {
	const args = process.argv.slice(2).join(" ");
	const result = run(`pnpm publish ${args}`, {
		encoding: "utf8",
		stdio: ["inherit", "pipe", "pipe"],
		env: { ...process.env, PICOCAD_PUBLISH_ACTIVE: "1" },
	});

	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);

	return result;
}

function isAuthError(result) {
	const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
	return /E401|E403|E404|ENEEDAUTH|Unable to authenticate|Two-factor|expired/i.test(
		output,
	);
}

let user = whoami();
if (!user) {
	console.log("Not authenticated with the npm registry.");
	await promptForToken(null);

	user = whoami();
	if (!user) {
		console.error("Still not authenticated with the new token, aborting.");
		process.exit(1);
	}
}
console.log(`Publishing as ${user}...`);

let result = publish();

if (result.status !== 0 && isAuthError(result)) {
	console.log("\nPublish failed with an authentication error.");
	console.log("Your token is likely expired or lacks publish permissions.");
	await promptForToken(user);

	result = publish();
	if (result.status !== 0) {
		console.error("Publish failed again, aborting.");
		process.exit(1);
	}
}

process.exit(result.status ?? 1);
