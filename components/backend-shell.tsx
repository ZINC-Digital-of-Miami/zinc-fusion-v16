"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useState } from "react"

const NAV_ITEMS = [
  { label: "DASHBOARD", href: "/dashboard" },
  { label: "STRATEGY", href: "/strategy" },
  { label: "LEGISLATION", href: "/legislation" },
  { label: "SENTIMENT", href: "/sentiment" },
  { label: "VEGAS INTEL", href: "/vegas-intel" },
]

function TopHeader() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header
      className="fixed top-0 w-full z-[1000] border-b border-white/10"
      style={{
        background: "rgba(0, 0, 0, 0.95)",
        backdropFilter: "blur(10px)",
      }}
    >
      <nav
        className="flex w-full items-center justify-between"
        style={{ padding: "20px 40px" }}
      >
        {/* Logo */}
        <Link href="/">
          <Image
            src="/logo-dashboard.svg"
            alt="ZINC Fusion"
            width={400}
            height={80}
            priority
            className="h-auto"
            style={{ maxWidth: 280 }}
          />
        </Link>

        {/* Desktop Nav Links */}
        <ul className="hidden md:flex items-center" style={{ gap: 40, listStyle: "none" }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-white font-semibold transition-opacity duration-300"
                  style={{
                    fontSize: 13,
                    letterSpacing: 0.5,
                    opacity: isActive ? 1 : 0.85,
                    borderBottom: isActive ? "2px solid #ffffff" : "2px solid transparent",
                    paddingBottom: 4,
                  }}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>

        {/* Mobile Hamburger */}
        <button
          className="md:hidden text-white text-2xl"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? "\u2715" : "\u2630"}
        </button>
      </nav>

      {/* Mobile Nav Dropdown */}
      {mobileOpen && (
        <ul
          className="md:hidden flex flex-col border-b border-white/10"
          style={{
            background: "rgba(0, 0, 0, 0.95)",
            backdropFilter: "blur(10px)",
            padding: "16px 40px",
            gap: 16,
            listStyle: "none",
          }}
        >
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-white font-semibold"
                  style={{
                    fontSize: 13,
                    letterSpacing: 0.5,
                    opacity: isActive ? 1 : 0.85,
                  }}
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </header>
  )
}

type BackendShellProps = {
  title?: string
  children: ReactNode
}

export function BackendShell({ children }: BackendShellProps) {
  return (
    <>
      <TopHeader />
      <main
        className="min-h-screen bg-[#0a0a0a] text-slate-200 p-3 pt-24 md:p-6 md:pt-36 pb-20 space-y-8"
      >
        {children}
      </main>
    </>
  )
}
