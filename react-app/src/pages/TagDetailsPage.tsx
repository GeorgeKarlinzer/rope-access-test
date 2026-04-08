import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useChrome } from '../components/AppLayout'
import type { Tag, TagPhoto, TagPhotoKind } from '../app/types'
import { repo } from '../app/repo'
import { notify } from '../app/notify'
import { nowIso, uuidV4 } from '../app/utils'

function tagTitle(tag: Tag): string {
  const base =
    tag.type === 'anchor'
      ? 'Anchor point'
      : tag.type === 'cleaning'
        ? 'Cleaning'
        : tag.type === 'issue'
          ? 'Issue'
          : 'Hollow'
  return `${base} • #${tag.seq}`
}

function canSetStatus(tag: Tag): boolean {
  return tag.type === 'anchor' || tag.type === 'cleaning'
}

function statusOptions(tag: Tag): Array<{ value: Tag['status']; label: string }> {
  if (tag.type === 'anchor') {
    return [
      { value: 'beforeCheck', label: 'Before check' },
      { value: 'passedCheck', label: 'Passed check' },
      { value: 'failedCheck', label: "Didn't pass check" },
    ]
  }
  if (tag.type === 'cleaning') {
    return [
      { value: 'beforeCleaning', label: 'Before cleaning' },
      { value: 'afterCleaning', label: 'After cleaning' },
    ]
  }
  return [{ value: 'none', label: '—' }]
}

export function TagDetailsPage() {
  const chrome = useChrome()
  const { buildingId, tagId } = useParams()
  const [building, setBuilding] = useState<Awaited<ReturnType<typeof repo.getBuilding>>>(undefined)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!buildingId) {
      setBuilding(undefined)
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setErr(null)
    repo
      .getBuilding(buildingId)
      .then((b) => {
        if (!alive) return
        setBuilding(b)
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
  }, [buildingId])

  useEffect(() => {
    if (!building) return
    chrome.setTitle(building.name)
    return () => chrome.setTitle('Vanguard')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building?.id])

  const tag = useMemo(() => building?.tags.find((t) => t.id === tagId), [building, tagId])

  const [name, setName] = useState(tag?.name ?? '')
  const [comment, setComment] = useState('')
  const commentRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setName(tag?.name ?? '')
  }, [tag?.id])

  if (!building || !tag) {
    return (
      <div className="page">
        <h1 className="page-title" style={{ fontSize: 28 }}>
          {loading ? 'Loading…' : err ? err : 'Tag not found'}
        </h1>
      </div>
    )
  }

  const b = building
  const t = tag

  function refresh() {
    if (!buildingId) return Promise.resolve()
    return repo
      .getBuilding(buildingId)
      .then((next) => setBuilding(next))
      .catch(() => {})
  }

  function optimisticPatchTag(patch: Partial<Tag>) {
    setBuilding((cur) => {
      if (!cur) return cur
      return {
        ...cur,
        tags: cur.tags.map((x) => (x.id === t.id ? { ...x, ...patch } : x)),
      }
    })
  }

  function commitName() {
    optimisticPatchTag({ name })
    repo
      .updateTag(b.id, t.id, { name })
      .then(refresh)
      .catch(() => {})
  }

  function addComment() {
    const text = comment.trim()
    if (!text) return
    const nextComments = [...t.comments, { id: uuidV4(), createdAt: nowIso(), text }]
    optimisticPatchTag({ comments: nextComments })
    setComment('')
    commentRef.current?.blur()
    repo
      .updateTag(b.id, t.id, {
        comments: nextComments,
      })
      .then(() => {
        notify.push({ message: 'Comment added' })
        return refresh()
      })
      .catch((e) => {
        notify.push({ message: e instanceof Error ? e.message : String(e), tone: 'danger' })
      })
  }

  function addPhoto(file: File | undefined, kind: TagPhotoKind) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const res = String(reader.result || '')
      if (!res.startsWith('data:image/')) return
      const photo: TagPhoto = { id: uuidV4(), createdAt: nowIso(), dataUrl: res, kind }
      const nextPhotos = [...t.photos, photo]
      const patch: Partial<Tag> = { photos: nextPhotos }
      if (t.type === 'cleaning' && kind === 'after') patch.status = 'afterCleaning'
      optimisticPatchTag(patch)
      repo
        .uploadTagPhoto(b.id, t.id, file, kind)
        .then(() => {
          notify.push({ message: 'File uploaded' })
          return refresh()
        })
        .catch((e) => {
          notify.push({ message: e instanceof Error ? e.message : String(e), tone: 'danger' })
        })
    }
    reader.readAsDataURL(file)
  }

  const opts = statusOptions(t)

  const beforePhotos = t.photos.filter((p) => p.kind === 'before')
  const afterPhotos = t.photos.filter((p) => p.kind === 'after')
  const generalPhotos = t.photos.filter((p) => p.kind === 'general')

  return (
    <div className="page">
      <h1 className="page-title" style={{ fontSize: 26 }}>
        {tagTitle(t)}
      </h1>
      <p className="page-subtitle">{b.name}</p>

      <div className="form">
        <div className="field">
          <label htmlFor="tag-name">Name (optional)</label>
          <input
            id="tag-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            placeholder="e.g. North edge"
          />
        </div>

        {canSetStatus(t) && (
          <div className="field">
            <label htmlFor="tag-status">Status</label>
            <select
              id="tag-status"
              value={t.status}
              onChange={(e) => {
                const next = e.target.value as Tag['status']
                optimisticPatchTag({ status: next })
                repo.updateTag(b.id, t.id, { status: next }).then(refresh).catch(() => {})
              }}
              style={{
                width: '100%',
                height: 44,
                borderRadius: 14,
                border: '1px solid rgba(15, 23, 42, 0.12)',
                padding: '0 10px',
                background: 'white',
                fontSize: 14,
              }}
            >
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label>Photos</label>
          {t.type === 'cleaning' ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <CleaningPhotoSection title="Before cleaning" photos={beforePhotos} onPick={(f) => addPhoto(f, 'before')} />
              <CleaningPhotoSection title="After cleaning" photos={afterPhotos} onPick={(f) => addPhoto(f, 'after')} />
            </div>
          ) : (
            <PhotoSection
              title="All photos"
              photos={generalPhotos}
              onPick={(f) => addPhoto(f, 'general')}
            />
          )}
        </div>

        <div className="field">
          <label>Comments</label>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="text"
                ref={commentRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment"
              />
              <button
                className="btn secondary"
                type="button"
                onClick={addComment}
                style={{ width: 120 }}
              >
                Add
              </button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {t.comments.length === 0 ? (
                <div style={{ color: 'rgba(15, 23, 42, 0.55)', fontSize: 13 }}>No comments yet.</div>
              ) : (
                t.comments
                  .slice()
                  .reverse()
                  .map((c) => (
                    <div
                      key={c.id}
                      style={{
                        background: 'rgba(255, 255, 255, 0.7)',
                        border: '1px solid rgba(15, 23, 42, 0.10)',
                        borderRadius: 14,
                        padding: 12,
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 12, color: 'rgba(15,23,42,0.55)' }}>
                        {new Date(c.createdAt).toLocaleString()}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 14 }}>{c.text}</div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PhotoSection(props: {
  title: string
  photos: TagPhoto[]
  onPick: (file: File | undefined) => void
}) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 900, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(15,23,42,0.6)' }}>
          {props.title}
        </div>
        <input type="file" accept="image/*" onChange={(e) => props.onPick(e.target.files?.[0])} />
      </div>
      {props.photos.length === 0 ? (
        <div style={{ color: 'rgba(15,23,42,0.55)', fontSize: 13 }}>No photos yet.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {props.photos
            .slice()
            .reverse()
            .map((p) => (
              <div
                key={p.id}
                style={{
                  borderRadius: 14,
                  overflow: 'hidden',
                  border: '1px solid rgba(15, 23, 42, 0.12)',
                  background: 'white',
                  aspectRatio: '1 / 1',
                }}
              >
                <img alt="" src={p.dataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function CleaningPhotoSection(props: { title: string; photos: TagPhoto[]; onPick: (file: File | undefined) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  function pick() {
    inputRef.current?.click()
  }

  return (
    <div className="cleaning-section">
      <div className="cleaning-header">
        <div className="cleaning-title">{props.title}</div>
        <button className="cleaning-upload" type="button" onClick={pick}>
          <span className="material-symbols-outlined" aria-hidden="true">
            photo_camera
          </span>
          <span>Upload</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.currentTarget.value = ''
            props.onPick(f)
          }}
        />
      </div>

      {props.photos.length === 0 ? (
        <div style={{ color: 'rgba(15, 23, 42, 0.55)', fontSize: 13 }}>No photos yet.</div>
      ) : (
        <div className="cleaning-grid">
          {props.photos
            .slice()
            .reverse()
            .map((p) => (
              <button key={p.id} className="cleaning-tile" type="button" onClick={pick} aria-label="Replace photo">
                <img alt="" src={p.dataUrl} />
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

