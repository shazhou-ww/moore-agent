export const createId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // Adapted RFC4122 variant 4 formatting.
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  hex[6] = ((parseInt(hex[6]!, 16) & 0x0f) | 0x40).toString(16);
  hex[8] = ((parseInt(hex[8]!, 16) & 0x3f) | 0x80).toString(16);

  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
};

export const makeLLMEffectKey = (messageId: string): `llm-${string}` =>
  `llm-${messageId}`;

export const makeToolEffectKey = (
  messageId: string,
  callId: string,
): `tool-${string}-${string}` => `tool-${messageId}-${callId}`;

