import type { ReactNode } from 'react'

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex items-end justify-between px-4 pt-4 pb-3">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {children}
    </header>
  )
}
