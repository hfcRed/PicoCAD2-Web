/**
 * Stores a build of the library under `test/perf/builds/<name>/` so the
 * performance runner can compare it against other builds.
 *
 *   node test/perf/snapshot.ts <name> --npm <version>
 *   node test/perf/snapshot.ts <name> --ref <git-ref>
 *   node test/perf/snapshot.ts <name> --dist
 *   node test/perf/snapshot.ts --list
 *
 * `--npm` downloads the published package, `--ref` builds the commit in a
 * temporary git worktree that shares this checkout's node_modules, and
 * `--dist` copies the working tree's current `dist/main.js`. Every snapshot
 * gets a `meta.json` recording where it came from, which the runner prints.
 *
 * The intended chain for an optimization pass: `1.3.0` from npm, `base` from
 * the commit before the first optimization, one snapshot after each
 * optimization lands, and `dist` for the working tree.
 */

import { execFileSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmdirSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const buildsDir = join(root, "test/perf/builds");

interface SnapshotMeta {
	name: string;
	source: string;
	commit: string | null;
	date: string;
	bytes: number;
}

function run(command: string, args: string[], cwd: string): string {
	return execFileSync(command, args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "inherit"],
		shell: process.platform === "win32",
	}).trim();
}

function writeSnapshot(
	name: string,
	mainJs: string,
	source: string,
	commit: string | null,
): void {
	const dir = join(buildsDir, name);
	mkdirSync(dir, { recursive: true });
	copyFileSync(mainJs, join(dir, "main.js"));
	const meta: SnapshotMeta = {
		name,
		source,
		commit,
		date: new Date().toISOString(),
		bytes: statSync(mainJs).size,
	};
	writeFileSync(
		join(dir, "meta.json"),
		`${JSON.stringify(meta, null, "\t")}\n`,
	);
	console.log(
		`Stored ${name}: ${source} (${(meta.bytes / 1024).toFixed(0)} KB) in test/perf/builds/${name}/`,
	);
}

function snapshotNpm(name: string, version: string): void {
	const tmp = join(root, "node_modules/.tmp/perf-npm");
	rmSync(tmp, { recursive: true, force: true });
	mkdirSync(tmp, { recursive: true });
	const tarball = run(
		"npm",
		["pack", `picocad2-web@${version}`, "--pack-destination", tmp],
		root,
	)
		.split("\n")
		.pop();
	if (!tarball) throw new Error("npm pack did not report a tarball");
	const mainJs = join(tmp, "main.js");
	writeFileSync(
		mainJs,
		extractTarEntry(
			gunzipSync(readFileSync(join(tmp, tarball))),
			"package/dist/main.js",
		),
	);
	writeSnapshot(name, mainJs, `npm picocad2-web@${version}`, null);
	rmSync(tmp, { recursive: true, force: true });
}

/**
 * Reads one file out of an uncompressed tar archive. The system tar is not
 * used because Git's GNU tar reads a Windows drive letter as a host name.
 *
 * @param tar - The archive bytes.
 * @param wanted - The entry path to extract.
 * @returns The entry's bytes.
 */
function extractTarEntry(tar: Buffer, wanted: string): Buffer {
	let offset = 0;
	while (offset + 512 <= tar.length) {
		const header = tar.subarray(offset, offset + 512);
		if (header[0] === 0) break;
		const field = (start: number, length: number): string =>
			header
				.subarray(start, start + length)
				.toString("utf8")
				.replace(/\0.*$/s, "");
		const prefix = field(345, 155);
		const path = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
		const size = Number.parseInt(field(124, 12), 8);
		const start = offset + 512;
		if (path === wanted) return tar.subarray(start, start + size);
		offset = start + Math.ceil(size / 512) * 512;
	}
	throw new Error(`${wanted} not found in the tarball`);
}

function snapshotRef(name: string, ref: string): void {
	const commit = run("git", ["rev-parse", ref], root);
	const subject = run("git", ["log", "-1", "--format=%s", commit], root);
	const tmp = join(root, "node_modules/.tmp/perf-worktree");
	if (existsSync(tmp)) {
		run("git", ["worktree", "remove", "--force", tmp], root);
	}
	run("git", ["worktree", "add", "--detach", tmp, commit], root);

	// The worktree shares this checkout's dependencies through a junction,
	// which is removed again before the worktree is, so nothing follows it.
	const modules = join(tmp, "node_modules");
	symlinkSync(join(root, "node_modules"), modules, "junction");
	try {
		execFileSync("pnpm", ["exec", "vite", "build"], {
			cwd: tmp,
			stdio: "inherit",
			shell: process.platform === "win32",
		});
		writeSnapshot(
			name,
			join(tmp, "dist/main.js"),
			`git ${commit.slice(0, 7)} ${subject}`,
			commit,
		);
	} finally {
		rmdirSync(modules);
		run("git", ["worktree", "remove", "--force", tmp], root);
	}
}

function snapshotDist(name: string): void {
	const mainJs = join(root, "dist/main.js");
	if (!existsSync(mainJs)) {
		throw new Error("dist/main.js does not exist, run pnpm build first");
	}
	const commit = run("git", ["rev-parse", "HEAD"], root);
	const dirty = run("git", ["status", "--porcelain", "--", "lib"], root) !== "";
	writeSnapshot(
		name,
		mainJs,
		`dist at ${commit.slice(0, 7)}${dirty ? " with uncommitted changes" : ""}`,
		commit,
	);
}

function list(): void {
	if (!existsSync(buildsDir)) {
		console.log("No snapshots yet.");
		return;
	}
	for (const entry of readdirSync(buildsDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const metaPath = join(buildsDir, entry.name, "meta.json");
		if (!existsSync(metaPath)) continue;
		const meta = JSON.parse(readFileSync(metaPath, "utf8")) as SnapshotMeta;
		console.log(
			`${meta.name.padEnd(16)} ${meta.source}  (${meta.date.slice(0, 10)}, ${(meta.bytes / 1024).toFixed(0)} KB)`,
		);
	}
}

function main(): void {
	const argv = process.argv.slice(2);
	if (argv.includes("--list")) {
		list();
		return;
	}

	const name = argv[0];
	if (!name || name.startsWith("--")) {
		throw new Error(
			"Usage: snapshot.ts <name> --npm <version> | --ref <git-ref> | --dist",
		);
	}
	if (!/^[\w.-]+$/.test(name)) {
		throw new Error(
			`Snapshot names may only contain letters, digits, ".", "_" and "-": ${name}`,
		);
	}

	const npmAt = argv.indexOf("--npm");
	const refAt = argv.indexOf("--ref");
	if (npmAt >= 0 && argv[npmAt + 1]) {
		snapshotNpm(name, argv[npmAt + 1]);
	} else if (refAt >= 0 && argv[refAt + 1]) {
		snapshotRef(name, argv[refAt + 1]);
	} else if (argv.includes("--dist")) {
		snapshotDist(name);
	} else {
		throw new Error("Pass --npm <version>, --ref <git-ref> or --dist");
	}
}

main();
