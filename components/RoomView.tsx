"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Track } from "livekit-client";
import { useLiveRoom, type Feed } from "@/lib/client/useLiveRoom";
import { getEffort, getInstruction, getKeys, setInstruction as saveInstruction, type JoinInfo } from "@/lib/client/storage";
import { shrinkDataUrl } from "@/lib/client/snapshot";
import { MAX_SHOTS, type AskResponse } from "@/lib/types";
import { VideoView } from "./VideoView";
import { KeysModal } from "./KeysModal";
import { AnswerText } from "./AnswerText";
import {
  CameraIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  FlipIcon,
  HistoryIcon,
  KeyIcon,
  LinkIcon,
  NoteIcon,
  ScreenIcon,
  SendIcon,
  UsersIcon,
} from "./Icons";

type Shot = { id: string; status: "loading" | "ready"; url?: string; from: string };

type Answer = {
  id: string;
  from: string;
  at: number;
  status: "loading" | "done" | "error";
  images: string[];
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

const uid = () => Math.random().toString(36).slice(2);

function initial(name: string) {
  return (name.trim()[0] || "?").toUpperCase();
}

function metaLine(a: Answer) {
  const parts = [PROVIDER_LABEL[a.provider!] ?? a.provider, `${((a.ms ?? 0) / 1000).toFixed(1)}s`];
  if (a.images.length > 1) parts.push(`${a.images.length} photos`);
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
  const [shots, setShots] = useState<Shot[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [sheet, setSheet] = useState<"people" | "history" | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [keyCount, setKeyCount] = useState(0);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const sending = useRef(false);
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
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const isCreator = !!meta && meta.creator === me;
  const isHost = !!meta && meta.host === me;
  const hostName = people.find((p) => p.identity === meta?.host)?.name;

  // What fills the screen: your pick, else the host, else anyone else, else yourself.
  const stage = useMemo(
    () =>
      feeds.find((f) => f.key === spotKey) ??
      feeds.find((f) => f.identity === meta?.host && !f.isLocal) ??
      feeds.find((f) => !f.isLocal) ??
      feeds[0] ??
      null,
    [feeds, spotKey, meta?.host],
  );

  const patch = (id: string, p: Partial<Answer>) => setAnswers((as) => as.map((a) => (a.id === id ? { ...a, ...p } : a)));

  async function run(fn: () => Promise<unknown>, fail: string) {
    try {
      await fn();
    } catch (e) {
      const msg = (e as Error).message;
      setToast(/Permission|NotAllowed/i.test(msg) ? "Allow camera access in your browser settings." : msg || fail);
    }
  }

  /** Shutter: add a sharp still of the stage feed to the tray. */
  const capture = useCallback(async () => {
    if (!stage) return;
    if (shots.length >= MAX_SHOTS) {
      setToast(`Up to ${MAX_SHOTS} photos per question. Send these first.`);
      return;
    }
    const id = uid();
    setShots((s) => [...s, { id, status: "loading", from: feedLabel(stage) }]);
    setFlash((f) => f + 1);
    try {
      const url = await live.snapshot(stage);
      setShots((s) => s.map((x) => (x.id === id ? { ...x, status: "ready", url } : x)));
    } catch (e) {
      setShots((s) => s.filter((x) => x.id !== id));
      setToast((e as Error).message || "Couldn't take that photo");
    }
  }, [stage, shots.length, live]);

  /** Send every photo in the tray as one question. */
  const send = useCallback(async () => {
    const ready = shots.filter((s) => s.status === "ready" && s.url);
    if (!ready.length || sending.current) return;
    if (shots.some((s) => s.status === "loading")) {
      setToast("One photo is still coming in…");
      return;
    }
    const keys = getKeys().filter((k) => k.apiKey.trim() && k.enabled !== false);
    if (!keys.length) {
      setKeysOpen(true);
      setToast("Add an API key first. It only takes a few seconds.");
      return;
    }
    sending.current = true;
    const id = uid();
    const instruction = note.trim() || undefined;
    const from = [...new Set(ready.map((s) => s.from))].join(", ");
    const originals = ready.map((s) => s.url!);
    setShots([]);
    setNoteOpen(false);
    setDismissed(null);
    setAnswers((as) => [{ id, from, at: Date.now(), status: "loading" as const, images: originals, note: instruction }, ...as].slice(0, 30));
    try {
      // Each photo costs image tokens; smaller stills keep multi-photo questions inside free-tier limits.
      const images = originals.length >= 3 ? await Promise.all(originals.map((u) => shrinkDataUrl(u, 1280))) : originals;
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ images, instruction, keys, effort: getEffort() }),
      });
      const j = (await res.json().catch(() => ({ ok: false, error: `Request failed (${res.status})` }))) as AskResponse;
      if (j.ok) patch(id, { status: "done", text: j.answer, provider: j.provider, model: j.model, ms: j.ms, tokens: j.tokens });
      else patch(id, { status: "error", error: j.error });
    } catch (e) {
      patch(id, { status: "error", error: (e as Error).message || "Something went wrong" });
    } finally {
      sending.current = false;
    }
  }, [shots, note]);

  // Desktop: Space takes a photo, Enter sends.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, button, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (keysOpen || sheet) return;
      if (e.key === " ") {
        e.preventDefault();
        capture();
      } else if (e.key === "Enter") {
        e.preventDefault();
        send();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [capture, send, keysOpen, sheet]);

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1500);
    } catch {
      setToast("Couldn't copy to the clipboard.");
    }
  }

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${join.room}` : "";
  const latest = answers[0];
  const readyCount = shots.filter((s) => s.status === "ready").length;
  const connected = live.status === "connected";

  return (
    <div className="cam">
      {/* the camera view */}
      <div className="cam-stage">
        {stage ? (
          <VideoView key={stage.key} track={stage.track} />
        ) : (
          <div className="cam-empty">
            <span className="cam-empty-eyebrow">{connected ? `${people.length} in the room` : "Connecting…"}</span>
            <h2>Nobody&rsquo;s live yet.</h2>
            <p>Go live to share your camera. Everyone in the room will see it here.</p>
            <button className="btn btn-primary btn-lg" disabled={!connected} onClick={() => run(live.toggleCamera, "Couldn't start camera")}>
              <CameraIcon />
              Go live
            </button>
          </div>
        )}
      </div>
      {flash > 0 && <div className="cam-flash" key={flash} />}

      {/* top bar */}
      <header className="cam-top">
        <a className="cam-icon" href="/" aria-label="Leave room" onClick={(e) => (e.preventDefault(), live.leave())}>
          <CloseIcon size={20} />
        </a>
        <button className="cam-chip" onClick={() => copy(inviteUrl, "invite")} aria-label="Copy invite link">
          <span className={`cam-dot ${connected ? "" : "warn"}`} />
          <span className="mono">{join.room}</span>
          {copied === "invite" ? <CheckIcon size={14} /> : <LinkIcon size={14} />}
        </button>
        <div className="cam-top-right">
          {canShareScreen && (
            <button
              className={`cam-icon hide-sm ${live.screenOn ? "on" : ""}`}
              disabled={!connected}
              onClick={() => run(live.toggleScreen, "Couldn't share screen")}
              aria-label={live.screenOn ? "Stop sharing screen" : "Share screen"}
              title={live.screenOn ? "Stop sharing screen" : "Share screen"}
            >
              <ScreenIcon size={20} />
            </button>
          )}
          <button className="cam-icon" onClick={() => setSheet("people")} aria-label="People">
            <UsersIcon size={20} />
            <span className="cam-badge">{people.length}</span>
          </button>
          <button className="cam-icon" onClick={() => setKeysOpen(true)} aria-label="AI keys">
            <KeyIcon size={20} />
            {!keyCount && <span className="cam-badge alert">!</span>}
          </button>
        </div>
      </header>

      {/* who you're looking at; switch when several people are live */}
      {stage && (
        <div className="cam-feeds">
          {(feeds.length > 1 ? feeds : [stage]).map((f) => (
            <button
              key={f.key}
              className={`cam-feed ${f.key === stage.key ? "active" : ""}`}
              onClick={() => setSpotKey(f.key)}
              disabled={feeds.length < 2}
            >
              {feedLabel(f)}
              {f.identity === meta?.host && <span className="cam-host">Host</span>}
            </button>
          ))}
        </div>
      )}

      {/* bottom: answer, tray, controls */}
      <div className="cam-bottom">
        {latest && dismissed !== latest.id && (
          <div className="cam-answer" aria-live="polite">
            <div className="cam-answer-head">
              <span className="cam-answer-eyebrow">{latest.status === "loading" ? "Asking AI" : "Answer"}</span>
              <div className="cam-answer-actions">
                {latest.status === "done" && (
                  <button className="cam-mini" onClick={() => copy(latest.text!, latest.id)} aria-label="Copy answer">
                    {copied === latest.id ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
                  </button>
                )}
                <button className="cam-mini" onClick={() => setDismissed(latest.id)} aria-label="Hide answer">
                  <CloseIcon size={15} />
                </button>
              </div>
            </div>
            {latest.status === "loading" && (
              <div className="cam-answer-loading">
                <span className="pulse" />
                Reading {latest.images.length > 1 ? `${latest.images.length} photos` : "the question"}…
              </div>
            )}
            {latest.status === "done" && (
              <div className="cam-answer-text">
                <AnswerText text={latest.text!} />
              </div>
            )}
            {latest.status === "error" && <p className="cam-answer-error">{latest.error}</p>}
            {latest.status === "done" && <div className="cam-answer-meta">{metaLine(latest)}</div>}
          </div>
        )}

        {shots.length > 0 && (
          <div className="cam-tray">
            <div className="cam-thumbs">
              {shots.map((s, i) => (
                <div className="cam-thumb" key={s.id}>
                  {s.url ? <img src={s.url} alt={`Photo ${i + 1}`} /> : <span className="cam-thumb-wait" />}
                  <button
                    className="cam-thumb-x"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => setShots((all) => all.filter((x) => x.id !== s.id))}
                  >
                    <CloseIcon size={12} />
                  </button>
                </div>
              ))}
            </div>
            {noteOpen && (
              <input
                className="cam-note"
                autoFocus
                placeholder="Optional note, e.g. “explain briefly”"
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  saveInstruction(e.target.value);
                }}
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
            )}
            <div className="cam-tray-actions">
              <button
                className={`cam-mini ${note ? "on" : ""}`}
                onClick={() => setNoteOpen((o) => !o)}
                aria-label="Add a note for the AI"
                title="Add a note"
              >
                <NoteIcon size={16} />
              </button>
              <button className="btn btn-primary cam-send" disabled={!readyCount} onClick={send}>
                Ask AI{shots.length > 1 ? ` · ${shots.length} photos` : ""}
                <SendIcon size={18} />
              </button>
            </div>
          </div>
        )}

        <div className="cam-controls">
          <button className="cam-side" onClick={() => setSheet("history")} aria-label="Previous answers">
            {latest?.images[0] ? <img src={latest.images[0]} alt="" /> : <HistoryIcon size={22} />}
            {answers.length > 0 && <span className="cam-badge">{answers.length}</span>}
          </button>

          <button
            className="cam-shutter"
            disabled={!stage}
            onClick={capture}
            aria-label={shots.length ? "Take another photo" : "Take a photo"}
          >
            <span />
          </button>

          {live.camOn ? (
            <div className="cam-side-stack">
              <button className="cam-side" onClick={() => run(live.flipCamera, "Couldn't switch camera")} aria-label="Flip camera">
                <FlipIcon size={22} />
              </button>
              <button className="cam-live-off" onClick={() => run(live.toggleCamera, "Couldn't stop camera")}>
                Stop live
              </button>
            </div>
          ) : !stage ? (
            <span />
          ) : (
            <button
              className="cam-side"
              disabled={!connected}
              onClick={() => run(live.toggleCamera, "Couldn't start camera")}
              aria-label="Go live with your camera"
            >
              <CameraIcon size={22} />
              <span className="cam-side-label">Go live</span>
            </button>
          )}
        </div>
        <p className="cam-hint">
          {stage
            ? shots.length
              ? "Add more photos of the same question, or tap Ask AI"
              : "Tap the shutter to snap the question"
            : " "}
        </p>
      </div>

      {/* sheets */}
      {sheet && (
        <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="drawer" role="dialog" aria-modal>
            <div className="drawer-grab" />
            <div className="drawer-head">
              <h2>{sheet === "people" ? "People" : "Answers"}</h2>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setSheet(null)} aria-label="Close">
                <CloseIcon />
              </button>
            </div>

            {sheet === "people" ? (
              <>
                <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
                  {isCreator
                    ? "You created this room. You choose the host, and there is only one at a time."
                    : hostName
                      ? `${hostName} is hosting. The room creator decides who hosts.`
                      : "The room creator decides who hosts."}
                </p>
                <ul className="people">
                  {people.map((p) => {
                    const pHost = p.identity === meta?.host;
                    const pCreator = p.identity === meta?.creator;
                    const sub = [pHost && "Host", pCreator && "Creator", p.camOn && "Live", p.screenOn && "Sharing screen"]
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
                            <button className="btn btn-ghost btn-sm" onClick={() => run(() => live.setHost(p.identity), "Couldn't change host")}>
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
                <button className="btn btn-ghost" style={{ width: "100%", marginTop: 16 }} onClick={() => copy(inviteUrl, "invite")}>
                  {copied === "invite" ? <CheckIcon size={16} /> : <LinkIcon size={16} />}
                  {copied === "invite" ? "Invite link copied" : "Copy invite link"}
                </button>
              </>
            ) : answers.length === 0 ? (
              <div className="empty-answers">
                <h3>No answers yet</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Snap one or more photos of a question, then tap Ask AI.
                </p>
              </div>
            ) : (
              <ul className="answer-list">
                {answers.map((a) => (
                  <li className="answer-item" key={a.id}>
                    <div className="answer-thumb">
                      {a.images[0] && <img src={a.images[0]} alt="" />}
                      {a.images.length > 1 && <span className="cam-badge">{a.images.length}</span>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="answer-item-text" style={a.status === "error" ? { color: "var(--danger)" } : undefined}>
                        {a.status === "done" ? <AnswerText text={a.text!} /> : a.status === "error" ? a.error : "Working…"}
                      </div>
                      <div className="answer-item-meta">
                        {a.from} · {new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {a.status === "done" ? ` · ${metaLine(a)}` : ""}
                        {a.note ? ` · Note: ${a.note}` : ""}
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
          </div>
        </div>
      )}

      {keysOpen && (
        <KeysModal
          onClose={() => {
            setKeysOpen(false);
            setKeyCount(getKeys().filter((k) => k.apiKey && k.enabled !== false).length);
          }}
        />
      )}
      {toast && <div className="toast cam-toast">{toast}</div>}
    </div>
  );
}
