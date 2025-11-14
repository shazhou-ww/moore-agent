import { useState, useEffect, useRef, useCallback } from "react";
import type { AgentState, AgentEvent } from "../types.ts";
import type { FrozenJson } from "@hstore/core";
import { transition as baseTransition } from "@/agent/transition.ts";

type UseAgentReturn = {
  state: FrozenJson<AgentState> | null;
  isLoading: boolean;
  sendMessage: (message: string) => Promise<void>;
  pendingMessages: string[];
};

export const useAgent = (): UseAgentReturn => {
  const [state, setState] = useState<FrozenJson<AgentState> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingMessages, setPendingMessages] = useState<string[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource("/api/receive");
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("SSE connection opened");
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

          // 如果收到 assistant 消息，移除对应的 pending message
          if (agentEvent.signal.kind === "assistant") {
            setPendingMessages((prev) => prev.slice(1));
          }
        }
      } catch (error) {
        console.error("Error parsing SSE event:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE error:", error);
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

  const sendMessage = useCallback(async (message: string) => {
    // 添加到 pending messages
    setPendingMessages((prev) => [...prev, message]);

    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // 从 pending messages 中移除
      setPendingMessages((prev) => prev.slice(0, -1));
    }
  }, []);

  return {
    state,
    isLoading,
    sendMessage,
    pendingMessages,
  };
};

