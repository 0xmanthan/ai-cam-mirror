/* Illustrations built from real UI pieces, so they always match the product. */

export function QuestionSheet({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`sheet ${compact ? "sheet-compact" : ""}`}>
      <div className="sheet-head">
        <span>Biology · Unit 3</span>
        <span>Page 2</span>
      </div>
      <p className="sheet-q">
        <b>7.</b> Which organelle is known as the <u>powerhouse</u> of the cell?
      </p>
      <ol className="sheet-opts">
        <li>(A) Nucleus</li>
        <li>(B) Mitochondria</li>
        <li>(C) Ribosome</li>
        <li>(D) Golgi body</li>
      </ol>
      <p className="sheet-q sheet-q2">
        <b>8.</b> Name the process by which plants make food using sunlight.
      </p>
      <div className="sheet-lines">
        <i />
        <i />
      </div>
    </div>
  );
}

export function Phone() {
  return (
    <div className="phone" aria-hidden>
      <div className="phone-screen">
        <div className="desk">
          <QuestionSheet />
        </div>
        <div className="vf vf-tl" />
        <div className="vf vf-tr" />
        <div className="vf vf-bl" />
        <div className="vf vf-br" />
        <div className="phone-top">
          <span className="live-pill">
            <span className="live-dot" /> Live
          </span>
          <span className="phone-room">K7QM2P</span>
        </div>
        <div className="phone-bottom">
          <span className="phone-btn on">Camera on</span>
          <span className="phone-btn">Flip</span>
        </div>
      </div>
    </div>
  );
}

export function RoomWindow() {
  return (
    <div className="window" aria-hidden>
      <div className="window-bar">
        <span className="dots">
          <i />
          <i />
          <i />
        </span>
        <span className="window-url">ai-cam-mirror.vercel.app/room/K7QM2P</span>
      </div>
      <div className="window-body">
        <div className="mini-stage">
          <div className="desk desk-sm">
            <QuestionSheet compact />
          </div>
          <span className="mini-tag">Rahul · Host</span>
          <span className="mini-ask">
            Ask AI
            <svg className="cursor" width="22" height="22" viewBox="0 0 24 24">
              <path d="M5 3l14 7-6 2-2 6z" fill="#0d1b21" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
        <div className="mini-aside">
          <div className="mini-tabs">
            <b>Answers</b>
            <span>People 4</span>
          </div>
          <div className="mini-answer">
            <span className="mini-eyebrow">Latest · Rahul</span>
            <span className="mini-answer-text">B) Mitochondria</span>
            <span className="mini-meta">Gemini · 1.4s</span>
          </div>
          <div className="mini-old">
            <span>8. Photosynthesis</span>
            <span>False</span>
            <span>42.5 m/s</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroVisual() {
  return (
    <div className="hero-visual">
      <div className="hv-grid">
        <Phone />
        <svg className="hv-link" viewBox="0 0 220 120" preserveAspectRatio="none" aria-hidden>
          <path d="M4 60 C 70 60, 120 20, 216 40" />
        </svg>
        <span className="hv-chip hv-chip-link">Full-res still · 0.6s</span>
        <RoomWindow />
      </div>
      <span className="hv-chip hv-chip-a">No typing</span>
      <span className="hv-chip hv-chip-b">Only the answer</span>
    </div>
  );
}

const TYPES: { kind: string; ask: string; out: string; mono?: boolean }[] = [
  { kind: "Single choice", ask: "Which organelle is the powerhouse of the cell?", out: "B) Mitochondria" },
  { kind: "Select all", ask: "Select all even numbers: 2, 5, 6, 8, 9", out: "A) 2, C) 6, D) 8" },
  { kind: "Numerical", ask: "A car covers 170 m in 4 s. Find its speed.", out: "42.5 m/s" },
  { kind: "True / False", ask: "Sound travels faster in air than in water.", out: "False" },
  { kind: "Code", ask: "Write a function that reverses a string.", out: "def rev(s): return s[::-1]", mono: true },
  { kind: "Match", ask: "Match the scientists to their laws.", out: "1-C, 2-A, 3-D, 4-B" },
];

export function TypesVisual() {
  return (
    <div className="types">
      {TYPES.map((t) => (
        <div className="type-row" key={t.kind}>
          <span className="type-kind">{t.kind}</span>
          <span className="type-ask">{t.ask}</span>
          <span className={`type-out ${t.mono ? "mono-out" : ""}`}>{t.out}</span>
        </div>
      ))}
    </div>
  );
}

export function RouterVisual() {
  return (
    <div className="router" aria-hidden>
      <div className="key-card dim">
        <span className="key-n">1.</span>
        <div>
          <b>Google Gemini</b>
          <span className="key-mask">AIza••••••••3fQ</span>
        </div>
        <span className="key-status bad">429 · rate limited</span>
      </div>
      <div className="router-arrow">falls through to the next key</div>
      <div className="key-card win">
        <span className="key-n">2.</span>
        <div>
          <b>OpenRouter</b>
          <span className="key-mask">sk-or-••••••••a91</span>
        </div>
        <span className="key-status good">Answered · 1.2s</span>
      </div>
      <div className="key-card ghost">
        <span className="key-n">3.</span>
        <div>
          <b>Anthropic</b>
          <span className="key-mask">sk-ant-••••••••7Lc</span>
        </div>
        <span className="key-status">Standby</span>
      </div>
    </div>
  );
}

export function SharpVisual() {
  return (
    <div className="sharp" aria-hidden>
      <figure>
        <div className="sharp-crop blurred">
          <QuestionSheet compact />
        </div>
        <figcaption>What a video stream looks like</figcaption>
      </figure>
      <figure>
        <div className="sharp-crop">
          <QuestionSheet compact />
        </div>
        <figcaption>
          <b>What the AI reads:</b> a 1080p still taken on the phone
        </figcaption>
      </figure>
    </div>
  );
}

export function PeopleVisual() {
  const people = [
    { n: "Priya", s: "Creator", host: false, action: "Make host" },
    { n: "Rahul", s: "Host · Camera live", host: true },
    { n: "Sana", s: "Watching", host: false, action: "Make host" },
  ];
  return (
    <div className="people-vis" aria-hidden>
      {people.map((p) => (
        <div className="pv-row" key={p.n}>
          <span className={`avatar ${p.host ? "host" : ""}`}>{p.n[0]}</span>
          <div className="person-main">
            <div className="person-name">{p.n}</div>
            <div className="person-sub">{p.s}</div>
          </div>
          {p.action && <span className="pv-btn">{p.action}</span>}
        </div>
      ))}
    </div>
  );
}
