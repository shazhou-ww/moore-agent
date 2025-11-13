import { nanoid } from "nanoid";

export const createId = (): string => nanoid();

export const makeLLMEffectKey = (messageId: string): `llm-${string}` =>
  `llm-${messageId}`;

export const makeToolEffectKey = (
  messageId: string,
  callId: string,
): `tool-${string}-${string}` => `tool-${messageId}-${callId}`;

