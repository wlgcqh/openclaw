import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { DynamicAgentStorageService } from "../../agents/dynamic-agent-storage.js";
import { dynamicAgentHandlers, setTestStorageService } from "./dynamic-agents.js";
import type { GatewayRequestHandlerOptions } from "./types.js";

const { provisionDynamicAgentMock, getDefaultTemplateMock } = vi.hoisted(() => ({
  provisionDynamicAgentMock: vi.fn(),
  getDefaultTemplateMock: vi.fn(),
}));

vi.mock("../../agents/dynamic-agent-provisioner.js", () => ({
  provisionDynamicAgent: provisionDynamicAgentMock,
  getDefaultTemplate: getDefaultTemplateMock,
}));

function createOptions(
  method: string,
  params: Record<string, unknown>,
  overrides?: Partial<GatewayRequestHandlerOptions>,
): GatewayRequestHandlerOptions {
  return {
    req: { type: "req", id: "req-1", method, params },
    params,
    client: null,
    isWebchatConnect: () => false,
    respond: vi.fn(),
    context: {
      logGateway: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      },
    },
    ...overrides,
  } as unknown as GatewayRequestHandlerOptions;
}

describe("dynamicAgentHandlers", () => {
  let tempDir: string;
  let storagePath: string;
  let storage: DynamicAgentStorageService;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = path.join(os.tmpdir(), `dynamic-agent-handler-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    storagePath = path.join(tempDir, "dynamic_agents.json");
    storage = new DynamicAgentStorageService({ storagePath });
    await storage.load();

    // Inject test storage for tests that need it
    setTestStorageService(storage);

    getDefaultTemplateMock.mockReturnValue({
      workspaceTemplate: "~/.openclaw/workspace-{agentId}",
      agentDirTemplate: "~/.openclaw/agents/{agentId}/agent",
    });
  });

  afterEach(async () => {
    // Reset storage service
    setTestStorageService(null as never);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("dynamic.bindUser", () => {
    it("validates senderId (must be non-empty string)", async () => {
      const opts = createOptions("dynamic.bindUser", {
        senderId: "",
        userId: "emp001",
      });
      await dynamicAgentHandlers["dynamic.bindUser"](opts);

      expect(opts.respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({
          code: "INVALID_REQUEST",
          message: expect.stringContaining("senderId is required"),
        }),
      );
    });

    it("accepts various senderId formats (E.164, numeric, openId)", async () => {
      provisionDynamicAgentMock.mockResolvedValue({
        agentId: "agent_emp001",
        workspacePath: "/path/to/workspace",
        agentDirPath: "/path/to/agent",
        isNew: true,
      });

      // Test E.164 format
      const opts1 = createOptions("dynamic.bindUser", {
        senderId: "+15551234567",
        userId: "emp001",
      });
      await dynamicAgentHandlers["dynamic.bindUser"](opts1);
      expect(opts1.respond).toHaveBeenCalledWith(
        true,
        expect.objectContaining({ success: true }),
        undefined,
      );

      // Test Telegram numeric ID
      const opts2 = createOptions("dynamic.bindUser", {
        senderId: "123456789",
        userId: "emp002",
      });
      await dynamicAgentHandlers["dynamic.bindUser"](opts2);
      expect(opts2.respond).toHaveBeenCalledWith(
        true,
        expect.objectContaining({ success: true }),
        undefined,
      );

      // Test Feishu openId
      const opts3 = createOptions("dynamic.bindUser", {
        senderId: "ou_sender_123",
        userId: "emp003",
      });
      await dynamicAgentHandlers["dynamic.bindUser"](opts3);
      expect(opts3.respond).toHaveBeenCalledWith(
        true,
        expect.objectContaining({ success: true }),
        undefined,
      );
    });

    it("creates binding and provisions agent for new senderId", async () => {
      provisionDynamicAgentMock.mockResolvedValue({
        agentId: "agent_emp001",
        workspacePath: "/path/to/workspace",
        agentDirPath: "/path/to/agent",
        isNew: true,
      });

      const opts = createOptions("dynamic.bindUser", {
        senderId: "+15551234567",
        userId: "emp001",
      });
      await dynamicAgentHandlers["dynamic.bindUser"](opts);

      expect(provisionDynamicAgentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "emp001",
          template: {
            workspaceTemplate: "~/.openclaw/workspace-{agentId}",
            agentDirTemplate: "~/.openclaw/agents/{agentId}/agent",
          },
          storage: expect.any(DynamicAgentStorageService),
        }),
      );

      expect(opts.respond).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          success: true,
          binding: expect.objectContaining({
            senderId: "+15551234567",
            userId: "emp001",
            agentId: "agent_emp001",
          }),
          agent: expect.objectContaining({
            agentId: "agent_emp001",
            isNew: true,
          }),
        }),
        undefined,
      );
    });

    it("returns existing binding if already bound to same userId", async () => {
      // First, create a binding
      await storage.addBinding({
        senderId: "+15551234567",
        userId: "emp001",
        agentId: "agent_emp001",
        createdAt: Date.now(),
      });
      await storage.addAgent({
        agentId: "agent_emp001",
        userId: "emp001",
        createdAt: Date.now(),
        workspacePath: "/existing/workspace",
        agentDirPath: "/existing/agent",
      });

      provisionDynamicAgentMock.mockResolvedValue({
        agentId: "agent_emp001",
        workspacePath: "/existing/workspace",
        agentDirPath: "/existing/agent",
        isNew: false,
      });

      const opts = createOptions("dynamic.bindUser", {
        senderId: "+15551234567",
        userId: "emp001",
      });

      await dynamicAgentHandlers["dynamic.bindUser"](opts);

      expect(opts.respond).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          success: true,
          agent: expect.objectContaining({
            isNew: false,
          }),
        }),
        undefined,
      );
    });

    it("returns error if bound to different userId without force=true", async () => {
      // First, create a binding to emp001
      await storage.addBinding({
        senderId: "+15551234567",
        userId: "emp001",
        agentId: "agent_emp001",
        createdAt: Date.now(),
      });

      const opts = createOptions("dynamic.bindUser", {
        senderId: "+15551234567",
        userId: "emp002", // Different userId
      });

      await dynamicAgentHandlers["dynamic.bindUser"](opts);

      expect(opts.respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({
          code: "INVALID_REQUEST",
          message: expect.stringContaining("already bound to user emp001"),
        }),
      );
    });

    it("allows rebinding with force=true (account switch)", async () => {
      // First, create a binding to emp001
      await storage.addBinding({
        senderId: "+15551234567",
        userId: "emp001",
        agentId: "agent_emp001",
        createdAt: Date.now(),
      });

      provisionDynamicAgentMock.mockResolvedValue({
        agentId: "agent_emp002",
        workspacePath: "/path/to/workspace",
        agentDirPath: "/path/to/agent",
        isNew: true,
      });

      const opts = createOptions("dynamic.bindUser", {
        senderId: "+15551234567",
        userId: "emp002",
        force: true,
      });

      await dynamicAgentHandlers["dynamic.bindUser"](opts);

      expect(opts.respond).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          success: true,
          previousBinding: expect.objectContaining({
            userId: "emp001",
            agentId: "agent_emp001",
          }),
          binding: expect.objectContaining({
            userId: "emp002",
          }),
        }),
        undefined,
      );
    });

    it("accepts optional custom agentId", async () => {
      provisionDynamicAgentMock.mockResolvedValue({
        agentId: "custom_agent_123",
        workspacePath: "/path/to/workspace",
        agentDirPath: "/path/to/agent",
        isNew: true,
      });

      const opts = createOptions("dynamic.bindUser", {
        senderId: "+15551234567",
        userId: "emp001",
        agentId: "custom_agent_123",
      });
      await dynamicAgentHandlers["dynamic.bindUser"](opts);

      expect(provisionDynamicAgentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: "custom_agent_123",
        }),
      );
    });
  });

  describe("dynamic.unbindUser", () => {
    it("validates senderId (must be non-empty)", async () => {
      const opts = createOptions("dynamic.unbindUser", {
        senderId: "",
      });
      await dynamicAgentHandlers["dynamic.unbindUser"](opts);

      expect(opts.respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({
          code: "INVALID_REQUEST",
          message: expect.stringContaining("senderId is required"),
        }),
      );
    });

    it("removes existing binding", async () => {
      await storage.addBinding({
        senderId: "+15551234567",
        userId: "emp001",
        agentId: "agent_emp001",
        createdAt: Date.now(),
      });

      const opts = createOptions("dynamic.unbindUser", {
        senderId: "+15551234567",
      });

      await dynamicAgentHandlers["dynamic.unbindUser"](opts);

      expect(opts.respond).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          success: true,
          binding: expect.objectContaining({
            senderId: "+15551234567",
            userId: "emp001",
          }),
          agentDeleted: false,
        }),
        undefined,
      );
    });

    it("returns error for unknown senderId", async () => {
      const opts = createOptions("dynamic.unbindUser", {
        senderId: "+15559999999",
      });
      await dynamicAgentHandlers["dynamic.unbindUser"](opts);

      expect(opts.respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({
          code: "INVALID_REQUEST",
          message: expect.stringContaining("no binding found"),
        }),
      );
    });

    it("does not delete agent files by default", async () => {
      await storage.addBinding({
        senderId: "+15551234567",
        userId: "emp001",
        agentId: "agent_emp001",
        createdAt: Date.now(),
      });

      const opts = createOptions("dynamic.unbindUser", {
        senderId: "+15551234567",
      });

      await dynamicAgentHandlers["dynamic.unbindUser"](opts);

      expect(opts.respond).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          agentDeleted: false,
        }),
        undefined,
      );
    });
  });

  describe("dynamic.status", () => {
    it("validates senderId (must be non-empty)", async () => {
      const opts = createOptions("dynamic.status", {
        senderId: "",
      });
      await dynamicAgentHandlers["dynamic.status"](opts);

      expect(opts.respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({
          code: "INVALID_REQUEST",
          message: expect.stringContaining("senderId is required"),
        }),
      );
    });

    it("returns BOUND status for existing binding", async () => {
      await storage.addBinding({
        senderId: "+15551234567",
        userId: "emp001",
        agentId: "agent_emp001",
        createdAt: Date.now(),
      });

      const opts = createOptions("dynamic.status", {
        senderId: "+15551234567",
      });

      await dynamicAgentHandlers["dynamic.status"](opts);

      expect(opts.respond).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          status: "BOUND",
          senderId: "+15551234567",
          binding: expect.objectContaining({
            userId: "emp001",
            agentId: "agent_emp001",
          }),
        }),
        undefined,
      );
    });

    it("returns UNBOUND status for unknown senderId", async () => {
      const opts = createOptions("dynamic.status", {
        senderId: "+15559999999",
      });
      await dynamicAgentHandlers["dynamic.status"](opts);

      expect(opts.respond).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          status: "UNBOUND",
          senderId: "+15559999999",
        }),
        undefined,
      );
    });
  });
});
