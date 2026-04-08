import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { notify, type Toast } from '../app/notify'

export function AppLayout() {
  const nav = useNavigate()
  const loc = useLocation()
  const [toasts, setToasts] = useState<Toast[]>([])
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => notify.subscribe(setToasts), [])
  useEffect(() => {
    if (!menuOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  return (
    <div className="app-shell">
      <div className="app-frame">
        <div className="topbar">
          {loc.pathname !== '/buildings' ? (
            <button className="icon-btn" aria-label="Back" onClick={() => nav('/buildings')}>
              <ChevronLeftIcon />
            </button>
          ) : (
            <div style={{ width: 40, height: 40 }} aria-hidden="true" />
          )}
          <div style={{ fontWeight: 800, fontSize: 14 }}>Vanguard</div>
          <button
            className="icon-btn"
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls="app-drawer"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MenuIcon />
          </button>
        </div>

        {menuOpen && (
          <div
            className="drawer-backdrop"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setMenuOpen(false)
            }}
          >
            <aside className="drawer" id="app-drawer" role="dialog" aria-modal="true" aria-label="Menu">
              <div className="drawer-nav">
                <button
                  className="drawer-item"
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    nav('/buildings')
                  }}
                >
                  Buildings
                </button>
                <button
                  className="drawer-item"
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    nav('/help')
                  }}
                >
                  Help
                </button>
              </div>

              <div className="drawer-bottom">
                <button
                  className="drawer-item"
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    nav('/settings')
                  }}
                >
                  Settings
                </button>
              </div>
            </aside>
          </div>
        )}

        <div className="app-content">
          <Outlet />
        </div>

        {toasts.length > 0 && (
          <div className="toasts" aria-live="polite" aria-relevant="additions text">
            {toasts.map((t) => (
              <div key={t.id} className="toast" data-tone={t.tone ?? 'neutral'}>
                {t.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ChevronLeftIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 7h14M5 12h14M5 17h14"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

