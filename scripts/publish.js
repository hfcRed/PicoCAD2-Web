import { spawn, spawnSync } from "node:child_process";
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
const PACKAGE_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"package.json",
);
const PUBLISH_BRANCHES = ["main", "master"];

function prereleaseTag() {
	const { version } = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));
	const prerelease = version.split("-")[1];
	if (!prerelease) return null;

	const identifier = prerelease.split(".")[0];
	return /^[a-zA-Z]/.test(identifier) ? identifier : "next";
}

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

async function prompt(question) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = (await rl.question(question)).trim();
	rl.close();
	return answer;
}

async function promptForToken(user) {
	const tokensUrl = `https://www.npmjs.com/settings/${user ?? "your-username"}/tokens`;

	console.log("\nA new npm access token is needed.");
	console.log(`Generate one at: ${tokensUrl}`);
	console.log(
		"(Generate New Token -> Granular Access Token, with read and write access to this package)",
	);

	const token = await prompt("\nPaste the new token: ");
	if (!token) {
		console.error("No token provided, aborting.");
		process.exit(1);
	}

	saveToken(token);
	console.log("Token saved to the projects .npmrc file.");
}

async function runGitChecks() {
	const status = run("git status --porcelain", { encoding: "utf8" });
	if (status.status === 0 && status.stdout.trim()) {
		console.error(
			"Unclean working tree. Commit or stash changes first (or pass --no-git-checks).",
		);
		process.exit(1);
	}

	const branchResult = run("git branch --show-current", { encoding: "utf8" });
	const branch = branchResult.status === 0 ? branchResult.stdout.trim() : null;
	if (branch && !PUBLISH_BRANCHES.includes(branch)) {
		const answer = await prompt(
			`You are on branch "${branch}", not ${PUBLISH_BRANCHES.join("|")}. Publish anyway? (y/N) `,
		);
		if (answer.toLowerCase() !== "y") {
			console.log("Aborting.");
			process.exit(1);
		}
	}
}

function publish() {
	const args = process.argv.slice(2);

	const tag = prereleaseTag();
	const hasExplicitTag = args.some(
		(arg) => arg === "--tag" || arg.startsWith("--tag="),
	);
	if (tag && !hasExplicitTag) {
		console.log(
			`Prerelease version detected, publishing under the "${tag}" dist-tag.`,
		);
		args.push("--tag", tag);
	}

	// The git checks already ran visibly in this script.
	if (!args.includes("--no-git-checks")) {
		args.push("--no-git-checks");
	}

	return new Promise((resolve) => {
		const child = spawn(`pnpm publish ${args.join(" ")}`, {
			shell: true,
			stdio: ["inherit", "pipe", "pipe"],
			env: { ...process.env, PICOCAD_PUBLISH_ACTIVE: "1" },
		});

		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
			process.stdout.write(chunk);
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
			process.stderr.write(chunk);
		});
		child.on("close", (status) => resolve({ status, stdout, stderr }));
		child.on("error", (error) => {
			console.error(error.message);
			resolve({ status: 1, stdout, stderr });
		});
	});
}

function isAuthError(result) {
	const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
	return /E401|E403|E404|ENEEDAUTH|Unable to authenticate|Two-factor|expired/i.test(
		output,
	);
}

if (!process.argv.slice(2).includes("--no-git-checks")) {
	await runGitChecks();
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

let result = await publish();

if (result.status !== 0 && isAuthError(result)) {
	console.log("\nPublish failed with an authentication error.");
	console.log("Your token is likely expired or lacks publish permissions.");
	await promptForToken(user);

	result = await publish();
	if (result.status !== 0) {
		console.error("Publish failed again, aborting.");
		process.exit(1);
	}
}

process.exit(result.status ?? 1);
