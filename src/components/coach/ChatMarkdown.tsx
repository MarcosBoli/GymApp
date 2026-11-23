import { Fragment } from 'react'
import { parseChatMarkdown, type Inline } from '../../domain/chatMarkdown'

const Line = ({ parts }: { parts: Inline[] }) => (
  <>
    {parts.map((p, i) => (p.bold ? <strong key={i} className="font-semibold text-zinc-50">{p.text}</strong> : <Fragment key={i}>{p.text}</Fragment>))}
  </>
)

/** Respuesta del coach: párrafos, listas y negrita (nunca HTML del modelo). */
export function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {parseChatMarkdown(text).map((b, i) =>
        b.type === 'p' ? (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Line parts={l} />
              </Fragment>
            ))}
          </p>
        ) : (
          <Fragment key={i}>
            {b.type === 'ul' ? (
              <ul className="list-disc space-y-1 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}><Line parts={it} /></li>
                ))}
              </ul>
            ) : (
              <ol className="list-decimal space-y-1 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}><Line parts={it} /></li>
                ))}
              </ol>
            )}
          </Fragment>
        ),
      )}
    </div>
  )
}
