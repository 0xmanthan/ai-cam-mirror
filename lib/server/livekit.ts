import { createHmac, randomInt } from "node:crypto";
import { AccessToken, RoomServiceClient, TokenVerifier } from "livekit-server-sdk";
import type { RoomMeta } from "@/lib/types";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export function lkConfig() {
  const url = env("LIVEKIT_URL");
  return {
    url,
    httpUrl: url.replace(/^ws/, "http"),
    apiKey: env("LIVEKIT_API_KEY"),
    apiSecret: env("LIVEKIT_API_SECRET"),
  };
}

export function roomService() {
  const c = lkConfig();
  return new RoomServiceClient(c.httpUrl, c.apiKey, c.apiSecret);
}

/**
 * Identities are derived server-side from a secret only the client knows, so
 * nobody can impersonate the creator/host by picking their identity string.
 */
export function deriveIdentity(clientSecret: string): string {
  const h = createHmac("sha256", lkConfig().apiSecret).update(`id:${clientSecret}`).digest("hex");
  return `u-${h.slice(0, 16)}`;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newRoomCode(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

export function normalizeCode(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const c = code.trim().toUpperCase();
  return /^[A-Z0-9]{4,12}$/.test(c) ? c : null;
}

export function parseMeta(raw: string | undefined): RoomMeta | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw);
    if (typeof m?.creator === "string" && typeof m?.host === "string") return m;
  } catch {}
  return null;
}

export async function mintToken(room: string, identity: string, name: string) {
  const c = lkConfig();
  const at = new AccessToken(c.apiKey, c.apiSecret, { identity, name, ttl: "8h" });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
  });
  return at.toJwt();
}

/** Verifies a participant's own access token and returns who they are. */
export async function verifyParticipant(token: string) {
  const c = lkConfig();
  const claims = await new TokenVerifier(c.apiKey, c.apiSecret).verify(token);
  const identity = claims.sub;
  const room = claims.video?.room;
  if (!identity || !room) throw new Error("Invalid token");
  return { identity, room };
}
