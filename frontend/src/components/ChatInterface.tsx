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
import type { AgentState } from "../types.ts";
import { useAgent } from "../hooks/useAgent.ts";

type ChatInterfaceProps = {
  state: AgentState;
};

export const ChatInterface = ({ state: initialState }: ChatInterfaceProps) => {
  const { sendMessage, pendingMessages, state } = useAgent();
  const [input, setInput] = useState("");
  
  // 使用最新的 state，如果还没有则使用初始状态
  const currentState = state || initialState;

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

  const allMessages = [
    ...currentState.messages,
    ...pendingMessages.map((content, index) => ({
      id: `pending-${index}`,
      kind: "user" as const,
      content,
      timestamp: Date.now() + index,
    })),
  ].sort((a, b) => a.timestamp - b.timestamp);

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

