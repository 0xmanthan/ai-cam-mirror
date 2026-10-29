import { NextResponse } from "next/server";
import { callProvider, modelsFor, parseDataUrl, retryableOnSameKey } from "@/lib/server/providers";
import { MAX_SHOTS, type AskRequest, type AskResponse, type Effort } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const EFFORTS: Effort[] = ["fast", "balanced", "deep"];

/**
 * Key router: tries each enabled key in the user's priority order (and, for
 * Gemini, a lighter model on the same key when one is rate limited) and returns
 * the first successful answer. Keys come from the caller's browser and are
 * never stored or logged.
 */
export async function POST(req: Request) {
  let body: AskRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<AskResponse>({ ok: false, error: "Bad JSON" }, { status: 400 });
  }

  const raw = Array.isArray(body.images) ? body.images : [];
  if (raw.length > MAX_SHOTS) {
    return NextResponse.json<AskResponse>({ ok: false, error: `Up to ${MAX_SHOTS} photos at once` }, { status: 400 });
  }
  const imgs = raw.flatMap((u) => {
    const img = typeof u === "string" ? parseDataUrl(u) : null;
    return img ? [img] : [];
  });
  if (imgs.length === 0 || imgs.length !== raw.length) {
    return NextResponse.json<AskResponse>({ ok: false, error: "Missing or invalid image" }, { status: 400 });
  }

  const keys = (Array.isArray(body.keys) ? body.keys : []).filter(
    (k) => k && typeof k.apiKey === "string" && k.apiKey.trim() && k.enabled !== false,
  );
  if (keys.length === 0) {
    return NextResponse.json<AskResponse>({ ok: false, error: "Add an API key in AI settings first" }, { status: 400 });
  }

  const instruction = typeof body.instruction === "string" ? body.instruction.slice(0, 2000) : undefined;
  const effort: Effort = EFFORTS.includes(body.effort as Effort) ? (body.effort as Effort) : "balanced";
  const started = Date.now();
  const deadline = AbortSignal.timeout(55_000);
  const attempts: { provider: string; model: string; error: string }[] = [];

  outer: for (const k of keys.slice(0, 8)) {
    const { provider, models } = await modelsFor(k, deadline);
    for (const model of models) {
      try {
        const r = await callProvider(provider, model, k.apiKey, imgs, instruction, effort, deadline);
        return NextResponse.json<AskResponse>({ ok: true, ...r, ms: Date.now() - started });
      } catch (e) {
        attempts.push({ provider, model, error: (e as Error).message });
        if (deadline.aborted) break outer;
        if (!retryableOnSameKey(e)) break;
      }
    }
  }

  const allLimited = attempts.length > 0 && attempts.every((a) => a.error.startsWith("Rate limit"));
  const error = allLimited
    ? "Free-tier limit reached on every key. Wait a minute, or add another key (one from a different Google project works)."
    : (attempts.at(-1)?.error ?? "All keys failed");
  return NextResponse.json<AskResponse>({ ok: false, error, attempts }, { status: allLimited ? 429 : 502 });
}
