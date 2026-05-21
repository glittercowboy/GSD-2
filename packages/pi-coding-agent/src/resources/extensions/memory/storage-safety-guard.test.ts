import assert from "node:assert/strict";
import { lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MemoryStorage } from "./storage.js";

test("MemoryStorage replaces a symlinked DB path instead of overwriting the symlink target", async (t) => {
	const dir = mkdtempSync(join(tmpdir(), "memory-storage-atomic-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));

	const canaryPath = join(dir, "canary.txt");
	const dbPath = join(dir, "memory.db");
	const canaryStorage = await MemoryStorage.create(canaryPath);
	canaryStorage.close();
	const originalCanary = readFileSync(canaryPath);
	symlinkSync(canaryPath, dbPath);

	const storage = await MemoryStorage.create(dbPath);
	storage.upsertThreads([{
		threadId: "thread-1",
		filePath: join(dir, "thread.jsonl"),
		fileSize: 1,
		fileMtime: 1,
		cwd: dir,
	}]);
	storage.close();

	assert.deepEqual(readFileSync(canaryPath), originalCanary);
	assert.equal(lstatSync(dbPath).isSymbolicLink(), false, "atomic snapshot write should replace the symlink");
});
