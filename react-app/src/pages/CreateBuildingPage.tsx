import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { repo } from '../app/repo'

export function CreateBuildingPage() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [photo, setPhoto] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const preview = useMemo(() => {
    if (photo) return photo
    return ''
  }, [name, photo])

  function onPickPhoto(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const res = String(reader.result || '')
      if (res.startsWith('data:image/')) setPhoto(res)
    }
    reader.readAsDataURL(file)
  }

  const canSave = name.trim().length > 0 && photo.length > 0

  return (
    <div className="page">
      <h1 className="page-title" style={{ fontSize: 30 }}>
        Create building
      </h1>
      <p className="page-subtitle">Name and a main photo are required</p>

      <div className="form">
        <div className="field">
          <label htmlFor="bld-name">Name</label>
          <input
            id="bld-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Skyline Tower"
          />
        </div>

        <div className="field">
          <label htmlFor="bld-loc">Location (optional)</label>
          <input
            id="bld-loc"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. 101 Financial District, Metro City"
          />
        </div>

        <div className="field">
          <label>Main photo</label>
          <div
            className="photo-picker"
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click()
            }}
          >
            {preview ? (
              <img alt="" src={preview} />
            ) : (
              <div className="upload-hint" aria-label="Upload a photo">
                <span className="material-symbols-outlined" aria-hidden="true">
                  add_photo_alternate
                </span>
                <div className="upload-hint-title">Upload a photo</div>
                <div className="upload-hint-sub">PNG or JPG</div>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.currentTarget.value = ''
              onPickPhoto(f)
            }}
          />
        </div>

        <div className="actions">
          <button className="btn secondary" type="button" onClick={() => nav('/buildings')}>
            Cancel
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={!canSave || saving}
            onClick={async () => {
              try {
                setSaving(true)
                setErr(null)
                const b = await repo.createBuilding({
                  name,
                  location: location.trim() ? location : undefined,
                  mainPhotoDataUrl: photo,
                })
                nav(`/buildings/${b.id}`)
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e))
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {err && <div style={{ marginTop: 10, color: 'rgba(185, 28, 28, 0.9)', fontSize: 14 }}>{err}</div>}
      </div>
    </div>
  )
}

