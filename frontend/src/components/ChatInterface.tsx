import { Box, Paper } from "@mui/material";
import { ChatHeader } from "./ChatHeader.tsx";
import { MessageList } from "./MessageList.tsx";
import { MessageInput } from "./MessageInput.tsx";
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
        <ChatHeader />
        <MessageList state={state} pendingMessages={pendingMessages} />
      </Paper>
      <MessageInput onSend={sendMessage} />
    </Box>
  );
};
