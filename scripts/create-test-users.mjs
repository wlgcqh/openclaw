// Script to create dynamic agent bindings for testing multi-user isolation
import fs from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';

const STORAGE_PATH = path.join(homedir(), '.openclaw', 'dynamic_agents.json');

const STORAGE_VERSION = '1.0';

// Test users to create
const testUsers = [
  { senderId: '+8613800138001', userId: 'user001', displayName: '测试用户1' },
  { senderId: '+8613800138002', userId: 'user002', displayName: '测试用户2' },
  { senderId: '+8613800138003', userId: 'user003', displayName: '测试用户3' },
];

async function main() {
  // Read existing storage or create new
  let storage;
  try {
    const content = await fs.readFile(STORAGE_PATH, 'utf-8');
    storage = JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      storage = { version: STORAGE_VERSION, bindings: [], agents: [] };
    } else {
      throw err;
    }
  }

  const now = Date.now();

  for (const user of testUsers) {
    // Check if already exists
    const existing = storage.bindings.find(b => b.senderId === user.senderId);
    if (existing) {
      console.log(`User ${user.userId} already bound to agent ${existing.agentId}`);
      continue;
    }

    // Generate agent ID
    const agentId = `agent-${user.userId}-${Date.now().toString(36)}`;

    // Create binding record
    const binding = {
      senderId: user.senderId,
      userId: user.userId,
      agentId: agentId,
      createdAt: now,
    };

    // Create agent record
    const workspacePath = path.join(homedir(), '.openclaw', `workspace-${agentId}`);
    const agentDirPath = path.join(homedir(), '.openclaw', 'agents', agentId, 'agent');

    const agentRecord = {
      agentId: agentId,
      userId: user.userId,
      createdAt: now,
      workspacePath: workspacePath,
      agentDirPath: agentDirPath,
    };

    storage.bindings.push(binding);
    storage.agents.push(agentRecord);

    // Create directories
    await fs.mkdir(workspacePath, { recursive: true });
    await fs.mkdir(agentDirPath, { recursive: true });

    // Create default IDENTITY.md
    const identityContent = `# Agent Identity

This agent belongs to user: ${user.userId} (${user.displayName})

Created at: ${new Date(now).toISOString()}
`;
    await fs.writeFile(path.join(agentDirPath, 'IDENTITY.md'), identityContent);

    // Create default AGENTS.md
    const agentsContent = `# Agent Configuration

User: ${user.userId}
Sender ID: ${user.senderId}

This agent has an isolated workspace and memory.
`;
    await fs.writeFile(path.join(agentDirPath, 'AGENTS.md'), agentsContent);

    console.log(`Created binding: ${user.senderId} -> ${user.userId} -> ${agentId}`);
    console.log(`  Workspace: ${workspacePath}`);
    console.log(`  Agent dir: ${agentDirPath}`);
  }

  // Save storage
  await fs.writeFile(STORAGE_PATH, JSON.stringify(storage, null, 2));
  console.log(`\nSaved ${storage.bindings.length} bindings to ${STORAGE_PATH}`);
}

main().catch(console.error);