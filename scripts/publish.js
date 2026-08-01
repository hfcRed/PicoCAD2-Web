import { spawnSync } from "node:child_process";

if (process.env.PICOCAD_PUBLISH_ACTIVE) process.exit(0);

const REGISTRY = "https://registry.npmjs.org/";

function run(cmd, args, options = {}) {
	return spawnSync(cmd, args, { shell: true, ...options });
}

function login() {
	console.log("\nStarting npm login flow...");
	const result = run("pnpm", ["login", "--registry", REGISTRY], {
		stdio: "inherit",
	});

	if (result.status !== 0) {
		console.error("Login failed, aborting.");
		process.exit(1);
	}
}

function whoami() {
	const result = run("pnpm", ["whoami", "--registry", REGISTRY], {
		encoding: "utf8",
	});

	return result.status === 0 ? result.stdout.trim() : null;
}

function publish() {
	const result = run("pnpm", ["publish", ...process.argv.slice(2)], {
		encoding: "utf8",
		stdio: ["inherit", "pipe", "pipe"],
		env: { ...process.env, PICOCAD_PUBLISH_ACTIVE: "1" },
	});

	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);

	return result;
}

let user = whoami();
if (!user) {
	console.log("Not authenticated with the npm registry.");
	login();
	user = whoami();

	if (!user) {
		console.error("Still not authenticated after login, aborting.");
		process.exit(1);
	}
}
console.log(`Publishing as ${user}...`);

let result = publish();

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const isAuthError = /E401|E403|ENEEDAUTH|Unable to authenticate|expired/i.test(
	output,
);

if (result.status !== 0 && isAuthError) {
	console.log("\nPublish failed with an authentication error.");
	console.log("Your token is likely expired or lacks publish permissions.");

	login();
	result = publish();
	
	if (result.status !== 0) {
		console.error("Publish failed again, aborting.");
		process.exit(1);
	}
}

process.exit(result.status ?? 1);
