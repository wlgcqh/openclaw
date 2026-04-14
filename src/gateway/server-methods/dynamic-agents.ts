import {
  provisionDynamicAgent,
  getDefaultTemplate,
} from "../../agents/dynamic-agent-provisioner.js";
import { DynamicAgentStorageService } from "../../agents/dynamic-agent-storage.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

// E.164 format validation: must start with + and have at least 3 more characters
function validateSenderId(senderId: string): boolean {
  if (!senderId.startsWith("+")) {
    return false;
  }
  // After the +, we need at least 3 digits (minimum valid E.164 is +123)
  const afterPlus = senderId.slice(1);
  return afterPlus.length >= 3 && /^\d+$/.test(afterPlus);
}

export type BindUserRequest = {
  senderId: string; // Phone number E.164 format like "+15551234567"
  userId: string; // Employee/user ID
  agentId?: string; // Optional custom agent ID
  force?: boolean; // Override existing binding
};

export type BindUserResponse = {
  success: boolean;
  binding?: {
    senderId: string;
    userId: string;
    agentId: string;
    createdAt: number;
    updatedAt?: number;
  };
  agent?: {
    agentId: string;
    workspacePath: string;
    agentDirPath: string;
    isNew: boolean;
  };
  previousBinding?: {
    userId: string;
    agentId: string;
  }; // For account switch
  error?: string;
};

export type UnbindUserRequest = {
  senderId: string;
  deleteAgent?: boolean; // Delete agent data, default false
};

export type UnbindUserResponse = {
  success: boolean;
  binding?: {
    senderId: string;
    userId: string;
    agentId: string;
  };
  agentDeleted: boolean;
  error?: string;
};

export type StatusResponse = {
  status: "BOUND" | "UNBOUND";
  senderId: string;
  binding?: {
    senderId: string;
    userId: string;
    agentId: string;
    createdAt: number;
  };
};

// Singleton storage service instance
let storageInstance: DynamicAgentStorageService | null = null;

function getStorageService(): DynamicAgentStorageService {
  if (!storageInstance) {
    storageInstance = new DynamicAgentStorageService();
  }
  return storageInstance;
}

// Allow test injection
export function setTestStorageService(storage: DynamicAgentStorageService | null): void {
  storageInstance = storage;
}

export const dynamicAgentHandlers: GatewayRequestHandlers = {
  "dynamic.bindUser": async ({ params, respond }) => {
    const p = params as BindUserRequest;

    // Validate senderId
    if (!p.senderId || !validateSenderId(p.senderId)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "senderId must be in E.164 format (e.g., +15551234567)",
        ),
      );
      return;
    }

    // Validate userId
    if (!p.userId || typeof p.userId !== "string" || !p.userId.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "userId is required"));
      return;
    }

    const storage = getStorageService();
    await storage.load();

    // Check existing binding
    const existingBinding = storage.resolveBinding(p.senderId);
    if (existingBinding) {
      if (existingBinding.userId === p.userId) {
        // Already bound to same user - return existing binding info
        const agentRecord = storage.resolveAgent(existingBinding.agentId);
        const response: BindUserResponse = {
          success: true,
          binding: existingBinding,
          agent: agentRecord
            ? {
                agentId: agentRecord.agentId,
                workspacePath: agentRecord.workspacePath,
                agentDirPath: agentRecord.agentDirPath,
                isNew: false,
              }
            : undefined,
        };
        respond(true, response, undefined);
        return;
      }

      // Bound to different user
      if (!p.force) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `senderId ${p.senderId} is already bound to user ${existingBinding.userId}. Use force=true to rebind.`,
          ),
        );
        return;
      }

      // Force rebind - record previous binding for response
      // Continue with provisioning new agent
    }

    // Provision agent
    const template = getDefaultTemplate();
    const provisionResult = await provisionDynamicAgent({
      userId: p.userId.trim(),
      agentId: p.agentId?.trim(),
      template,
      storage,
    });

    // Create binding record
    const now = Date.now();
    const bindingRecord = {
      senderId: p.senderId,
      userId: p.userId.trim(),
      agentId: provisionResult.agentId,
      createdAt: existingBinding ? existingBinding.createdAt : now,
      updatedAt: existingBinding ? now : undefined,
    };

    await storage.addBinding(bindingRecord);

    const response: BindUserResponse = {
      success: true,
      binding: bindingRecord,
      agent: {
        agentId: provisionResult.agentId,
        workspacePath: provisionResult.workspacePath,
        agentDirPath: provisionResult.agentDirPath,
        isNew: provisionResult.isNew,
      },
      previousBinding: existingBinding
        ? {
            userId: existingBinding.userId,
            agentId: existingBinding.agentId,
          }
        : undefined,
    };

    respond(true, response, undefined);
  },

  "dynamic.unbindUser": async ({ params, respond }) => {
    const p = params as UnbindUserRequest;

    // Validate senderId
    if (!p.senderId || !validateSenderId(p.senderId)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "senderId must be in E.164 format (e.g., +15551234567)",
        ),
      );
      return;
    }

    const storage = getStorageService();
    await storage.load();

    // Remove binding
    const removedBinding = await storage.removeBinding(p.senderId);
    if (!removedBinding) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `no binding found for senderId ${p.senderId}`),
      );
      return;
    }

    // For now, we don't delete agent files even if deleteAgent=true
    // This is a placeholder for future implementation
    const agentDeleted = false;

    const response: UnbindUserResponse = {
      success: true,
      binding: {
        senderId: removedBinding.senderId,
        userId: removedBinding.userId,
        agentId: removedBinding.agentId,
      },
      agentDeleted,
    };

    respond(true, response, undefined);
  },

  "dynamic.status": async ({ params, respond }) => {
    const p = params as { senderId: string };

    // Validate senderId
    if (!p.senderId || !validateSenderId(p.senderId)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "senderId must be in E.164 format (e.g., +15551234567)",
        ),
      );
      return;
    }

    const storage = getStorageService();
    await storage.load();

    const binding = storage.resolveBinding(p.senderId);

    if (binding) {
      const response: StatusResponse = {
        status: "BOUND",
        senderId: p.senderId,
        binding: {
          senderId: binding.senderId,
          userId: binding.userId,
          agentId: binding.agentId,
          createdAt: binding.createdAt,
        },
      };
      respond(true, response, undefined);
    } else {
      const response: StatusResponse = {
        status: "UNBOUND",
        senderId: p.senderId,
      };
      respond(true, response, undefined);
    }
  },
};
