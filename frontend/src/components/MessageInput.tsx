import { useState } from "react";
import { Box, TextField, Button } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";

type MessageInputProps = {
  onSend: (message: string) => Promise<void>;
};

export const MessageInput = ({ onSend }: MessageInputProps) => {
  const [input, setInput] = useState("");

  const handleSend = async () => {
    if (!input.trim()) return;
    await onSend(input);
    setInput("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
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
  );
};

