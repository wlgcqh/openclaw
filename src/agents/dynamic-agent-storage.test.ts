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

  it("resolveBinding returns binding by senderId", async () => {
    await service.load();
    await service.addBinding({
      senderId: "+15551234567",
      userId: "emp001",
      agentId: "agent_emp001",
      createdAt: Date.now(),
    });

    const binding = service.resolveBinding("+15551234567");
    expect(binding).toBeDefined();
    expect(binding?.userId).toBe("emp001");
    expect(binding?.agentId).toBe("agent_emp001");
  });

  it("resolveBinding returns null for unknown senderId", async () => {
    await service.load();
    const binding = service.resolveBinding("+15559999999");
    expect(binding).toBeNull();
  });

  it("removeBinding removes binding and returns it", async () => {
    await service.load();
    await service.addBinding({
      senderId: "+15551234567",
      userId: "emp001",
      agentId: "agent_emp001",
      createdAt: Date.now(),
    });

    const removed = await service.removeBinding("+15551234567");
    expect(removed).toBeDefined();
    expect(removed?.userId).toBe("emp001");

    const binding = service.resolveBinding("+15551234567");
    expect(binding).toBeNull();
  });

  it("removeBinding returns null for unknown senderId", async () => {
    await service.load();
    const removed = await service.removeBinding("+15559999999");
    expect(removed).toBeNull();
  });

  it("addAgent registers agent record", async () => {
    await service.load();
    await service.addAgent({
      agentId: "agent_emp001",
      userId: "emp001",
      createdAt: Date.now(),
      workspacePath: "/path/to/workspace",
      agentDirPath: "/path/to/agent",
    });

    const storage = await service.load();
    const agent = storage.agents.find((a) => a.agentId === "agent_emp001");
    expect(agent).toBeDefined();
    expect(agent?.userId).toBe("emp001");
  });

  it("resolveAgent returns agent by agentId", async () => {
    await service.load();
    await service.addAgent({
      agentId: "agent_emp001",
      userId: "emp001",
      createdAt: Date.now(),
      workspacePath: "/path/to/workspace",
      agentDirPath: "/path/to/agent",
    });

    const agent = service.resolveAgent("agent_emp001");
    expect(agent).toBeDefined();
    expect(agent?.userId).toBe("emp001");
    expect(agent?.workspacePath).toBe("/path/to/workspace");
  });

  it("resolveAgent returns null for unknown agentId", async () => {
    await service.load();
    const agent = service.resolveAgent("unknown_agent");
    expect(agent).toBeNull();
  });
});
