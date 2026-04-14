import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DynamicAgentStorageService } from "../agents/dynamic-agent-storage.js";
import {
  resolveDynamicBinding,
  setDynamicBindingOptions,
  isDynamicBindingEnabled,
} from "./dynamic-binding-resolver.js";

describe("dynamic-binding-resolver", () => {
  let tempDir: string;
  let storageService: DynamicAgentStorageService;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `resolver-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    const storagePath = path.join(tempDir, "dynamic_agents.json");
    storageService = new DynamicAgentStorageService({ storagePath });
    await storageService.load();
    setDynamicBindingOptions({ enabled: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    setDynamicBindingOptions({ enabled: true });
  });

  describe("isDynamicBindingEnabled", () => {
    it("returns true by default", () => {
      setDynamicBindingOptions({ enabled: true });
      expect(isDynamicBindingEnabled()).toBe(true);
    });

    it("returns false when disabled", () => {
      setDynamicBindingOptions({ enabled: false });
      expect(isDynamicBindingEnabled()).toBe(false);
    });
  });

  describe("resolveDynamicBinding", () => {
    it("returns null when disabled", async () => {
      setDynamicBindingOptions({ enabled: false });

      await storageService.addBinding({
        senderId: "+15551234567",
        userId: "emp001",
        agentId: "agent_emp001",
        createdAt: Date.now(),
      });

      const result = await resolveDynamicBinding({
        senderId: "+15551234567",
        channel: "custom",
        storageService,
      });

      expect(result).toBeNull();
    });

    it("returns null when senderId not bound", async () => {
      const result = await resolveDynamicBinding({
        senderId: "+15559999999",
        channel: "custom",
        storageService,
      });

      expect(result).toBeNull();
    });

    it("returns binding when senderId is bound", async () => {
      await storageService.addBinding({
        senderId: "+15551234567",
        userId: "emp001",
        agentId: "agent_emp001",
        createdAt: Date.now(),
      });
      await storageService.addAgent({
        agentId: "agent_emp001",
        userId: "emp001",
        createdAt: Date.now(),
        workspacePath: "/workspace",
        agentDirPath: "/agent",
      });

      const result = await resolveDynamicBinding({
        senderId: "+15551234567",
        channel: "custom",
        storageService,
      });

      expect(result).toBeDefined();
      expect(result?.binding.userId).toBe("emp001");
      expect(result?.agentId).toBe("agent_emp001");
      expect(result?.agent.agentId).toBe("agent_emp001");
    });
  });
});
