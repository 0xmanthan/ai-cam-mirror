import type { Effort, KeyConfig } from "@/lib/types";

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function randomSecret() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Per-browser secret; the server derives our room identity from it. */
export function clientSecret(): string {
  let s = read<string>("acm.secret", "");
  if (!s) {
    s = randomSecret();
    write("acm.secret", s);
  }
  return s;
}

export const getName = () => read<string>("acm.name", "");
export const setName = (n: string) => write("acm.name", n);

export const getKeys = () => read<KeyConfig[]>("acm.keys", []);
export const setKeys = (k: KeyConfig[]) => write("acm.keys", k);

export const getEffort = () => read<Effort>("acm.effort", "balanced");
export const setEffort = (e: Effort) => write("acm.effort", e);

export const getInstruction = () => read<string>("acm.instruction", "");
export const setInstruction = (s: string) => write("acm.instruction", s);

export type JoinInfo = { token: string; url: string; room: string; identity: string };

export async function requestJoin(opts: { name: string; room?: string; create?: boolean }): Promise<JoinInfo> {
  const res = await fetch("/api/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...opts, clientSecret: clientSecret() }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
  return j as JoinInfo;
}

/** Hand a freshly minted token from the home page to the room page. */
export function stashJoin(info: JoinInfo) {
  try {
    sessionStorage.setItem(`acm.join.${info.room}`, JSON.stringify(info));
  } catch {}
}

export function takeJoin(room: string): JoinInfo | null {
  try {
    const k = `acm.join.${room}`;
    const v = sessionStorage.getItem(k);
    sessionStorage.removeItem(k);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
