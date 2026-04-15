// Dynamic Agent Provisioner
// Creates agent workspace and agent directory structures for dynamic multi-tenant agents

import fs from "node:fs/promises";
import path from "node:path";
import { normalizeAgentId } from "../routing/session-key.js";
import { resolveUserPath } from "../utils.js";
import type { DynamicAgentRecord, DynamicAgentStorageService } from "./dynamic-agent-storage.js";

export type DynamicAgentTemplate = {
  workspaceTemplate: string;
  agentDirTemplate: string;
};

export type ProvisionAgentParams = {
  userId: string;
  agentId?: string;
  template: DynamicAgentTemplate;
  storage: DynamicAgentStorageService;
};

export type ProvisionAgentResult = {
  agentId: string;
  workspacePath: string;
  agentDirPath: string;
  isNew: boolean;
};

const DEFAULT_WORKSPACE_TEMPLATE = "~/.openclaw/workspace-{agentId}";
const DEFAULT_AGENT_DIR_TEMPLATE = "~/.openclaw/agents/{agentId}/agent";

export function getDefaultTemplate(): DynamicAgentTemplate {
  return {
    workspaceTemplate: DEFAULT_WORKSPACE_TEMPLATE,
    agentDirTemplate: DEFAULT_AGENT_DIR_TEMPLATE,
  };
}

function resolveTemplatePath(template: string, agentId: string): string {
  return template.replace("{agentId}", agentId);
}

export async function provisionDynamicAgent(
  params: ProvisionAgentParams,
): Promise<ProvisionAgentResult> {
  // Normalize agentId for path/shell safety (e.g., "qi.heng" -> "qi-heng")
  const rawAgentId = params.agentId ?? `agent_${params.userId}`;
  const agentId = normalizeAgentId(rawAgentId);
  const workspacePath = resolveUserPath(
    resolveTemplatePath(params.template.workspaceTemplate, agentId),
  );
  const agentDirPath = resolveUserPath(
    resolveTemplatePath(params.template.agentDirTemplate, agentId),
  );

  // Check if agent already exists in storage
  const existingAgent = params.storage.resolveAgent(agentId);
  if (existingAgent) {
    return {
      agentId,
      workspacePath: existingAgent.workspacePath,
      agentDirPath: existingAgent.agentDirPath,
      isNew: false,
    };
  }

  // Create workspace directory
  await fs.mkdir(workspacePath, { recursive: true });

  // Create agent directory
  await fs.mkdir(agentDirPath, { recursive: true });

  // Create default workspace files
  await createDefaultWorkspaceFiles(workspacePath, params.userId);

  // Register agent in storage
  const agentRecord: DynamicAgentRecord = {
    agentId,
    userId: params.userId,
    createdAt: Date.now(),
    workspacePath,
    agentDirPath,
  };
  await params.storage.addAgent(agentRecord);

  return {
    agentId,
    workspacePath,
    agentDirPath,
    isNew: true,
  };
}

async function createDefaultWorkspaceFiles(workspacePath: string, userId: string): Promise<void> {
  const identityPath = path.join(workspacePath, "IDENTITY.md");
  const agentsPath = path.join(workspacePath, "AGENTS.md");

  const identityContent = `# Agent for ${userId}

This agent serves user ${userId}.
`;

  const agentsContent = `# Instructions

You are an AI assistant helping an employee of the company.
`;

  await fs.writeFile(identityPath, identityContent, "utf-8");
  await fs.writeFile(agentsPath, agentsContent, "utf-8");
}
