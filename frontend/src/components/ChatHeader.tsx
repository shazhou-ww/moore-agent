import { Box, Typography } from "@mui/material";

type ChatHeaderProps = {
  title?: string;
};

export const ChatHeader = ({ title = "Moore Agent" }: ChatHeaderProps) => {
  return (
    <Box
      sx={{
        p: 2,
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "primary.main",
        color: "primary.contrastText",
      }}
    >
      <Typography variant="h6">{title}</Typography>
    </Box>
  );
};

