/**
 * 多用户隔离测试脚本
 */

import WebSocket from 'ws';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

// 正确设置 sha512（必须在模块顶层）
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const GATEWAY_URL = 'ws://127.0.0.1:18790/ws';
const TOKEN = '2473656fcb7744d4b7559247098dc5114253b7fcffffdccc';

const TEST_USERS = [
  { userId: 'user001', expectedAgentId: 'agent-user001-mo18mn4k' },
  { userId: 'user002', expectedAgentId: 'agent-user002-mo18mn4r' },
  { userId: 'user003', expectedAgentId: 'agent-user003-mo18mn4t' },
];

const DEVICE_ID = '74cf629787ec3816df25a1647e6af9cbbfb17b812eb94a57cbb283c00b1f4ce7';
const PUBKEY_B64URL = 'D36ZoPFBLSk08CMgt2dzdtwiu9XhhX7VbgD4usOls7Q';
const PRIVKEY_JWK = '{"kty":"OKP","crv":"Ed25519","key_ops":["sign"],"ext":true,"d":"jZLl3sCvN_v5_MRPrueLnIShYmjKPVmXAxDUXMXZhmM","x":"D36ZoPFBLSk08CMgt2dzdtwiu9XhhX7VbgD4usOls7Q"}';

const ROLE = 'operator';
const SCOPES = ['operator.read', 'operator.write'];
const CLIENT_ID = 'cli';
const CLIENT_MODE = 'cli';

function fromBase64Url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const buf = Buffer.from(padded, 'base64');
  return new Uint8Array(buf);
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

const privKeyJwk = JSON.parse(PRIVKEY_JWK);
const privKeyBytes = fromBase64Url(privKeyJwk.d);

async function signPayload(payload: string): Promise<string> {
  const data = new TextEncoder().encode(payload);
  const sig = await ed.sign(data, privKeyBytes);
  return toBase64Url(sig);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface TestResult {
  userId: string;
  agentId: string | null;
  success: boolean;
  error?: string;
}

async function testUserConnection(user: { userId: string; expectedAgentId: string }): Promise<TestResult> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(GATEWAY_URL);
    let connected = false;
    let agentId: string | null = null;

    console.log(`\n=== Testing user: ${user.userId} ===`);

    ws.on('open', () => {
      console.log(`[${user.userId}] WebSocket connected`);
    });

    ws.on('message', async (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      console.log(`[${user.userId}] Received: ${msg.type} ${msg.event || ''}`);

      if (msg.type === 'event' && msg.event === 'connect.challenge') {
        const nonce = msg.payload.nonce;
        const ts = msg.payload.ts;
        console.log(`[${user.userId}] Challenge: nonce=${nonce}, ts=${ts}`);

        const scopeStr = SCOPES.join(',');
        const sigPayload = `v2|${DEVICE_ID}|${CLIENT_ID}|${CLIENT_MODE}|${ROLE}|${scopeStr}|${ts}|${TOKEN}|${nonce}`;
        const signature = await signPayload(sigPayload);

        const id = `req-${Date.now()}`;
        console.log(`[${user.userId}] Sending connect with userId: ${user.userId}`);

        ws.send(JSON.stringify({
          type: 'req',
          id,
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: { id: CLIENT_ID, version: '1.0.0', platform: 'linux', mode: CLIENT_MODE },
            role: ROLE,
            scopes: SCOPES,
            caps: ['tool-events'],
            commands: [],
            permissions: {},
            auth: { token: TOKEN },
            locale: 'zh-CN',
            userAgent: 'test-script',
            device: {
              id: DEVICE_ID,
              publicKey: PUBKEY_B64URL,
              signature,
              signedAt: ts,
              nonce,
            },
            userId: user.userId,
          },
        }));
      }

      if (msg.type === 'res') {
        if (msg.ok && msg.payload?.type === 'hello-ok') {
          connected = true;
          agentId = msg.payload.agentId || 'main';
          console.log(`[${user.userId}] ✓ Connected! agentId: ${agentId}`);
          console.log(`[${user.userId}] Server: ${msg.payload.server?.version}, connId: ${msg.payload.server?.connId}`);

          if (agentId === user.expectedAgentId) {
            console.log(`[${user.userId}] ✓ PASS: Matches expected agent`);
          } else if (agentId === 'main') {
            console.log(`[${user.userId}] ⚠ WARN: Got default 'main' agent`);
          } else {
            console.log(`[${user.userId}] Agent: ${agentId} (expected: ${user.expectedAgentId})`);
          }

          ws.close();
          resolve({ userId: user.userId, agentId, success: true });
        } else {
          console.log(`[${user.userId}] ✗ Error: ${msg.error?.message}`);
          ws.close();
          reject(new Error(`Failed: ${msg.error?.message}`));
        }
      }
    });

    ws.on('error', (err: Error) => {
      console.log(`[${user.userId}] ✗ WebSocket error: ${err.message}`);
      reject(err);
    });

    ws.on('close', () => {
      if (!connected) {
        reject(new Error(`Connection closed before handshake for ${user.userId}`));
      }
    });

    setTimeout(() => {
      if (!connected) {
        ws.close();
        reject(new Error(`Timeout for ${user.userId}`));
      }
    }, 30000);
  });
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Multi-User Isolation Test');
  console.log('Gateway:', GATEWAY_URL);
  console.log('='.repeat(60));

  const results: TestResult[] = [];

  for (const user of TEST_USERS) {
    try {
      const result = await testUserConnection(user);
      results.push(result);
    } catch (err) {
      const error = err as Error;
      console.log(`[${user.userId}] ✗ Failed: ${error.message}`);
      results.push({ userId: user.userId, agentId: null, success: false, error: error.message });
    }
    await delay(2000);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test Report');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\nTotal: ${results.length}, Passed: ${passed.length}, Failed: ${failed.length}`);
  console.log('\nResults:');
  for (const r of results) {
    console.log(`  ${r.success ? '✓' : '✗'} ${r.userId} -> ${r.agentId || 'N/A'}`);
  }

  if (passed.length > 0) {
    console.log('\nIsolation Check:');
    const agentIds = passed.map(r => r.agentId);
    const unique = new Set(agentIds);
    console.log(`  ${unique.size === passed.length ? '✓ PASS' : '✗ FAIL'}: ${unique.size} unique agents for ${passed.length} users`);
    console.log(`  Agent IDs: ${agentIds.join(', ')}`);
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
