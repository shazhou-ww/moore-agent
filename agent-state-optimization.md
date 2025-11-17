# AgentState 优化方案

## 问题分析

### 当前问题

当前 `AgentState` 将所有消息（UserMessage、ToolMessage、AssistantMessage）平铺存储在 `messages` 数组中。当调用 LLM 时，会将 `lastSentToLLMAt` 之后的所有消息都作为 `messageWindow` 发送给 LLM。

**存在的问题：**
1. 随着对话轮次增加，`messages` 数组会不断增长
2. 每次调用 LLM 时，都会带上所有历史消息，导致 context 消耗越来越大
3. 最终会超出 LLM 的 context 限制，导致无法继续对话
4. 历史轮次中的 Tool Call 结果可能已经不再需要，但仍然占用 context

### 核心观察

Agent 的沟通模式具有明显的阶段性特征：
- **思考阶段**：Agent 接收用户输入后，会多次调用 Tools 收集信息
- **回复阶段**：整合信息后向用户输出最终回复

在多轮交互中：
- 当前轮次的完整交互信息（包括所有 Tool Calls）是必需的
- 过往轮次的详细 Tool Call 结果通常不再需要
- 过往轮次只需要保留用户输入和 Agent 的最终回复即可

## 优化方案

### 方案概述

将消息按**响应用户输入的轮次**进行组织，每一轮作为一个独立的 **Agent Run Loop**。在构建发送给 LLM 的消息窗口时：
- **当前 Run Loop**：包含完整的 Agent & Tool 交互信息
- **过往 Run Loop**：只包含 user message 和 assistant 的最终回复
- **Tool Messages**：单独管理，可以复用，但不与 user/assistant message 混在一起
- **历史 Tool Call 请求**：额外存储所有 Agent tool call 的 request 信息，提供 tool 让 LLM 按需回忆

### 数据结构设计

#### 1. Run Loop 定义

```typescript
type RunLoop = {
  id: string;                    // Run Loop 唯一标识
  startTimestamp: number;         // 开始时间（user message 的 timestamp）
  endTimestamp: number | null;    // 结束时间（assistant 最终回复的 timestamp，null 表示未完成）
  userMessage: UserMessage;       // 用户输入
  assistantMessage: AssistantMessage | null;  // Agent 最终回复（可能为 null，表示还在处理中）
  toolCallRequests: ToolCallRequest[];  // 该轮次中的所有 tool call 请求
};

type ToolCallRequest = {
  id: string;                     // tool call id
  name: string;                   // tool name
  input: string;                  // tool input (JSON string)
  timestamp: number;               // 请求时间
  runLoopId: string;              // 所属 Run Loop
};
```

#### 2. 优化后的 AgentState

```typescript
type AgentState = {
  systemMessage: SystemMessage;
  
  // 按 Run Loop 组织的消息历史
  runLoops: RunLoop[];
  
  // 当前正在进行的 Run Loop（如果存在）
  currentRunLoop: RunLoop | null;
  
  // 所有 Tool Messages（按 callId 索引，可复用）
  toolMessages: Map<string, ToolMessage>;  // key: callId, value: ToolMessage
  
  // 部分消息（用于 streaming）
  partialMessage: PartialMessage | null;
  
  // 最后一次向 LLM 发送的时间戳
  lastSentToLLMAt: number;
  
  // 配置项
  config: {
    // 保留的过往 Run Loop 数量（超过此数量的会被压缩）
    maxRunLoops: number;
    
    // 过往 Run Loop 中 user/assistant message 的最大长度（字符数）
    maxMessageLength: number;
    
    // 保留的过往 Run Loop 时间范围（毫秒），超过此时间的会被压缩
    maxTimeRange: number;
  };
};
```

#### 3. 消息窗口构建逻辑

```typescript
/**
 * 构建发送给 LLM 的消息窗口
 */
function buildMessageWindow(
  state: AgentState,
  includeCurrentRunLoop: boolean = true
): MessageWindow {
  const window: MessageWindow = [];
  
  // 1. 添加过往 Run Loop 的摘要
  const pastRunLoops = state.runLoops.filter(
    loop => loop.endTimestamp !== null && 
    (!includeCurrentRunLoop || loop.id !== state.currentRunLoop?.id)
  );
  
  for (const loop of pastRunLoops) {
    // 只添加 user message 和 assistant 的最终回复
    // 对内容进行截取（如果超过 maxMessageLength）
    const userMsg = truncateMessage(loop.userMessage, state.config.maxMessageLength);
    const assistantMsg = loop.assistantMessage 
      ? truncateMessage(loop.assistantMessage, state.config.maxMessageLength)
      : null;
    
    window.push(userMsg);
    if (assistantMsg) {
      window.push(assistantMsg);
    }
  }
  
  // 2. 添加当前 Run Loop 的完整信息
  if (includeCurrentRunLoop && state.currentRunLoop) {
    const currentLoop = state.currentRunLoop;
    
    // 添加 user message
    window.push(currentLoop.userMessage);
    
    // 添加该轮次的所有 tool calls 和对应的 tool messages
    // 按时间顺序排列
    const toolInteractions = currentLoop.toolCallRequests
      .map(req => {
        const toolMsg = state.toolMessages.get(req.id);
        return { request: req, response: toolMsg };
      })
      .filter(item => item.response !== undefined)
      .sort((a, b) => a.request.timestamp - b.request.timestamp);
    
    for (const { request, response } of toolInteractions) {
      // 添加 assistant message（包含 tool call）
      // 注意：这里需要根据实际的 assistant message 结构来处理
      // 如果 assistant message 已经包含了 tool calls，可能需要重构
      
      // 添加 tool message
      if (response) {
        window.push(response);
      }
    }
    
    // 如果当前 Run Loop 已完成，添加 assistant 的最终回复
    if (currentLoop.assistantMessage) {
      window.push(currentLoop.assistantMessage);
    }
  }
  
  return window;
}
```

#### 4. Run Loop 识别逻辑

```typescript
/**
 * 识别新的 Run Loop 开始
 * 规则：当接收到新的 user message 时，如果当前 Run Loop 已完成，则开始新的 Run Loop
 */
function shouldStartNewRunLoop(
  state: AgentState,
  newUserMessage: UserMessage
): boolean {
  // 如果没有当前 Run Loop，开始新的
  if (!state.currentRunLoop) {
    return true;
  }
  
  // 如果当前 Run Loop 已完成（有 assistant message），开始新的
  if (state.currentRunLoop.assistantMessage !== null) {
    return true;
  }
  
  return false;
}

/**
 * 处理新的 user message
 */
function handleUserMessage(
  state: AgentState,
  userMessage: UserMessage
): AgentState {
  // 如果需要开始新的 Run Loop
  if (shouldStartNewRunLoop(state, userMessage)) {
    // 将当前 Run Loop 移到历史中（如果存在）
    const newRunLoops = state.currentRunLoop
      ? [...state.runLoops, state.currentRunLoop]
      : state.runLoops;
    
    // 压缩过旧的 Run Loop
    const compressedRunLoops = compressOldRunLoops(
      newRunLoops,
      state.config
    );
    
    // 创建新的 Run Loop
    const newRunLoop: RunLoop = {
      id: createId(),
      startTimestamp: userMessage.timestamp,
      endTimestamp: null,
      userMessage,
      assistantMessage: null,
      toolCallRequests: [],
    };
    
    return {
      ...state,
      runLoops: compressedRunLoops,
      currentRunLoop: newRunLoop,
    };
  }
  
  // 否则，更新当前 Run Loop 的 user message（理论上不应该发生）
  // 或者抛出错误
  throw new Error("Cannot add user message to incomplete run loop");
}
```

#### 5. Tool Call 处理逻辑

```typescript
/**
 * 处理 assistant message（可能包含 tool calls）
 */
function handleAssistantMessage(
  state: AgentState,
  assistantMessage: AssistantMessage
): AgentState {
  if (!state.currentRunLoop) {
    throw new Error("No current run loop to add assistant message");
  }
  
  const currentLoop = state.currentRunLoop;
  
  // 如果 assistant message 包含 tool calls，记录这些请求
  const toolCallRequests: ToolCallRequest[] = 
    assistantMessage.toolCalls?.map(tc => ({
      id: tc.id,
      name: tc.name,
      input: tc.input,
      timestamp: assistantMessage.timestamp,
      runLoopId: currentLoop.id,
    })) ?? [];
  
  // 如果 assistant message 不包含 tool calls，说明这是最终回复
  const isFinalReply = !assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0;
  
  const updatedRunLoop: RunLoop = {
    ...currentLoop,
    toolCallRequests: [...currentLoop.toolCallRequests, ...toolCallRequests],
    assistantMessage: isFinalReply ? assistantMessage : currentLoop.assistantMessage,
    endTimestamp: isFinalReply ? assistantMessage.timestamp : currentLoop.endTimestamp,
  };
  
  return {
    ...state,
    currentRunLoop: updatedRunLoop,
  };
}

/**
 * 处理 tool message
 */
function handleToolMessage(
  state: AgentState,
  toolMessage: ToolMessage
): AgentState {
  // 将 tool message 存储到 toolMessages Map 中
  const newToolMessages = new Map(state.toolMessages);
  newToolMessages.set(toolMessage.callId, toolMessage);
  
  return {
    ...state,
    toolMessages: newToolMessages,
  };
}
```

#### 6. 历史 Tool Call 回忆机制

```typescript
/**
 * 提供 tool 让 LLM 回忆历史 tool call 结果
 */
type RecallToolCallEffect = {
  key: `recall-tool-${string}`;
  kind: "recall-tool-call";
  callId: string;
};

/**
 * 实现 recall_tool_call tool
 * 这个 tool 可以在 LLM 的 system prompt 中提供
 */
const recallToolCallTool = {
  name: "recall_tool_call",
  description: "回忆历史 tool call 的结果。当需要查看之前某次 tool call 的详细结果时使用。",
  parameters: {
    type: "object",
    properties: {
      callId: {
        type: "string",
        description: "要回忆的 tool call ID",
      },
    },
    required: ["callId"],
  },
};

/**
 * 执行 recall tool call
 */
async function executeRecallToolCall(
  state: AgentState,
  callId: string
): Promise<string> {
  // 从 toolMessages 中查找
  const toolMessage = state.toolMessages.get(callId);
  if (toolMessage) {
    return toolMessage.content;
  }
  
  // 如果找不到，返回错误信息
  return JSON.stringify({
    error: "Tool call result not found",
    callId,
  });
}
```

#### 7. Run Loop 压缩策略

```typescript
/**
 * 压缩过旧的 Run Loop
 */
function compressOldRunLoops(
  runLoops: RunLoop[],
  config: AgentState["config"]
): RunLoop[] {
  const now = Date.now();
  
  return runLoops
    .map(loop => {
      // 检查是否需要压缩
      const isTooOld = loop.startTimestamp < (now - config.maxTimeRange);
      const isBeyondLimit = runLoops.length > config.maxRunLoops;
      
      if (isTooOld || isBeyondLimit) {
        // 压缩：只保留 user message 和 assistant message 的摘要
        return {
          ...loop,
          userMessage: truncateMessage(loop.userMessage, config.maxMessageLength),
          assistantMessage: loop.assistantMessage
            ? truncateMessage(loop.assistantMessage, config.maxMessageLength)
            : null,
          toolCallRequests: [], // 清空 tool call requests，LLM 可以通过 recall tool 获取
        };
      }
      
      return loop;
    })
    .slice(-config.maxRunLoops); // 只保留最近的 N 个
}

/**
 * 截取消息内容
 */
function truncateMessage<T extends UserMessage | AssistantMessage>(
  message: T,
  maxLength: number
): T {
  if (message.content.length <= maxLength) {
    return message;
  }
  
  return {
    ...message,
    content: message.content.slice(0, maxLength) + "...[truncated]",
  };
}
```

### 迁移策略

#### 阶段 1：兼容模式

保持现有的 `messages` 数组，同时维护新的 `runLoops` 结构。在 `transition` 函数中同时更新两者。

```typescript
// 过渡期的 AgentState
type AgentStateV1 = {
  // 旧结构（保持兼容）
  messages: (UserMessage | ToolMessage | AssistantMessage)[];
  
  // 新结构
  runLoops: RunLoop[];
  currentRunLoop: RunLoop | null;
  toolMessages: Map<string, ToolMessage>;
  
  // 其他字段...
};
```

#### 阶段 2：完全迁移

移除 `messages` 数组，完全使用 `runLoops` 结构。

### 配置建议

```typescript
const DEFAULT_CONFIG: AgentState["config"] = {
  maxRunLoops: 10,              // 保留最近 10 个 Run Loop
  maxMessageLength: 500,         // 过往消息最多 500 字符
  maxTimeRange: 7 * 24 * 60 * 60 * 1000,  // 保留最近 7 天的 Run Loop
};
```

### 优势

1. **Context 使用效率提升**：
   - 当前 Run Loop 带完整信息，保证 Agent 有足够上下文
   - 过往 Run Loop 只带摘要，大幅减少 context 消耗
   - Tool Messages 按需加载，不占用不必要的 context

2. **可扩展性**：
   - 通过 `recall_tool_call` tool，Agent 可以按需回忆历史信息
   - 支持灵活的压缩策略（按数量、时间、长度）

3. **向后兼容**：
   - 可以通过迁移策略逐步过渡
   - 不影响现有的持久化机制

4. **清晰的语义**：
   - Run Loop 概念清晰，符合 Agent 的工作模式
   - 代码可读性和可维护性提升

### 潜在问题与解决方案

#### 问题 1：Tool Messages 的存储

**问题**：如果所有 Tool Messages 都存储在 Map 中，长期运行可能导致内存占用过大。

**解决方案**：
- 对于过旧的 Tool Messages（超过一定时间或数量），可以持久化到数据库
- 提供 `recall_tool_call` tool 时，先从内存查找，找不到再从数据库加载

#### 问题 2：Run Loop 的边界识别

**问题**：如何准确识别一个 Run Loop 的开始和结束？

**解决方案**：
- 开始：新的 user message 到达
- 结束：assistant message 不包含 tool calls（即最终回复）
- 特殊情况：如果 assistant message 包含 tool calls，但后续没有新的 user message，可以设置超时机制

#### 问题 3：跨 Run Loop 的上下文依赖

**问题**：某些情况下，Agent 可能需要参考多个 Run Loop 的信息。

**解决方案**：
- 通过 `recall_tool_call` tool 可以获取历史信息
- 在 system prompt 中提示 Agent 可以使用该 tool
- 可以考虑提供 `search_history` tool，让 Agent 搜索历史对话

### 实施计划

1. **Phase 1：数据结构设计**（1-2 天）
   - 定义新的类型结构
   - 编写类型定义和 Schema

2. **Phase 2：核心逻辑实现**（3-5 天）
   - 实现 Run Loop 识别逻辑
   - 实现消息窗口构建逻辑
   - 实现压缩策略

3. **Phase 3：Tool 回忆机制**（2-3 天）
   - 实现 `recall_tool_call` tool
   - 集成到 system prompt

4. **Phase 4：迁移与测试**（3-5 天）
   - 实现兼容模式
   - 编写迁移脚本
   - 全面测试

5. **Phase 5：优化与调优**（2-3 天）
   - 性能优化
   - 配置调优
   - 文档完善

### 总结

本优化方案通过引入 Run Loop 概念，将消息按轮次组织，显著减少了发送给 LLM 的 context 大小，同时保持了必要的上下文信息。通过 Tool 回忆机制，Agent 可以按需获取历史信息，实现了灵活性和效率的平衡。

