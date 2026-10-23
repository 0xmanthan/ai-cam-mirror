import { NextResponse } from "next/server";
import { callProvider, detectProvider, parseDataUrl } from "@/lib/server/providers";
import type { AskRequest, AskResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Key router: tries each enabled key in the user's priority order and returns
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

  const img = typeof body.image === "string" ? parseDataUrl(body.image) : null;
  if (!img) return NextResponse.json<AskResponse>({ ok: false, error: "Missing or invalid image" }, { status: 400 });

  const keys = (Array.isArray(body.keys) ? body.keys : []).filter(
    (k) => k && typeof k.apiKey === "string" && k.apiKey.trim() && k.enabled !== false,
  );
  if (keys.length === 0) {
    return NextResponse.json<AskResponse>({ ok: false, error: "Add an API key in AI settings first" }, { status: 400 });
  }

  const instruction = typeof body.instruction === "string" ? body.instruction.slice(0, 2000) : undefined;
  const started = Date.now();
  const deadline = AbortSignal.timeout(55_000);
  const attempts: { provider: string; model: string; error: string }[] = [];

  for (const k of keys.slice(0, 8)) {
    try {
      const r = await callProvider(k, img, instruction, deadline);
      return NextResponse.json<AskResponse>({ ok: true, ...r, ms: Date.now() - started });
    } catch (e) {
      const provider = k.provider === "auto" ? detectProvider(k.apiKey) : k.provider;
      attempts.push({ provider, model: k.model || "default", error: (e as Error).message });
      if (deadline.aborted) break;
    }
  }

  return NextResponse.json<AskResponse>(
    { ok: false, error: attempts.at(-1)?.error ?? "All keys failed", attempts },
    { status: 502 },
  );
}
