import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useChrome } from '../components/AppLayout'
import type { Tag, TagPhoto, TagPhotoKind, TagType } from '../app/types'
import { repo } from '../app/repo'
import { notify } from '../app/notify'
import { nowIso, uuidV4 } from '../app/utils'

type Selected =
  | { kind: 'none' }
  | { kind: 'photo_menu'; x: number; y: number }
  | { kind: 'tag_menu'; tagId: string; x: number; y: number }
  | { kind: 'anchor_status'; tagId: string; x: number; y: number }
  | { kind: 'move_target'; tagId: string; x: number; y: number }

function tagTitle(tag: Tag): string {
  const base =
    tag.type === 'anchor'
      ? 'Anchor point'
      : tag.type === 'cleaning'
        ? 'Cleaning'
        : tag.type === 'issue'
          ? 'Issue'
          : 'Tag'
  return `${base} • #${tag.seq}`
}

function tagTone(tag: Tag): 'grey' | 'green' | 'red' | 'yellow' {
  if (tag.type === 'issue') return 'yellow'
  if (tag.type === 'anchor') {
    if (tag.status === 'passedCheck') return 'green'
    if (tag.status === 'failedCheck') return 'red'
    return 'grey'
  }
  if (tag.type === 'cleaning') {
    if (tag.status === 'afterCleaning') return 'green'
    return 'red'
  }
  return 'grey'
}

function tagGlyph(tag: Tag): string {
  if (tag.type === 'anchor') return 'anchor'
  if (tag.type === 'cleaning') return 'cleaning_services'
  if (tag.type === 'issue') return 'warning'
  return 'help'
}

type Viewport = { scale: number; tx: number; ty: number }

export function BuildingPage() {
  const chrome = useChrome()
  const { buildingId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sel, setSel] = useState<Selected>({ kind: 'none' })
  const [movingTagId, setMovingTagId] = useState<string | null>(null)
  const [detailsTagId, setDetailsTagId] = useState<string | null>(null)
  const [focusCommentTagId, setFocusCommentTagId] = useState<string | null>(null)
  const [commentDialogTagId, setCommentDialogTagId] = useState<string | null>(null)
  const [confirmDeleteTagId, setConfirmDeleteTagId] = useState<string | null>(null)
  const [cleaningPhotoTagId, setCleaningPhotoTagId] = useState<string | null>(null)
  const [cleaningPhotoPick, setCleaningPhotoPick] = useState<{ tagId: string; kind: 'before' | 'after' } | null>(null)
  const [rev, setRev] = useState(0)
  const [building, setBuilding] = useState<Awaited<ReturnType<typeof repo.getBuilding>>>(undefined)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'building' | 'tag'>('building')
  const [downloadingReport, setDownloadingReport] = useState(false)
  const photoRef = useRef<HTMLDivElement | null>(null)
  const [photoSize, setPhotoSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null)
  const [vp, setVp] = useState<Viewport>({ scale: 1, tx: 0, ty: 0 })
  const imgProbeRef = useRef<HTMLImageElement | null>(null)
  const cleaningPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<
    | { kind: 'none' }
    | { kind: 'pan'; startTx: number; startTy: number; startX: number; startY: number }
    | {
        kind: 'pinch'
        startScale: number
        startTx: number
        startTy: number
        startDist: number
        startMidClientX: number
        startMidClientY: number
      }
  >({ kind: 'none' })
  const gestureMoved = useRef(false)
  const gestureMovedAt = useRef(0)
  const wheelMovedAt = useRef(0)
  const lastUrlTagId = useRef<string | null>(null)
  const suppressTap = useRef(false)
  const [drag, setDrag] = useState<{ tagId: string; x: number; y: number } | null>(null)
  const dragSession = useRef<{
    pointerId: number
    tagId: string
    startClientX: number
    startClientY: number
    started: boolean
    timer: number | null
  } | null>(null)
  const lastDragEndAt = useRef(0)
  const lastTapHandledAt = useRef(0)
  const lastSelectedAt = useRef(0)
  const lastSelectedTagId = useRef<string | null>(null)
  const pendingTagIds = useRef(new Set<string>())
  const pendingTagOps = useRef(new Map<string, Array<(realId: string) => Promise<unknown>>>())

  useEffect(() => {
    function onWheel(e: WheelEvent) {
      const host = photoRef.current
      if (!host) return

      e.preventDefault()
      e.stopPropagation()
      wheelMovedAt.current = Date.now()
      setSel({ kind: 'none' })
      setDetailsTagId(null)

      const rect = host.getBoundingClientRect()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top

      setVp((cur) => {
        const factor = Math.exp(-e.deltaY * 0.0015)
        const nextScale = cur.scale * factor

        const clamped = clampViewport({ ...cur, scale: nextScale }, rect.width, rect.height, imgSize)
        const imgX = (localX - cur.tx) / cur.scale
        const imgY = (localY - cur.ty) / cur.scale
        const tx = localX - imgX * clamped.scale
        const ty = localY - imgY * clamped.scale
        return clampViewport({ scale: clamped.scale, tx, ty }, rect.width, rect.height, imgSize)
      })
    }

    const host = photoRef.current
    if (!host) return
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [imgSize])

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
  }, [buildingId, rev])

  const urlTagId = searchParams.get('tag')

  function setUrlTagId(next: string | null) {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (!next) p.delete('tag')
        else p.set('tag', next)
        return p
      },
      { replace: true },
    )
  }

  useEffect(() => {
    if (!building) return
    if (!urlTagId) return
    if (detailsTagId && detailsTagId !== urlTagId) return
    if (lastUrlTagId.current === urlTagId) return
    lastUrlTagId.current = urlTagId
    const t = building.tags.find((x) => x.id === urlTagId)
    if (!t) return
    setSel({ kind: 'tag_menu', tagId: t.id, x: t.x, y: t.y })
    setDetailsTagId(t.id)
  }, [building, urlTagId, detailsTagId])

  useEffect(() => {
    if (!building) return
    chrome.setTitle(building.name)
    return () => chrome.setTitle('Vanguard')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building?.id])

  useEffect(() => {
    const host = photoRef.current
    if (!host) return
    const ro = new ResizeObserver(() => {
      const rect = host.getBoundingClientRect()
      setPhotoSize({ w: rect.width, h: rect.height })
      setVp((cur) => clampViewport({ ...cur }, rect.width, rect.height, imgSize))
    })
    ro.observe(host)
    return () => ro.disconnect()
  }, [imgSize])

  useEffect(() => {
    if (!focusCommentTagId) return
    if (detailsTagId !== focusCommentTagId) return
    const doc = photoRef.current?.ownerDocument ?? document
    const el = doc.getElementById(`tag-comment-${focusCommentTagId}`) as HTMLInputElement | null
    if (!el) return
    requestAnimationFrame(() => {
      el.focus()
    })
    setFocusCommentTagId(null)
  }, [detailsTagId, focusCommentTagId])

  useEffect(() => {
    if (!confirmDeleteTagId) return
    setSel({ kind: 'none' })
  }, [confirmDeleteTagId])

  const coverScale = useMemo(() => {
    if (!imgSize || photoSize.w <= 0 || photoSize.h <= 0) return 1
    const cover = Math.max(photoSize.w / imgSize.w, photoSize.h / imgSize.h)
    const contain = Math.min(photoSize.w / imgSize.w, photoSize.h / imgSize.h)
    if (contain <= 0) return 1
    return cover / contain
  }, [imgSize, photoSize.h, photoSize.w])

  useEffect(() => {
    if (!imgSize) return
    if (photoSize.w <= 0 || photoSize.h <= 0) return
    setVp((cur) => {
      if (cur.scale !== 1 || cur.tx !== 0 || cur.ty !== 0) return cur
      return clampViewport({ scale: 1, tx: 0, ty: 0 }, photoSize.w, photoSize.h, imgSize)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgSize, photoSize.h, photoSize.w])

  const menuTag = useMemo(() => {
    if (!building) return undefined
    if (sel.kind !== 'tag_menu' && sel.kind !== 'anchor_status') return undefined
    return building.tags.find((t) => t.id === sel.tagId)
  }, [building, sel])

  const selectedTagId =
    detailsTagId ??
    (sel.kind === 'tag_menu' || sel.kind === 'anchor_status' ? sel.tagId : null)

  const selectedTag = useMemo(() => {
    if (!building || !selectedTagId) return undefined
    return building.tags.find((t) => t.id === selectedTagId)
  }, [building, selectedTagId])
  const confirmDeleteTag = useMemo(() => {
    if (!building || !confirmDeleteTagId) return undefined
    return building.tags.find((t) => t.id === confirmDeleteTagId)
  }, [building, confirmDeleteTagId])
  // (kept for potential future: tag-specific dialog copy)

  const tagSummary = useMemo(() => {
    const tags = building?.tags ?? []

    let anchorsTotal = 0
    let anchorsPassed = 0
    let anchorsBefore = 0
    let anchorsFailed = 0

    let cleaningTotal = 0
    let cleaningPre = 0
    let cleaningPost = 0

    let issuesTotal = 0

    for (const t of tags) {
      if (t.type === 'anchor') {
        anchorsTotal++
        if (t.status === 'passedCheck') anchorsPassed++
        else if (t.status === 'beforeCheck') anchorsBefore++
        else if (t.status === 'failedCheck') anchorsFailed++
        continue
      }
      if (t.type === 'cleaning') {
        cleaningTotal++
        if (t.status === 'afterCleaning') cleaningPost++
        else cleaningPre++
        continue
      }
      if (t.type === 'issue') {
        issuesTotal++
        continue
      }
    }

    const anchorsPassedRatio = anchorsTotal > 0 ? anchorsPassed / anchorsTotal : 0

    return {
      anchorsTotal,
      anchorsPassed,
      anchorsBefore,
      anchorsFailed,
      anchorsPassedRatio,
      cleaningTotal,
      cleaningPre,
      cleaningPost,
      issuesTotal,
    }
  }, [building?.tags])

  useEffect(() => {
    if (detailsTagId) {
      setActiveTab('tag')
      setUrlTagId(detailsTagId)
    } else {
      setActiveTab('building')
      if (!loading) setUrlTagId(null)
    }
  }, [detailsTagId, loading])

  if (!building) {
    return (
      <div className="page">
        <h1 className="page-title" style={{ fontSize: 28 }}>
          {loading ? 'Loading…' : err ? err : 'Building not found'}
        </h1>
      </div>
    )
  }

  const b = building

  function bump() {
    setRev((r) => r + 1)
  }

  function optimisticMoveTag(tagId: string, x: number, y: number) {
    setBuilding((cur) => {
      if (!cur) return cur
      return {
        ...cur,
        tags: cur.tags.map((t) => (t.id === tagId ? { ...t, x, y } : t)),
      }
    })
  }

  function optimisticPatchTag(tagId: string, patch: Partial<Tag>) {
    setBuilding((cur) => {
      if (!cur) return cur
      return {
        ...cur,
        tags: cur.tags.map((t) => (t.id === tagId ? { ...t, ...patch } : t)),
      }
    })
  }

  function optimisticDeleteTag(tagId: string) {
    setBuilding((cur) => {
      if (!cur) return cur
      return { ...cur, tags: cur.tags.filter((t) => t.id !== tagId) }
    })
  }

  function optimisticCreateTag(input: { type: TagType; x: number; y: number }): string {
    const tempId = uuidV4()
    pendingTagIds.current.add(tempId)
    setBuilding((cur) => {
      if (!cur) return cur
      const nextSeq = (cur.tags.length === 0 ? 0 : Math.max(...cur.tags.map((t) => t.seq))) + 1
      const nextTag: Tag = {
        id: tempId,
        createdAt: nowIso(),
        seq: nextSeq,
        type: input.type,
        name: undefined,
        x: input.x,
        y: input.y,
        status: 'none',
        photos: [],
        comments: [],
      }
      return { ...cur, tags: [...cur.tags, nextTag] }
    })
    return tempId
  }

  function runOrQueueTagOp(tagId: string, op: (id: string) => Promise<unknown>) {
    if (!pendingTagIds.current.has(tagId)) {
      void op(tagId)
      return
    }
    const list = pendingTagOps.current.get(tagId) ?? []
    list.push(op)
    pendingTagOps.current.set(tagId, list)
  }

  function optimisticReplaceTag(tempId: string, real: Tag) {
    setBuilding((cur) => {
      if (!cur) return cur
      return { ...cur, tags: cur.tags.map((t) => (t.id === tempId ? real : t)) }
    })
    pendingTagIds.current.delete(tempId)
    const ops = pendingTagOps.current.get(tempId) ?? []
    pendingTagOps.current.delete(tempId)
    for (const op of ops) void op(real.id)
  }

  function requestDeleteTag(tagId: string) {
    setConfirmDeleteTagId(tagId)
    if (movingTagId === tagId) setMovingTagId(null)
    if (detailsTagId === tagId) setDetailsTagId(null)
    if (
      sel.kind === 'tag_menu' ||
      sel.kind === 'anchor_status'
    ) {
      if (sel.tagId === tagId) setSel({ kind: 'none' })
    }
  }

  function confirmDeleteNow(tagId: string) {
    setConfirmDeleteTagId(null)
    optimisticDeleteTag(tagId)
    runOrQueueTagOp(tagId, (id) => repo.deleteTag(b.id, id).catch(() => bump()))
  }

  function addCommentToTag(tagId: string, text: string) {
    const clean = text.trim()
    if (!clean) return
    const tag = building?.tags.find((t) => t.id === tagId)
    if (!tag) return
    const nextComments = [...tag.comments, { id: uuidV4(), createdAt: nowIso(), text: clean }]
    optimisticPatchTag(tagId, { comments: nextComments })
    runOrQueueTagOp(tagId, (id) =>
      repo
        .updateTag(b.id, id, { comments: nextComments })
        .then(() => notify.push({ message: 'Comment added' }))
        .catch((e) => {
          notify.push({ message: e instanceof Error ? e.message : String(e), tone: 'danger' })
          bump()
        }),
    )
  }

  function containMetrics(w: number, h: number, iw: number, ih: number) {
    const s = Math.min(w / iw, h / ih)
    const dw = iw * s
    const dh = ih * s
    const ox = (w - dw) / 2
    const oy = (h - dh) / 2
    return { dw, dh, ox, oy }
  }

  function clampViewport(next: Viewport, w: number, h: number, image: { w: number; h: number } | null): Viewport {
    const minScale = 1
    const maxScale = Math.max(minScale, 4 * coverScale)
    const scale = Math.min(maxScale, Math.max(minScale, next.scale))
    if (!image || w <= 0 || h <= 0) return { scale, tx: next.tx, ty: next.ty }
    const { dw, dh, ox, oy } = containMetrics(w, h, image.w, image.h)

    const scaledW = dw * scale
    const scaledH = dh * scale

    let tx = next.tx
    let ty = next.ty

    if (scaledW <= w) {
      tx = (w - scaledW) / 2 - ox * scale
    } else {
      const minTx = w - (ox + dw) * scale
      const maxTx = -ox * scale
      tx = Math.min(maxTx, Math.max(minTx, tx))
    }

    if (scaledH <= h) {
      ty = (h - scaledH) / 2 - oy * scale
    } else {
      const minTy = h - (oy + dh) * scale
      const maxTy = -oy * scale
      ty = Math.min(maxTy, Math.max(minTy, ty))
    }

    return { scale, tx, ty }
  }

  function clampScale(nextScale: number): number {
    const minScale = 1
    const maxScale = Math.max(minScale, 4 * coverScale)
    return Math.min(maxScale, Math.max(minScale, nextScale))
  }

  function clamp01(v: number) {
    return Math.min(1, Math.max(0, v))
  }

  function getImagePoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const host = photoRef.current
    if (!host) return null
    const rect = host.getBoundingClientRect()
    const localX = clientX - rect.left
    const localY = clientY - rect.top
    if (!imgSize) return null
    const { dw, dh, ox, oy } = containMetrics(rect.width, rect.height, imgSize.w, imgSize.h)
    const sx = (localX - vp.tx) / vp.scale
    const sy = (localY - vp.ty) / vp.scale
    const nx = (sx - ox) / dw
    const ny = (sy - oy) / dh
    return { x: clamp01(nx), y: clamp01(ny) }
  }

  function onPhotoTap(clientX: number, clientY: number) {
    if (Date.now() - wheelMovedAt.current < 450) return
    if (gestureMoved.current && Date.now() - gestureMovedAt.current < 600) return
    const pt = getImagePoint(clientX, clientY)
    if (!pt) return
    const { x, y } = pt
    if (movingTagId) {
      setSel({ kind: 'move_target', tagId: movingTagId, x, y })
      return
    }
    if (sel.kind !== 'none') {
      setSel({ kind: 'none' })
      setDetailsTagId(null)
      return
    }
    setSel({ kind: 'photo_menu', x, y })
  }

  function pickTagAt(clientX: number, clientY: number): Tag | null {
    const doc = photoRef.current?.ownerDocument ?? document
    const els = doc.elementsFromPoint?.(clientX, clientY) ?? []
    for (const el of els) {
      const e = el as Element
      if (e.closest('.radial')) continue
      const tagEl = e.closest('.tag-dot[data-tag-id]') as HTMLElement | null
      if (!tagEl) continue
      const tagId = tagEl.getAttribute('data-tag-id')
      const tag = tagId ? b.tags.find((t) => t.id === tagId) : undefined
      if (tag) return tag
    }
    return null
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    gestureMoved.current = false
    suppressTap.current = false
    const host = photoRef.current
    if (!host) return
    const target = e.target as Element | null
    if (target?.closest('.radial')) return
    if (target?.closest('.tag-dot')) return
    host.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      gesture.current = { kind: 'pan', startTx: vp.tx, startTy: vp.ty, startX: e.clientX, startY: e.clientY }
    } else if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values())
      const dx = pts[1].x - pts[0].x
      const dy = pts[1].y - pts[0].y
      const dist = Math.hypot(dx, dy) || 1
      const startMidClientX = (pts[0].x + pts[1].x) / 2
      const startMidClientY = (pts[0].y + pts[1].y) / 2
      gesture.current = { kind: 'pinch', startScale: vp.scale, startTx: vp.tx, startTy: vp.ty, startDist: dist, startMidClientX, startMidClientY }
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const host = photoRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()

    if (pointers.current.size === 1 && gesture.current.kind === 'pan') {
      const dx = e.clientX - gesture.current.startX
      const dy = e.clientY - gesture.current.startY
      const startTx = gesture.current.startTx
      const startTy = gesture.current.startTy
      if (!gestureMoved.current && Math.hypot(dx, dy) > 6) {
        gestureMoved.current = true
        gestureMovedAt.current = Date.now()
        suppressTap.current = true
        if (sel.kind !== 'none') setSel({ kind: 'none' })
        if (detailsTagId) setDetailsTagId(null)
      }
      setVp((cur) => clampViewport({ ...cur, tx: startTx + dx, ty: startTy + dy }, photoSize.w, photoSize.h, imgSize))
      return
    }

    if (pointers.current.size === 2 && gesture.current.kind === 'pinch') {
      const pts = Array.from(pointers.current.values())
      const dx = pts[1].x - pts[0].x
      const dy = pts[1].y - pts[0].y
      const dist = Math.hypot(dx, dy) || 1
      const midX = (pts[0].x + pts[1].x) / 2
      const midY = (pts[0].y + pts[1].y) / 2

      const desiredScale = gesture.current.startScale * (dist / gesture.current.startDist)
      const nextScale = clampScale(desiredScale)

      const localMidX = midX - rect.left
      const localMidY = midY - rect.top
      const startLocalMidX = gesture.current.startMidClientX - rect.left
      const startLocalMidY = gesture.current.startMidClientY - rect.top
      const imgMidX = (startLocalMidX - gesture.current.startTx) / gesture.current.startScale
      const imgMidY = (startLocalMidY - gesture.current.startTy) / gesture.current.startScale

      const nextTx = localMidX - imgMidX * nextScale
      const nextTy = localMidY - imgMidY * nextScale

      gestureMoved.current = true
      gestureMovedAt.current = Date.now()
      suppressTap.current = true
      if (sel.kind !== 'none') setSel({ kind: 'none' })
      if (detailsTagId) setDetailsTagId(null)
      setVp((cur) => clampViewport({ ...cur, scale: nextScale, tx: nextTx, ty: nextTy }, photoSize.w, photoSize.h, imgSize))
      return
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) {
      gesture.current = { kind: 'none' }
      return
    }
    if (pointers.current.size === 1) {
      const pt = Array.from(pointers.current.values())[0]
      gesture.current = { kind: 'pan', startTx: vp.tx, startTy: vp.ty, startX: pt.x, startY: pt.y }
    }
  }

  function addPhotoToTag(tagId: string, file: File | undefined, kind: TagPhotoKind) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const res = String(reader.result || '')
      if (!res.startsWith('data:image/')) return
      const photo: TagPhoto = { id: uuidV4(), createdAt: nowIso(), dataUrl: res, kind }
      const tag = b.tags.find((t) => t.id === tagId)
      if (!tag) return
      const nextPhotos = [...tag.photos, photo]
      const patch: Partial<Tag> = { photos: nextPhotos }
      if (tag.type === 'cleaning' && kind === 'after') patch.status = 'afterCleaning'
      optimisticPatchTag(tagId, patch)
      repo
        .uploadTagPhoto(b.id, tagId, file, kind)
        .then(() => {
          notify.push({ message: 'File uploaded' })
          bump()
        })
        .catch((e) => {
          notify.push({ message: e instanceof Error ? e.message : String(e), tone: 'danger' })
          bump()
        })
    }
    reader.readAsDataURL(file)
  }

  function toScreen(x: number, y: number): { left: number; top: number } {
    if (!imgSize) return { left: 0, top: 0 }
    const { dw, dh, ox, oy } = containMetrics(photoSize.w, photoSize.h, imgSize.w, imgSize.h)
    const px = ox + x * dw
    const py = oy + y * dh
    return { left: vp.tx + px * vp.scale, top: vp.ty + py * vp.scale }
  }

  function beginDrag(tagId: string) {
    const tag = b.tags.find((t) => t.id === tagId)
    if (!tag) return
    setSel({ kind: 'none' })
    setDetailsTagId(null)
    setDrag({ tagId, x: tag.x, y: tag.y })
    suppressTap.current = true
  }

  function updateDrag(clientX: number, clientY: number) {
    const s = dragSession.current
    if (!s) return
    const pt = getImagePoint(clientX, clientY)
    if (!pt) return
    setDrag({ tagId: s.tagId, x: pt.x, y: pt.y })
  }

  function endDrag(commit: boolean) {
    const s = dragSession.current
    if (!s) return
    if (s.timer) window.clearTimeout(s.timer)
    dragSession.current = null
    lastDragEndAt.current = Date.now()
    suppressTap.current = true
    setDrag((cur) => {
      if (!cur || cur.tagId !== s.tagId) return null
      if (commit) {
        optimisticMoveTag(s.tagId, cur.x, cur.y)
        repo.updateTag(b.id, s.tagId, { x: cur.x, y: cur.y }).catch(() => bump())
      }
      return null
    })
  }

  async function downloadReport() {
    if (!buildingId) return
    try {
      setDownloadingReport(true)
      const res = await fetch(`/api/buildings/${encodeURIComponent(buildingId)}/report`)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
      }
      const blob = await res.blob()

      const cd = res.headers.get('content-disposition') || ''
      const utfMatch = /filename\*=UTF-8''([^;]+)(?:;|$)/i.exec(cd)
      const asciiMatch = /filename=\"?([^\";]+)\"?(?:;|$)/i.exec(cd)
      const filename = utfMatch ? decodeURIComponent(utfMatch[1]) : asciiMatch ? asciiMatch[1] : 'report.docx'

      const url = URL.createObjectURL(blob)
      try {
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch (e) {
      notify.push({ message: e instanceof Error ? e.message : String(e), tone: 'danger' })
    } finally {
      setDownloadingReport(false)
    }
  }

  return (
    <div className="page">
      <div className="building-layout">
      <div
        className="building-photo"
        role="application"
        tabIndex={0}
        ref={photoRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => {
          if (Date.now() - wheelMovedAt.current < 450) return
          if (Date.now() - lastDragEndAt.current < 450) return
          onPointerUp(e)
          if (e.pointerType === 'mouse' && e.button !== 0) return
          if (suppressTap.current) {
            suppressTap.current = false
            return
          }
          const picked = pickTagAt(e.clientX, e.clientY)
          if (picked) {
            if (selectedTagId === picked.id) {
              setSel({ kind: 'none' })
              setDetailsTagId(null)
              lastTapHandledAt.current = 0
              return
            }
            setSel({ kind: 'tag_menu', tagId: picked.id, x: picked.x, y: picked.y })
            setDetailsTagId(picked.id)
            lastTapHandledAt.current = Date.now()
            lastSelectedAt.current = Date.now()
            lastSelectedTagId.current = picked.id
            return
          }

          onPhotoTap(e.clientX, e.clientY)
          lastTapHandledAt.current = Date.now()
        }}
        onTouchStart={() => {
          suppressTap.current = false
        }}
        onClick={(e) => {
          if (Date.now() - wheelMovedAt.current < 450) return
          if (Date.now() - lastDragEndAt.current < 450) return
          if (Date.now() - lastTapHandledAt.current < 450) return
          if (suppressTap.current) {
            suppressTap.current = false
            return
          }
          if (gestureMoved.current && Date.now() - gestureMovedAt.current < 600) return
          const picked = pickTagAt(e.clientX, e.clientY)
          if (picked) {
            if (selectedTagId === picked.id) {
              setSel({ kind: 'none' })
              setDetailsTagId(null)
              lastTapHandledAt.current = 0
              return
            }
            setSel({ kind: 'tag_menu', tagId: picked.id, x: picked.x, y: picked.y })
            setDetailsTagId(picked.id)
            lastTapHandledAt.current = Date.now()
            lastSelectedAt.current = Date.now()
            lastSelectedTagId.current = picked.id
            return
          }

          onPhotoTap(e.clientX, e.clientY)
          lastTapHandledAt.current = Date.now()
        }}
        onPointerCancel={onPointerUp}
      >
        <img
          ref={imgProbeRef}
          alt=""
          src={b.mainPhotoDataUrl}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
          onLoad={(e) => {
            const img = e.currentTarget
            if (img.naturalWidth && img.naturalHeight) setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
          }}
          draggable={false}
        />
        <div className="building-photo-clip" aria-hidden="true">
          <div
            className="building-photo-stage"
            style={{
              transform: `translate(${vp.tx}px, ${vp.ty}px) scale(${vp.scale})`,
              transformOrigin: '0 0',
              width: '100%',
              height: '100%',
            }}
          >
            <div
              className="building-photo-image"
              style={{ backgroundImage: `url(${b.mainPhotoDataUrl})` }}
              aria-label="Building photo"
              role="img"
            />
          </div>
        </div>

        <div className="building-photo-tags">
          {b.tags.map((t) => {
            const isDragging = drag?.tagId === t.id
            const x = isDragging ? drag.x : t.x
            const y = isDragging ? drag.y : t.y
            const pos = toScreen(x, y)
            return (
              <div
                key={t.id}
                className="tag-dot"
                data-tag-id={t.id}
                data-tone={tagTone(t)}
                data-moving={movingTagId === t.id ? 'true' : 'false'}
                data-selected={selectedTagId === t.id ? 'true' : 'false'}
                data-dragging={isDragging ? 'true' : 'false'}
                style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
                title={`#${t.seq}`}
                onClick={(e) => {
                  if (Date.now() - lastDragEndAt.current < 250) return
                  e.stopPropagation()
                  if (selectedTagId === t.id) {
                    if (lastSelectedTagId.current === t.id && Date.now() - lastSelectedAt.current < 450) return
                    setSel({ kind: 'none' })
                    setDetailsTagId(null)
                    lastTapHandledAt.current = 0
                    return
                  }
                  if (Date.now() - lastTapHandledAt.current < 350) return
                  setSel({ kind: 'tag_menu', tagId: t.id, x: t.x, y: t.y })
                  setDetailsTagId(t.id)
                }}
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse' && e.button !== 0) return
                  if (pointers.current.size >= 2) return
                  e.stopPropagation()
                  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                  dragSession.current = {
                    pointerId: e.pointerId,
                    tagId: t.id,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    started: false,
                    timer: window.setTimeout(() => {
                      const s = dragSession.current
                      if (!s || s.tagId !== t.id || s.pointerId !== e.pointerId) return
                      s.started = true
                      beginDrag(t.id)
                    }, 220),
                  }
                }}
                onPointerMove={(e) => {
                  const s = dragSession.current
                  if (!s || s.pointerId !== e.pointerId || s.tagId !== t.id) return
                  const dx = e.clientX - s.startClientX
                  const dy = e.clientY - s.startClientY
                  if (!s.started && Math.hypot(dx, dy) > 6) {
                    s.started = true
                    if (s.timer) window.clearTimeout(s.timer)
                    s.timer = null
                    beginDrag(t.id)
                  }
                  if (s.started) {
                    updateDrag(e.clientX, e.clientY)
                  }
                }}
                onPointerUp={(e) => {
                  const s = dragSession.current
                  if (!s || s.pointerId !== e.pointerId || s.tagId !== t.id) return
                  if (s.started) {
                    e.stopPropagation()
                    endDrag(true)
                  } else {
                    if (s.timer) window.clearTimeout(s.timer)
                    dragSession.current = null
                    e.stopPropagation()
                    if (selectedTagId === t.id) {
                      setSel({ kind: 'none' })
                      setDetailsTagId(null)
                      lastTapHandledAt.current = 0
                      return
                    }
                    setSel({ kind: 'tag_menu', tagId: t.id, x: t.x, y: t.y })
                    setDetailsTagId(t.id)
                    lastTapHandledAt.current = Date.now()
                    lastSelectedAt.current = Date.now()
                    lastSelectedTagId.current = t.id
                  }
                }}
                onPointerCancel={(e) => {
                  const s = dragSession.current
                  if (!s || s.pointerId !== e.pointerId || s.tagId !== t.id) return
                  endDrag(false)
                }}
              >
                <span className="tag-badge" aria-hidden="true">
                  {t.seq}
                </span>
                <span className="material-symbols-outlined" aria-hidden="true">
                  {tagGlyph(t)}
                </span>
              </div>
            )
          })}

          {sel.kind === 'photo_menu' && (() => {
            const pos = toScreen(sel.x, sel.y)
            return (
              <div
                className="tag-dot"
                data-tone="grey"
                data-preview="true"
                style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
                aria-hidden="true"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  add
                </span>
              </div>
            )
          })()}

          {sel.kind === 'move_target' && (() => {
            const pos = toScreen(sel.x, sel.y)
            return (
              <div
                className="tag-dot"
                data-tone="grey"
                data-preview="true"
                style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
                aria-hidden="true"
              />
            )
          })()}
        </div>

        <div
          className="building-photo-overlay"
          style={{
            pointerEvents:
              sel.kind === 'photo_menu' ||
              sel.kind === 'tag_menu' ||
              sel.kind === 'anchor_status' ||
              sel.kind === 'move_target'
                ? 'auto'
                : 'none',
          }}
          onClick={(e) => {
            const target = e.target as Element | null
            if (target?.closest('.radial')) return
            const picked = pickTagAt(e.clientX, e.clientY)
            if (picked) {
              if (selectedTagId === picked.id) {
                setSel({ kind: 'none' })
                setDetailsTagId(null)
                lastTapHandledAt.current = 0
                return
              }
              setSel({ kind: 'tag_menu', tagId: picked.id, x: picked.x, y: picked.y })
              setDetailsTagId(picked.id)
              lastTapHandledAt.current = Date.now()
              return
            }
            onPhotoTap(e.clientX, e.clientY)
          }}
        >
          {sel.kind === 'photo_menu' && (() => {
            const pos = toScreen(sel.x, sel.y)
            return (
              <RadialMenu
                left={pos.left}
                top={pos.top}
                onPick={(type) => {
                  const tempId = optimisticCreateTag({ type, x: sel.x, y: sel.y })
                  setSel({ kind: 'tag_menu', tagId: tempId, x: sel.x, y: sel.y })
                  setDetailsTagId(tempId)

                  repo
                    .addTag(b.id, { type, x: sel.x, y: sel.y })
                    .then((created) => {
                      if (!created) throw new Error('Failed to create')
                      optimisticReplaceTag(tempId, created)
                      setSel({ kind: 'tag_menu', tagId: created.id, x: sel.x, y: sel.y })
                      setDetailsTagId(created.id)
                    })
                    .catch(() => {
                      optimisticDeleteTag(tempId)
                      setSel({ kind: 'none' })
                      setDetailsTagId(null)
                      bump()
                    })
                }}
              />
            )
          })()}

          {sel.kind === 'tag_menu' && menuTag && (() => {
            const pos = toScreen(sel.x, sel.y)
            const layout: 'default' | 'near_top' = pos.top < 120 ? 'near_top' : 'default'
            return (
              <TagMenu
                left={pos.left}
                top={pos.top}
                tag={menuTag}
                layout={layout}
                onDelete={() => {
                  requestDeleteTag(menuTag.id)
                }}
                onDetails={() => setDetailsTagId((cur) => (cur === menuTag.id ? null : menuTag.id))}
                onAnchorStatus={(status) => {
                  optimisticPatchTag(menuTag.id, { status })
                  repo.updateTag(b.id, menuTag.id, { status }).catch(() => bump())
                }}
                onAddComment={() => {
                  setDetailsTagId(menuTag.id)
                  setCommentDialogTagId(menuTag.id)
                }}
                onCleaningToggle={() => {
                  const next = menuTag.status === 'afterCleaning' ? 'beforeCleaning' : 'afterCleaning'
                  optimisticPatchTag(menuTag.id, { status: next })
                  repo.updateTag(b.id, menuTag.id, { status: next }).catch(() => bump())
                }}
                onCleaningPhoto={() => {
                  setCleaningPhotoTagId(menuTag.id)
                }}
                onPickPhoto={(file, kind) => addPhotoToTag(menuTag.id, file, kind)}
              />
            )
          })()}

          {sel.kind === 'move_target' && (() => {
            const pos = toScreen(sel.x, sel.y)
            return (
              <MoveTargetMenu
                left={pos.left}
                top={pos.top}
                onCancel={() => {
                  setMovingTagId(null)
                  setSel({ kind: 'none' })
                }}
                onMoveHere={() => {
                  optimisticMoveTag(sel.tagId, sel.x, sel.y)
                  setMovingTagId(null)
                  setSel({ kind: 'none' })
                  repo.updateTag(b.id, sel.tagId, { x: sel.x, y: sel.y }).catch(() => bump())
                }}
              />
            )
          })()}
        </div>
      </div>

      <div className="tabs" aria-label="Building details">
        <div className="tab-list" role="tablist" aria-label="Details tabs">
          <button
            className="tab-btn"
            type="button"
            role="tab"
            aria-selected={activeTab === 'building'}
            data-active={activeTab === 'building'}
            onClick={() => setActiveTab('building')}
          >
            Building
          </button>
          {selectedTag && (
            <button
              className="tab-btn"
              type="button"
              role="tab"
              aria-selected={activeTab === 'tag'}
              data-active={activeTab === 'tag'}
              onClick={() => setActiveTab('tag')}
            >
              Tag
            </button>
          )}
        </div>

        {activeTab === 'building' && (
          <div className="tab-panel" role="tabpanel">
            <div className="kv">
              <div className="k">Location</div>
              <div className="v">{b.location ?? '—'}</div>
            </div>
            <div className="info-grid" aria-label="Tag summary">
              <div className="info-card info-card--anchors">
                <div className="info-card-head">
                  <div className="info-title">ANCHOR POINTS</div>
                  <div className="info-glyph" aria-hidden="true">
                    <span className="material-symbols-outlined">anchor</span>
                  </div>
                </div>
                <div className="info-big">{tagSummary.anchorsTotal}</div>

                <div className="info-row">
                  <div className="info-label">Passed</div>
                  <div className="info-right">
                    {tagSummary.anchorsPassed} / {tagSummary.anchorsTotal}
                  </div>
                </div>
                <div className="info-bar" aria-hidden="true">
                  <div className="info-bar-fill" style={{ width: `${Math.round(tagSummary.anchorsPassedRatio * 100)}%` }} />
                </div>

                <div className="info-mini-grid">
                  <div className="info-mini">
                    <div className="info-mini-k">BEFORE CHECK</div>
                    <div className="info-mini-v">{tagSummary.anchorsBefore}</div>
                  </div>
                  <div className="info-mini info-mini--danger">
                    <div className="info-mini-k">FAILED</div>
                    <div className="info-mini-v">{tagSummary.anchorsFailed}</div>
                  </div>
                </div>
              </div>

              <div className="info-card info-card--cleaning">
                <div className="info-card-head">
                  <div className="info-title">CLEANING</div>
                  <div className="info-glyph" aria-hidden="true">
                    <span className="material-symbols-outlined">cleaning_services</span>
                  </div>
                </div>
                <div className="info-big">{tagSummary.cleaningTotal}</div>
                <div className="info-sub">
                  <div className="dot dot--muted" aria-hidden="true" />
                  <div>Pre: {tagSummary.cleaningPre}</div>
                </div>
                <div className="info-sub">
                  <div className="dot dot--good" aria-hidden="true" />
                  <div>Post: {tagSummary.cleaningPost}</div>
                </div>
              </div>

              <div className="info-card info-card--issues">
                <div className="info-card-head">
                  <div className="info-title">ISSUES</div>
                  <div className="info-glyph" aria-hidden="true">
                    <span className="material-symbols-outlined">warning</span>
                  </div>
                </div>
                <div className="info-big">{tagSummary.issuesTotal}</div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <button
                className="btn primary"
                type="button"
                onClick={downloadReport}
                disabled={downloadingReport}
              >
                {downloadingReport ? 'Generating…' : 'Generate report'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'tag' && selectedTag && (
          <div className="tab-panel" role="tabpanel">
            <TagDetailsInline
              tag={selectedTag}
              expanded={true}
              buildingId={b.id}
              onMutate={bump}
              onOptimisticPatch={(tagId, patch) => optimisticPatchTag(tagId, patch)}
              onRunOrQueue={runOrQueueTagOp}
            />
          </div>
        )}
      </div>
      </div>

      <div className="tag-toolbar" aria-label="Tag actions" />

      <input
        ref={cleaningPhotoInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.currentTarget.value = ''
          if (!f) return
          const pick = cleaningPhotoPick
          if (!pick) return
          addPhotoToTag(pick.tagId, f, pick.kind)
          setCleaningPhotoPick(null)
        }}
      />

      {confirmDeleteTagId && (
        <ConfirmDialog
          title="Delete tag?"
          description={confirmDeleteTag ? `This will delete ${tagTitle(confirmDeleteTag)}.` : 'This will delete the tag.'}
          confirmText="Delete"
          tone="danger"
          onCancel={() => setConfirmDeleteTagId(null)}
          onConfirm={() => confirmDeleteNow(confirmDeleteTagId)}
        />
      )}

      {cleaningPhotoTagId && (
        <CleaningPhotoKindDialog
          onCancel={() => setCleaningPhotoTagId(null)}
          onPick={(kind) => {
            const tagId = cleaningPhotoTagId
            setCleaningPhotoTagId(null)
            setCleaningPhotoPick({ tagId, kind })
            requestAnimationFrame(() => cleaningPhotoInputRef.current?.click())
          }}
        />
      )}

      {commentDialogTagId && (
        <AddCommentDialog
          title="Add comment"
          onCancel={() => setCommentDialogTagId(null)}
          onSubmit={(text) => {
            addCommentToTag(commentDialogTagId, text)
            setCommentDialogTagId(null)
          }}
        />
      )}
    </div>
  )
}

function TagDetailsInline(props: {
  buildingId: string
  tag: Tag
  expanded: boolean
  onMutate: () => void
  onOptimisticPatch: (tagId: string, patch: Partial<Tag>) => void
  onRunOrQueue: (tagId: string, op: (id: string) => Promise<unknown>) => void
}) {
  const t = props.tag

  const [name, setName] = useState(t.name ?? '')
  const [comment, setComment] = useState('')
  const commentRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setName(t.name ?? '')
  }, [t.id, t.name])

  function commitName() {
    props.onOptimisticPatch(t.id, { name })
    props.onRunOrQueue(t.id, (id) => repo.updateTag(props.buildingId, id, { name }).catch(() => props.onMutate()))
  }

  function addComment() {
    const text = comment.trim()
    if (!text) return
    const nextComments = [...t.comments, { id: uuidV4(), createdAt: nowIso(), text }]
    props.onOptimisticPatch(t.id, { comments: nextComments })
    setComment('')
    commentRef.current?.blur()
    props.onRunOrQueue(t.id, (id) =>
      repo.updateTag(props.buildingId, id, { comments: nextComments }).catch(() => props.onMutate()),
    )
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
      props.onOptimisticPatch(t.id, patch)
      props.onRunOrQueue(t.id, (id) =>
        repo
          .uploadTagPhoto(props.buildingId, id, file, kind)
          .then(() => {
            notify.push({ message: 'File uploaded' })
            props.onMutate()
          })
          .catch((e) => {
            notify.push({ message: e instanceof Error ? e.message : String(e), tone: 'danger' })
            props.onMutate()
          }),
      )
    }
    reader.readAsDataURL(file)
  }

  return (
    <div
      className="form"
      style={{
        marginTop: 14,
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="tag-dot" data-tone={tagTone(t)} style={{ position: 'relative', left: 0, top: 0, margin: 0 }}>
              <span className="material-symbols-outlined" aria-hidden="true">
                {tagGlyph(t)}
              </span>
            </div>
            <div style={{ fontWeight: 900, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tagTitle(t)}
            </div>
          </div>
        </div>
      </div>

      {props.expanded && (
        <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
          <div className="field">
            <label htmlFor={`tag-name-${t.id}`}>Name (optional)</label>
            <input
              id={`tag-name-${t.id}`}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              placeholder="e.g. North edge"
            />
          </div>

          {(t.type === 'anchor' || t.type === 'cleaning') && (
            <div className="field">
              <label htmlFor={`tag-status-${t.id}`}>Status</label>
              <select
                id={`tag-status-${t.id}`}
                value={t.status}
                onChange={(e) => {
                  const next = e.target.value as Tag['status']
                  props.onOptimisticPatch(t.id, { status: next })
                  repo.updateTag(props.buildingId, t.id, { status: next }).catch(() => props.onMutate())
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
                {t.type === 'anchor' && (
                  <>
                    <option value="beforeCheck">Before check</option>
                    <option value="passedCheck">Passed check</option>
                    <option value="failedCheck">Didn't pass check</option>
                  </>
                )}
                {t.type === 'cleaning' && (
                  <>
                    <option value="beforeCleaning">Before cleaning</option>
                    <option value="afterCleaning">After cleaning</option>
                  </>
                )}
              </select>
            </div>
          )}

          <div className="field">
            <label>Photos</label>
            {t.type === 'cleaning' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <CleaningPhotoSection
                  title="Before cleaning"
                  photos={t.photos.filter((p) => p.kind === 'before')}
                  onPick={(f) => addPhoto(f, 'before')}
                />
                <CleaningPhotoSection
                  title="After cleaning"
                  photos={t.photos.filter((p) => p.kind === 'after')}
                  onPick={(f) => addPhoto(f, 'after')}
                />
              </div>
            ) : (
              <PhotoSection title="All photos" photos={t.photos.filter((p) => p.kind === 'general')} onPick={(f) => addPhoto(f, 'general')} />
            )}
          </div>

          <div className="field">
            <label>Comments</label>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  id={`tag-comment-${t.id}`}
                  type="text"
                  ref={commentRef}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment"
                />
                <button className="btn secondary" type="button" onClick={addComment} style={{ width: 120 }}>
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
      )}
    </div>
  )
}

function PhotoSection(props: { title: string; photos: TagPhoto[]; onPick: (file: File | undefined) => void }) {
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
        <div style={{ color: 'rgba(15,23,42,0.55)', fontSize: 13 }}>No photos yet.</div>
      ) : (
        <div className="general-grid">
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

function RadialMenu(props: { left: number; top: number; onPick: (type: TagType) => void }) {
  const lastActionAt = useRef(0)
  const fire = (fn: () => void) => (e: React.SyntheticEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const now = Date.now()
    if (now - lastActionAt.current < 350) return
    lastActionAt.current = now
    fn()
  }
  return (
    <div
      className="radial"
      style={{ left: `${props.left}px`, top: `${props.top}px` }}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Create tag"
    >
      <button
        className="radial-btn"
        data-pos="top"
        type="button"
        aria-label="Create anchor point tag"
        onClick={fire(() => props.onPick('anchor'))}
        onPointerUp={fire(() => props.onPick('anchor'))}
        onTouchEnd={fire(() => props.onPick('anchor'))}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          anchor
        </span>
      </button>
      <button
        className="radial-btn"
        data-pos="top-right"
        type="button"
        aria-label="Create cleaning tag"
        onClick={fire(() => props.onPick('cleaning'))}
        onPointerUp={fire(() => props.onPick('cleaning'))}
        onTouchEnd={fire(() => props.onPick('cleaning'))}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          cleaning_services
        </span>
      </button>
      <button
        className="radial-btn"
        data-pos="right"
        type="button"
        aria-label="Create issue tag"
        onClick={fire(() => props.onPick('issue'))}
        onPointerUp={fire(() => props.onPick('issue'))}
        onTouchEnd={fire(() => props.onPick('issue'))}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          warning
        </span>
      </button>
    </div>
  )
}

function MoveTargetMenu(props: { left: number; top: number; onMoveHere: () => void; onCancel: () => void }) {
  const lastActionAt = useRef(0)
  const fire = (fn: () => void) => (e: React.SyntheticEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const now = Date.now()
    if (now - lastActionAt.current < 350) return
    lastActionAt.current = now
    fn()
  }
  return (
    <div
      className="radial"
      style={{ left: `${props.left}px`, top: `${props.top}px` }}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Move tag"
    >
      <button
        className="radial-btn"
        data-pos="top"
        type="button"
        aria-label="Move tag here"
        onClick={fire(props.onMoveHere)}
        onPointerUp={fire(props.onMoveHere)}
        onTouchEnd={fire(props.onMoveHere)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          check
        </span>
      </button>
      <button
        className="radial-btn"
        data-pos="left"
        type="button"
        aria-label="Cancel moving"
        onClick={fire(props.onCancel)}
        onPointerUp={fire(props.onCancel)}
        onTouchEnd={fire(props.onCancel)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          close
        </span>
      </button>
    </div>
  )
}

function TagMenu(props: {
  left: number
  top: number
  tag: Tag
  layout?: 'default' | 'near_top'
  onDelete: () => void
  onDetails: () => void
  onAnchorStatus: (status: 'passedCheck' | 'failedCheck' | 'beforeCheck') => void
  onAddComment: () => void
  onCleaningToggle: () => void
  onCleaningPhoto: () => void
  onPickPhoto: (file: File | undefined, kind: TagPhotoKind) => void
}) {
  const generalRef = useRef<HTMLInputElement | null>(null)
  const lastActionAt = useRef(0)
  const fire = (fn: () => void) => (e: React.SyntheticEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const now = Date.now()
    if (now - lastActionAt.current < 350) return
    lastActionAt.current = now
    fn()
  }

  const pos = (p: {
    top: string
    topRight: string
    right: string
    bottomRight: string
    bottom: string
    bottomLeft: string
    bottomRightAlt?: string
  }) =>
    props.layout === 'near_top'
      ? {
          top: p.right,
          topRight: p.bottomRight,
          right: p.bottom,
          bottomRight: p.bottomLeft,
        }
      : {
          top: p.top,
          topRight: p.topRight,
          right: p.right,
          bottomRight: p.bottomRight,
        }

  return (
    <div
      className="radial"
      style={{ left: `${props.left}px`, top: `${props.top}px` }}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Tag actions"
    >
      <input
        ref={generalRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => props.onPickPhoto(e.target.files?.[0], 'general')}
      />
      <button
        className="radial-btn"
        data-pos="bottom-left"
        type="button"
        aria-label="Remove tag"
        onClick={fire(props.onDelete)}
        onPointerUp={fire(props.onDelete)}
        onTouchEnd={fire(props.onDelete)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          delete
        </span>
      </button>
      {props.tag.type !== 'anchor' && props.tag.type !== 'issue' && props.tag.type !== 'cleaning' && (
        <button
          className="radial-btn"
          data-pos="bottom-right"
          type="button"
          aria-label="View details"
          onClick={fire(props.onDetails)}
          onPointerUp={fire(props.onDetails)}
          onTouchEnd={fire(props.onDetails)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            open_in_new
          </span>
        </button>
      )}

      {props.tag.type === 'anchor' && (
        <>
          <button
            className="radial-btn"
            data-pos={pos({ top: 'top', topRight: 'top-right', right: 'right', bottomRight: 'bottom-right', bottom: 'bottom', bottomLeft: 'bottom-left' }).top}
            type="button"
            aria-label="Upload photo"
            onClick={fire(() => generalRef.current?.click())}
            onPointerUp={fire(() => generalRef.current?.click())}
            onTouchEnd={fire(() => generalRef.current?.click())}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              photo_camera
            </span>
          </button>
          <button
            className="radial-btn"
            data-pos={pos({ top: 'top', topRight: 'top-right', right: 'right', bottomRight: 'bottom-right', bottom: 'bottom', bottomLeft: 'bottom-left' }).topRight}
            type="button"
            aria-label="Add comment"
            onClick={fire(props.onAddComment)}
            onPointerUp={fire(props.onAddComment)}
            onTouchEnd={fire(props.onAddComment)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              add_comment
            </span>
          </button>
          <button
            className="radial-btn"
            data-pos={pos({ top: 'top', topRight: 'top-right', right: 'right', bottomRight: 'bottom-right', bottom: 'bottom', bottomLeft: 'bottom-left' }).right}
            type="button"
            aria-label={
              props.tag.status === 'beforeCheck'
                ? 'Approve'
                : props.tag.status === 'passedCheck'
                  ? 'Disapprove'
                  : 'Reset'
            }
            onClick={fire(() =>
              props.onAnchorStatus(
                props.tag.status === 'beforeCheck'
                  ? 'passedCheck'
                  : props.tag.status === 'passedCheck'
                    ? 'failedCheck'
                    : 'beforeCheck',
              ),
            )}
            onPointerUp={fire(() =>
              props.onAnchorStatus(
                props.tag.status === 'beforeCheck'
                  ? 'passedCheck'
                  : props.tag.status === 'passedCheck'
                    ? 'failedCheck'
                    : 'beforeCheck',
              ),
            )}
            onTouchEnd={fire(() =>
              props.onAnchorStatus(
                props.tag.status === 'beforeCheck'
                  ? 'passedCheck'
                  : props.tag.status === 'passedCheck'
                    ? 'failedCheck'
                    : 'beforeCheck',
              ),
            )}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {props.tag.status === 'beforeCheck'
                ? 'thumb_up'
                : props.tag.status === 'passedCheck'
                  ? 'thumb_down'
                  : 'restart_alt'}
            </span>
          </button>
        </>
      )}

      {props.tag.type === 'cleaning' && (
        <>
          <button
            className="radial-btn"
            data-pos={pos({ top: 'top', topRight: 'top-right', right: 'right', bottomRight: 'bottom-right', bottom: 'bottom', bottomLeft: 'bottom-left' }).top}
            type="button"
            aria-label="Upload photo"
            onClick={fire(props.onCleaningPhoto)}
            onPointerUp={fire(props.onCleaningPhoto)}
            onTouchEnd={fire(props.onCleaningPhoto)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              photo_camera
            </span>
          </button>
          <button
            className="radial-btn"
            data-pos={pos({ top: 'top', topRight: 'top-right', right: 'right', bottomRight: 'bottom-right', bottom: 'bottom', bottomLeft: 'bottom-left' }).topRight}
            type="button"
            aria-label="Add comment"
            onClick={fire(props.onAddComment)}
            onPointerUp={fire(props.onAddComment)}
            onTouchEnd={fire(props.onAddComment)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              add_comment
            </span>
          </button>
          <button
            className="radial-btn"
            data-pos={pos({ top: 'top', topRight: 'top-right', right: 'right', bottomRight: 'bottom-right', bottom: 'bottom', bottomLeft: 'bottom-left' }).right}
            type="button"
            aria-label={props.tag.status === 'afterCleaning' ? 'Mark as not cleaned' : 'Mark as cleaned'}
            onClick={fire(props.onCleaningToggle)}
            onPointerUp={fire(props.onCleaningToggle)}
            onTouchEnd={fire(props.onCleaningToggle)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {props.tag.status === 'afterCleaning' ? 'thumb_down' : 'thumb_up'}
            </span>
          </button>
        </>
      )}

      {props.tag.type === 'issue' && (
        <>
          <button
            className="radial-btn"
            data-pos={pos({ top: 'top', topRight: 'top-right', right: 'right', bottomRight: 'bottom-right', bottom: 'bottom', bottomLeft: 'bottom-left' }).top}
            type="button"
            aria-label="Upload photo"
            onClick={fire(() => generalRef.current?.click())}
            onPointerUp={fire(() => generalRef.current?.click())}
            onTouchEnd={fire(() => generalRef.current?.click())}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              photo_camera
            </span>
          </button>
          <button
            className="radial-btn"
            data-pos={pos({ top: 'top', topRight: 'top-right', right: 'right', bottomRight: 'bottom-right', bottom: 'bottom', bottomLeft: 'bottom-left' }).topRight}
            type="button"
            aria-label="Add comment"
            onClick={fire(props.onAddComment)}
            onPointerUp={fire(props.onAddComment)}
            onTouchEnd={fire(props.onAddComment)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              add_comment
            </span>
          </button>
        </>
      )}
    </div>
  )
}

function ConfirmDialog(props: {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  tone?: 'danger' | 'neutral'
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') props.onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [props])

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        zIndex: 50,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          borderRadius: 16,
          background: 'rgba(255, 255, 255, 0.98)',
          border: '1px solid rgba(15, 23, 42, 0.14)',
          boxShadow: '0 18px 60px rgba(2, 6, 23, 0.25)',
          padding: 16,
        }}
      >
        <div style={{ fontWeight: 950, fontSize: 16 }}>{props.title}</div>
        {props.description && <div style={{ marginTop: 8, color: 'rgba(15, 23, 42, 0.7)', fontSize: 14 }}>{props.description}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button className="btn secondary" type="button" onClick={props.onCancel} style={{ minWidth: 110 }}>
            {props.cancelText ?? 'Cancel'}
          </button>
          <button
            className="btn"
            type="button"
            onClick={props.onConfirm}
            style={{
              minWidth: 110,
              background: props.tone === 'danger' ? 'rgba(220, 38, 38, 0.95)' : undefined,
              borderColor: props.tone === 'danger' ? 'rgba(185, 28, 28, 0.9)' : undefined,
              color: props.tone === 'danger' ? 'white' : undefined,
            }}
          >
            {props.confirmText ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CleaningPhotoKindDialog(props: { onPick: (kind: 'before' | 'after') => void; onCancel: () => void }) {
  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        zIndex: 50,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upload cleaning photo"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          borderRadius: 16,
          background: 'rgba(255, 255, 255, 0.98)',
          border: '1px solid rgba(15, 23, 42, 0.14)',
          boxShadow: '0 18px 60px rgba(2, 6, 23, 0.25)',
          padding: 16,
        }}
      >
        <div style={{ fontWeight: 950, fontSize: 16 }}>Upload cleaning photo</div>
        <div style={{ marginTop: 8, color: 'rgba(15, 23, 42, 0.7)', fontSize: 14 }}>
          Select which stage this photo represents.
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn primary" type="button" onClick={() => props.onPick('before')} style={{ minWidth: 110 }}>
              Before
            </button>
            <button className="btn primary" type="button" onClick={() => props.onPick('after')} style={{ minWidth: 110 }}>
              After
            </button>
          </div>
          <button className="btn secondary" type="button" onClick={props.onCancel} style={{ minWidth: 110 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function AddCommentDialog(props: { title: string; onSubmit: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('')

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') props.onCancel()
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') props.onSubmit(text)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [props, text])

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        zIndex: 50,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          borderRadius: 16,
          background: 'rgba(255, 255, 255, 0.98)',
          border: '1px solid rgba(15, 23, 42, 0.14)',
          boxShadow: '0 18px 60px rgba(2, 6, 23, 0.25)',
          padding: 16,
        }}
      >
        <div style={{ fontWeight: 950, fontSize: 16 }}>{props.title}</div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment"
          style={{
            marginTop: 12,
            width: '100%',
            minHeight: 110,
            resize: 'vertical',
            borderRadius: 14,
            border: '1px solid rgba(15, 23, 42, 0.12)',
            padding: 12,
            fontSize: 16,
            outline: 'none',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button className="btn secondary" type="button" onClick={props.onCancel} style={{ minWidth: 110 }}>
            Cancel
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={() => props.onSubmit(text)}
            style={{ minWidth: 110 }}
            disabled={!text.trim()}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

// CleaningPhotoMenu removed (replaced with dialog)
