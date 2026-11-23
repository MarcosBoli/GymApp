import { describe, expect, it } from 'vitest'
import { parseChatMarkdown, parseInline } from './chatMarkdown'

const t = (text: string) => ({ text, bold: false })
const b = (text: string) => ({ text, bold: true })

describe('parseInline', () => {
  it('negritas', () => {
    expect(parseInline('Mantén **la espalda neutra** y **respira**.')).toEqual([t('Mantén '), b('la espalda neutra'), t(' y '), b('respira'), t('.')])
  })
  it('** sin cerrar (streaming) queda como texto', () => {
    expect(parseInline('Clave: **la esc')).toEqual([t('Clave: **la esc')])
  })
  it('sin HTML: el texto se conserva literal', () => {
    expect(parseInline('<b>x</b>')).toEqual([t('<b>x</b>')])
  })
})

describe('parseChatMarkdown', () => {
  it('párrafos, listas con viñetas y numeradas', () => {
    const md = 'Así se hace:\nsin prisa\n\n1. Pies firmes\n2) **Baja** controlando\n\n- Codos a 45°\n* Glúteos en el banco\n\nListo.'
    expect(parseChatMarkdown(md)).toEqual([
      { type: 'p', lines: [[t('Así se hace:')], [t('sin prisa')]] },
      { type: 'ol', items: [[t('Pies firmes')], [b('Baja'), t(' controlando')]] },
      { type: 'ul', items: [[t('Codos a 45°')], [t('Glúteos en el banco')]] },
      { type: 'p', lines: [[t('Listo.')]] },
    ])
  })

  it('lista justo después de un párrafo (sin línea en blanco) y títulos como texto', () => {
    expect(parseChatMarkdown('## Técnica\nPasos:\n- uno')).toEqual([
      { type: 'p', lines: [[t('Técnica')], [t('Pasos:')]] },
      { type: 'ul', items: [[t('uno')]] },
    ])
  })

  it('vacío', () => {
    expect(parseChatMarkdown('')).toEqual([])
    expect(parseChatMarkdown('\n\n')).toEqual([])
  })
})
