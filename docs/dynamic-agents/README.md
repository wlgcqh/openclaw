# Dynamic Multi-Tenant Agent Service

动态多租户Agent服务，支持每个员工拥有独立的agent实例。

## 功能概述

- **动态绑定**: 通过HTTP API自动创建用户与agent的绑定关系
- **隔离存储**: 每个用户拥有独立的workspace和session存储
- **自动分配**: 新用户自动获得新的agent实例
- **WebSocket连接**: 客户端连接时自动根据userId映射到对应agent
- **对话历史共享**: 同一用户从多个设备连接时共享对话历史

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
  },
  "gateway": {
    "auth": {
      "mode": "none"
    }
  }
}
```

或使用CLI命令设置:

```bash
openclaw config set dynamicAgents.enabled true
openclaw config set dynamicAgents.storage.path ~/.openclaw/dynamic_agents.json
openclaw config set gateway.auth.mode none
```

**注意**: 使用 `gateway.auth.mode none` 时，webchat客户端可以直接连接而无需认证。这在内部网络环境中是安全的配置。

### 2. 配置字段说明

| 字段                         | 类型    | 说明                                                                         |
| ---------------------------- | ------- | ---------------------------------------------------------------------------- |
| `enabled`                    | boolean | 是否启用动态绑定模式                                                         |
| `storage.path`               | string  | 绑定数据存储文件路径                                                         |
| `template.workspaceTemplate` | string  | workspace目录模板，`{agentId}`会被替换                                       |
| `template.agentDirTemplate`  | string  | agent配置目录模板                                                            |
| `template.thinkingDefault`   | string  | thinking级别: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `adaptive` |

## Gateway API 端点

动态Agent服务通过Gateway的WebSocket API提供服务。

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
  "senderId": "user_001", // 用户标识符
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
    "senderId": "user_001",
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
  "senderId": "user_001",
  "deleteAgent": false // 可选：是否删除agent数据（暂未实现）
}
```

### 3. 查询状态 (`dynamic.status`)

查询senderId的绑定状态。

**请求参数:**

```json
{
  "senderId": "user_001"
}
```

**响应示例 (已绑定):**

```json
{
  "status": "BOUND",
  "senderId": "user_001",
  "binding": {
    "senderId": "user_001",
    "userId": "emp001",
    "agentId": "agent_emp001",
    "createdAt": 1776128763018
  }
}
```

## 测试步骤

### 方法一: 使用网页客户端测试 (推荐)

**1. 启动Gateway**

```bash
# 确保 gateway 正在运行
openclaw gateway run --bind loopback --port 18789 --force
```

**2. 绑定用户**

```bash
# 绑定用户张三
openclaw gateway call dynamic.bindUser --params '{"senderId":"user_001","userId":"zhangsan"}' --json

# 绑定用户李四（测试多用户）
openclaw gateway call dynamic.bindUser --params '{"senderId":"user_002","userId":"lisi"}' --json

# 查看绑定状态
openclaw gateway call dynamic.status --params '{"senderId":"user_001"}' --json
```

**3. 启动HTTP服务器**

```bash
cd docs/dynamic-agents
python3 -m http.server 8080
```

**4. 打开网页客户端**

浏览器打开 http://localhost:8080/webchat-client.html

**5. 测试对话**

- 输入用户名 `zhangsan`
- 点击"开始对话" - 系统自动映射到 `agent_zhangsan`
- 发送消息进行对话

**6. 测试多用户隔离**

- 打开另一个浏览器窗口
- 输入用户名 `lisi`
- 点击"开始对话" - 系统映射到 `agent_lisi`
- 两个用户的对话历史完全隔离

### 方法二: 使用单元测试

```bash
# 运行dynamic-agent相关测试
pnpm test src/gateway/server-methods/dynamic-agents.test.ts --run
pnpm test src/agents/dynamic-agent-storage.test.ts --run
pnpm test src/gateway/server/ws-connection/connect-policy.test.ts --run
```

### 方法三: 使用Gateway CLI测试

```bash
# 使用 wscat 或其他WebSocket客户端
wscat -c ws://localhost:18789

# 连接后发送请求
> {"type":"req","id":"conn-1","method":"connect","params":{"minProtocol":3,"maxProtocol":3,"client":{"id":"webchat-ui","displayName":"WebChat - zhangsan","version":"1.0","platform":"web","mode":"webchat"},"userId":"zhangsan","scopes":["operator.write"]}}
> {"type":"req","id":"req-1","method":"dynamic.status","params":{"senderId":"user_001"}}
```

## senderId 格式说明

senderId 支持多种格式:

- E.164 电话号码: `+15551234567`
- Telegram/Discord 数字ID: `123456789`
- Feishu/Slack openId: `ou_sender_1`, `U123`
- 任意非空字符串: `user_001`, `emp001`

绑定请求示例:

```bash
# 使用任意字符串作为senderId
openclaw gateway call dynamic.bindUser --params '{"senderId":"user_001","userId":"zhangsan"}'
```

## 账号切换

同一senderId绑定到不同userId时需要使用 `force` 参数:

```json
{
  "senderId": "user_001",
  "userId": "lisi",
  "force": true
}
```

## WebSocket连接流程

### 客户端连接参数

```javascript
const connectParams = {
  minProtocol: 3,
  maxProtocol: 3,
  client: {
    id: "webchat-ui",
    displayName: "WebChat - " + userId,
    version: "1.0.0",
    platform: "web",
    mode: "webchat", // 重要：标识为webchat客户端
  },
  userId: userId, // 用于动态agent映射
  scopes: ["operator.write"], // 必需：用于发送消息
};
```

### HelloOk响应

连接成功后，Gateway返回:

```json
{
  "type": "hello-ok",
  "protocol": 3,
  "server": { "version": "...", "connId": "..." },
  "agentId": "agent_zhangsan" // 动态映射的agentId
}
```

### SessionKey格式

发送消息时使用:

```javascript
const sessionKey = `agent:${agentId}:dm:${userId}`;
// 例如: agent:agent_zhangsan:dm:zhangsan
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
│       └── agent/
├── workspace-agent_zhangsan/    # workspace目录
└── workspace-agent_lisi/
```

## 对话历史行为

- **不同用户**: 完全隔离，各自独立的历史
- **同一用户多窗口**: 共享历史，保持一致性

sessionKey = `agent:{agentId}:dm:{userId}`，同一userId使用同一session文件。

## 注意事项

1. 启用 `dynamicAgents.enabled=true` 后，所有webchat客户端必须先绑定userId
2. 使用 `gateway.auth.mode=none` 适合内部网络环境
3. 目前 `deleteAgent=true` 暂未实现，解绑不会删除agent文件
4. 存储文件使用原子写入，确保数据安全
5. scopes必须包含 `operator.write` 才能发送消息
