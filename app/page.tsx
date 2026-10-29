import { Launcher } from "@/components/landing/Launcher";
import { HeroVisual, PeopleVisual, RouterVisual, SharpVisual, TypesVisual } from "@/components/landing/Visuals";

const USES = [
  "Multiple choice",
  "Select all that apply",
  "Numericals",
  "True or false",
  "Fill in the blanks",
  "Match the following",
  "Code",
  "Short answers",
  "Diagrams",
  "Whiteboards",
];

const FAQ = [
  {
    q: "Is it really free?",
    a: "Yes. The app runs on Vercel's free tier and video goes through LiveKit's free plan. AI uses your own key, and Gemini keys from Google AI Studio are free.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. Open the link in any modern phone or laptop browser, allow the camera, and you're live.",
  },
  {
    q: "Where does my API key go?",
    a: "It's saved only in your browser. When you tap Ask AI, it's sent with the image to a serverless function that forwards it to the provider. Nothing is stored.",
  },
  {
    q: "Can I get an explanation instead?",
    a: "Yes. Type a note like “explain in two lines” before you tap and the AI follows it. Leave it empty and you get only the answer.",
  },
  {
    q: "Who controls the room?",
    a: "Whoever creates it. The creator chooses the host, and there's only ever one. The host and the creator can remove people.",
  },
];

export default function Home() {
  return (
    <main className="landing">
      <header className="l-nav">
        <a className="wordmark" href="/">
          <span className="wordmark-dot" />
          Mirror
        </a>
        <nav className="l-links">
          <a href="#how">How it works</a>
          <a href="#answers">Answers</a>
          <a href="#faq">FAQ</a>
        </nav>
        <a className="btn btn-dark btn-sm" href="#start">
          Start free
        </a>
      </header>

      <section className="l-hero" id="start">
        <span className="l-pill">
          <span className="l-pill-dot" /> Free · No sign-up · Works on any phone
        </span>
        <h1>
          Point a camera.
          <br />
          <em>Get the answer.</em>
        </h1>
        <p className="l-lede">
          One phone goes live. Everyone in the room can snap the question, even across several shots, and tap{" "}
          <b>Ask AI</b> to get back only the answer. No typing, no fluff.
        </p>
        <Launcher id="hero" />
        <HeroVisual />
      </section>

      <div className="marquee" aria-hidden>
        <div className="marquee-track">
          {[...USES, ...USES].map((u, i) => (
            <span key={i}>
              {u}
              <i>✦</i>
            </span>
          ))}
        </div>
      </div>

      <section className="l-section" id="how">
        <div className="l-head">
          <span className="eyebrow">How it works</span>
          <h2>
            Three taps from <em>question</em> to answer.
          </h2>
        </div>
        <div className="steps3">
          <article className="step-card">
            <div className="step-art">
              <div className="code-art">
                <span className="eyebrow">Room code</span>
                <span className="code-art-code">K7QM2P</span>
                <span className="code-art-link">Copy invite link</span>
              </div>
            </div>
            <span className="step-num">01</span>
            <h3>Open a room</h3>
            <p>Create a room and share the link. Anyone with it can join from their phone or laptop.</p>
          </article>
          <article className="step-card">
            <div className="step-art">
              <div className="live-art">
                <span className="live-pill">
                  <span className="live-dot" /> Live
                </span>
                <div className="live-art-frame" />
                <span className="phone-btn on">Camera on</span>
              </div>
            </div>
            <span className="step-num">02</span>
            <h3>Go live</h3>
            <p>Turn on the camera, back or front, or share a laptop screen. Everyone in the room sees it in real time.</p>
          </article>
          <article className="step-card">
            <div className="step-art">
              <div className="answer-art">
                <span className="btn btn-primary btn-sm">Ask AI</span>
                <div className="mini-answer">
                  <span className="mini-eyebrow">Latest</span>
                  <span className="mini-answer-text">B) Mitochondria</span>
                </div>
              </div>
            </div>
            <span className="step-num">03</span>
            <h3>Snap, then ask</h3>
            <p>Take one photo, or several if the question runs long. Tap Ask AI and get one answer for all of them.</p>
          </article>
        </div>
      </section>

      <section className="l-section split" id="answers">
        <div className="split-text">
          <span className="eyebrow">Only the answer</span>
          <h2>
            It answers. <em>It doesn&rsquo;t lecture.</em>
          </h2>
          <p>
            The prompt is built for each kind of question: the letter for MCQs, every correct option for
            multi-select, the value and unit for numericals, just the code for code. The question is never repeated
            and nothing is explained unless you ask.
          </p>
        </div>
        <TypesVisual />
      </section>

      <section className="l-section split reverse">
        <div className="split-text">
          <span className="eyebrow">Sharp, not blurry</span>
          <h2>
            The AI reads a <em>photo</em>, not a video frame.
          </h2>
          <p>
            Live video gets compressed. So when you tap Ask AI, Mirror asks the broadcaster&rsquo;s phone for a
            full-resolution still and sends that instead. Small print stays readable.
          </p>
        </div>
        <SharpVisual />
      </section>

      <section className="l-section split">
        <div className="split-text">
          <span className="eyebrow">Bring any key</span>
          <h2>
            One key fails. <em>The next one answers.</em>
          </h2>
          <p>
            Add Gemini, OpenRouter, OpenAI or Anthropic keys and put them in order. If one hits a rate limit, Mirror
            moves on to the next automatically. Your keys never leave your browser except to make the request.
          </p>
        </div>
        <RouterVisual />
      </section>

      <section className="l-section split reverse">
        <div className="split-text">
          <span className="eyebrow">One host, your call</span>
          <h2>
            The creator <em>picks the host.</em>
          </h2>
          <p>
            There&rsquo;s exactly one host at a time, and only the person who made the room can hand that role over.
            The host and the creator can remove anyone who shouldn&rsquo;t be there.
          </p>
        </div>
        <PeopleVisual />
      </section>

      <section className="l-section" id="faq">
        <div className="l-head">
          <span className="eyebrow">Questions</span>
          <h2>Good to know</h2>
        </div>
        <div className="faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="l-cta">
        <h2>
          Your next question,
          <br />
          <em>answered in a tap.</em>
        </h2>
        <Launcher id="cta" />
      </section>

      <footer className="l-foot">
        <span className="wordmark" style={{ fontSize: 20 }}>
          <span className="wordmark-dot" />
          Mirror
        </span>
        <span className="faint">Runs on Vercel and LiveKit. Bring your own AI key.</span>
      </footer>
    </main>
  );
}
