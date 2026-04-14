import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const startPluginServices = vi.fn(async () => null);
  const startGmailWatcherWithLogs = vi.fn(async () => undefined);
  const loadInternalHooks = vi.fn(async () => 0);
  const setInternalHooksEnabled = vi.fn();
  const startGatewayMemoryBackend = vi.fn(async () => undefined);
  const scheduleGatewayUpdateCheck = vi.fn(() => () => {});
  const startGatewayTailscaleExposure = vi.fn(async () => null);
  const logGatewayStartup = vi.fn();
  const scheduleSubagentOrphanRecovery = vi.fn();
  const shouldWakeFromRestartSentinel = vi.fn(() => false);
  const scheduleRestartSentinelWake = vi.fn();
  const reconcilePendingSessionIdentities = vi.fn(async () => ({
    checked: 0,
    resolved: 0,
    failed: 0,
  }));
  const initializeGlobalDynamicAgentStorage = vi.fn(() => ({
    load: vi.fn(async () => ({ version: "1.0", bindings: [], agents: [] })),
  }));
  const setDynamicBindingOptions = vi.fn();
  return {
    startPluginServices,
    startGmailWatcherWithLogs,
    loadInternalHooks,
    setInternalHooksEnabled,
    startGatewayMemoryBackend,
    scheduleGatewayUpdateCheck,
    startGatewayTailscaleExposure,
    logGatewayStartup,
    scheduleSubagentOrphanRecovery,
    shouldWakeFromRestartSentinel,
    scheduleRestartSentinelWake,
    reconcilePendingSessionIdentities,
    initializeGlobalDynamicAgentStorage,
    setDynamicBindingOptions,
  };
});

vi.mock("../agents/session-dirs.js", () => ({
  resolveAgentSessionDirs: vi.fn(async () => []),
}));

vi.mock("../agents/session-write-lock.js", () => ({
  cleanStaleLockFiles: vi.fn(async () => undefined),
}));

vi.mock("../agents/subagent-registry.js", () => ({
  scheduleSubagentOrphanRecovery: hoisted.scheduleSubagentOrphanRecovery,
}));

vi.mock("../config/paths.js", async () => {
  const actual = await vi.importActual<typeof import("../config/paths.js")>("../config/paths.js");
  return {
    ...actual,
    STATE_DIR: "/tmp/openclaw-state",
    resolveConfigPath: vi.fn(() => "/tmp/openclaw-state/openclaw.json"),
    resolveGatewayPort: vi.fn(() => 18789),
    resolveStateDir: vi.fn(() => "/tmp/openclaw-state"),
  };
});

vi.mock("../hooks/gmail-watcher-lifecycle.js", () => ({
  startGmailWatcherWithLogs: hoisted.startGmailWatcherWithLogs,
}));

vi.mock("../hooks/internal-hooks.js", () => ({
  createInternalHookEvent: vi.fn(() => ({})),
  setInternalHooksEnabled: hoisted.setInternalHooksEnabled,
  triggerInternalHook: vi.fn(async () => undefined),
}));

vi.mock("../hooks/loader.js", () => ({
  loadInternalHooks: hoisted.loadInternalHooks,
}));

vi.mock("../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: vi.fn(() => null),
}));

vi.mock("../plugins/services.js", () => ({
  startPluginServices: hoisted.startPluginServices,
}));

vi.mock("../acp/control-plane/manager.js", () => ({
  getAcpSessionManager: vi.fn(() => ({
    reconcilePendingSessionIdentities: hoisted.reconcilePendingSessionIdentities,
  })),
}));

vi.mock("./server-restart-sentinel.js", () => ({
  scheduleRestartSentinelWake: hoisted.scheduleRestartSentinelWake,
  shouldWakeFromRestartSentinel: hoisted.shouldWakeFromRestartSentinel,
}));

vi.mock("./server-startup-memory.js", () => ({
  startGatewayMemoryBackend: hoisted.startGatewayMemoryBackend,
}));

vi.mock("./server-startup-log.js", () => ({
  logGatewayStartup: hoisted.logGatewayStartup,
}));

vi.mock("../infra/update-startup.js", () => ({
  scheduleGatewayUpdateCheck: hoisted.scheduleGatewayUpdateCheck,
}));

vi.mock("./server-tailscale.js", () => ({
  startGatewayTailscaleExposure: hoisted.startGatewayTailscaleExposure,
}));

vi.mock("../agents/dynamic-agent-storage.js", () => ({
  initializeGlobalDynamicAgentStorage: hoisted.initializeGlobalDynamicAgentStorage,
}));

vi.mock("../routing/dynamic-binding-resolver.js", () => ({
  setDynamicBindingOptions: hoisted.setDynamicBindingOptions,
}));

const { startGatewayPostAttachRuntime } = await import("./server-startup-post-attach.js");

describe("startGatewayPostAttachRuntime", () => {
  beforeEach(() => {
    hoisted.startPluginServices.mockClear();
    hoisted.startGmailWatcherWithLogs.mockClear();
    hoisted.loadInternalHooks.mockClear();
    hoisted.setInternalHooksEnabled.mockClear();
    hoisted.startGatewayMemoryBackend.mockClear();
    hoisted.scheduleGatewayUpdateCheck.mockClear();
    hoisted.startGatewayTailscaleExposure.mockClear();
    hoisted.logGatewayStartup.mockClear();
    hoisted.scheduleSubagentOrphanRecovery.mockClear();
    hoisted.shouldWakeFromRestartSentinel.mockReturnValue(false);
    hoisted.scheduleRestartSentinelWake.mockClear();
    hoisted.reconcilePendingSessionIdentities.mockClear();
    hoisted.initializeGlobalDynamicAgentStorage.mockClear();
    hoisted.setDynamicBindingOptions.mockClear();
  });

  it("re-enables startup-gated methods after post-attach sidecars start", async () => {
    const unavailableGatewayMethods = new Set<string>(["chat.history", "models.list"]);

    await startGatewayPostAttachRuntime({
      minimalTestGateway: false,
      cfgAtStart: { hooks: { internal: { enabled: false } } } as never,
      bindHost: "127.0.0.1",
      bindHosts: ["127.0.0.1"],
      port: 18789,
      tlsEnabled: false,
      log: { info: vi.fn(), warn: vi.fn() },
      isNixMode: false,
      broadcast: vi.fn(),
      tailscaleMode: "off",
      resetOnExit: false,
      controlUiBasePath: "/",
      logTailscale: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      gatewayPluginConfigAtStart: { hooks: { internal: { enabled: false } } } as never,
      pluginRegistry: {
        plugins: [
          { id: "beta", status: "loaded" },
          { id: "alpha", status: "loaded" },
          { id: "cold", status: "disabled" },
          { id: "broken", status: "error" },
        ],
      } as never,
      defaultWorkspaceDir: "/tmp/openclaw-workspace",
      deps: {} as never,
      startChannels: vi.fn(async () => undefined),
      logHooks: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      logChannels: {
        info: vi.fn(),
        error: vi.fn(),
      },
      unavailableGatewayMethods,
    });

    expect([...unavailableGatewayMethods]).toEqual([]);
    expect(hoisted.startPluginServices).toHaveBeenCalledTimes(1);
    expect(hoisted.setInternalHooksEnabled).toHaveBeenCalledWith(false);
    expect(hoisted.logGatewayStartup).toHaveBeenCalledWith(
      expect.objectContaining({ loadedPluginIds: ["beta", "alpha"] }),
    );
  });
});

describe("dynamic agent storage initialization", () => {
  beforeEach(() => {
    hoisted.startPluginServices.mockClear();
    hoisted.startGmailWatcherWithLogs.mockClear();
    hoisted.loadInternalHooks.mockClear();
    hoisted.setInternalHooksEnabled.mockClear();
    hoisted.startGatewayMemoryBackend.mockClear();
    hoisted.scheduleGatewayUpdateCheck.mockClear();
    hoisted.startGatewayTailscaleExposure.mockClear();
    hoisted.logGatewayStartup.mockClear();
    hoisted.scheduleSubagentOrphanRecovery.mockClear();
    hoisted.shouldWakeFromRestartSentinel.mockReturnValue(false);
    hoisted.scheduleRestartSentinelWake.mockClear();
    hoisted.reconcilePendingSessionIdentities.mockClear();
    hoisted.initializeGlobalDynamicAgentStorage.mockClear();
    hoisted.setDynamicBindingOptions.mockClear();
  });

  it("initializes dynamic agent storage when dynamicAgents.enabled is true", async () => {
    const unavailableGatewayMethods = new Set<string>(["chat.history"]);

    await startGatewayPostAttachRuntime({
      minimalTestGateway: false,
      cfgAtStart: { hooks: { internal: { enabled: false } } } as never,
      bindHost: "127.0.0.1",
      bindHosts: ["127.0.0.1"],
      port: 18789,
      tlsEnabled: false,
      log: { info: vi.fn(), warn: vi.fn() },
      isNixMode: false,
      broadcast: vi.fn(),
      tailscaleMode: "off",
      resetOnExit: false,
      controlUiBasePath: "/",
      logTailscale: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      gatewayPluginConfigAtStart: {
        hooks: { internal: { enabled: false } },
        dynamicAgents: { enabled: true },
      } as never,
      pluginRegistry: { plugins: [] } as never,
      defaultWorkspaceDir: "/tmp/openclaw-workspace",
      deps: {} as never,
      startChannels: vi.fn(async () => undefined),
      logHooks: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      logChannels: {
        info: vi.fn(),
        error: vi.fn(),
      },
      unavailableGatewayMethods,
    });

    expect(hoisted.initializeGlobalDynamicAgentStorage).toHaveBeenCalledWith({});
    expect(hoisted.setDynamicBindingOptions).toHaveBeenCalledWith({ enabled: true });
  });

  it("passes custom storage path when configured", async () => {
    const unavailableGatewayMethods = new Set<string>(["chat.history"]);

    await startGatewayPostAttachRuntime({
      minimalTestGateway: false,
      cfgAtStart: { hooks: { internal: { enabled: false } } } as never,
      bindHost: "127.0.0.1",
      bindHosts: ["127.0.0.1"],
      port: 18789,
      tlsEnabled: false,
      log: { info: vi.fn(), warn: vi.fn() },
      isNixMode: false,
      broadcast: vi.fn(),
      tailscaleMode: "off",
      resetOnExit: false,
      controlUiBasePath: "/",
      logTailscale: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      gatewayPluginConfigAtStart: {
        hooks: { internal: { enabled: false } },
        dynamicAgents: {
          enabled: true,
          storage: { path: "/custom/path/dynamic_agents.json" },
        },
      } as never,
      pluginRegistry: { plugins: [] } as never,
      defaultWorkspaceDir: "/tmp/openclaw-workspace",
      deps: {} as never,
      startChannels: vi.fn(async () => undefined),
      logHooks: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      logChannels: {
        info: vi.fn(),
        error: vi.fn(),
      },
      unavailableGatewayMethods,
    });

    expect(hoisted.initializeGlobalDynamicAgentStorage).toHaveBeenCalledWith({
      storagePath: "/custom/path/dynamic_agents.json",
    });
    expect(hoisted.setDynamicBindingOptions).toHaveBeenCalledWith({ enabled: true });
  });

  it("does not initialize storage when dynamicAgents.enabled is false", async () => {
    const unavailableGatewayMethods = new Set<string>(["chat.history"]);

    await startGatewayPostAttachRuntime({
      minimalTestGateway: false,
      cfgAtStart: { hooks: { internal: { enabled: false } } } as never,
      bindHost: "127.0.0.1",
      bindHosts: ["127.0.0.1"],
      port: 18789,
      tlsEnabled: false,
      log: { info: vi.fn(), warn: vi.fn() },
      isNixMode: false,
      broadcast: vi.fn(),
      tailscaleMode: "off",
      resetOnExit: false,
      controlUiBasePath: "/",
      logTailscale: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      gatewayPluginConfigAtStart: {
        hooks: { internal: { enabled: false } },
        dynamicAgents: { enabled: false },
      } as never,
      pluginRegistry: { plugins: [] } as never,
      defaultWorkspaceDir: "/tmp/openclaw-workspace",
      deps: {} as never,
      startChannels: vi.fn(async () => undefined),
      logHooks: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      logChannels: {
        info: vi.fn(),
        error: vi.fn(),
      },
      unavailableGatewayMethods,
    });

    expect(hoisted.initializeGlobalDynamicAgentStorage).not.toHaveBeenCalled();
    expect(hoisted.setDynamicBindingOptions).toHaveBeenCalledWith({ enabled: false });
  });

  it("does not initialize storage when dynamicAgents is not configured", async () => {
    const unavailableGatewayMethods = new Set<string>(["chat.history"]);

    await startGatewayPostAttachRuntime({
      minimalTestGateway: false,
      cfgAtStart: { hooks: { internal: { enabled: false } } } as never,
      bindHost: "127.0.0.1",
      bindHosts: ["127.0.0.1"],
      port: 18789,
      tlsEnabled: false,
      log: { info: vi.fn(), warn: vi.fn() },
      isNixMode: false,
      broadcast: vi.fn(),
      tailscaleMode: "off",
      resetOnExit: false,
      controlUiBasePath: "/",
      logTailscale: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      gatewayPluginConfigAtStart: {
        hooks: { internal: { enabled: false } },
      } as never,
      pluginRegistry: { plugins: [] } as never,
      defaultWorkspaceDir: "/tmp/openclaw-workspace",
      deps: {} as never,
      startChannels: vi.fn(async () => undefined),
      logHooks: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      logChannels: {
        info: vi.fn(),
        error: vi.fn(),
      },
      unavailableGatewayMethods,
    });

    expect(hoisted.initializeGlobalDynamicAgentStorage).not.toHaveBeenCalled();
    expect(hoisted.setDynamicBindingOptions).toHaveBeenCalledWith({ enabled: false });
  });

  it("logs warning and continues when storage initialization fails", async () => {
    const warnLog = vi.fn();
    const unavailableGatewayMethods = new Set<string>(["chat.history"]);
    hoisted.initializeGlobalDynamicAgentStorage.mockImplementation(() => {
      throw new Error("storage init failed");
    });

    await startGatewayPostAttachRuntime({
      minimalTestGateway: false,
      cfgAtStart: { hooks: { internal: { enabled: false } } } as never,
      bindHost: "127.0.0.1",
      bindHosts: ["127.0.0.1"],
      port: 18789,
      tlsEnabled: false,
      log: { info: vi.fn(), warn: warnLog },
      isNixMode: false,
      broadcast: vi.fn(),
      tailscaleMode: "off",
      resetOnExit: false,
      controlUiBasePath: "/",
      logTailscale: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      gatewayPluginConfigAtStart: {
        hooks: { internal: { enabled: false } },
        dynamicAgents: { enabled: true },
      } as never,
      pluginRegistry: { plugins: [] } as never,
      defaultWorkspaceDir: "/tmp/openclaw-workspace",
      deps: {} as never,
      startChannels: vi.fn(async () => undefined),
      logHooks: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      logChannels: {
        info: vi.fn(),
        error: vi.fn(),
      },
      unavailableGatewayMethods,
    });

    expect(warnLog).toHaveBeenCalledWith(
      expect.stringContaining("dynamic agent storage initialization failed"),
    );
    // Should still continue with other startup
    expect(hoisted.startPluginServices).toHaveBeenCalledTimes(1);
  });
});
