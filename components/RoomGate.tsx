"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getName, requestJoin, setName, takeJoin, type JoinInfo } from "@/lib/client/storage";
import { RoomView } from "./RoomView";

export function RoomGate({ code }: { code: string }) {
  const [join, setJoin] = useState<JoinInfo | null>(null);
  const [name, setNameState] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState<{ reason: string | null } | null>(null);
  const [ready, setReady] = useState(false);
  const started = useRef(false);

  const connect = useCallback(
    async (n: string) => {
      setBusy(true);
      setError(null);
      try {
        setName(n);
        setJoin(await requestJoin({ name: n, room: code }));
        setEnded(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [code],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const stashed = takeJoin(code);
    const n = getName();
    setNameState(n);
    setReady(true);
    if (stashed) setJoin(stashed);
    else if (n) connect(n);
  }, [code, connect]);

  const onEnded = useCallback((reason: string | null) => {
    setJoin(null);
    setEnded({ reason });
  }, []);

  if (join) return <RoomView join={join} onEnded={onEnded} />;
  if (!ready) return null;

  if (ended) {
    return (
      <main className="center-page">
        <div className="card center-card">
          <span className="eyebrow">Room {code}</span>
          <h1 style={{ marginTop: 10 }}>{ended.reason ? "You're out of the room." : "You left the room."}</h1>
          <p className="muted">{ended.reason ?? "Your camera has been turned off."}</p>
          <div className="row" style={{ marginTop: 22, flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => connect(name || getName())}>
              {busy ? "Rejoining…" : "Rejoin"}
            </button>
            <a className="btn btn-ghost" href="/">
              Back home
            </a>
          </div>
          {error && <p className="err">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="center-page">
      <form
        className="card center-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) connect(name.trim());
        }}
      >
        <span className="eyebrow">Joining room</span>
        <h1 className="mono" style={{ marginTop: 10, fontFamily: "inherit", letterSpacing: "0.12em", fontSize: 36 }}>
          {code}
        </h1>
        <label className="label" htmlFor="gate-name" style={{ marginTop: 18 }}>
          Your name
        </label>
        <input
          id="gate-name"
          className="field"
          autoFocus
          value={name}
          maxLength={40}
          placeholder="e.g. Aarav"
          onChange={(e) => setNameState(e.target.value)}
        />
        <button className="btn btn-primary btn-lg" style={{ width: "100%", marginTop: 14 }} disabled={busy || !name.trim()}>
          {busy ? "Joining…" : "Join room"}
        </button>
        {error && <p className="err">{error}</p>}
      </form>
    </main>
  );
}
