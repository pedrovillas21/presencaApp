'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import BrandLogo from '@/components/BrandLogo'
import Icon from '@/components/Icon'
import LogoutButton from '@/components/LogoutButton'

/** Só as rotas que existem de fato — nada de item decorativo que dá 404. */
const NAV = [
  { href: '/admin', icon: 'calendar_today', label: 'Eventos' },
] as const

export default function AdminShell({
  email,
  children,
}: {
  email: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Navegar fecha a gaveta: sem isso ela ficaria por cima da página nova.
  useEffect(() => setDrawerOpen(false), [pathname])

  return (
    <div className="flex min-h-full flex-1">
      {/* Gaveta mobile */}
      {drawerOpen && (
        <button
          aria-label="Fechar menu"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-on-surface/40 backdrop-blur-sm md:hidden"
        />
      )}

      <Sidebar
        pathname={pathname}
        email={email}
        className={`fixed left-0 top-0 z-50 h-screen w-60 transition-transform duration-300 md:translate-x-0 ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      />

      {/* ml-60 = largura da sidebar fixa (240px). */}
      <div className="flex min-w-0 flex-1 flex-col md:ml-60">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border bg-surface/80 px-4 py-4 backdrop-blur-md md:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menu"
              className="rounded-full p-2 text-muted transition-colors hover:bg-surface-container-low md:hidden"
            >
              <Icon name="menu" />
            </button>
            <h2 className="truncate font-display text-headline-md text-primary">
              Gestão de eventos
            </h2>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-label-md text-muted lg:inline">{email}</span>
            <span className="flex size-10 items-center justify-center rounded-full bg-primary-fixed text-label-sm font-bold uppercase text-on-primary-fixed">
              {email.slice(0, 2)}
            </span>
          </div>
        </header>

        <div className="flex-1">{children}</div>
      </div>
    </div>
  )
}

function Sidebar({
  pathname,
  email,
  className = '',
}: {
  pathname: string
  email: string
  className?: string
}) {
  return (
    <nav className={`flex flex-col bg-shell p-6 shadow-xl ${className}`}>
      <div>
        <BrandLogo className="max-w-[175px]" priority />
        <p className="mt-2 text-label-sm uppercase tracking-[0.14em] text-white/65">Painel interno</p>
      </div>

      <div className="mt-8 flex flex-1 flex-col gap-2">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-full px-4 py-3 text-label-md transition-colors ${
                active
                  ? 'bg-secondary-container/10 font-bold text-secondary-fixed'
                  : 'text-surface-variant hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon name={item.icon} filled={active} />
              {item.label}
            </Link>
          )
        })}

        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-full px-4 py-3 text-label-md text-surface-variant transition-colors hover:bg-white/5 hover:text-white"
        >
          <Icon name="open_in_new" />
          Formulário público
        </a>
      </div>

      <div className="mt-auto flex flex-col gap-3 border-t border-white/10 pt-6">
        <p className="truncate px-4 text-label-sm text-surface-variant/60">{email}</p>
        <LogoutButton />
      </div>
    </nav>
  )
}
