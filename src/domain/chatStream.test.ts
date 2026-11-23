import { describe, expect, it } from 'vitest'
import { encodeChatEvent, parseChatEvent, splitChatEvents, type ChatStreamEvent } from './chatStream'

describe('protocolo NDJSON del chat', () => {
  const events: ChatStreamEvent[] = [
    { type: 'delta', text: 'Baja la barra\ncontrolando' },
    { type: 'done', model: 'claude-haiku-5-5', truncated: false },
    { type: 'error', error: { code: 'timeout', message: 'Tardó' } },
  ]

  it('codifica una línea por evento y vuelve a leerla igual', () => {
    for (const e of events) {
      const line = encodeChatEvent(e)
      expect(line.endsWith('\n')).toBe(true)
      expect(line.slice(0, -1)).not.toContain('\n') // los saltos del texto van escapados
      expect(parseChatEvent(line)).toEqual(e)
    }
  })

  it('trozos partidos por cualquier sitio', () => {
    const wire = events.map(encodeChatEvent).join('')
    for (const cut of [1, 7, 20, wire.length - 3]) {
      const a = splitChatEvents(wire.slice(0, cut))
      const b = splitChatEvents(a.rest + wire.slice(cut))
      expect([...a.events, ...b.events]).toEqual(events)
      expect(b.rest).toBe('')
    }
  })

  it('ignora líneas vacías, JSON roto y eventos desconocidos', () => {
    expect(splitChatEvents('\n{roto\n{"type":"ping"}\n{"type":"delta","text":"ok"}\n{"type":"de').events).toEqual([{ type: 'delta', text: 'ok' }])
    expect(parseChatEvent('{"type":"delta","text":5}')).toBeNull()
    expect(parseChatEvent('[1]')).toBeNull()
  })

  it('done sin truncated → false; error sin mensaje → vacío', () => {
    expect(parseChatEvent('{"type":"done","model":"m"}')).toEqual({ type: 'done', model: 'm', truncated: false })
    expect(parseChatEvent('{"type":"error","error":{"code":"x"}}')).toEqual({ type: 'error', error: { code: 'x', message: '' } })
  })
})
