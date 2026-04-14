import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DynamicAgentStorageService } from "../src/agents/dynamic-agent-storage.js";
/**
 * Test script for dynamic agent allocation.
 * Demonstrates binding two different users and verifying they get different agents.
 *
 * Usage: node --import tsx scripts/test-dynamic-agents-allocation.ts
 */
import {
  dynamicAgentHandlers,
  setTestStorageService,
  type BindUserResponse,
  type StatusResponse,
  type UnbindUserResponse,
} from "../src/gateway/server-methods/dynamic-agents.js";

interface TestResult {
  success: boolean;
  result?: unknown;
  error?: unknown;
}

async function main() {
  console.log("=== 动态Agent分配测试 ===\n");

  // Create temp storage
  const tempDir = path.join(os.tmpdir(), `test-dynamic-agents-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });
  const storagePath = path.join(tempDir, "dynamic_agents.json");

  console.log(`临时存储路径: ${storagePath}\n`);

  const storage = new DynamicAgentStorageService({ storagePath });
  await storage.load();
  setTestStorageService(storage);

  // Helper to create mock options
  function createOptions(
    method: string,
    params: Record<string, unknown>,
  ): {
    respond: (success: boolean, result: unknown, error: unknown) => void;
    promise: Promise<TestResult>;
  } & Record<string, unknown> {
    let resolvePromise: (result: TestResult) => void;
    const promise = new Promise<TestResult>((resolve) => {
      resolvePromise = resolve;
    });

    return {
      req: { type: "req", id: "req-1", method, params },
      params,
      client: null,
      isWebchatConnect: () => false,
      respond: (success: boolean, result: unknown, error: unknown) => {
        resolvePromise({ success, result, error });
      },
      context: {
        logGateway: {
          debug: () => {},
          error: console.error,
          info: console.log,
          warn: console.warn,
        },
      },
      promise,
    } as unknown as ReturnType<typeof createOptions>;
  }

  // Test 1: Bind first user
  console.log("1. 绑定第一个用户: 张三 (userId: zhangsan)");
  console.log("   senderId: +15551001001");

  const opts1 = createOptions("dynamic.bindUser", {
    senderId: "+15551001001",
    userId: "zhangsan",
  });
  await dynamicAgentHandlers["dynamic.bindUser"](opts1);
  const result1 = await opts1.promise;

  if (result1.success && result1.result) {
    const resp = result1.result as BindUserResponse;
    const binding = resp.binding;
    const agent = resp.agent;
    console.log(`   ✓ 成功绑定`);
    console.log(`   agentId: ${binding?.agentId}`);
    console.log(`   workspace: ${agent?.workspacePath}`);
    console.log(`   agentDir: ${agent?.agentDirPath}`);
    console.log(`   isNew: ${agent?.isNew}`);
  } else {
    console.log(`   ✗ 绑定失败: ${JSON.stringify(result1.error)}`);
  }

  // Test 2: Bind second user
  console.log("\n2. 绑定第二个用户: 李四 (userId: lisi)");
  console.log("   senderId: +15551001002");

  const opts2 = createOptions("dynamic.bindUser", {
    senderId: "+15551001002",
    userId: "lisi",
  });
  await dynamicAgentHandlers["dynamic.bindUser"](opts2);
  const result2 = await opts2.promise;

  if (result2.success && result2.result) {
    const resp = result2.result as BindUserResponse;
    const binding = resp.binding;
    const agent = resp.agent;
    console.log(`   ✓ 成功绑定`);
    console.log(`   agentId: ${binding?.agentId}`);
    console.log(`   workspace: ${agent?.workspacePath}`);
    console.log(`   agentDir: ${agent?.agentDirPath}`);
    console.log(`   isNew: ${agent?.isNew}`);
  } else {
    console.log(`   ✗ 绑定失败: ${JSON.stringify(result2.error)}`);
  }

  // Test 3: Check status for both users
  console.log("\n3. 查询张三的状态:");
  const opts3 = createOptions("dynamic.status", {
    senderId: "+15551001001",
  });
  await dynamicAgentHandlers["dynamic.status"](opts3);
  const result3 = await opts3.promise;

  if (result3.success && result3.result) {
    const resp = result3.result as StatusResponse;
    console.log(`   status: ${resp.status}`);
    console.log(`   agentId: ${resp.binding?.agentId}`);
  }

  console.log("\n4. 查询李四的状态:");
  const opts4 = createOptions("dynamic.status", {
    senderId: "+15551001002",
  });
  await dynamicAgentHandlers["dynamic.status"](opts4);
  const result4 = await opts4.promise;

  if (result4.success && result4.result) {
    const resp = result4.result as StatusResponse;
    console.log(`   status: ${resp.status}`);
    console.log(`   agentId: ${resp.binding?.agentId}`);
  }

  // Test 4: Check storage file content
  console.log("\n5. 查看存储文件内容:");
  const fileContent = await fs.readFile(storagePath, "utf-8");
  const data = JSON.parse(fileContent);

  console.log("\n   bindings:");
  for (const b of data.bindings) {
    console.log(`   - senderId: ${b.senderId}, userId: ${b.userId}, agentId: ${b.agentId}`);
  }

  console.log("\n   agents:");
  for (const a of data.agents) {
    console.log(`   - agentId: ${a.agentId}, userId: ${a.userId}`);
  }

  // Verify different agents
  const binding1 = data.bindings.find((b) => b.senderId === "+15551001001");
  const binding2 = data.bindings.find((b) => b.senderId === "+15551001002");

  console.log("\n=== 验证结果 ===");
  console.log(`  张三的 agentId: ${binding1?.agentId}`);
  console.log(`  李四的 agentId: ${binding2?.agentId}`);

  if (binding1?.agentId !== binding2?.agentId) {
    console.log(`  ✓ 两个用户分配了不同的agent`);
  } else {
    console.log(`  ✗ 错误: 两个用户分配了相同的agent!`);
  }

  // Test 5: Test unbind
  console.log("\n6. 测试解绑张三:");
  const opts5 = createOptions("dynamic.unbindUser", {
    senderId: "+15551001001",
  });
  await dynamicAgentHandlers["dynamic.unbindUser"](opts5);
  const result5 = await opts5.promise;

  if (result5.success && result5.result) {
    const resp = result5.result as UnbindUserResponse;
    console.log(`   ✓ 成功解绑`);
    console.log(`   原binding: ${resp.binding?.agentId}`);
  }

  // Test 6: Check status after unbind
  console.log("\n7. 查询张三解绑后的状态:");
  const opts6 = createOptions("dynamic.status", {
    senderId: "+15551001001",
  });
  await dynamicAgentHandlers["dynamic.status"](opts6);
  const result6 = await opts6.promise;

  if (result6.success && result6.result) {
    const resp = result6.result as StatusResponse;
    console.log(`   status: ${resp.status}`);
  }

  // Cleanup
  setTestStorageService(null as never);
  await fs.rm(tempDir, { recursive: true, force: true });
  console.log("\n=== 测试完成，已清理临时文件 ===");
}

main().catch((err) => {
  console.error("测试失败:", err);
  process.exit(1);
});
