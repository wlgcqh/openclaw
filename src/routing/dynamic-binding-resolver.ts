// Dynamic Agent Storage Types and Service
// Manages bindings (senderId -> userId -> agentId) and agent records

import type { DynamicBindingRecord, DynamicAgentRecord } from "../agents/dynamic-agent-storage.js";
import type { DynamicAgentStorageService } from "../agents/dynamic-agent-storage.js";

export type DynamicBindingResolution = {
  binding: DynamicBindingRecord;
  agent: DynamicAgentRecord;
  agentId: string;
} | null;

export type DynamicBindingResolverOptions = {
  enabled: boolean;
};

const DEFAULT_OPTIONS: DynamicBindingResolverOptions = {
  enabled: true,
};

let globalOptions: DynamicBindingResolverOptions = DEFAULT_OPTIONS;

export function setDynamicBindingOptions(options: DynamicBindingResolverOptions): void {
  globalOptions = options;
}

export function isDynamicBindingEnabled(): boolean {
  return globalOptions.enabled;
}

export type ResolveDynamicBindingParams = {
  senderId: string;
  channel: string; // Reserved for future channel-specific routing decisions
  storageService: DynamicAgentStorageService;
};

export async function resolveDynamicBinding(
  params: ResolveDynamicBindingParams,
): Promise<DynamicBindingResolution> {
  if (!isDynamicBindingEnabled()) {
    return null;
  }

  const binding = params.storageService.resolveBinding(params.senderId);
  if (!binding) {
    return null;
  }

  const agent = params.storageService.resolveAgent(binding.agentId);
  if (!agent) {
    return null;
  }

  return {
    binding,
    agent,
    agentId: binding.agentId,
  };
}
