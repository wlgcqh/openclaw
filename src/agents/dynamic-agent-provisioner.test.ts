import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  provisionDynamicAgent,
  getDefaultTemplate,
  type DynamicAgentTemplate,
} from "./dynamic-agent-provisioner.js";
import { DynamicAgentStorageService } from "./dynamic-agent-storage.js";

describe("provisionDynamicAgent", () => {
  let tempDir: string;
  let tempHome: string;
  let storageService: DynamicAgentStorageService;
  let template: DynamicAgentTemplate;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `provisioner-test-${Date.now()}`);
    tempHome = path.join(tempDir, "home");
    await fs.mkdir(tempHome, { recursive: true });
    const storagePath = path.join(tempHome, "dynamic_agents.json");
    storageService = new DynamicAgentStorageService({ storagePath });
    await storageService.load();
    template = {
      workspaceTemplate: path.join(tempHome, "workspace-{agentId}"),
      agentDirTemplate: path.join(tempHome, "agents/{agentId}/agent"),
    };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates new agent directories when not exists", async () => {
    const result = await provisionDynamicAgent({
      userId: "emp001",
      template,
      storage: storageService,
    });

    expect(result.agentId).toBe("agent_emp001");
    expect(result.isNew).toBe(true);
    expect(result.workspacePath).toContain("agent_emp001");

    const workspaceStat = await fs.stat(result.workspacePath);
    expect(workspaceStat.isDirectory()).toBe(true);
    const agentDirStat = await fs.stat(result.agentDirPath);
    expect(agentDirStat.isDirectory()).toBe(true);
  });

  it("returns existing agent when already provisioned", async () => {
    const first = await provisionDynamicAgent({
      userId: "emp001",
      template,
      storage: storageService,
    });
    expect(first.isNew).toBe(true);

    const second = await provisionDynamicAgent({
      userId: "emp001",
      template,
      storage: storageService,
    });
    expect(second.isNew).toBe(false);
    expect(second.agentId).toBe(first.agentId);
  });

  it("creates IDENTITY.md with user ID", async () => {
    const result = await provisionDynamicAgent({
      userId: "emp002",
      template,
      storage: storageService,
    });

    const identityPath = path.join(result.workspacePath, "IDENTITY.md");
    const content = await fs.readFile(identityPath, "utf-8");
    expect(content).toContain("emp002");
    expect(content).toContain("# Agent for emp002");
  });

  it("creates AGENTS.md with instructions", async () => {
    const result = await provisionDynamicAgent({
      userId: "emp003",
      template,
      storage: storageService,
    });

    const agentsPath = path.join(result.workspacePath, "AGENTS.md");
    const content = await fs.readFile(agentsPath, "utf-8");
    expect(content).toContain("# Instructions");
    expect(content).toContain("AI assistant");
  });

  it("uses custom agentId when provided", async () => {
    const result = await provisionDynamicAgent({
      userId: "emp004",
      agentId: "custom_agent_xyz",
      template,
      storage: storageService,
    });

    expect(result.agentId).toBe("custom_agent_xyz");
    expect(result.workspacePath).toContain("custom_agent_xyz");
  });

  it("registers agent in storage", async () => {
    const result = await provisionDynamicAgent({
      userId: "emp005",
      template,
      storage: storageService,
    });

    const stored = storageService.resolveAgent(result.agentId);
    expect(stored).not.toBeNull();
    expect(stored?.userId).toBe("emp005");
    expect(stored?.workspacePath).toBe(result.workspacePath);
    expect(stored?.agentDirPath).toBe(result.agentDirPath);
  });

  it("handles different users with different agents", async () => {
    const result1 = await provisionDynamicAgent({
      userId: "user1",
      template,
      storage: storageService,
    });
    const result2 = await provisionDynamicAgent({
      userId: "user2",
      template,
      storage: storageService,
    });

    expect(result1.agentId).toBe("agent_user1");
    expect(result2.agentId).toBe("agent_user2");
    expect(result1.workspacePath).not.toBe(result2.workspacePath);
  });

  it("normalizes userId with special characters (e.g., dots to dashes)", async () => {
    const result = await provisionDynamicAgent({
      userId: "qi.heng",
      template,
      storage: storageService,
    });

    // "qi.heng" should be normalized to "qi-heng" (dots replaced with dashes)
    expect(result.agentId).toBe("agent_qi-heng");
    expect(result.workspacePath).toContain("agent_qi-heng");
    expect(result.agentDirPath).toContain("agent_qi-heng");

    // Verify the directory was actually created with the normalized name
    const agentDirStat = await fs.stat(result.agentDirPath);
    expect(agentDirStat.isDirectory()).toBe(true);
  });

  it("normalizes custom agentId with special characters", async () => {
    const result = await provisionDynamicAgent({
      userId: "emp006",
      agentId: "custom.agent.id",
      template,
      storage: storageService,
    });

    // "custom.agent.id" should be normalized to "custom-agent-id"
    expect(result.agentId).toBe("custom-agent-id");
    expect(result.workspacePath).toContain("custom-agent-id");
  });

  it("can find agent by normalized agentId", async () => {
    await provisionDynamicAgent({
      userId: "qi.heng",
      template,
      storage: storageService,
    });

    // Should find agent by the normalized agentId
    const stored = storageService.resolveAgent("agent_qi-heng");
    expect(stored).not.toBeNull();
    expect(stored?.userId).toBe("qi.heng");
  });
});

describe("getDefaultTemplate", () => {
  it("returns default template with correct placeholders", () => {
    const template = getDefaultTemplate();

    expect(template.workspaceTemplate).toContain("{agentId}");
    expect(template.agentDirTemplate).toContain("{agentId}");
    expect(template.workspaceTemplate).toContain(".openclaw");
    expect(template.agentDirTemplate).toContain(".openclaw");
  });
});
