import type { KeyConfig, ProviderId } from "@/lib/types";
import { SYSTEM_PROMPT, userText } from "./prompt";

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: "gemini-2.5-flash",
  openrouter: "google/gemini-2.5-flash",
  openai: "gpt-4.1-mini",
  anthropic: "claude-sonnet-5-5",
};

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

async function callGemini(key: string, model: string, img: Image, instruction: string | undefined, signal: AbortSignal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const j = await postJson(
    url,
    { "x-goog-api-key": key },
    {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: "user",
          parts: [{ inline_data: { mime_type: img.mime, data: img.b64 } }, { text: userText(instruction) }],
        },
      ],
    },
    signal,
  );
  const cand = j?.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .filter((p: { text?: string; thought?: boolean }) => p.text && !p.thought)
    .map((p: { text: string }) => p.text)
    .join("");
  if (!text) throw new ProviderError(`Empty response (${cand?.finishReason ?? j?.promptFeedback?.blockReason ?? "unknown"})`);
  return text;
}

async function callOpenAICompatible(
  baseUrl: string,
  key: string,
  model: string,
  img: Image,
  instruction: string | undefined,
  signal: AbortSignal,
  extraHeaders: Record<string, string> = {},
) {
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
            { type: "text", text: userText(instruction) },
            { type: "image_url", image_url: { url: `data:${img.mime};base64,${img.b64}`, detail: "high" } },
          ],
        },
      ],
    },
    signal,
  );
  const text = j?.choices?.[0]?.message?.content;
  if (!text) throw new ProviderError("Empty response");
  return typeof text === "string" ? text : JSON.stringify(text);
}

async function callAnthropic(key: string, model: string, img: Image, instruction: string | undefined, signal: AbortSignal) {
  const j = await postJson(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": key, "anthropic-version": "2023-06-01" },
    {
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: img.mime, data: img.b64 } },
            { type: "text", text: userText(instruction) },
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
  return text;
}

export async function callProvider(cfg: KeyConfig, img: Image, instruction: string | undefined, signal: AbortSignal) {
  const provider = cfg.provider === "auto" ? detectProvider(cfg.apiKey) : cfg.provider;
  const model = cfg.model?.trim() || DEFAULT_MODELS[provider];
  const key = cfg.apiKey.trim();
  let text: string;
  switch (provider) {
    case "gemini":
      text = await callGemini(key, model, img, instruction, signal);
      break;
    case "openai":
      text = await callOpenAICompatible("https://api.openai.com/v1", key, model, img, instruction, signal);
      break;
    case "openrouter":
      text = await callOpenAICompatible("https://openrouter.ai/api/v1", key, model, img, instruction, signal, {
        "x-title": "AI Cam Mirror",
      });
      break;
    case "anthropic":
      text = await callAnthropic(key, model, img, instruction, signal);
      break;
  }
  return { provider, model, answer: text.trim() };
}
