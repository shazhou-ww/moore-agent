import { Box } from "@mui/material";
import ReactMarkdown from "react-markdown";

type MarkdownContentProps = {
  content: string;
};

export const MarkdownContent = ({ content }: MarkdownContentProps) => {
  return (
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
      <ReactMarkdown>{content}</ReactMarkdown>
    </Box>
  );
};

