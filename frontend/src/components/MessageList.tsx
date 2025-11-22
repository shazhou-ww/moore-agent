import { Box, List, ListItem } from "@mui/material";
import { useEffect, useRef } from "react";
import { MessageItem } from "./MessageItem.tsx";
import type { HistoryMessage, UserMessage, AgentState } from "../types.ts";
import type { FrozenJson } from "@hstore/core";

type DisplayMessage = {
  id: string;
  type: "user" | "assistant";
  content: string;
  timestamp: number;
  isPending?: boolean;
  isStreaming?: boolean;
};

type MessageListProps = {
  state: FrozenJson<AgentState>;
  pendingMessages: ReadonlyArray<UserMessage>;
};

export const MessageList = ({ state, pendingMessages }: MessageListProps) => {
  // 合并历史消息和流式消息
  const confirmedMessageIds = new Set(
    state.historyMessages.map((msg) => msg.id)
  );
  const unconfirmedMessages = pendingMessages.filter(
    (msg) => !confirmedMessageIds.has(msg.id)
  );

  // 将流式回复转换为显示消息
  const streamingMessages: DisplayMessage[] = Object.values(state.replies).map(
    (reply) => ({
      id: reply.messageId,
      type: "assistant" as const,
      content: reply.chunks.map((chunk) => chunk.content).join(""),
      timestamp: Date.now(), // 使用当前时间作为临时 timestamp
      isStreaming: true,
    })
  );

  // 转换历史消息
  const historyDisplayMessages: DisplayMessage[] = state.historyMessages.map(
    (msg) => ({
      id: msg.id,
      type: msg.type,
      content: msg.content,
      timestamp: msg.timestamp,
    })
  );

  // 转换待确认消息
  const pendingDisplayMessages: DisplayMessage[] = unconfirmedMessages.map(
    (msg) => ({
      id: msg.id,
      type: "user" as const,
      content: msg.content,
      timestamp: msg.timestamp,
      isPending: true,
    })
  );

  // 合并所有消息并按时间排序
  const allMessages: DisplayMessage[] = [
    ...historyDisplayMessages,
    ...streamingMessages,
    ...pendingDisplayMessages,
  ].sort((a, b) => a.timestamp - b.timestamp);

  // 滚动容器引用
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部 - 当消息更新时自动滚动
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      // 使用 requestAnimationFrame 确保在 DOM 更新后滚动
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
    // 依赖：消息 ID 列表和流式消息总长度（用于实时更新流式内容）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allMessages.map((m) => m.id).join(","),
    streamingMessages.reduce((sum, m) => sum + m.content.length, 0),
  ]);

  return (
    <Box
      ref={scrollContainerRef}
      sx={{
        flex: 1,
        overflowY: "auto",
        p: 2,
      }}
    >
      <List>
        {allMessages.map((message) => (
          <ListItem key={message.id} sx={{ display: "block", p: 0 }}>
            <MessageItem message={message} />
          </ListItem>
        ))}
      </List>
    </Box>
  );
};

