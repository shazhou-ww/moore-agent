import { useState, useEffect, useRef, useCallback } from "react";
import type { AgentState, AgentEvent, UserMessage } from "../types.ts";
import type { FrozenJson } from "@hstore/core";
import { transition as baseTransition } from "@/agent/transition.ts";

type UseAgentReturn = {
  state: FrozenJson<AgentState> | null;
  isLoading: boolean;
  sendMessage: (message: string) => Promise<void>;
  pendingMessages: ReadonlyArray<UserMessage>;
};

export const useAgent = (): UseAgentReturn => {
  console.log("useAgent hook called");
  const [state, setState] = useState<FrozenJson<AgentState> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingMessages, setPendingMessages] = useState<UserMessage[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const isConnectingRef = useRef<boolean>(false);

  const connectSSE = useCallback(() => {
    console.log("connectSSE called");
    console.log("isConnectingRef.current:", isConnectingRef.current);
    console.log("eventSourceRef.current?.readyState:", eventSourceRef.current?.readyState);
    
    // 防止重复连接
    if (isConnectingRef.current || eventSourceRef.current?.readyState === EventSource.OPEN) {
      console.log("Skipping connection - already connecting or connected");
      return;
    }

    if (eventSourceRef.current) {
      console.log("Closing existing EventSource");
      eventSourceRef.current.close();
    }

    console.log("Creating new EventSource connection to /api/receive");
    isConnectingRef.current = true;
    const eventSource = new EventSource("/api/receive");
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("SSE connection opened");
      isConnectingRef.current = false;
    };

    eventSource.onmessage = (event) => {
      console.log("SSE message received:", event.data.substring(0, 100));
      
      // 忽略心跳消息
      if (event.data.trim() === ": heartbeat") {
        return;
      }

      try {
        const agentEvent: AgentEvent = JSON.parse(event.data);
        console.log("Parsed agent event:", agentEvent.type);

        if (agentEvent.type === "state-updated") {
          // 初始化时接收完整状态
          console.log("Received state-updated event, setting state");
          setState(agentEvent.state);
          setIsLoading(false);
        } else if (agentEvent.type === "signal-received") {
          // 根据 signal 更新前端状态
          setState((currentState) => {
            if (!currentState) return currentState;
            try {
              // 处理 chunk 和 complete 信号
              const signal = agentEvent.signal;
              
              if (signal.kind === "assistant-chunk") {
                // 更新 partialMessage
                if (currentState.partialMessage && currentState.partialMessage.messageId === signal.messageId) {
                  // 追加 chunk
                  return {
                    ...currentState,
                    partialMessage: {
                      messageId: currentState.partialMessage.messageId,
                      chunks: [...currentState.partialMessage.chunks, signal.chunk],
                    },
                  };
                } else {
                  // 创建新的 partialMessage
                  return {
                    ...currentState,
                    partialMessage: {
                      messageId: signal.messageId,
                      chunks: [signal.chunk],
                    },
                  };
                }
              }
              
              if (signal.kind === "assistant-complete") {
                // 从 partialMessage 拼装完整的 assistant message
                if (currentState.partialMessage && currentState.partialMessage.messageId === signal.messageId) {
                  const content = currentState.partialMessage.chunks.join("");
                  const assistantMessage = {
                    id: signal.messageId,
                    kind: "assistant" as const,
                    content,
                    toolCalls: signal.toolCalls,
                    timestamp: signal.timestamp,
                  };
                  
                  // 插入消息并保持排序
                  const newMessages = [...currentState.messages, assistantMessage].sort(
                    (a, b) => a.timestamp - b.timestamp,
                  );
                  
                  return {
                    ...currentState,
                    messages: newMessages,
                    partialMessage: null,
                    lastSentToLLMAt: signal.timestamp,
                  };
                }
              }
              
              // 其他信号（user, tool）使用 transition
              if (signal.kind === "user" || signal.kind === "tool") {
                const newState = baseTransition(signal)(currentState);
                return newState;
              }
              
              // 未知信号类型，返回原状态
              return currentState;
            } catch (error) {
              // 前端忽略无效的 timestamp，返回原状态
              console.warn("Invalid timestamp, ignoring signal:", error);
              return currentState;
            }
          });

          // 如果收到 user message 的 signal，说明该消息已被确认，从 pendingMessages 中移除
          if (agentEvent.signal.kind === "user") {
            setPendingMessages((prev) =>
              prev.filter((msg) => msg.id === (agentEvent.signal as UserMessage).id)
            );
          }
        }
      } catch (error) {
        console.error("Error parsing SSE event:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE error:", error);
      console.error("EventSource readyState:", eventSource.readyState);
      isConnectingRef.current = false;
      
      // 如果连接关闭或出错，尝试重连
      if (eventSource.readyState === EventSource.CLOSED) {
        eventSource.close();
        // 尝试重连
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connectSSE();
        }, 3000);
      }
    };
  }, []);

  useEffect(() => {
    console.log("useEffect: Setting up SSE connection");
    
    // 使用 connectSSE 函数
    connectSSE();

    return () => {
      console.log("useEffect cleanup: Closing SSE connection");
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      isConnectingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // connectSSE 是稳定的函数引用，不需要作为依赖

  const sendMessage = useCallback(async (content: string) => {
    // agent-v2 的 sendMessage 只接受 content: string
    // 生成临时的 userMessage 用于前端显示
    const userMessage: UserMessage = {
      id: crypto.randomUUID(),
      kind: "user",
      content,
      timestamp: Date.now(),
    };

    // 添加到 pending messages
    setPendingMessages((prev) => [...prev, userMessage]);

    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        console.error("Failed to send message");
        // 从 pending messages 中移除
        setPendingMessages((prev) =>
          prev.filter((msg) => msg.id !== userMessage.id)
        );
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // 从 pending messages 中移除
      setPendingMessages((prev) =>
        prev.filter((msg) => msg.id !== userMessage.id)
      );
    }
  }, []);

  return {
    state,
    isLoading,
    sendMessage,
    pendingMessages,
  };
};

