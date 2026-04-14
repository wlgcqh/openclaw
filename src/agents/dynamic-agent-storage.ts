// Dynamic Agent Storage Types and Service
// Manages bindings (senderId -> userId -> agentId) and agent records

import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

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
      const parsed = JSON.parse(content) as DynamicAgentStorage;
      this.storage = parsed;
      return parsed;
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
    const content = JSON.stringify(storage, null, 2);
    await fs.writeFile(this.storagePath, content, "utf-8");
    this.storage = storage;
  }
}
