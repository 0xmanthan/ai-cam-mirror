"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getName, requestJoin, setName, stashJoin } from "@/lib/client/storage";

export function Launcher({ id }: { id: string }) {
  const router = useRouter();
  const [name, setNameState] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"create" | "join">("create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setNameState(getName()), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = name.trim();
    if (!n) return setError("Add your name so the room knows who you are.");
    if (mode === "join" && code.trim().length < 4) return setError("Enter the room code you were given.");
    setName(n);
    setBusy(true);
    try {
      const info = await requestJoin(mode === "create" ? { name: n, create: true } : { name: n, room: code.trim() });
      stashJoin(info);
      router.push(`/room/${info.room}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="launcher">
      <form className="launcher-bar" onSubmit={submit}>
        <input
          id={`${id}-name`}
          className="launcher-input"
          placeholder="Your name"
          aria-label="Your name"
          value={name}
          maxLength={40}
          autoComplete="nickname"
          onChange={(e) => setNameState(e.target.value)}
        />
        {mode === "join" && (
          <input
            className="launcher-input launcher-code code-input"
            placeholder="CODE"
            aria-label="Room code"
            value={code}
            maxLength={12}
            autoFocus
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())}
          />
        )}
        <button className="btn btn-primary btn-lg launcher-go" disabled={busy}>
          {busy ? (mode === "create" ? "Creating…" : "Joining…") : mode === "create" ? "Create a room" : "Join room"}
        </button>
      </form>
      <div className="launcher-foot">
        {error ? (
          <span className="err" style={{ margin: 0 }}>
            {error}
          </span>
        ) : (
          <button type="button" className="linkish" onClick={() => setMode(mode === "create" ? "join" : "create")}>
            {mode === "create" ? "Have a code? Join a room instead" : "Start a new room instead"}
          </button>
        )}
      </div>
    </div>
  );
}
