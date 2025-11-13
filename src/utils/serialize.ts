import type { AgentSnapshot } from "../types/schema.ts";

export const serializeSnapshot = (snapshot: AgentSnapshot): string =>
  JSON.stringify(snapshot);

export const deserializeSnapshot = (raw: string): AgentSnapshot =>
  JSON.parse(raw) as AgentSnapshot;

