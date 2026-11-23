export function EmptyState({ text = 'Próximamente' }: { text?: string }) {
  return (
    <div className="mx-4 rounded-2xl border border-dashed border-border bg-surface/50 px-4 py-12 text-center text-sm text-neutral-500">
      {text}
    </div>
  )
}
