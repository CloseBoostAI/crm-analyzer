"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { useTheme } from "next-themes"
import { createClient } from "@/lib/supabase/client"
import { loadUserSettings, saveUserSettings } from "@/lib/supabase/data"
import { DEFAULT_DEAL_STAGE_KEYS } from "@/lib/utils"

// ── Deals Column Settings ──

export type DealsColumnKey =
  | "dealName"
  | "company"
  | "contact"
  | "email"
  | "dealStage"
  | "dealOwner"
  | "amount"
  | "lastActivity"
  | "notes"
  | "actions"

export const DEALS_COLUMNS: { key: DealsColumnKey; label: string; required?: boolean }[] = [
  { key: "dealName", label: "Deal Name" },
  { key: "company", label: "Company" },
  { key: "contact", label: "Contact" },
  { key: "email", label: "Email" },
  { key: "dealStage", label: "Deal Stage" },
  { key: "dealOwner", label: "Deal Owner" },
  { key: "amount", label: "Amount" },
  { key: "lastActivity", label: "Last Activity" },
  { key: "notes", label: "Notes" },
  { key: "actions", label: "Actions", required: true },
]

const DEFAULT_COLUMN_ORDER: DealsColumnKey[] = [
  "dealName", "company", "contact", "email", "dealStage", "dealOwner", "amount", "lastActivity", "notes", "actions",
]

// ── Profile / Company Setup ──

// ── Email Settings ──

// ── Task Settings ──

export type TaskSortBy = "dueDate" | "status"
export type TasksLayout = "topBottom" | "sideBySide"

// ── Appearance Settings ──

export type ThemeMode = "light" | "dark" | "system"
export type BackgroundMode = "plain" | "graph" | "lined"

// ── Combined Settings Type ──

export type DealsSortMode = "custom"

type Settings = {
  dealsColumns: Record<DealsColumnKey, boolean>
  dealsColumnOrder: DealsColumnKey[]
  dealsOverview: {
    hideClosedDeals: boolean
    horizontalScroll: boolean
    /** Ordered list of deal stage keys the user has selected */
    dealStages: string[]
  }
  dealsSortMode: DealsSortMode
  customDealOrder: string[]
  profile: {
    name: string
    companyName: string
  }
  email: {
    signature: string
  }
  tasks: {
    sortBy: TaskSortBy
    showCompleted: boolean
    layout: TasksLayout
  }
  appearance: {
    theme: ThemeMode
    background: BackgroundMode
  }
  statistics: {
    showPercentage: boolean
  }
}

const DEFAULT_SETTINGS: Settings = {
  dealsColumns: {
    dealName: true,
    company: true,
    contact: true,
    email: false,
    dealStage: true,
    dealOwner: false,
    amount: true,
    lastActivity: true,
    notes: true,
    actions: true,
  },
  dealsColumnOrder: [...DEFAULT_COLUMN_ORDER],
  dealsOverview: {
    hideClosedDeals: false,
    horizontalScroll: false,
    dealStages: [...DEFAULT_DEAL_STAGE_KEYS],
  },
  dealsSortMode: "custom",
  customDealOrder: [],
  profile: {
    name: "",
    companyName: "",
  },
  email: {
    signature: "",
  },
  tasks: {
    sortBy: "dueDate",
    showCompleted: true,
    layout: "topBottom",
  },
  appearance: {
    theme: "light",
    background: "graph",
  },
  statistics: {
    showPercentage: true,
  },
}

const STORAGE_KEY = "closeboost-settings"

function mergeWithDefaults(parsed: Record<string, unknown>): Settings {
  let order = parsed.dealsColumnOrder as DealsColumnKey[] | undefined
  if (!order || !Array.isArray(order)) {
    order = [...DEFAULT_COLUMN_ORDER]
  } else {
    const missing = DEFAULT_COLUMN_ORDER.filter((k) => !order!.includes(k))
    const extra = order.filter((k) => !DEFAULT_COLUMN_ORDER.includes(k))
    order = [...order.filter((k) => !extra.includes(k)), ...missing]
  }
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    dealsColumns: { ...DEFAULT_SETTINGS.dealsColumns, ...(parsed.dealsColumns as Record<string, boolean>) },
    dealsColumnOrder: order,
    dealsOverview: {
      ...DEFAULT_SETTINGS.dealsOverview,
      ...(parsed.dealsOverview as object),
      dealStages: [...DEFAULT_DEAL_STAGE_KEYS],
    },
    profile: { ...DEFAULT_SETTINGS.profile, ...(parsed.profile as object) },
    email: { ...DEFAULT_SETTINGS.email, ...(parsed.email as object) },
    tasks: { ...DEFAULT_SETTINGS.tasks, ...(parsed.tasks as object) },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...(parsed.appearance as object) },
    statistics: { ...DEFAULT_SETTINGS.statistics, ...(parsed.statistics as object) },
  }
}

type SettingsContextType = {
  settings: Settings
  orderedDealsColumns: { key: DealsColumnKey; label: string; required?: boolean }[]
  updateDealsColumn: (key: DealsColumnKey, visible: boolean) => void
  reorderDealsColumns: (order: DealsColumnKey[]) => void
  resetDealsColumns: () => void
  updateDealsOverview: (updates: Partial<Settings["dealsOverview"]>) => void
  setCustomDealOrder: (order: string[]) => void
  updateProfile: (updates: Partial<Settings["profile"]>) => void
  updateEmailSettings: (updates: Partial<Settings["email"]>) => void
  updateTaskSettings: (updates: Partial<Settings["tasks"]>) => void
  updateAppearance: (updates: Partial<Settings["appearance"]>) => void
  updateStatistics: (updates: Partial<Settings["statistics"]>) => void
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

function loadSettingsFromStorage(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULT_SETTINGS
    const parsed = JSON.parse(stored) as Record<string, unknown>
    return mergeWithDefaults(parsed)
  } catch {
    return DEFAULT_SETTINGS
  }
}

function settingsToJson(settings: Settings): Record<string, unknown> {
  return {
    dealsColumns: settings.dealsColumns,
    dealsColumnOrder: settings.dealsColumnOrder,
    dealsOverview: settings.dealsOverview,
    dealsSortMode: settings.dealsSortMode,
    customDealOrder: settings.customDealOrder,
    profile: settings.profile,
    email: settings.email,
    tasks: settings.tasks,
    appearance: settings.appearance,
    statistics: settings.statistics,
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { setTheme } = useTheme()
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [mounted, setMounted] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  const loadSettings = useCallback(async () => {
    try {
      const remote = await loadUserSettings()
      if (remote !== null) {
        const merged = mergeWithDefaults(remote)
        setSettings(merged)
        setIsAuthenticated(true)
        // One-time migration: if Supabase was empty but localStorage had legacy data, persist it
        const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null
        if (stored && Object.keys(remote).length === 0) {
          try {
            const legacy = JSON.parse(stored) as Record<string, unknown>
            await saveUserSettings(legacy)
            setSettings(mergeWithDefaults(legacy))
            localStorage.removeItem(STORAGE_KEY)
          } catch { /* ignore */ }
        }
        return
      }
    } catch { /* not authenticated or error */ }
    setIsAuthenticated(false)
    setSettings(loadSettingsFromStorage())
  }, [])

  useEffect(() => {
    loadSettings().finally(() => setMounted(true))
  }, [loadSettings])

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user)
      if (session?.user) {
        loadSettings()
      } else {
        setSettings(loadSettingsFromStorage())
      }
    })
    return () => subscription.unsubscribe()
  }, [loadSettings])

  useEffect(() => {
    if (!mounted || isAuthenticated === null) return
    if (isAuthenticated) {
      const timer = setTimeout(() => {
        saveUserSettings(settingsToJson(settings)).catch(() => { /* ignore save errors */ })
      }, 300)
      return () => clearTimeout(timer)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    }
  }, [settings, mounted, isAuthenticated])

  // Sync theme to next-themes when settings load from Supabase (cross-device)
  useEffect(() => {
    if (mounted && settings.appearance.theme) {
      setTheme(settings.appearance.theme)
    }
  }, [mounted, settings.appearance.theme, setTheme])

  const updateDealsColumn = (key: DealsColumnKey, visible: boolean) => {
    setSettings((prev) => ({
      ...prev,
      dealsColumns: { ...prev.dealsColumns, [key]: visible },
    }))
  }

  const reorderDealsColumns = (order: DealsColumnKey[]) => {
    setSettings((prev) => ({ ...prev, dealsColumnOrder: order }))
  }

  const resetDealsColumns = () => {
    setSettings((prev) => ({
      ...prev,
      dealsColumns: { ...DEFAULT_SETTINGS.dealsColumns },
      dealsColumnOrder: [...DEFAULT_COLUMN_ORDER],
    }))
  }

  const updateDealsOverview = (updates: Partial<Settings["dealsOverview"]>) => {
    setSettings((prev) => ({
      ...prev,
      dealsOverview: { ...prev.dealsOverview, ...updates },
    }))
  }

  const setCustomDealOrder = (order: string[]) => {
    setSettings((prev) => ({ ...prev, customDealOrder: order }))
  }

  const updateProfile = (updates: Partial<Settings["profile"]>) => {
    setSettings((prev) => ({
      ...prev,
      profile: { ...prev.profile, ...updates },
    }))
  }

  const updateEmailSettings = (updates: Partial<Settings["email"]>) => {
    setSettings((prev) => ({
      ...prev,
      email: { ...prev.email, ...updates },
    }))
  }

  const updateTaskSettings = (updates: Partial<Settings["tasks"]>) => {
    setSettings((prev) => ({
      ...prev,
      tasks: { ...prev.tasks, ...updates },
    }))
  }

  const updateAppearance = (updates: Partial<Settings["appearance"]>) => {
    setSettings((prev) => ({
      ...prev,
      appearance: { ...prev.appearance, ...updates },
    }))
  }

  const updateStatistics = (updates: Partial<Settings["statistics"]>) => {
    setSettings((prev) => ({
      ...prev,
      statistics: { ...prev.statistics, ...updates },
    }))
  }

  const orderedDealsColumns = settings.dealsColumnOrder
    .map((key) => DEALS_COLUMNS.find((c) => c.key === key)!)
    .filter(Boolean)

  return (
    <SettingsContext.Provider
      value={{
        settings,
        orderedDealsColumns,
        updateDealsColumn,
        reorderDealsColumns,
        resetDealsColumns,
        updateDealsOverview,
        setCustomDealOrder,
        updateProfile,
        updateEmailSettings,
        updateTaskSettings,
        updateAppearance,
        updateStatistics,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider")
  return ctx
}
