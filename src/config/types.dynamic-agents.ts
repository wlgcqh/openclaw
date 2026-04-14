import type { AgentModelConfig } from "./types.agents-shared.js";
import type { AgentSandboxConfig } from "./types.agents-shared.js";
import type { AgentToolsConfig } from "./types.tools.js";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "adaptive";

export type DynamicAgentTemplateConfig = {
  inheritDefaults?: boolean;
  workspaceTemplate?: string;
  agentDirTemplate?: string;
  model?: AgentModelConfig;
  thinkingDefault?: ThinkingLevel;
  tools?: AgentToolsConfig;
  sandbox?: AgentSandboxConfig;
};

export type DynamicAgentsStorageConfig = {
  path?: string;
};

export type DynamicAgentsApiConfig = {
  authToken?: string;
};

export type DynamicAgentsConfig = {
  enabled: boolean;
  template?: DynamicAgentTemplateConfig;
  storage?: DynamicAgentsStorageConfig;
  api?: DynamicAgentsApiConfig;
};
