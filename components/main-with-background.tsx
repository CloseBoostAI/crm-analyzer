'use client'

import { useSettings } from '@/lib/settings-context'

export function MainWithBackground({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings()
  const background = settings.appearance.background ?? 'graph'
  const bgClass = background === 'graph' ? 'bg-grid-pattern' : background === 'lined' ? 'bg-lined-pattern' : ''
  return (
    <main className={`min-h-screen ${bgClass}`}>
      {children}
    </main>
  )
}
