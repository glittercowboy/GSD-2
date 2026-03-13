/**
 * Tests for secure_env_collect utility functions:
 * - checkExistingEnvKeys: detects keys already present in .env file or process.env
 * - detectDestination: infers write destination from project files
 *
 * Uses temp directories for filesystem isolation.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkExistingEnvKeys, detectDestination } from "../../get-secrets-from-user.ts";

function makeTempDir(prefix: string): string {
	const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

// ─── checkExistingEnvKeys ─────────────────────────────────────────────────────

test("secure_env_collect: checkExistingEnvKeys — key found in .env file", async () => {
	const tmp = makeTempDir("sec-env-test");
	try {
		const envPath = join(tmp, ".env");
		writeFileSync(envPath, "API_KEY=secret123\nOTHER=val\n");
		const result = await checkExistingEnvKeys(["API_KEY"], envPath);
		assert.deepStrictEqual(result, ["API_KEY"]);
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
});

test("secure_env_collect: checkExistingEnvKeys — key found in process.env", async () => {
	const tmp = makeTempDir("sec-env-test");
	const savedVal = process.env.GSD_TEST_ENV_KEY_12345;
	try {
		process.env.GSD_TEST_ENV_KEY_12345 = "some-value";
		const envPath = join(tmp, ".env"); // file doesn't exist
		const result = await checkExistingEnvKeys(["GSD_TEST_ENV_KEY_12345"], envPath);
		assert.deepStrictEqual(result, ["GSD_TEST_ENV_KEY_12345"]);
	} finally {
		delete process.env.GSD_TEST_ENV_KEY_12345;
		if (savedVal !== undefined) process.env.GSD_TEST_ENV_KEY_12345 = savedVal;
		rmSync(tmp, { recursive: true, force: true });
	}
});

test("secure_env_collect: checkExistingEnvKeys — key found in both .env and process.env", async () => {
	const tmp = makeTempDir("sec-env-test");
	const savedVal = process.env.GSD_TEST_BOTH_KEY;
	try {
		process.env.GSD_TEST_BOTH_KEY = "from-env";
		const envPath = join(tmp, ".env");
		writeFileSync(envPath, "GSD_TEST_BOTH_KEY=from-file\n");
		const result = await checkExistingEnvKeys(["GSD_TEST_BOTH_KEY"], envPath);
		assert.deepStrictEqual(result, ["GSD_TEST_BOTH_KEY"]);
	} finally {
		delete process.env.GSD_TEST_BOTH_KEY;
		if (savedVal !== undefined) process.env.GSD_TEST_BOTH_KEY = savedVal;
		rmSync(tmp, { recursive: true, force: true });
	}
});

test("secure_env_collect: checkExistingEnvKeys — key not found anywhere", async () => {
	const tmp = makeTempDir("sec-env-test");
	try {
		const envPath = join(tmp, ".env");
		writeFileSync(envPath, "OTHER_KEY=val\n");
		// Ensure it's not in process.env
		delete process.env.DEFINITELY_NOT_SET_KEY_XYZ;
		const result = await checkExistingEnvKeys(["DEFINITELY_NOT_SET_KEY_XYZ"], envPath);
		assert.deepStrictEqual(result, []);
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
});

test("secure_env_collect: checkExistingEnvKeys — .env file doesn't exist (ENOENT), still checks process.env", async () => {
	const tmp = makeTempDir("sec-env-test");
	const savedVal = process.env.GSD_TEST_ENOENT_KEY;
	try {
		process.env.GSD_TEST_ENOENT_KEY = "exists-in-process";
		const envPath = join(tmp, "nonexistent.env");
		const result = await checkExistingEnvKeys(["GSD_TEST_ENOENT_KEY", "MISSING_KEY_XYZ"], envPath);
		assert.deepStrictEqual(result, ["GSD_TEST_ENOENT_KEY"]);
	} finally {
		delete process.env.GSD_TEST_ENOENT_KEY;
		if (savedVal !== undefined) process.env.GSD_TEST_ENOENT_KEY = savedVal;
		rmSync(tmp, { recursive: true, force: true });
	}
});

test("secure_env_collect: checkExistingEnvKeys — empty-string value in process.env counts as existing", async () => {
	const tmp = makeTempDir("sec-env-test");
	const savedVal = process.env.GSD_TEST_EMPTY_KEY;
	try {
		process.env.GSD_TEST_EMPTY_KEY = "";
		const envPath = join(tmp, ".env");
		writeFileSync(envPath, "");
		const result = await checkExistingEnvKeys(["GSD_TEST_EMPTY_KEY"], envPath);
		assert.deepStrictEqual(result, ["GSD_TEST_EMPTY_KEY"]);
	} finally {
		delete process.env.GSD_TEST_EMPTY_KEY;
		if (savedVal !== undefined) process.env.GSD_TEST_EMPTY_KEY = savedVal;
		rmSync(tmp, { recursive: true, force: true });
	}
});

test("secure_env_collect: checkExistingEnvKeys — returns only existing keys from input list", async () => {
	const tmp = makeTempDir("sec-env-test");
	const saved1 = process.env.GSD_TEST_EXISTS_A;
	const saved2 = process.env.GSD_TEST_EXISTS_B;
	try {
		process.env.GSD_TEST_EXISTS_A = "val-a";
		delete process.env.GSD_TEST_EXISTS_B;
		const envPath = join(tmp, ".env");
		writeFileSync(envPath, "FILE_KEY=val\n");
		const result = await checkExistingEnvKeys(
			["GSD_TEST_EXISTS_A", "GSD_TEST_EXISTS_B", "FILE_KEY", "NOPE_KEY"],
			envPath,
		);
		assert.deepStrictEqual(result.sort(), ["FILE_KEY", "GSD_TEST_EXISTS_A"]);
	} finally {
		delete process.env.GSD_TEST_EXISTS_A;
		delete process.env.GSD_TEST_EXISTS_B;
		if (saved1 !== undefined) process.env.GSD_TEST_EXISTS_A = saved1;
		if (saved2 !== undefined) process.env.GSD_TEST_EXISTS_B = saved2;
		rmSync(tmp, { recursive: true, force: true });
	}
});

// ─── detectDestination ────────────────────────────────────────────────────────

test("secure_env_collect: detectDestination — returns 'vercel' when vercel.json exists", () => {
	const tmp = makeTempDir("sec-dest-test");
	try {
		writeFileSync(join(tmp, "vercel.json"), "{}");
		assert.equal(detectDestination(tmp), "vercel");
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
});

test("secure_env_collect: detectDestination — returns 'convex' when convex/ dir exists", () => {
	const tmp = makeTempDir("sec-dest-test");
	try {
		mkdirSync(join(tmp, "convex"));
		assert.equal(detectDestination(tmp), "convex");
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
});

test("secure_env_collect: detectDestination — returns 'dotenv' when neither exists", () => {
	const tmp = makeTempDir("sec-dest-test");
	try {
		assert.equal(detectDestination(tmp), "dotenv");
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
});

test("secure_env_collect: detectDestination — vercel takes priority when both exist", () => {
	const tmp = makeTempDir("sec-dest-test");
	try {
		writeFileSync(join(tmp, "vercel.json"), "{}");
		mkdirSync(join(tmp, "convex"));
		assert.equal(detectDestination(tmp), "vercel");
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
});

test("secure_env_collect: detectDestination — convex file (not dir) does not trigger convex", () => {
	const tmp = makeTempDir("sec-dest-test");
	try {
		writeFileSync(join(tmp, "convex"), "not a directory");
		assert.equal(detectDestination(tmp), "dotenv");
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
});
