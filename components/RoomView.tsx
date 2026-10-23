"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Track } from "livekit-client";
import { useLiveRoom, type Feed } from "@/lib/client/useLiveRoom";
import { getEffort, getInstruction, getKeys, setInstruction as saveInstruction, type JoinInfo } from "@/lib/client/storage";
import type { AskResponse } from "@/lib/types";
import { VideoView } from "./VideoView";
import { KeysModal } from "./KeysModal";
import { AnswerText } from "./AnswerText";
import {
  AskIcon,
  CameraIcon,
  CameraOffIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  FlipIcon,
  KeyIcon,
  LinkIcon,
  ScreenIcon,
} from "./Icons";

type Answer = {
  id: string;
  from: string;
  at: number;
  status: "loading" | "done" | "error";
  image?: string;
  text?: string;
  error?: string;
  provider?: string;
  model?: string;
  ms?: number;
  tokens?: number;
  note?: string;
};

const PROVIDER_LABEL: Record<string, string> = {
  gemini: "Gemini",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Claude",
};

function initial(name: string) {
  return (name.trim()[0] || "?").toUpperCase();
}

function metaLine(a: Answer) {
  const parts = [PROVIDER_LABEL[a.provider!] ?? a.provider, a.model, `${((a.ms ?? 0) / 1000).toFixed(1)}s`];
  if (a.tokens) parts.push(`${a.tokens.toLocaleString()} tokens`);
  return parts.join(" · ");
}

function feedLabel(f: Feed) {
  return `${f.isLocal ? "You" : f.name}${f.source === Track.Source.ScreenShare ? " · screen" : ""}`;
}

export function RoomView({ join, onEnded }: { join: JoinInfo; onEnded: (reason: string | null) => void }) {
  const live = useLiveRoom(join);
  const { meta, people, feeds, me } = live;
  const [spotKey, setSpotKey] = useState<string | null>(null);
  const [tab, setTab] = useState<"answers" | "people">("answers");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [keysOpen, setKeysOpen] = useState(false);
  const [keyCount, setKeyCount] = useState(0);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());
  const canShareScreen = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

  useEffect(() => {
    setNote(getInstruction());
    setKeyCount(getKeys().filter((k) => k.apiKey && k.enabled !== false).length);
  }, []);

  useEffect(() => {
    if (live.status === "ended") onEnded(live.endReason);
  }, [live.status, live.endReason, onEnded]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const isCreator = !!meta && meta.creator === me;
  const isHost = !!meta && meta.host === me;
  const hostName = people.find((p) => p.identity === meta?.host)?.name;

  // Stage: what you picked, else the host's feed, else someone else's, else your own.
  const stage = useMemo(() => {
    return (
      feeds.find((f) => f.key === spotKey) ??
      feeds.find((f) => f.identity === meta?.host && !f.isLocal) ??
      feeds.find((f) => !f.isLocal) ??
      feeds[0] ??
      null
    );
  }, [feeds, spotKey, meta?.host]);

  const patch = (id: string, p: Partial<Answer>) => setAnswers((as) => as.map((a) => (a.id === id ? { ...a, ...p } : a)));

  const ask = useCallback(
    async (feed: Feed) => {
      const keys = getKeys().filter((k) => k.apiKey.trim() && k.enabled !== false);
      if (!keys.length) {
        setKeysOpen(true);
        setToast("Add an API key first. It only takes a few seconds.");
        return;
      }
      // One request per feed at a time: double taps would just burn free-tier quota.
      if (inFlight.current.has(feed.key)) {
        setToast("Still answering the last one…");
        return;
      }
      inFlight.current.add(feed.key);
      const id = Math.random().toString(36).slice(2);
      const instruction = note.trim() || undefined;
      setAnswers((as) => [{ id, from: feedLabel(feed), at: Date.now(), status: "loading" as const, note: instruction }, ...as].slice(0, 30));
      setTab("answers");
      try {
        const image = await live.snapshot(feed);
        patch(id, { image });
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ image, instruction, keys, effort: getEffort() }),
        });
        const j = (await res.json().catch(() => ({ ok: false, error: `Request failed (${res.status})` }))) as AskResponse;
        if (j.ok)
          patch(id, { status: "done", text: j.answer, provider: j.provider, model: j.model, ms: j.ms, tokens: j.tokens });
        else patch(id, { status: "error", error: j.error });
      } catch (e) {
        patch(id, { status: "error", error: (e as Error).message || "Something went wrong" });
      } finally {
        inFlight.current.delete(feed.key);
      }
    },
    [live, note],
  );

  // Press "A" anywhere (outside inputs) to ask about the stage feed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "a" && stage && !keysOpen) {
        e.preventDefault();
        ask(stage);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask, stage, keysOpen]);

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1500);
    } catch {
      setToast("Couldn't copy to the clipboard.");
    }
  }

  async function run(fn: () => Promise<unknown>, fail: string) {
    try {
      await fn();
    } catch (e) {
      const msg = (e as Error).message;
      setToast(/Permission|NotAllowed/i.test(msg) ? "Permission denied. Allow camera access in your browser." : msg || fail);
    }
  }

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${join.room}` : "";
  const [latest, ...older] = answers;

  return (
    <div className="room">
      <header className="topbar">
        <a className="wordmark" href="/">
          <span className="wordmark-dot" />
          <span className="hide-sm">Mirror</span>
        </a>
        <div className="room-chip">
          <span className={`status-dot ${live.status === "connected" ? "" : "warn"}`} title={live.status} />
          <span className="mono">{join.room}</span>
          <button className="btn btn-ghost btn-sm" style={{ height: 26, padding: "0 10px" }} onClick={() => copy(inviteUrl, "invite")}>
            {copied === "invite" ? <CheckIcon size={14} /> : <LinkIcon size={14} />}
            <span className="hide-sm">{copied === "invite" ? "Copied" : "Invite link"}</span>
          </button>
        </div>
        <div className="topbar-right">
          <button className="btn btn-ghost btn-sm" onClick={live.leave}>
            Leave
          </button>
        </div>
      </header>

      <div className="room-body">
        <section className="main-col">
          <div className="stage">
            {stage ? (
              <>
                <VideoView key={stage.key} track={stage.track} />
                <div className="overlay-tl">
                  {stage.identity === meta?.host && <span className="tag tag-host">Host</span>}
                </div>
                <div className="overlay-bl">
                  <span className="tag">{feedLabel(stage)}</span>
                </div>
                <div className="overlay-br hide-sm">
                  <button className="btn btn-primary ask-btn" onClick={() => ask(stage)}>
                    <AskIcon size={20} />
                    Ask AI
                  </button>
                </div>
              </>
            ) : (
              <div className="stage-empty">
                <span className="eyebrow" style={{ marginBottom: 14 }}>
                  {live.status === "connected" ? `${people.length} in the room` : "Connecting…"}
                </span>
                <h2>Nobody&rsquo;s live yet.</h2>
                <p>Turn on your camera or share your screen, and everyone in the room will see it here.</p>
                <button
                  className="btn btn-primary btn-lg"
                  disabled={live.status !== "connected"}
                  onClick={() => run(live.toggleCamera, "Couldn't start camera")}
                >
                  <CameraIcon />
                  Turn on camera
                </button>
              </div>
            )}
          </div>

          <div className="dock hide-sm">
            <button
              className={`btn ${live.camOn ? "btn-on" : "btn-ghost"}`}
              disabled={live.status !== "connected"}
              onClick={() => run(live.toggleCamera, "Couldn't start camera")}
            >
              {live.camOn ? <CameraIcon /> : <CameraOffIcon />}
              {live.camOn ? "Camera on" : "Camera off"}
            </button>
            {live.camOn && (
              <button className="btn btn-ghost" onClick={() => run(live.flipCamera, "Couldn't switch camera")}>
                <FlipIcon />
                Flip
              </button>
            )}
            {canShareScreen && (
              <button
                className={`btn ${live.screenOn ? "btn-on" : "btn-ghost"} hide-sm`}
                disabled={live.status !== "connected"}
                onClick={() => run(live.toggleScreen, "Couldn't share screen")}
              >
                <ScreenIcon />
                {live.screenOn ? "Stop sharing" : "Share screen"}
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => setKeysOpen(true)}>
              <KeyIcon />
              AI keys{keyCount ? ` · ${keyCount}` : ""}
            </button>
          </div>

          {feeds.length > 1 && (
            <div className="strip">
              {feeds.map((f) => (
                <button
                  key={f.key}
                  className={`thumb ${stage?.key === f.key ? "active" : ""}`}
                  onClick={() => setSpotKey(f.key)}
                  aria-label={`Show ${feedLabel(f)}`}
                >
                  <VideoView track={f.track} />
                  <span className="tag">{feedLabel(f)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="aside">
          <div className="tabs">
            <button className={`tab ${tab === "answers" ? "active" : ""}`} onClick={() => setTab("answers")}>
              Answers{answers.length ? <span className="count">{answers.length}</span> : null}
            </button>
            <button className={`tab ${tab === "people" ? "active" : ""}`} onClick={() => setTab("people")}>
              People<span className="count">{people.length}</span>
            </button>
          </div>

          <div className="aside-scroll">
            {tab === "answers" ? (
              <>
                <div className="note-box">
                  <div className="note-head">
                    <label className="label" htmlFor="note">
                      Note for the AI <span className="faint">(optional)</span>
                    </label>
                    {note && (
                      <button
                        className="linkish"
                        onClick={() => {
                          setNote("");
                          saveInstruction("");
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <textarea
                    id="note"
                    className="field"
                    rows={2}
                    placeholder="e.g. “explain in 2 lines”. Leave empty for just the answer."
                    value={note}
                    onChange={(e) => {
                      setNote(e.target.value);
                      saveInstruction(e.target.value);
                    }}
                  />
                </div>

                {latest ? (
                  <div className="answer-hero" aria-live="polite">
                    <div className="answer-meta" style={{ color: "var(--deep-muted)" }}>
                      <span className="eyebrow">Latest · {latest.from}</span>
                      {latest.image && <img src={latest.image} alt="Frame sent to the AI" />}
                    </div>
                    {latest.status === "loading" && (
                      <div className="loading-line">
                        <span className="pulse" />
                        {latest.image ? "Reading the question…" : "Grabbing a sharp frame…"}
                      </div>
                    )}
                    {latest.status === "done" && (
                      <div className="answer-text">
                        <AnswerText text={latest.text!} />
                      </div>
                    )}
                    {latest.status === "error" && <p className="answer-error loading-line">{latest.error}</p>}
                    <div className="answer-meta">
                      <span>
                        {latest.status === "done"
                          ? metaLine(latest)
                          : latest.note
                            ? `Note: ${latest.note}`
                            : ""}
                      </span>
                      {latest.status === "done" && (
                        <button className="btn btn-ghost btn-sm" onClick={() => copy(latest.text!, latest.id)}>
                          {copied === latest.id ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                          {copied === latest.id ? "Copied" : "Copy"}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="empty-answers">
                    <h3>No answers yet</h3>
                    <p className="muted" style={{ margin: 0 }}>
                      When someone is live, tap <strong>Ask AI</strong>
                      <span className="hide-sm">
                        {" "}
                        or press <span className="mono">A</span>
                      </span>
                      .
                    </p>
                  </div>
                )}

                {older.length > 0 && (
                  <ul className="answer-list">
                    {older.map((a) => (
                      <li className="answer-item" key={a.id}>
                        {a.image ? <img src={a.image} alt="" /> : <span className="avatar" />}
                        <div style={{ minWidth: 0 }}>
                          <div className="answer-item-text" style={a.status === "error" ? { color: "var(--danger)" } : undefined}>
                            {a.status === "done" ? <AnswerText text={a.text!} /> : a.status === "error" ? a.error : "Working…"}
                          </div>
                          <div className="answer-item-meta">
                            {a.from} · {new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            {a.provider ? ` · ${PROVIDER_LABEL[a.provider] ?? a.provider}` : ""}
                          </div>
                        </div>
                        {a.status === "done" && (
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => copy(a.text!, a.id)} aria-label="Copy">
                            {copied === a.id ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
                  {isCreator
                    ? "You created this room. Choose who hosts it, and only one person can be host at a time."
                    : hostName
                      ? `${hostName} is hosting. The room creator decides who hosts.`
                      : "The room creator decides who hosts."}
                </p>
                <ul className="people">
                  {people.map((p) => {
                    const pHost = p.identity === meta?.host;
                    const pCreator = p.identity === meta?.creator;
                    const sub = [pHost && "Host", pCreator && "Creator", p.camOn && "Camera live", p.screenOn && "Sharing screen"]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <li className="person" key={p.identity}>
                        <span className={`avatar ${pHost ? "host" : ""}`}>{initial(p.name)}</span>
                        <div className="person-main">
                          <div className="person-name">
                            {p.name}
                            {p.isLocal && <span className="faint"> (you)</span>}
                          </div>
                          <div className="person-sub">{sub || "Watching"}</div>
                        </div>
                        <div className="person-actions">
                          {isCreator && !pHost && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => run(() => live.setHost(p.identity), "Couldn't change host")}
                            >
                              Make host
                            </button>
                          )}
                          {(isCreator || isHost) && !pCreator && !p.isLocal && (
                            <button
                              className="btn btn-ghost btn-sm btn-danger"
                              onClick={() => {
                                if (confirm(`Remove ${p.name} from the room?`)) run(() => live.kick(p.identity), "Couldn't remove");
                              }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {meta?.host && !people.some((p) => p.identity === meta.host) && (
                  <div className="notice">The host has stepped out. They&rsquo;ll be host again when they rejoin.</div>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      {latest && dismissed !== latest.id && (
        <div className="m-answer" aria-live="polite">
          <div className="m-answer-head">
            <span className="eyebrow">{latest.status === "loading" ? "Asking AI" : `Answer · ${latest.from}`}</span>
            <div className="row" style={{ gap: 6 }}>
              {latest.status === "done" && (
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => copy(latest.text!, latest.id)} aria-label="Copy">
                  {copied === latest.id ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
                </button>
              )}
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDismissed(latest.id)} aria-label="Hide">
                <CloseIcon size={15} />
              </button>
            </div>
          </div>
          {latest.status === "loading" && (
            <div className="loading-line" style={{ margin: "6px 0 2px" }}>
              <span className="pulse" />
              {latest.image ? "Reading the question…" : "Grabbing a sharp frame…"}
            </div>
          )}
          {latest.status === "done" && (
            <div className="m-answer-text">
              <AnswerText text={latest.text!} />
            </div>
          )}
          {latest.status === "error" && <p className="answer-error" style={{ margin: "6px 0 2px" }}>{latest.error}</p>}
          {latest.status === "done" && <div className="m-answer-meta">{metaLine(latest)}</div>}
        </div>
      )}

      <nav className="m-bar" aria-label="Room controls">
        <button
          className={`m-btn ${live.camOn ? "on" : ""}`}
          disabled={live.status !== "connected"}
          onClick={() => run(live.toggleCamera, "Couldn't start camera")}
          aria-label={live.camOn ? "Turn camera off" : "Turn camera on"}
        >
          {live.camOn ? <CameraIcon size={22} /> : <CameraOffIcon size={22} />}
          <span>{live.camOn ? "Live" : "Camera"}</span>
        </button>
        {live.camOn && (
          <button className="m-btn" onClick={() => run(live.flipCamera, "Couldn't switch camera")} aria-label="Flip camera">
            <FlipIcon size={22} />
            <span>Flip</span>
          </button>
        )}
        <button
          className="btn btn-primary m-ask"
          disabled={!stage}
          onClick={() => {
            if (stage) {
              setDismissed(null);
              ask(stage);
            }
          }}
        >
          <AskIcon size={22} />
          {stage ? "Ask AI" : "Nobody's live"}
        </button>
        <button className="m-btn" onClick={() => setKeysOpen(true)} aria-label="AI keys">
          <KeyIcon size={22} />
          <span>{keyCount ? `Keys · ${keyCount}` : "Keys"}</span>
        </button>
      </nav>

      {keysOpen && (
        <KeysModal
          onClose={() => {
            setKeysOpen(false);
            setKeyCount(getKeys().filter((k) => k.apiKey && k.enabled !== false).length);
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
