import type { Effort, KeyConfig, ProviderId } from "@/lib/types";
import { SYSTEM_PROMPT, userText } from "./prompt";

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: "gemini-flash-latest",
  openrouter: "google/gemini-2.5-flash",
  openai: "gpt-4.1-mini",
  anthropic: "claude-sonnet-5-5",
};

/** Used only if listing the key's models fails. */
const GEMINI_STATIC = ["gemini-flash-latest", "gemini-3.8-flash", "gemini-flash-lite-latest", "gemini-2.5-flash"];

const modelCache = new Map<string, { at: number; models: string[] }>();

function geminiVersion(name: string) {
  return parseFloat(/gemini-(\d+(?:\.\d+)?)/.exec(name)?.[1] ?? "0");
}

/**
 * Google retires model names for new keys, so instead of hardcoding one we ask
 * which models this key can call and pick the newest Flash, then Flash-Lite.
 * Free-tier quotas are per model, so the Lite model doubles as rate-limit headroom.
 */
async function geminiChain(key: string, signal: AbortSignal): Promise<string[]> {
  const cacheKey = key.slice(-12);
  const hit = modelCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.models;
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {
      headers: { "x-goog-api-key": key },
      signal,
    });
    if (!res.ok) return GEMINI_STATIC;
    const j = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    const names = (j.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((n) => /^gemini-\d+(\.\d+)?-flash(-lite)?(-preview(-[\w-]+)?|-\d{3})?$/.test(n));
    const rank = (a: string, b: string) =>
      geminiVersion(b) - geminiVersion(a) || Number(a.includes("preview")) - Number(b.includes("preview")) || a.length - b.length;
    const flash = names.filter((n) => !n.includes("-lite")).sort(rank);
    const lite = names.filter((n) => n.includes("-lite")).sort(rank);
    const models = [...flash.slice(0, 2), ...lite.slice(0, 1)];
    if (!models.length) return GEMINI_STATIC;
    modelCache.set(cacheKey, { at: Date.now(), models });
    return models;
  } catch {
    return GEMINI_STATIC;
  }
}

/** Guess the provider from the key's shape so users can just paste a key. */
export function detectProvider(apiKey: string): ProviderId {
  const k = apiKey.trim();
  if (k.startsWith("AIza")) return "gemini";
  if (k.startsWith("sk-or-")) return "openrouter";
  if (k.startsWith("sk-ant-")) return "anthropic";
  if (k.startsWith("sk-")) return "openai";
  return "gemini";
}

export class ProviderError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

type Image = { mime: string; b64: string };
type Result = { answer: string; tokens?: number };
export type Question = { instruction?: string; stitched?: number };

export function parseDataUrl(dataUrl: string): Image | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  return m ? { mime: m[1], b64: m[2] } : null;
}

async function readError(res: Response): Promise<never> {
  let msg = `${res.status} ${res.statusText}`;
  try {
    const j = await res.json();
    msg = j?.error?.message || j?.error?.type || j?.message || msg;
  } catch {}
  if (res.status === 429) msg = `Rate limit reached (${msg.split(/[.\n]/)[0]})`;
  throw new ProviderError(msg, res.status);
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) await readError(res);
  return res.json();
}

/** Output budget: answers are short; only an explicit note (e.g. "explain") needs room. */
function answerBudget(instruction?: string) {
  return instruction?.trim() ? 1536 : 384;
}

function geminiThinking(model: string, effort: Effort) {
  const m = model.toLowerCase();
  const v = geminiVersion(m);
  const pro = m.includes("pro");
  if (v >= 3 || m.includes("latest")) {
    if (effort === "deep") return { thinkingLevel: "high" };
    if (effort === "balanced") return { thinkingLevel: "low" };
    return { thinkingLevel: pro ? "low" : "minimal" };
  }
  if (m.includes("2.5")) {
    // 2.5 Pro can't turn thinking off
    const budget = effort === "fast" ? (pro ? 128 : 0) : effort === "balanced" ? 1024 : -1;
    return { thinkingBudget: budget };
  }
  return undefined;
}

async function callGemini(
  key: string,
  model: string,
  imgs: Image[],
  q: Question,
  effort: Effort,
  signal: AbortSignal,
): Promise<Result> {
  const thinking = geminiThinking(model, effort);
  try {
    return await geminiRequest(key, model, imgs, q, thinking, signal);
  } catch (e) {
    // Older/newer models may reject a thinking setting; retry once with the model's defaults.
    if (thinking && e instanceof ProviderError && e.status === 400 && /think/i.test(e.message)) {
      return geminiRequest(key, model, imgs, q, undefined, signal);
    }
    throw e;
  }
}

async function geminiRequest(
  key: string,
  model: string,
  imgs: Image[],
  q: Question,
  thinkingConfig: ReturnType<typeof geminiThinking>,
  signal: AbortSignal,
): Promise<Result> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const thinkingCap = thinkingConfig && "thinkingBudget" in thinkingConfig ? Math.max(thinkingConfig.thinkingBudget!, 0) : 0;
  const j = await postJson(
    url,
    { "x-goog-api-key": key },
    {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: "user",
          parts: [
            ...imgs.map((img) => ({ inline_data: { mime_type: img.mime, data: img.b64 } })),
            { text: userText(q.instruction, imgs.length, q.stitched) },
          ],
        },
      ],
      generationConfig: {
        ...(thinkingConfig ? { thinkingConfig } : {}),
        // Cap output only when the thinking budget is known; otherwise thinking could eat the cap.
        ...(thinkingConfig && !("thinkingBudget" in thinkingConfig && thinkingConfig.thinkingBudget! >= 0)
          ? {}
          : { maxOutputTokens: answerBudget(q.instruction) + thinkingCap }),
      },
    },
    signal,
  );
  const cand = j?.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .filter((p: { text?: string; thought?: boolean }) => p.text && !p.thought)
    .map((p: { text: string }) => p.text)
    .join("");
  if (!text) throw new ProviderError(`Empty response (${cand?.finishReason ?? j?.promptFeedback?.blockReason ?? "unknown"})`);
  return { answer: text, tokens: j?.usageMetadata?.totalTokenCount };
}

async function callOpenAICompatible(
  baseUrl: string,
  key: string,
  model: string,
  imgs: Image[],
  q: Question,
  signal: AbortSignal,
  extraHeaders: Record<string, string> = {},
): Promise<Result> {
  const j = await postJson(
    `${baseUrl}/chat/completions`,
    { authorization: `Bearer ${key}`, ...extraHeaders },
    {
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userText(q.instruction, imgs.length, q.stitched) },
            ...imgs.map((img) => ({
              type: "image_url",
              image_url: { url: `data:${img.mime};base64,${img.b64}`, detail: "high" },
            })),
          ],
        },
      ],
    },
    signal,
  );
  const text = j?.choices?.[0]?.message?.content;
  if (!text) throw new ProviderError("Empty response");
  return { answer: typeof text === "string" ? text : JSON.stringify(text), tokens: j?.usage?.total_tokens };
}

async function callAnthropic(
  key: string,
  model: string,
  imgs: Image[],
  q: Question,
  signal: AbortSignal,
): Promise<Result> {
  const j = await postJson(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": key, "anthropic-version": "2023-06-01" },
    {
      model,
      max_tokens: answerBudget(q.instruction) * 2,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...imgs.map((img) => ({ type: "image", source: { type: "base64", media_type: img.mime, data: img.b64 } })),
            { type: "text", text: userText(q.instruction, imgs.length, q.stitched) },
          ],
        },
      ],
    },
    signal,
  );
  const text = (j?.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");
  if (!text) throw new ProviderError("Empty response");
  const u = j?.usage;
  return { answer: text, tokens: u ? (u.input_tokens ?? 0) + (u.output_tokens ?? 0) : undefined };
}

/** The models to try for one key, in order. */
export async function modelsFor(cfg: KeyConfig, signal: AbortSignal): Promise<{ provider: ProviderId; models: string[] }> {
  const provider = cfg.provider === "auto" ? detectProvider(cfg.apiKey) : cfg.provider;
  const explicit = cfg.model?.trim();
  if (provider !== "gemini") return { provider, models: [explicit || DEFAULT_MODELS[provider]] };
  const chain = await geminiChain(cfg.apiKey.trim(), signal);
  // An explicit model goes first, but auto-picked ones stay as backup in case it's retired.
  return { provider, models: explicit ? [explicit, ...chain.filter((m) => m !== explicit)] : chain };
}

/** Worth trying another model on the same key: quota, overload, or a retired/unknown model. */
export function retryableOnSameKey(e: unknown) {
  const status = e instanceof ProviderError ? e.status : undefined;
  if (status === 429 || status === 503 || status === 404) return true;
  return /no longer available|not found|not supported|deprecated|unknown model/i.test((e as Error)?.message ?? "");
}

export async function callProvider(
  provider: ProviderId,
  model: string,
  apiKey: string,
  imgs: Image[],
  q: Question,
  effort: Effort,
  signal: AbortSignal,
) {
  const key = apiKey.trim();
  let r: Result;
  switch (provider) {
    case "gemini":
      r = await callGemini(key, model, imgs, q, effort, signal);
      break;
    case "openai":
      r = await callOpenAICompatible("https://api.openai.com/v1", key, model, imgs, q, signal);
      break;
    case "openrouter":
      r = await callOpenAICompatible("https://openrouter.ai/api/v1", key, model, imgs, q, signal, {
        "x-title": "AI Cam Mirror",
      });
      break;
    case "anthropic":
      r = await callAnthropic(key, model, imgs, q, signal);
      break;
  }
  return { provider, model, answer: r.answer.trim(), tokens: r.tokens };
}
