import { Box, List, ListItem } from "@mui/material";
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

  return (
    <Box
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

