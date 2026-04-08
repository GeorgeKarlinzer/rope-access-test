import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { BuildingStatus } from '../app/types'
import { repo } from '../app/repo'
import { formatCardDate } from '../app/utils'

type ListTone = 'success' | 'danger' | 'neutral'

function buildingTone(name: string): ListTone {
  if (name.toLowerCase().includes('nexus')) return 'danger'
  if (name.toLowerCase().includes('industrial')) return 'neutral'
  return 'success'
}

function buildingLabel(tone: ListTone): string {
  if (tone === 'danger') return 'URGENT REVIEW'
  if (tone === 'neutral') return 'PENDING'
  return 'IN PROGRESS'
}

export function BuildingsPage() {
  const nav = useNavigate()
  const [tab, setTab] = useState<BuildingStatus>('active')
  const [query, setQuery] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [buildings, setBuildings] = useState<ReturnType<typeof repo.listBuildings> extends Promise<infer T> ? T : never>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!filterOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setFilterOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filterOpen])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setErr(null)
    repo
      .listBuildings({ status: tab, query })
      .then((res) => {
        if (!alive) return
        setBuildings(res)
      })
      .catch((e) => {
        if (!alive) return
        setErr(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [query, tab])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return buildings.filter((b) => {
      if (!q) return true
      const hay = `${b.name} ${b.location ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [buildings, query])

  return (
    <div className="page">
      <h1 className="page-title">Buildings</h1>
      <p className="page-subtitle">Manage and track structural assessments</p>

      <div className="search-row">
        <div className="search">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by building name or address"
            aria-label="Search"
          />
        </div>
        <div className="filter-anchor">
          <button
            className="filter-btn"
            type="button"
            aria-label="Filter"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((v) => !v)}
          >
            <FilterIcon />
          </button>

          {filterOpen && (
            <>
              <div
                className="filter-backdrop"
                role="presentation"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setFilterOpen(false)
                }}
              />
              <div className="filter-menu" role="menu" aria-label="Building status filter">
                <button
                  className="filter-item"
                  type="button"
                  data-active={tab === 'active'}
                  onClick={() => {
                    setTab('active')
                    setFilterOpen(false)
                  }}
                >
                  Active
                </button>
                <button
                  className="filter-item"
                  type="button"
                  data-active={tab === 'completed'}
                  onClick={() => {
                    setTab('completed')
                    setFilterOpen(false)
                  }}
                >
                  Completed
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="cards" role="list">
        {loading && (
          <div style={{ padding: 14, color: 'rgba(15, 23, 42, 0.65)', fontSize: 14 }}>Loading…</div>
        )}
        {err && (
          <div style={{ padding: 14, color: 'rgba(185, 28, 28, 0.9)', fontSize: 14 }}>
            {err}
          </div>
        )}
        {!loading && !err && filtered.length === 0 && (
          <div
            className="card"
            role="listitem"
            style={{
              gridTemplateColumns: '1fr',
              textAlign: 'left',
            }}
          >
            <div className="meta">
              <h3 className="card-title" style={{ whiteSpace: 'normal' }}>
                {query.trim()
                  ? 'No matching buildings'
                  : tab === 'completed'
                    ? 'No completed buildings yet'
                    : 'No buildings yet'}
              </h3>
              <div className="card-sub" style={{ whiteSpace: 'normal' }}>
                {query.trim()
                  ? 'Try a different search term or clear filters.'
                  : tab === 'completed'
                    ? 'Mark buildings as completed to see them here.'
                    : 'Create your first building to start tagging issues, anchor points, and cleaning photos.'}
              </div>
              {(!query.trim() && tab !== 'completed') && (
                <div className="card-date" style={{ marginTop: 8 }}>
                  Use the <b>+</b> button to create one.
                </div>
              )}
            </div>
          </div>
        )}
        {filtered.map((b) => {
          const tone = buildingTone(b.name)
          return (
            <Link to={`/buildings/${b.id}`} key={b.id} className="card" role="listitem">
              <div className="thumb" aria-hidden="true">
                <img alt="" src={b.mainPhotoDataUrl} />
              </div>
              <div className="meta">
                <span className="pill" data-tone={tone}>
                  <span className="bar" />
                  {buildingLabel(tone)}
                </span>
                <h3 className="card-title">{b.name}</h3>
                <div className="card-sub">{b.location ?? '—'}</div>
                <div className="card-date">{formatCardDate(b.createdAt)}</div>
              </div>
              <span className="chev" aria-hidden="true">
                <ChevronRightIcon />
              </span>
            </Link>
          )
        })}
      </div>

      <button className="fab" type="button" aria-label="Create building" onClick={() => nav('/buildings/new')}>
        +
      </button>
    </div>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M16.5 16.5L21 21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16M7 12h10M10 18h4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

