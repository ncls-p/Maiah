import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function lockfileHash() {
	return createHash("sha256")
		.update(readFileSync("package-lock.json"))
		.digest("hex");
}

const before = lockfileHash();
const result = spawnSync(
	"npm",
	[
		"install",
		"--package-lock-only",
		"--ignore-scripts",
		"--no-audit",
		"--no-fund",
	],
	{ stdio: "inherit" },
);

if (result.status !== 0) {
	process.exit(result.status ?? 1);
}

const after = lockfileHash();
if (before !== after) {
	process.stderr.write(
		"package-lock.json is not reproducible with the pinned npm version. Run npm install with the repo npm version and commit the updated lockfile.\n",
	);
	process.exit(1);
}

process.stdout.write("package-lock.json is reproducible.\n");
