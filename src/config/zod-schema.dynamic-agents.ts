import { z } from "zod";
import { AgentModelSchema } from "./zod-schema.agent-model.js";
import { AgentSandboxSchema } from "./zod-schema.agent-runtime.js";
import { AgentToolsSchema } from "./zod-schema.agent-runtime.js";

export const ThinkingLevelSchema = z.enum([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "adaptive",
]);

export const DynamicAgentTemplateConfigSchema = z
  .object({
    inheritDefaults: z.boolean().optional(),
    workspaceTemplate: z.string().optional(),
    agentDirTemplate: z.string().optional(),
    model: AgentModelSchema.optional(),
    thinkingDefault: ThinkingLevelSchema.optional(),
    tools: AgentToolsSchema.optional(),
    sandbox: AgentSandboxSchema.optional(),
  })
  .strict()
  .optional();

export const DynamicAgentsStorageConfigSchema = z
  .object({
    path: z.string().optional(),
  })
  .strict()
  .optional();

export const DynamicAgentsApiConfigSchema = z
  .object({
    authToken: z.string().optional(),
  })
  .strict()
  .optional();

export const DynamicAgentsConfigSchema = z
  .object({
    enabled: z.boolean(),
    template: DynamicAgentTemplateConfigSchema,
    storage: DynamicAgentsStorageConfigSchema,
    api: DynamicAgentsApiConfigSchema,
  })
  .strict()
  .optional();
