import { useState } from "react";
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  List,
  ListItem,
  Avatar,
  Chip,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import PersonIcon from "@mui/icons-material/Person";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import BuildIcon from "@mui/icons-material/Build";
import ReactMarkdown from "react-markdown";
import type { AgentState, UserMessage } from "../types.ts";
import type { FrozenJson } from "@hstore/core";

type ChatInterfaceProps = {
  state: FrozenJson<AgentState>;
  pendingMessages: ReadonlyArray<UserMessage>;
  sendMessage: (message: string) => Promise<void>;
};

export const ChatInterface = ({
  state,
  pendingMessages,
  sendMessage,
}: ChatInterfaceProps) => {
  const [input, setInput] = useState("");
  
  // 使用传入的 state
  const currentState = state;

  const handleSend = async () => {
    if (!input.trim()) return;

    await sendMessage(input);
    setInput("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 合并消息，去重：如果 state.messages 中已有某条消息，就不显示 pendingMessages 中的
  const confirmedMessageIds = new Set(currentState.messages.map((msg) => msg.id));
  const unconfirmedMessages = pendingMessages.filter(
    (msg) => !confirmedMessageIds.has(msg.id)
  );

  // 将 partial message 转换为临时的 assistant message 用于显示
  const partialAssistantMessage = currentState.partialMessage ? {
    id: currentState.partialMessage.messageId,
    kind: "assistant" as const,
    content: currentState.partialMessage.chunks.join(""),
    toolCalls: [],
    timestamp: Date.now(), // 使用当前时间作为临时 timestamp
  } : null;

  const allMessages = [
    ...currentState.messages,
    ...(partialAssistantMessage ? [partialAssistantMessage] : []),
    ...unconfirmedMessages,
  ].sort((a, b) => a.timestamp - b.timestamp);

  // 创建未确认消息的 ID 集合，用于样式判断
  const unconfirmedMessageIds = new Set(unconfirmedMessages.map((msg) => msg.id));
  
  // 创建 partial message 的 ID 集合，用于样式判断（显示为流式输出）
  const partialMessageIds = currentState.partialMessage 
    ? new Set([currentState.partialMessage.messageId])
    : new Set<string>();

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Paper
        elevation={2}
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          mb: 2,
        }}
      >
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "primary.main",
            color: "primary.contrastText",
          }}
        >
          <Typography variant="h6">Moore Agent</Typography>
        </Box>

        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            p: 2,
          }}
        >
          <List>
            {allMessages.map((message) => (
              <ListItem
                key={message.id}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems:
                    message.kind === "user" ? "flex-end" : "flex-start",
                  mb: 2,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 0.5,
                    flexDirection:
                      message.kind === "user" ? "row-reverse" : "row",
                  }}
                >
                  <Avatar
                    sx={{
                      bgcolor:
                        message.kind === "user"
                          ? "primary.main"
                          : message.kind === "assistant"
                          ? "secondary.main"
                          : "info.main",
                      width: 32,
                      height: 32,
                    }}
                  >
                    {message.kind === "user" ? (
                      <PersonIcon fontSize="small" />
                    ) : message.kind === "assistant" ? (
                      <SmartToyIcon fontSize="small" />
                    ) : (
                      <BuildIcon fontSize="small" />
                    )}
                  </Avatar>
                  <Typography variant="caption" color="text.secondary">
                    {message.kind === "user"
                      ? "You"
                      : message.kind === "assistant"
                      ? "Assistant"
                      : "Tool"}
                  </Typography>
                </Box>
                <Paper
                  elevation={1}
                  sx={{
                    p: 1.5,
                    maxWidth: "70%",
                    bgcolor:
                      message.kind === "user"
                        ? "primary.light"
                        : message.kind === "assistant"
                        ? "grey.100"
                        : "info.light",
                    color:
                      message.kind === "user"
                        ? "primary.contrastText"
                        : "text.primary",
                    // 未确认消息的特殊样式：降低透明度，添加虚线边框
                    opacity: unconfirmedMessageIds.has(message.id) ? 0.6 : 1,
                    border: unconfirmedMessageIds.has(message.id)
                      ? "1px dashed"
                      : partialMessageIds.has(message.id)
                      ? "1px solid"
                      : "none",
                    borderColor: unconfirmedMessageIds.has(message.id)
                      ? "primary.main"
                      : partialMessageIds.has(message.id)
                      ? "secondary.main"
                      : "transparent",
                    // Partial message 添加闪烁动画效果
                    animation: partialMessageIds.has(message.id)
                      ? "pulse 1.5s ease-in-out infinite"
                      : "none",
                    "@keyframes pulse": {
                      "0%, 100%": {
                        opacity: 1,
                      },
                      "50%": {
                        opacity: 0.8,
                      },
                    },
                  }}
                >
                  <Box
                    sx={{
                      "& > *": {
                        margin: 0,
                        marginBottom: 1,
                      },
                      "& > *:last-child": {
                        marginBottom: 0,
                      },
                      "& p": {
                        margin: 0,
                        marginBottom: 1,
                      },
                      "& p:last-child": {
                        marginBottom: 0,
                      },
                      "& code": {
                        backgroundColor: "rgba(0, 0, 0, 0.1)",
                        padding: "2px 4px",
                        borderRadius: "3px",
                        fontFamily: "monospace",
                        fontSize: "0.9em",
                      },
                      "& pre": {
                        backgroundColor: "rgba(0, 0, 0, 0.05)",
                        padding: "8px",
                        borderRadius: "4px",
                        overflow: "auto",
                        marginBottom: 1,
                      },
                      "& pre code": {
                        backgroundColor: "transparent",
                        padding: 0,
                      },
                      "& ul, & ol": {
                        marginLeft: 2,
                        marginBottom: 1,
                      },
                      "& h1, & h2, & h3, & h4, & h5, & h6": {
                        marginTop: 1,
                        marginBottom: 0.5,
                      },
                      "& a": {
                        color: "primary.main",
                        textDecoration: "none",
                      },
                      "& a:hover": {
                        textDecoration: "underline",
                      },
                      "& blockquote": {
                        borderLeft: "3px solid",
                        borderColor: "primary.main",
                        paddingLeft: 1,
                        marginLeft: 0,
                        fontStyle: "italic",
                      },
                    }}
                  >
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </Box>
                  {message.kind === "assistant" &&
                    message.toolCalls &&
                    message.toolCalls.length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" sx={{ display: "block", mb: 0.5 }}>
                          Tool Calls:
                        </Typography>
                        {message.toolCalls.map((toolCall) => (
                          <Chip
                            key={toolCall.id}
                            label={`${toolCall.name}(${toolCall.input})`}
                            size="small"
                            sx={{ mr: 0.5, mb: 0.5 }}
                          />
                        ))}
                      </Box>
                    )}
                </Paper>
              </ListItem>
            ))}
          </List>
        </Box>
      </Paper>

      <Box sx={{ display: "flex", gap: 1 }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          placeholder="Type your message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          variant="outlined"
        />
        <Button
          variant="contained"
          onClick={handleSend}
          disabled={!input.trim()}
          sx={{ minWidth: 100 }}
          endIcon={<SendIcon />}
        >
          Send
        </Button>
      </Box>
    </Box>
  );
};

