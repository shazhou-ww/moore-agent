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

  const allMessages = [
    ...currentState.messages,
    ...unconfirmedMessages,
  ].sort((a, b) => a.timestamp - b.timestamp);

  // 创建未确认消息的 ID 集合，用于样式判断
  const unconfirmedMessageIds = new Set(unconfirmedMessages.map((msg) => msg.id));

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
                      : "none",
                    borderColor: unconfirmedMessageIds.has(message.id)
                      ? "primary.main"
                      : "transparent",
                  }}
                >
                  <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                    {message.content}
                  </Typography>
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

