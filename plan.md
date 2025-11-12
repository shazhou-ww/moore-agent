# 项目计划概览

- **目标**：基于 Moorex 构建持久化 AI 代理，将状态驱动的效果执行与 HStore LevelDB 适配器结合，实现崩溃后可恢复的对话流程。
- **核心思路**：以 Moore 状态机抽象 agent 行为；所有副作用由当前状态推导；状态变化即触发效果对齐；通过 HStore 持续写入状态快照。

## 类型设计

- **Signal（信号）**
  - 种类：`user` 用户输入、`tool` 工具返回、`assistant`（LLM 输出）。
  - 作用：驱动状态转换，明确对话流向与工具反馈；所有异步结果均归入工具或助手信号，不额外引入 `effect-finished`。
- **Signal 类型定义**

```ts
type BaseMessage = {
  id: string;
  content: string;
  timestamp: number;
};

type SystemMessage = BaseMessage & { kind: 'system' };

type UserMessage = BaseMessage & { kind: 'user' };

type ToolMessage = BaseMessage & {
  kind: 'tool';
  callId: string;
};

type AssistantToolCall = {
  id: string;
  name: string;
  input: string;
};

type AssistantMessage = BaseMessage & {
  kind: 'assistant';
  toolCalls?: AssistantToolCall[];
};

type Signal = UserMessage | ToolMessage | AssistantMessage;
```

- 说明：
  - 所有消息共享 `id`、`content`、`timestamp`；系统消息在代理创建时写入，其余 signal 在 dispatch 前即时生成 UUID。
  - 助手消息可携带多个工具调用请求；工具消息携带响应的 `callId`，其 `content` 存储 JSON 字符串结果。
- **AgentState（状态）**
  - 字段：按时间排序的消息列表 `messages`、最后一次向 LLM 发送的时间戳 `lastSentToLLMAt`。
  - 作用：统一维护所有消息；创建时以 system prompt 作为首条消息，但尚未发送给 LLM，`lastSentToLLMAt` 初始设为创建时刻之前的时间（例如 `createdAt - 1`）。
  - 类型定义：

```ts
type AgentState = {
  systemMessage: SystemMessage;
  messages: Array<UserMessage | ToolMessage | AssistantMessage>;
  lastSentToLLMAt: number;
};
```

- **Effect（副作用）**
  - 种类：`call-llm` 调用 LLM、`call-tool` 触发工具。
  - 特点：全部携带唯一 `key`，与 Moorex 的效果去重与取消语义对齐；`call-llm` 使用 `llm-{最后一条待发送消息 id}`，`call-tool` 使用 `tool-{助手消息 id}-{toolCall id}`。
  - 类型定义：

```ts
type Effect =
  | {
      key: `llm-${string}`;
      kind: 'call-llm';
      prompt: string;
      messageWindow: Signal[];
    }
  | {
      key: `tool-${string}-${string}`;
      kind: 'call-tool';
      messageId: string;
      call: {
        id: string;
        name: string;
        input: Record<string, unknown>;
      };
    };
```

## Moorex 定义与流程

1. **initialState**：以创建代理时传入的 system prompt 初始化消息列表，赋值 `timestamp = createdAt`；`lastSentToLLMAt` 设为 `createdAt - 1`，确保系统消息仍被视为未发送。
2. **transition(signal)(state)**：
   - 将消息插入 `messages` 并保持按 `timestamp` 排序。
   - 对助手消息：记录其中的 tool call，并标记为“待 fulfill”。
   - 对工具消息：根据 `callId` 找到触发它的助手消息工具调用并标记完成。
   - 根据 `lastSentToLLMAt` 确定哪些消息仍未发送给 LLM；新消息的 `timestamp` 必须严格大于当前指针。
   - 计算新的状态哈希以决定是否需要持久化。

3. **effectsAt(state)**：
   1. 先检查待执行的工具调用：找到 `lastSentToLLMAt` 之后最新的一条 `AssistantMessage`，从其中尚未被 `ToolMessage` fulfill 的 `toolCalls` 中挑选最早的一条，若存在则生成单个 `call-tool` 效果，`key` 为 `tool-{助手消息 id}-{toolCall id}`，并直接返回（不再计算 LLM 效果）。
   2. 若无待执行工具调用，再检查 `timestamp > lastSentToLLMAt` 的 `UserMessage` 或 `ToolMessage`：若存在则生成 `call-llm` 效果，`key` 为 `llm-{待发送集合最后一条消息的 id}`。
   3. 若以上两项均不存在，则返回空数组，表示当前 idle。

4. **runEffect(effect)**：分别封装调用 LLM、执行工具的启动与取消逻辑；完成后通过新的 `assistant` 或 `tool` 消息 signal 反馈入状态，并在发送成功时更新 `lastSentToLLMAt`。

## 持久化方案

- **HStore 配置**：使用 `@hstore/core` + LevelDB 适配器，选用更高效的 `murmurhash` 哈希函数，将 `AgentState` 序列化存储。
- **状态写入**：订阅 Moorex 的 `state-updated` 事件，将最新 `AgentState` 推入串行持久化队列，由单一 worker 依次调用 HStore，确保写入顺序与状态演进一致。
- **重启恢复**：启动时直接从 HStore 读取最新状态快照，恢复为初始 `AgentState`。

## 依赖使用约定

- **moorex**：参考 npm Readme 使用 `createMoorex(definition)` 构建状态机；`definition` 中包含 `initialState`, `transition(signal)(state)`, `effectsAt(state)` 与 `runEffect(effect)` 等纯函数；`agent.dispatch(signal)` 返回异步 `Promise<void>` 并触发 `agent.on(event)` 订阅的生命周期事件。为保持函数长度不超过 50 行，`transition`、`effectsAt` 分拆至 `src/state/transition.ts`、`src/state/effects.ts`。
- **@hstore/core**：借助 `await createStore({ schema, adapter, hashFn })` 生成存储实例（`schema` 由 zod 描述 `AgentState` 结构，`hashFn` 推荐 `murmurhash` 实现）；使用 `await store.head()` 或 `await store.get(hash)` 恢复最新快照，`await store.commit(snapshot)` 追加序列化的 `AgentState`；操作流程与 npm Quick Start 一致。
- **@hstore/leveldb-adapter**：遵循 npm Readme 通过 `await createLevelAdapter({ location, createIfMissing, compression })` 构建 LevelDB 适配器；`location` 由 `src/config/defaults.ts` 提供，可选项透传给 `classic-level`；初始化后注入 `createStore({ adapter })`，并在进程关闭钩子或测试清理阶段调用 `await adapter.close()` / `await adapter.clear()`。

## 代码结构规划

- **类型定义层**
  - `src/types/messages.ts`：集中维护 `BaseMessage` 及三类 signal 的 `type` 定义，保留纯数据结构。
  - `src/types/state.ts`：定义 `AgentState`、派生选择器类型与 `Effect` 联合类型，供全局复用。
- **状态机层（Moorex）**
  - `src/state/definition.ts`：导出 `createAgentDefinition(deps)`，组合 `initialState`、`transition`、`effectsAt`。
  - `src/state/transition.ts`：实现消息插入、工具 fulfill、待发送窗口等纯函数，按 concern 拆分成 ≤50 行的辅助函数。
  - `src/state/effects.ts`：根据状态推导 `call-llm` / `call-tool` 列表，保持纯函数。
  - `src/state/machine.ts`：封装 `createMoorex(definition)` 并暴露 `createAgentMachine(deps)`，用于 agent 编排层。
- **副作用运行时**
  - `src/runtime/effects.ts`：根据 `Effect.kind` 调度 LLM 与工具执行，返回 `start/cancel` 函数，保持无状态。
  - `src/runtime/llm.ts`、`src/runtime/tools.ts`：适配具体调用策略，默认导出函数式工厂以便注入。
- **持久化层**
  - `src/persistence/adapter.ts`：利用 `createLevelAdapter` 创建共享适配器，读取配置后按需初始化/关闭。
  - `src/persistence/store.ts`：封装 `createStore`、`store.head`、`store.commit` 等操作，提供 `loadLatestState`、`appendState`。
  - `src/persistence/queue.ts`：实现串行写入队列，确保状态快照按事件顺序持久化。
- **Agent 编排层**
  - `src/agent/index.ts`：导出 `createAgent({ systemPrompt, tools, persistence })`，协调状态机、运行时和持久化；内部以函数式组合保持高可读性。
  - `src/agent/events.ts`：定义事件类型与订阅工具，包装 Moorex `agent.on` 输出，供上层消费。
- **工具库**
  - `src/utils/id.ts`：UUID / key 生成器。
  - `src/utils/time.ts`：时间戳辅助函数。
  - `src/utils/serialize.ts`：集中处理状态序列化/反序列化逻辑。
- **入口与示例**
  - `src/index.ts`：导出公共 API（类型、`createAgent`）。
  - `examples/basic-agent.ts`：演示初始化、dispatch、重启恢复流程。
  - 后续在 `tests/` 添加针对 `transition`、`effectsAt`、持久化的单元测试。
- **模块依赖关系**：`src/agent/index.ts` 负责整合 Moorex 状态机与 HStore 持久化，启动时先 `store.get`（若支持 `store.head` 亦可优先使用）恢复状态，再监听 `machine.dispatch` 输出的状态更新队列，依次 `store.set` 或 `store.append` 写入；副作用执行封装在 `src/runtime/effects.ts`，与状态机通过纯数据协议交互。

## 下一步任务

- 明确 Agent 框架的初始化协议：系统 prompt、工具列表等均作为创建参数传入，框架本身不预设具体实现。
- 细化工具调用匹配逻辑：通过 `ToolMessage.callId` 与相应 `AssistantMessage.toolCalls` 的 `id` 对应，确定 fulfill 状态。
- 接入 HStore：利用现有接口（如 `store.head()`）获取最新快照，确保重启时能够直接复原状态。
- 通过构建真实场景应用来验证框架行为，后续再考虑专门的单元测试需求。
