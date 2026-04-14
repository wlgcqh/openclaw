import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DynamicAgentStorageService, STORAGE_VERSION } from "./dynamic-agent-storage.js";

describe("DynamicAgentStorageService", () => {
  let tempDir: string;
  let storagePath: string;
  let service: DynamicAgentStorageService;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `dynamic-agent-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    storagePath = path.join(tempDir, "dynamic_agents.json");
    service = new DynamicAgentStorageService({ storagePath });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("loads empty storage when file does not exist", async () => {
    const storage = await service.load();

    expect(storage.version).toBe(STORAGE_VERSION);
    expect(storage.bindings).toEqual([]);
    expect(storage.agents).toEqual([]);
  });
});
