// Dynamic Agent Storage Types and Service
// Manages bindings (senderId -> userId -> agentId) and agent records

import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { resolveStateDir } from "../config/paths.js";
import { writeJsonFileAtomically } from "../plugin-sdk/json-store.js";
import { safeParseJsonWithSchema } from "../utils/zod-parse.js";

export type DynamicBindingRecord = {
  senderId: string; // Phone number, e.g., "+15551234567"
  userId: string; // Employee ID from auth service
  agentId: string; // Generated agent ID
  createdAt: number; // Unix timestamp (ms)
  updatedAt?: number; // Updated timestamp for account switches
};

export type DynamicAgentRecord = {
  agentId: string;
  userId: string;
  createdAt: number;
  workspacePath: string;
  agentDirPath: string;
};

export type DynamicAgentStorage = {
  version: string;
  bindings: DynamicBindingRecord[];
  agents: DynamicAgentRecord[];
};

export const DynamicBindingRecordSchema = z.object({
  senderId: z.string(),
  userId: z.string(),
  agentId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number().optional(),
}) as z.ZodType<DynamicBindingRecord>;

export const DynamicAgentRecordSchema = z.object({
  agentId: z.string(),
  userId: z.string(),
  createdAt: z.number(),
  workspacePath: z.string(),
  agentDirPath: z.string(),
}) as z.ZodType<DynamicAgentRecord>;

export const DynamicAgentStorageSchema = z.object({
  version: z.string(),
  bindings: z.array(DynamicBindingRecordSchema),
  agents: z.array(DynamicAgentRecordSchema),
}) as z.ZodType<DynamicAgentStorage>;

export const STORAGE_VERSION = "1.0";
export const DEFAULT_STORAGE_PATH = "dynamic_agents.json";

export type DynamicAgentStorageServiceOptions = {
  storagePath?: string;
};

export class DynamicAgentStorageService {
  private storagePath: string;
  private storage: DynamicAgentStorage | null = null;

  constructor(options?: DynamicAgentStorageServiceOptions) {
    if (options?.storagePath) {
      this.storagePath = options.storagePath;
    } else {
      const stateDir = resolveStateDir(process.env);
      this.storagePath = path.join(stateDir, DEFAULT_STORAGE_PATH);
    }
  }

  async load(): Promise<DynamicAgentStorage> {
    if (this.storage) {
      return this.storage;
    }

    try {
      const content = await fs.readFile(this.storagePath, "utf-8");
      const parsed = safeParseJsonWithSchema(DynamicAgentStorageSchema, content);
      if (parsed) {
        this.storage = parsed;
        return parsed;
      }
      // Invalid JSON or schema validation failed - create default
      const defaultStorage: DynamicAgentStorage = {
        version: STORAGE_VERSION,
        bindings: [],
        agents: [],
      };
      this.storage = defaultStorage;
      await this.save(defaultStorage);
      return defaultStorage;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File doesn't exist, create default
        const defaultStorage: DynamicAgentStorage = {
          version: STORAGE_VERSION,
          bindings: [],
          agents: [],
        };
        this.storage = defaultStorage;
        await this.save(defaultStorage);
        return defaultStorage;
      }
      throw error;
    }
  }

  async save(storage: DynamicAgentStorage): Promise<void> {
    await writeJsonFileAtomically(this.storagePath, storage);
    this.storage = storage;
  }
}
