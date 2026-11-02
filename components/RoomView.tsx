"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Track } from "livekit-client";
import { useLiveRoom, type Feed } from "@/lib/client/useLiveRoom";
import { getEffort, getInstruction, getKeys, setInstruction as saveInstruction, type JoinInfo } from "@/lib/client/storage";
import { shrinkDataUrl, stitchDataUrls } from "@/lib/client/snapshot";
import { canCopyImage, canShareFiles, copyImage, downloadImage, shareImage, shotFileName } from "@/lib/client/share";
import { MAX_SHOTS, type AskResponse } from "@/lib/types";
import { VideoView } from "./VideoView";
import { KeysModal } from "./KeysModal";
import { AnswerText } from "./AnswerText";
import {
  CameraIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  ExpandIcon,
  FlipIcon,
  HistoryIcon,
  ImagesIcon,
  KeyIcon,
  LinkIcon,
  NoteIcon,
  ScreenIcon,
  SendIcon,
  ShareIcon,
  TrashIcon,
  UsersIcon,
} from "./Icons";

type Shot = { id: string; status: "loading" | "ready"; url?: string; from: string };

/** Screenshot mode: stills kept on this device only (memory, gone when you leave). */
type Screenshot = { id: string; url: string; at: number; from: string };
type Mode = "ask" | "shot";
const MAX_SCREENSHOTS = 60;
const MODE_KEY = "acm.mode";

type Answer = {
  id: string;
  from: string;
  at: number;
  status: "loading" | "done" | "error";
  images: string[];
  text?: string;
  error?: string;
  /** per-model errors from the server, for figuring out why it failed */
  detail?: string;
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
  const [sheet, setSheet] = useState<"people" | "history" | "shots" | null>(null);
  const [mode, setMode] = useState<Mode>("ask");
  const [screens, setScreens] = useState<Screenshot[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [clean, setClean] = useState(false);
  const [cleanUi, setCleanUi] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [canCopy, setCanCopy] = useState(false);
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
    setCanShare(canShareFiles());
    setCanCopy(canCopyImage());
    try {
      if (localStorage.getItem(MODE_KEY) === "shot") setMode("shot");
    } catch {}
  }, []);

  const pickMode = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  };

  // Keep the screen awake for long sessions: a sleeping phone drops its broadcast.
  useEffect(() => {
    if (live.status !== "connected" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const grab = async () => {
      try {
        if (document.visibilityState === "visible" && !stopped) lock = await navigator.wakeLock.request("screen");
      } catch {}
    };
    grab();
    document.addEventListener("visibilitychange", grab);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", grab);
      lock?.release().catch(() => {});
    };
  }, [live.status]);

  // Camera-only view: go browser-fullscreen where allowed, and leave the view if the user exits fullscreen.
  useEffect(() => {
    if (!clean) return;
    const el = document.documentElement;
    let wentFull = false;
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      el.requestFullscreen?.().then(() => (wentFull = true)).catch(() => {});
    }
    const onChange = () => {
      if (wentFull && !document.fullscreenElement) setClean(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [clean]);

  // In camera-only view a tap shows the exit button for a few seconds.
  useEffect(() => {
    if (!cleanUi) return;
    const t = setTimeout(() => setCleanUi(false), 3000);
    return () => clearTimeout(t);
  }, [cleanUi]);

  // The little screenshot preview fades after a few seconds, like a phone's.
  useEffect(() => {
    if (!preview) return;
    const t = setTimeout(() => setPreview(null), 5000);
    return () => clearTimeout(t);
  }, [preview]);

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

  /** Screenshot mode: save a sharp still of the stage feed on this device. */
  const screenshot = useCallback(async () => {
    if (!stage) return;
    setFlash((f) => f + 1);
    try {
      const url = await live.snapshot(stage);
      const id = uid();
      setScreens((s) => [{ id, url, at: Date.now(), from: feedLabel(stage) }, ...s].slice(0, MAX_SCREENSHOTS));
      setPreview(id);
    } catch (e) {
      setToast((e as Error).message || "Couldn't take that screenshot");
    }
  }, [stage, live]);

  /** Shutter: add a sharp still of the stage feed to the tray. */
  const capture = useCallback(async () => {
    if (!stage) return;
    if (mode === "shot") return screenshot();
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
  }, [stage, shots.length, live, mode, screenshot]);

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
    const effort = getEffort();
    const ask = async (images: string[], stitched?: number) => {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ images, stitched, instruction, keys, effort }),
      });
      return (await res.json().catch(() => ({ ok: false, error: `Request failed (${res.status})` }))) as AskResponse;
    };
    try {
      // Each photo costs image tokens and upload time, so shrink them whenever there's more than one.
      const images = originals.length > 1 ? await Promise.all(originals.map((u) => shrinkDataUrl(u, 1280))) : originals;
      let j = await ask(images);
      // Some models/keys choke on several images in one request; retry once with them stitched into one picture.
      if (!j.ok && images.length > 1 && !/rate limit|free-tier limit/i.test(j.error)) {
        j = await ask([await stitchDataUrls(images)], images.length);
      }
      if (j.ok) patch(id, { status: "done", text: j.answer, provider: j.provider, model: j.model, ms: j.ms, tokens: j.tokens });
      else patch(id, { status: "error", error: j.error, detail: j.attempts?.map((a) => `${a.model}: ${a.error}`).join("\n") });
    } catch (e) {
      patch(id, { status: "error", error: (e as Error).message || "Something went wrong" });
    } finally {
      sending.current = false;
    }
  }, [shots, note]);

  // Desktop: Space takes a photo, Enter sends, Esc backs out of a full-screen view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (viewing) setViewing(null);
        else if (clean) setClean(false);
        return;
      }
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, button, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (keysOpen || sheet || viewing) return;
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
  }, [capture, send, keysOpen, sheet, viewing, clean]);

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1500);
    } catch {
      setToast("Couldn't copy to the clipboard.");
    }
  }

  async function shareShot(s: Screenshot) {
    const name = shotFileName(join.room, s.at);
    try {
      if (canShare) await shareImage(s.url, name);
      else {
        downloadImage(s.url, name);
        setToast("Saved to your downloads.");
      }
    } catch {
      downloadImage(s.url, name);
      setToast("Sharing isn't available here, so it was saved instead.");
    }
  }

  function saveShot(s: Screenshot) {
    downloadImage(s.url, shotFileName(join.room, s.at));
    setToast("Saved to your downloads.");
  }

  async function copyShot(s: Screenshot) {
    try {
      await copyImage(s.url);
      setCopied(s.id);
      setTimeout(() => setCopied((c) => (c === s.id ? null : c)), 1500);
    } catch {
      setToast("Couldn't copy the image. Try Share or Save.");
    }
  }

  function askAboutShot(s: Screenshot) {
    if (shots.length >= MAX_SHOTS) {
      setToast(`Up to ${MAX_SHOTS} photos per question. Send these first.`);
      return;
    }
    setShots((all) => [...all, { id: uid(), status: "ready", url: s.url, from: s.from }]);
    pickMode("ask");
    setViewing(null);
    setSheet(null);
  }

  function deleteShot(s: Screenshot) {
    setScreens((all) => all.filter((x) => x.id !== s.id));
    setViewing(null);
    if (preview === s.id) setPreview(null);
  }

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${join.room}` : "";
  const latest = answers[0];
  const readyCount = shots.filter((s) => s.status === "ready").length;
  const connected = live.status === "connected";
  const viewed = screens.find((s) => s.id === viewing);
  const previewShot = screens.find((s) => s.id === preview);
  const lightbox = viewed && (
    <div className="ss-view" role="dialog" aria-modal aria-label="Screenshot">
      <div className="ss-view-top">
        <button className="cam-icon" onClick={() => setViewing(null)} aria-label="Close">
          <CloseIcon size={20} />
        </button>
        <span className="ss-view-meta">
          {viewed.from} · {new Date(viewed.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
        <button className="cam-icon" onClick={() => deleteShot(viewed)} aria-label="Delete screenshot">
          <TrashIcon size={19} />
        </button>
      </div>
      <img src={viewed.url} alt="Screenshot" />
      <div className="ss-actions">
        <button className="ss-action primary" onClick={() => shareShot(viewed)}>
          <ShareIcon size={20} />
          {canShare ? "Share" : "Save"}
        </button>
        {canShare && (
          <button className="ss-action" onClick={() => saveShot(viewed)}>
            <DownloadIcon size={20} />
            Save
          </button>
        )}
        {canCopy && (
          <button className="ss-action" onClick={() => copyShot(viewed)}>
            {copied === viewed.id ? <CheckIcon size={20} /> : <CopyIcon size={20} />}
            {copied === viewed.id ? "Copied" : "Copy"}
          </button>
        )}
        <button className="ss-action" onClick={() => askAboutShot(viewed)}>
          <SendIcon size={20} />
          Ask AI
        </button>
      </div>
    </div>
  );

  // Camera-only view: the feed and nothing else. A tap brings back the exit button for a moment.
  if (clean) {
    return (
      <div className="cam cam-clean" onClick={() => setCleanUi(true)}>
        <div className="cam-stage">
          {stage ? <VideoView key={stage.key} track={stage.track} /> : <p className="cam-clean-wait">Waiting for someone to go live…</p>}
        </div>
        {flash > 0 && <div className="cam-flash" key={flash} />}
        <button
          className={`cam-clean-exit ${cleanUi ? "show" : ""}`}
          onClick={(e) => (e.stopPropagation(), setClean(false))}
          aria-label="Exit camera-only view"
        >
          <CloseIcon size={16} />
          Exit camera only
        </button>
      </div>
    );
  }

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
          <button
            className="cam-icon"
            disabled={!stage}
            onClick={() => (setClean(true), setCleanUi(true))}
            aria-label="Camera only view"
            title="Camera only"
          >
            <ExpandIcon size={20} />
          </button>
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

        {previewShot && !shots.length && (
          <div className="ss-peek">
            <button className="ss-peek-img" onClick={() => (setViewing(previewShot.id), setPreview(null))} aria-label="Open screenshot">
              <img src={previewShot.url} alt="" />
            </button>
            <div className="ss-peek-text">
              <strong>Screenshot saved</strong>
              <span>{screens.length} this session · tap to open</span>
            </div>
            <button className="cam-mini" onClick={() => shareShot(previewShot)} aria-label={canShare ? "Share screenshot" : "Save screenshot"}>
              {canShare ? <ShareIcon size={16} /> : <DownloadIcon size={16} />}
            </button>
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

        <div className="cam-modes" role="tablist" aria-label="Shutter mode">
          <button role="tab" aria-selected={mode === "ask"} className={mode === "ask" ? "on" : ""} onClick={() => pickMode("ask")}>
            Ask AI
          </button>
          <button role="tab" aria-selected={mode === "shot"} className={mode === "shot" ? "on" : ""} onClick={() => pickMode("shot")}>
            Screenshot
          </button>
        </div>

        <div className="cam-controls">
          {mode === "shot" ? (
            <button className="cam-side" onClick={() => setSheet("shots")} aria-label="Screenshots">
              {screens[0] ? <img src={screens[0].url} alt="" /> : <ImagesIcon size={22} />}
              {screens.length > 0 && <span className="cam-badge">{screens.length}</span>}
            </button>
          ) : (
            <button className="cam-side" onClick={() => setSheet("history")} aria-label="Previous answers">
              {latest?.images[0] ? <img src={latest.images[0]} alt="" /> : <HistoryIcon size={22} />}
              {answers.length > 0 && <span className="cam-badge">{answers.length}</span>}
            </button>
          )}

          <button
            className={`cam-shutter ${mode === "shot" ? "ss" : ""}`}
            disabled={!stage}
            onClick={capture}
            aria-label={mode === "shot" ? "Take a screenshot" : shots.length ? "Take another photo" : "Take a photo"}
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
          {!stage
            ? " "
            : mode === "shot"
              ? "Tap the shutter to save a screenshot you can share"
              : shots.length
                ? "Add more photos of the same question, or tap Ask AI"
                : "Tap the shutter to snap the question"}
        </p>
      </div>

      {/* sheets */}
      {sheet && (
        <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="drawer" role="dialog" aria-modal>
            <div className="drawer-grab" />
            <div className="drawer-head">
              <h2>{sheet === "people" ? "People" : sheet === "shots" ? "Screenshots" : "Answers"}</h2>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setSheet(null)} aria-label="Close">
                <CloseIcon />
              </button>
            </div>

            {sheet === "shots" ? (
              screens.length === 0 ? (
                <div className="empty-answers">
                  <h3>No screenshots yet</h3>
                  <p className="muted" style={{ margin: 0 }}>
                    In Screenshot mode, each tap of the shutter saves the live view here. They stay on this device until you leave.
                  </p>
                </div>
              ) : (
                <>
                  <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
                    Kept on this device until you leave the room. Tap one to share, save or copy it.
                  </p>
                  <ul className="ss-grid">
                    {screens.map((s) => (
                      <li key={s.id}>
                        <button onClick={() => setViewing(s.id)} aria-label={`Open screenshot from ${s.from}`}>
                          <img src={s.url} alt="" />
                          <span>{new Date(s.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )
            ) : sheet === "people" ? (
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
                      {a.status === "error" && a.detail && <pre className="answer-detail">{a.detail}</pre>}
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
      {lightbox}
      {toast && <div className="toast cam-toast">{toast}</div>}
    </div>
  );
}
