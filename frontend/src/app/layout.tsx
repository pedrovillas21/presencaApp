import type { Metadata } from 'next'
import { DM_Sans, Syne } from 'next/font/google'
import './globals.css'

// Syne carrega os títulos; DM Sans, todo o resto (ver DESIGN.md dos exemplos).
const syne = Syne({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-syne',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Registro de presença',
  description: 'Registre sua presença no evento',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`h-full antialiased ${syne.variable} ${dmSans.variable}`}>
      <head>
        {/*
          Material Symbols é fonte de ícones variável — next/font não a cobre.
          display=block (e não swap) porque o fallback renderizaria o nome cru
          do ícone, tipo "event_available", no meio do layout.
        */}
        {/* eslint-disable-next-line @next/next/google-font-display, @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body className="flex min-h-full flex-col bg-background text-on-surface">{children}</body>
    </html>
  )
}
