export type RoomMeta = {
  /** identity of the participant who created the room; only they can pick the host */
  creator: string;
  /** identity of the current host (exactly one) */
  host: string;
};

export type ProviderId = "gemini" | "openrouter" | "openai" | "anthropic";

export type KeyConfig = {
  id: string;
  provider: ProviderId | "auto";
  apiKey: string;
  model?: string;
  enabled?: boolean;
};

/** How hard the model may think. Fewer thinking tokens = more answers per free-tier minute/day. */
export type Effort = "fast" | "balanced" | "deep";

export const MAX_SHOTS = 6;

export type AskRequest = {
  /** data URLs, in capture order; read together as one context */
  images: string[];
  instruction?: string;
  keys: KeyConfig[];
  effort?: Effort;
};

export type AskResponse =
  | { ok: true; answer: string; provider: ProviderId; model: string; ms: number; tokens?: number }
  | { ok: false; error: string; attempts?: { provider: string; model: string; error: string }[] };
