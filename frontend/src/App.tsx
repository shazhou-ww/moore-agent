import { Container, Box, Typography, CircularProgress } from "@mui/material";
import { useAgent } from "./hooks/useAgent.ts";
import { ChatInterface } from "./components/ChatInterface.tsx";

const App = () => {
  const { state, isLoading } = useAgent();

  if (isLoading || !state) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <Box sx={{ textAlign: "center" }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>
            {isLoading ? "Loading agent..." : "Failed to load agent state"}
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Container maxWidth="md" sx={{ height: "100vh", py: 2 }}>
      <ChatInterface state={state} />
    </Container>
  );
};

export default App;

