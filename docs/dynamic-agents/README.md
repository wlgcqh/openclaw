# Dynamic Multi-Tenant Agent Service

动态多租户Agent服务，支持每个员工拥有独立的agent实例。

## 功能概述

- **动态绑定**: 通过HTTP API自动创建用户与agent的绑定关系
- **隔离存储**: 每个用户拥有独立的workspace和session存储
- **自动分配**: 新用户自动获得新的agent实例
- **E.164验证**: senderId必须是有效的电话号码格式

## 配置

### 1. 启用动态Agent模式

在 `~/.openclaw/openclaw.json` 中添加 `dynamicAgents` 配置:

```json
{
  "dynamicAgents": {
    "enabled": true,
    "storage": {
      "path": "~/.openclaw/dynamic_agents.json"
    },
    "template": {
      "workspaceTemplate": "~/.openclaw/workspace-{agentId}",
      "agentDirTemplate": "~/.openclaw/agents/{agentId}/agent",
      "thinkingDefault": "medium"
    }
  }
}
```

或使用CLI命令设置:

```bash
openclaw config set dynamicAgents.enabled true
openclaw config set dynamicAgents.storage.path ~/.openclaw/dynamic_agents.json
```

### 2. 配置字段说明

| 字段                         | 类型    | 说明                                                                         |
| ---------------------------- | ------- | ---------------------------------------------------------------------------- |
| `enabled`                    | boolean | 是否启用动态绑定模式                                                         |
| `storage.path`               | string  | 绑定数据存储文件路径                                                         |
| `template.workspaceTemplate` | string  | workspace目录模板，`{agentId}`会被替换                                       |
| `template.agentDirTemplate`  | string  | agent配置目录模板                                                            |
| `template.thinkingDefault`   | string  | thinking级别: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `adaptive` |

## Gateway API 端点

动态Agent服务通过Gateway的WebSocket API提供服务。需要先建立WebSocket连接，然后发送请求帧。

### 请求帧格式

所有请求使用统一格式:

```json
{
  "type": "req",
  "id": "unique-request-id",
  "method": "dynamic.bindUser",
  "params": { ... }
}
```

### 1. 绑定用户 (`dynamic.bindUser`)

创建或更新用户绑定。

**请求参数:**

```json
{
  "senderId": "+15551234567", // E.164格式电话号码
  "userId": "emp001", // 员工ID
  "agentId": "custom_agent", // 可选：自定义agentId
  "force": true // 可选：强制重新绑定
}
```

**响应示例:**

```json
{
  "success": true,
  "binding": {
    "senderId": "+15551234567",
    "userId": "emp001",
    "agentId": "agent_emp001",
    "createdAt": 1776128763018
  },
  "agent": {
    "agentId": "agent_emp001",
    "workspacePath": "~/.openclaw/workspace-agent_emp001",
    "agentDirPath": "~/.openclaw/agents/agent_emp001/agent",
    "isNew": true
  }
}
```

### 2. 解绑用户 (`dynamic.unbindUser`)

移除用户绑定。

**请求参数:**

```json
{
  "senderId": "+15551234567",
  "deleteAgent": false // 可选：是否删除agent数据（暂未实现）
}
```

**响应示例:**

```json
{
  "success": true,
  "binding": {
    "senderId": "+15551234567",
    "userId": "emp001",
    "agentId": "agent_emp001"
  },
  "agentDeleted": false
}
```

### 3. 查询状态 (`dynamic.status`)

查询senderId的绑定状态。

**请求参数:**

```json
{
  "senderId": "+15551234567"
}
```

**响应示例 (已绑定):**

```json
{
  "status": "BOUND",
  "senderId": "+15551234567",
  "binding": {
    "senderId": "+15551234567",
    "userId": "emp001",
    "agentId": "agent_emp001",
    "createdAt": 1776128763018
  }
}
```

**响应示例 (未绑定):**

```json
{
  "status": "UNBOUND",
  "senderId": "+15551234567"
}
```

## 测试步骤

### 方法一: 使用Gateway Client测试 (推荐)

运行测试脚本，模拟两个用户绑定:

```bash
# 运行测试脚本（会自动创建临时存储和清理）
node --import tsx scripts/test-dynamic-agents-allocation.ts
```

### 方法二: 使用单元测试

```bash
# 运行dynamic-agent相关测试
pnpm test src/gateway/server-methods/dynamic-agents.test.ts --run
pnpm test src/agents/dynamic-agent-storage.test.ts --run
pnpm test src/routing/resolve-route.test.ts -t "dynamic binding" --run
```

### 方法三: 通过WebSocket连接测试

Gateway监听端口18789（默认），可以通过WebSocket连接调用:

```bash
# 使用 wscat 或其他WebSocket客户端
wscat -c ws://localhost:18789

# 连接后发送请求（需要先connect）
> {"type":"req","id":"conn-1","method":"connect","params":{"auth":{"mode":"password","password":"your-password"}}}
> {"type":"req","id":"req-1","method":"dynamic.bindUser","params":{"senderId":"+15551001001","userId":"zhangsan"}}
> {"type":"req","id":"req-2","method":"dynamic.status","params":{"senderId":"+15551001001"}}
```

### 方法四: 直接查看存储文件

```bash
# 查看绑定数据
cat ~/.openclaw/dynamic_agents.json

# 查看创建的agent目录
ls -la ~/.openclaw/agents/
ls -la ~/.openclaw/workspace-*
```

## E.164 格式说明

senderId必须是有效的E.164电话号码格式:

- 必须以 `+` 开头
- `+` 后至少3位数字
- 例如: `+15551234567`, `+8613800138000`

无效格式会返回错误:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "senderId must be in E.164 format (e.g., +15551234567)"
  }
}
```

## 账号切换

同一senderId绑定到不同userId时需要使用 `force` 参数:

```json
// 张三的手机号要切换到李四的账号
{
  "type": "req",
  "id": "req-005",
  "method": "dynamic.bindUser",
  "params": {
    "senderId": "+15551001001",
    "userId": "lisi",
    "force": true
  }
}
```

响应会包含 `previousBinding` 字段记录之前的绑定:

```json
{
  "success": true,
  "previousBinding": {
    "userId": "zhangsan",
    "agentId": "agent_zhangsan"
  },
  "binding": {
    "userId": "lisi",
    ...
  }
}
```

## 路由行为

启用动态绑定后，路由行为:

1. **已绑定用户**: 消息路由到用户专属agent
2. **未绑定用户**: 返回UNAUTHORIZED，不处理消息
3. **非direct消息**: 不受动态绑定影响

## 目录结构

绑定后创建的目录结构:

```
~/.openclaw/
├── dynamic_agents.json          # 绑定数据存储
├── agents/
│   ├── agent_zhangsan/
│   │   └── agent/               # agent配置目录
│   └── agent_lisi/
│   │   └── agent/
├── workspace-agent_zhangsan/    # workspace目录
└── workspace-agent_lisi/
```

## 注意事项

1. 启用 `dynamicAgents.enabled=true` 后，所有direct消息发送者必须先绑定
2. 未绑定的senderId会收到UNAUTHORIZED响应
3. 目前 `deleteAgent=true` 暂未实现，解绑不会删除agent文件
4. 存储文件使用原子写入，确保数据安全
