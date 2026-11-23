/**
 * Markdown mínimo de las respuestas del coach: párrafos, listas ("- ", "* ", "1. ")
 * y **negrita**. Cualquier otra cosa se muestra como texto (nunca HTML).
 */

export interface Inline {
  text: string
  bold: boolean
}

export type ChatBlock = { type: 'p'; lines: Inline[][] } | { type: 'ul' | 'ol'; items: Inline[][] }

/** Trozos con y sin negrita. Un ** sin cerrar (p. ej. a mitad del streaming) se muestra tal cual. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false })
    out.push({ text: m[1]!, bold: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false })
  return out
}

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/
// Títulos de markdown: se muestran como texto normal (sin los #)
const HEADING = /^\s*#{1,6}\s+/

export function parseChatMarkdown(text: string): ChatBlock[] {
  const blocks: ChatBlock[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(HEADING, '').trimEnd()
    // Línea en blanco: cierra el bloque en curso
    if (!line.trim()) {
      if (blocks.at(-1) !== BREAK) blocks.push(BREAK)
      continue
    }
    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    const kind = bullet ? 'ul' : numbered ? 'ol' : 'p'
    const inline = parseInline((bullet ?? numbered)?.[1] ?? line.trim())
    const last = blocks.at(-1)
    if (last && last !== BREAK && last.type === kind) {
      if (last.type === 'p') last.lines.push(inline)
      else last.items.push(inline)
    } else {
      blocks.push(kind === 'p' ? { type: 'p', lines: [inline] } : { type: kind, items: [inline] })
    }
  }
  return blocks.filter((b) => b !== BREAK)
}

/** Separador interno entre bloques (no se devuelve). */
const BREAK: ChatBlock = { type: 'p', lines: [] }
