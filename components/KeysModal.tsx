"use client";

import { useEffect, useState } from "react";
import type { KeyConfig, ProviderId } from "@/lib/types";
import { getKeys, setKeys } from "@/lib/client/storage";
import { ArrowDownIcon, ArrowUpIcon, CloseIcon } from "./Icons";

const PROVIDERS: { id: KeyConfig["provider"]; label: string }[] = [
  { id: "auto", label: "Detect from key" },
  { id: "gemini", label: "Google Gemini" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
];

const MODEL_HINTS: Record<ProviderId, string[]> = {
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite", "gemini-3-flash-preview", "gemini-3-pro-preview"],
  openrouter: ["google/gemini-2.5-flash", "google/gemini-2.5-pro", "openai/gpt-4.1-mini", "anthropic/claude-sonnet-5-5"],
  openai: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o"],
  anthropic: ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"],
};

function guess(key: string): ProviderId {
  const k = key.trim();
  if (k.startsWith("sk-or-")) return "openrouter";
  if (k.startsWith("sk-ant-")) return "anthropic";
  if (k.startsWith("sk-")) return "openai";
  return "gemini";
}

const blank = (): KeyConfig => ({ id: Math.random().toString(36).slice(2), provider: "auto", apiKey: "", model: "", enabled: true });

export function KeysModal({ onClose }: { onClose: () => void }) {
  const [keys, setLocal] = useState<KeyConfig[]>([]);

  useEffect(() => {
    const k = getKeys();
    setLocal(k.length ? k : [blank()]);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function update(id: string, patch: Partial<KeyConfig>) {
    setLocal((ks) => ks.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  }
  function move(i: number, d: -1 | 1) {
    setLocal((ks) => {
      const n = [...ks];
      const j = i + d;
      if (j < 0 || j >= n.length) return ks;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  }
  function save() {
    setKeys(keys.filter((k) => k.apiKey.trim()));
    onClose();
  }

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal aria-labelledby="keys-title">
        <div className="modal-head">
          <div>
            <h2 id="keys-title">AI keys</h2>
            <p className="muted" style={{ margin: 0 }}>
              Paste one or more keys. They&rsquo;re tried top to bottom, so if one hits a rate limit or fails, the next
              one answers.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {keys.map((k, i) => {
          const provider = k.provider === "auto" ? guess(k.apiKey) : k.provider;
          return (
            <div className="key-row" key={k.id}>
              <div className="key-row-grid">
                <select
                  className="field"
                  value={k.provider}
                  onChange={(e) => update(k.id, { provider: e.target.value as KeyConfig["provider"] })}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <input
                  className="field mono"
                  type="password"
                  placeholder={provider === "gemini" ? "AIza…" : "sk-…"}
                  value={k.apiKey}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => update(k.id, { apiKey: e.target.value })}
                />
                <span className="priority" style={{ alignSelf: "center" }}>
                  {i + 1}.
                </span>
                <input
                  className="field"
                  list={`models-${k.id}`}
                  placeholder={`Model (default ${MODEL_HINTS[provider][0]})`}
                  value={k.model ?? ""}
                  onChange={(e) => update(k.id, { model: e.target.value })}
                />
                <datalist id={`models-${k.id}`}>
                  {MODEL_HINTS[provider].map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              <div className="key-row-foot">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={k.enabled !== false}
                    onChange={(e) => update(k.id, { enabled: e.target.checked })}
                  />
                  Use this key
                  {k.provider === "auto" && k.apiKey && (
                    <span className="faint">· {PROVIDERS.find((p) => p.id === provider)?.label}</span>
                  )}
                </label>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => move(i, -1)} aria-label="Move up">
                    <ArrowUpIcon size={16} />
                  </button>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => move(i, 1)} aria-label="Move down">
                    <ArrowDownIcon size={16} />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm btn-danger"
                    onClick={() => setLocal((ks) => ks.filter((x) => x.id !== k.id))}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        <div className="row" style={{ marginTop: 16, justifyContent: "space-between", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={() => setLocal((ks) => [...ks, blank()])}>
            Add another key
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save keys
          </button>
        </div>

        <div className="notice">
          Keys are saved only in this browser. Each time you ask, the key is sent with the image to this app&rsquo;s
          serverless function, which forwards it to the provider. Nothing is stored on the server. You can get a free
          Gemini key at{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com/apikey
          </a>
          .
        </div>
      </div>
    </div>
  );
}
