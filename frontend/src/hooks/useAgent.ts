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
  const [state, setState] = useState<FrozenJson<AgentState> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingMessages, setPendingMessages] = useState<UserMessage[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const isConnectingRef = useRef<boolean>(false);

  const connectSSE = useCallback(() => {
    // 防止重复连接
    if (isConnectingRef.current || eventSourceRef.current?.readyState === EventSource.OPEN) {
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    isConnectingRef.current = true;
    const eventSource = new EventSource("/api/receive");
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("SSE connection opened");
      isConnectingRef.current = false;
    };

    eventSource.onmessage = (event) => {
      // 忽略心跳消息
      if (event.data.trim() === ": heartbeat") {
        return;
      }

      try {
        const agentEvent: AgentEvent = JSON.parse(event.data);

        if (agentEvent.type === "state-updated") {
          // 初始化时接收完整状态
          setState(agentEvent.state);
          setIsLoading(false);
        } else if (agentEvent.type === "signal-received") {
          // 根据 signal 更新前端状态
          setState((currentState) => {
            if (!currentState) return currentState;
            try {
              const newState = baseTransition(agentEvent.signal)(currentState);
              return newState;
            } catch (error) {
              // 前端忽略无效的 timestamp，返回原状态
              console.warn("Invalid timestamp, ignoring signal:", error);
              return currentState;
            }
          });

          // 如果收到 user message 的 signal，说明该消息已被确认，从 pendingMessages 中移除
          if (agentEvent.signal.kind === "user") {
            setPendingMessages((prev) =>
              prev.filter((msg) => msg.id !== agentEvent.signal.id)
            );
          }
        }
      } catch (error) {
        console.error("Error parsing SSE event:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE error:", error);
      isConnectingRef.current = false;
      eventSource.close();

      // 尝试重连
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connectSSE();
      }, 3000);
    };
  }, []);

  useEffect(() => {
    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connectSSE]);

  const sendMessage = useCallback(async (content: string) => {
    // 生成 UUID 和 timestamp
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
        body: JSON.stringify({ userMessage }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          console.error("Message ID conflict");
        } else {
          console.error("Failed to send message");
        }
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

