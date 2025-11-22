import { useState, useEffect, useRef, useCallback } from "react";
import type { AgentState, HistoryMessage, UserMessage } from "../types.ts";
import type { FrozenJson } from "@hstore/core";

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
        const agentEvent: any = JSON.parse(event.data);
        console.log("Parsed agent event:", agentEvent.type);

        // agent-v2 的事件结构是 { type: string; state: Immutable<AgentState> }
        if (agentEvent.type === "state-updated") {
          console.log("Received state-updated event, setting state");
          setState(agentEvent.state);
          setIsLoading(false);
          
          // 检查是否有新的 user message 被确认（出现在 historyMessages 中）
          // 通过内容和时间戳匹配，因为前端的临时 ID 和后端的 messageId 不同
          if (agentEvent.state && agentEvent.state.historyMessages) {
            const confirmedUserMessages = agentEvent.state.historyMessages.filter(
              (msg: HistoryMessage) => msg.type === "user"
            );
            
            setPendingMessages((prev) => {
              return prev.filter((pendingMsg) => {
                // 检查是否有内容相同且时间戳接近（5秒内）的已确认消息
                const isConfirmed = confirmedUserMessages.some((confirmedMsg: HistoryMessage) => {
                  const contentMatch = confirmedMsg.content === pendingMsg.content;
                  const timeMatch = 
                    confirmedMsg.timestamp >= pendingMsg.timestamp &&
                    confirmedMsg.timestamp - pendingMsg.timestamp < 5000; // 5秒内
                  return contentMatch && timeMatch;
                });
                
                // 如果已确认，则从 pendingMessages 中移除
                return !isConfirmed;
              });
            });
          }
        } else if (agentEvent.type === "signal-received" && agentEvent.signal.kind !== "assistant-chunk-received") {
          console.log('signal-received event received:', agentEvent.signal.kind, agentEvent.signal);
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
    const sendTimestamp = Date.now();
    const userMessage: UserMessage = {
      id: crypto.randomUUID(), // 临时 ID，用于前端标识
      kind: "user",
      content,
      timestamp: sendTimestamp,
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
