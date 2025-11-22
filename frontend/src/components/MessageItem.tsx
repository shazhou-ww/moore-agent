import { Box, Paper, Avatar, Typography } from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import { MarkdownContent } from "./MarkdownContent.tsx";
import type { HistoryMessage, UserMessage } from "../types.ts";

type DisplayMessage = {
  id: string;
  type: "user" | "assistant";
  content: string;
  timestamp: number;
  isPending?: boolean;
  isStreaming?: boolean;
};

type MessageItemProps = {
  message: DisplayMessage;
};

export const MessageItem = ({ message }: MessageItemProps) => {
  const isUser = message.type === "user";

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        mb: 2,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 0.5,
          flexDirection: isUser ? "row-reverse" : "row",
        }}
      >
        <Avatar
          sx={{
            bgcolor: isUser ? "primary.main" : "secondary.main",
            width: 32,
            height: 32,
          }}
        >
          {isUser ? (
            <PersonIcon fontSize="small" />
          ) : (
            <SmartToyIcon fontSize="small" />
          )}
        </Avatar>
        <Typography variant="caption" color="text.secondary">
          {isUser ? "You" : "Assistant"}
        </Typography>
      </Box>
      <Paper
        elevation={1}
        sx={{
          p: 1.5,
          maxWidth: "70%",
          bgcolor: isUser ? "primary.light" : "grey.100",
          color: isUser ? "primary.contrastText" : "text.primary",
          opacity: message.isPending ? 0.6 : 1,
          border: message.isPending
            ? "1px dashed"
            : message.isStreaming
            ? "1px solid"
            : "none",
          borderColor: message.isPending
            ? "primary.main"
            : message.isStreaming
            ? "secondary.main"
            : "transparent",
          animation: message.isStreaming
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
        <MarkdownContent content={message.content} />
      </Paper>
    </Box>
  );
};

