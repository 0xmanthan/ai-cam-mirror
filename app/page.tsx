"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getName, requestJoin, setName, stashJoin } from "@/lib/client/storage";

export default function Home() {
  const router = useRouter();
  const [name, setNameState] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setNameState(getName()), []);

  async function go(mode: "create" | "join") {
    setError(null);
    const n = name.trim();
    if (!n) return setError("Tell the room what to call you.");
    if (mode === "join" && code.trim().length < 4) return setError("Enter the room code you were given.");
    setName(n);
    setBusy(mode);
    try {
      const info = await requestJoin(mode === "create" ? { name: n, create: true } : { name: n, room: code.trim() });
      stashJoin(info);
      router.push(`/room/${info.room}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <main className="home">
      <nav className="nav">
        <span className="wordmark">
          <span className="wordmark-dot" />
          Mirror
        </span>
        <span className="faint" style={{ fontSize: 14 }}>
          Live camera rooms with a one-tap answer
        </span>
      </nav>

      <section className="hero">
        <div>
          <h1>
            Point a camera.
            <br />
            <em>Get the answer.</em>
          </h1>
          <p className="lede">
            One person shares their phone camera or screen. Everyone else in the room can ask AI what&rsquo;s on it,
            with one tap and no typing. You get back only the answer.
          </p>
        </div>

        <div className="card join-card">
          <h2>Start or join a room</h2>
          <label className="label" htmlFor="name">
            Your name
          </label>
          <input
            id="name"
            className="field"
            placeholder="e.g. Aarav"
            value={name}
            maxLength={40}
            autoComplete="nickname"
            onChange={(e) => setNameState(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go(code ? "join" : "create")}
          />
          <button
            className="btn btn-primary btn-lg"
            style={{ width: "100%", marginTop: 14 }}
            disabled={!!busy}
            onClick={() => go("create")}
          >
            {busy === "create" ? "Creating room…" : "Create a room"}
          </button>

          <div className="divider">or join with a code</div>

          <div className="row">
            <input
              className="field code-input"
              placeholder="K7QM2P"
              value={code}
              maxLength={12}
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && go("join")}
            />
            <button className="btn btn-dark" style={{ height: 48 }} disabled={!!busy} onClick={() => go("join")}>
              {busy === "join" ? "Joining…" : "Join"}
            </button>
          </div>
          {error && <p className="err">{error}</p>}
        </div>
      </section>

      <section className="steps">
        <div className="steps-inner">
          <div className="step">
            <div className="step-n">i.</div>
            <h3>Open a room</h3>
            <p>Whoever creates the room picks the host and can hand that role to anyone else.</p>
          </div>
          <div className="step">
            <div className="step-n">ii.</div>
            <h3>Go live</h3>
            <p>Turn on a phone or laptop camera, or share your screen. Everyone in the room sees it in real time.</p>
          </div>
          <div className="step">
            <div className="step-n">iii.</div>
            <h3>Tap Ask AI</h3>
            <p>It grabs a sharp frame and sends back only the answer. You can add a note if you want it explained.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
