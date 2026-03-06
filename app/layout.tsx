import type { Metadata } from 'next'
import './globals.css'
import { Space_Grotesk } from "next/font/google"
import { Toaster } from "sonner"
import Link from 'next/link'
import AuthNav from '@/components/auth-nav'
import { SettingsProvider } from '@/lib/settings-context'
import { ThemeProvider } from '@/components/theme-provider'
import { EnsureOrg } from '@/components/ensure-org'
import { MainWithBackground } from '@/components/main-with-background'

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-heading" })

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'CloseBoostAI',
  description: 'AI-powered CRM Analytics',
  generator: 'v0.dev',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} font-heading`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <nav className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-sm">
            <div className="container mx-auto px-4 py-3 flex items-center justify-between">
              <Link href="/" className="font-heading font-bold text-xl tracking-tight text-foreground hover:text-primary transition-colors">
                CloseBoostAI
              </Link>
              <AuthNav />
            </div>
          </nav>
          <SettingsProvider>
            <MainWithBackground>
              <EnsureOrg />
              {children}
            </MainWithBackground>
          </SettingsProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
