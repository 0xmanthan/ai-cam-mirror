/** Renders an answer, turning ``` fenced blocks into <pre>. Everything else is plain text. */
export function AnswerText({ text }: { text: string }) {
  const parts = text.split(/```[a-zA-Z0-9+#-]*\n?([\s\S]*?)```/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <pre key={i}>
            <code>{p.replace(/\n$/, "")}</code>
          </pre>
        ) : (
          p.trim() && <span key={i}>{p.trim()}</span>
        ),
      )}
    </>
  );
}
