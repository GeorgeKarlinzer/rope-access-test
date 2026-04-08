import type { Building, Tag, TagComment, TagPhoto, TagPhotoKind, TagType } from './types'

type ServerBuilding = {
  id: string
  createdAt: string
  completedAt?: string | null
  name: string
  location?: string | null
  status: 'active' | 'completed'
  mainPhotoDataUrl: string
  tags?: ServerTag[]
}

type ServerTag = {
  id: string
  createdAt: string
  seq: number
  type: TagType
  name?: string | null
  x: number
  y: number
  status?: Tag['status']
  photos?: ServerTagPhoto[]
  comments?: ServerTagComment[]
}

type ServerTagPhoto = {
  id: string
  createdAt: string
  fileName: string
  contentType: string
  blob: string
  kind: TagPhotoKind
}

type ServerTagComment = {
  id: string
  createdAt: string
  text: string
}

function toDataUrl(p: ServerTagPhoto): string {
  const contentType = p.contentType || 'application/octet-stream'
  const b64 = p.blob || ''
  return `data:${contentType};base64,${b64}`
}

function parseDataUrl(dataUrl: string): { contentType: string; b64: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/i.exec(dataUrl)
  if (!m) return null
  return { contentType: m[1], b64: m[2] }
}

function toTag(t: ServerTag): Tag {
  const photos: TagPhoto[] = (t.photos ?? []).map((p) => ({
    id: p.id,
    createdAt: p.createdAt,
    dataUrl: toDataUrl(p),
    kind: p.kind,
  }))
  const comments: TagComment[] = (t.comments ?? []).map((c) => ({
    id: c.id,
    createdAt: c.createdAt,
    text: c.text,
  }))

  return {
    id: t.id,
    createdAt: t.createdAt,
    seq: t.seq,
    type: t.type,
    name: t.name ?? undefined,
    x: t.x,
    y: t.y,
    status: (t.status ?? 'none') as Tag['status'],
    photos,
    comments,
  }
}

function toBuilding(b: ServerBuilding): Building {
  return {
    id: b.id,
    createdAt: b.createdAt,
    completedAt: b.completedAt ?? undefined,
    name: b.name,
    location: b.location ?? undefined,
    status: b.status,
    mainPhotoDataUrl: b.mainPhotoDataUrl,
    tags: (b.tags ?? []).map(toTag),
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      'content-type': 'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
  }
  if (res.status === 204) return undefined as T
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) return undefined as T
  const raw = await res.text()
  if (!raw) return undefined as T
  return JSON.parse(raw) as T
}

async function apiForm<T>(path: string, init: Omit<RequestInit, 'body'> & { body: FormData }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    body: init.body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
  }
  if (res.status === 204) return undefined as T
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) return undefined as T
  const raw = await res.text()
  if (!raw) return undefined as T
  return JSON.parse(raw) as T
}

export const repo = {
  async listBuildings(input?: { status?: Building['status']; query?: string }): Promise<Building[]> {
    const params = new URLSearchParams()
    if (input?.status) params.set('status', input.status)
    if (input?.query && input.query.trim()) params.set('query', input.query.trim())
    const qs = params.size ? `?${params.toString()}` : ''
    const raw = await api<ServerBuilding[]>(`/api/buildings${qs}`)
    return raw.map(toBuilding)
  },

  async getBuilding(id: string): Promise<Building | undefined> {
    try {
      const raw = await api<ServerBuilding>(`/api/buildings/${encodeURIComponent(id)}`)
      return toBuilding(raw)
    } catch (e) {
      if (String(e).includes('HTTP 404')) return undefined
      throw e
    }
  },

  async createBuilding(input: { name: string; mainPhotoDataUrl: string; location?: string }): Promise<Building> {
    const raw = await api<ServerBuilding>(`/api/buildings`, {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        mainPhotoDataUrl: input.mainPhotoDataUrl,
        location: input.location,
      }),
    })
    return toBuilding(raw)
  },

  async setBuildingStatus(buildingId: string, status: Building['status']): Promise<void> {
    await api<void>(`/api/buildings/${encodeURIComponent(buildingId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  },

  async updateBuilding(buildingId: string, patch: { name?: string; location?: string }): Promise<void> {
    await api<void>(`/api/buildings/${encodeURIComponent(buildingId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: patch.name, location: patch.location }),
    })
  },

  async deleteBuilding(buildingId: string): Promise<void> {
    await api<void>(`/api/buildings/${encodeURIComponent(buildingId)}`, {
      method: 'DELETE',
    })
  },

  async addTag(buildingId: string, input: { type: TagType; x: number; y: number }): Promise<Tag | undefined> {
    const raw = await api<ServerTag>(`/api/buildings/${encodeURIComponent(buildingId)}/tags`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return toTag(raw)
  },

  async updateTag(
    buildingId: string,
    tagId: string,
    patch: Partial<Pick<Tag, 'name' | 'status' | 'x' | 'y' | 'photos' | 'comments'>>,
  ): Promise<void> {
    const serverPatch: Record<string, unknown> = {}
    if ('name' in patch) serverPatch.name = patch.name ?? null
    if ('status' in patch) serverPatch.status = patch.status ?? null
    if ('x' in patch) serverPatch.x = patch.x ?? null
    if ('y' in patch) serverPatch.y = patch.y ?? null
    if ('comments' in patch) {
      serverPatch.comments = (patch.comments ?? []).map((c) => ({
        id: c.id,
        createdAt: c.createdAt,
        text: c.text,
      }))
    }
    if ('photos' in patch) {
      serverPatch.photos = (patch.photos ?? []).map((p) => {
        const parsed = parseDataUrl(p.dataUrl)
        return {
          id: p.id,
          createdAt: p.createdAt,
          fileName: 'photo',
          contentType: parsed?.contentType ?? 'application/octet-stream',
          blob: parsed?.b64 ?? '',
          kind: p.kind,
        }
      })
    }

    await api<void>(`/api/buildings/${encodeURIComponent(buildingId)}/tags/${encodeURIComponent(tagId)}`, {
      method: 'PATCH',
      body: JSON.stringify(serverPatch),
    })
  },

  async deleteTag(buildingId: string, tagId: string): Promise<void> {
    await api<void>(`/api/buildings/${encodeURIComponent(buildingId)}/tags/${encodeURIComponent(tagId)}`, {
      method: 'DELETE',
    })
  },

  async uploadTagPhoto(
    buildingId: string,
    tagId: string,
    file: File,
    kind: TagPhotoKind = 'general',
  ): Promise<TagPhoto> {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', kind)
    const raw = await apiForm<ServerTagPhoto>(
      `/api/buildings/${encodeURIComponent(buildingId)}/tags/${encodeURIComponent(tagId)}/files`,
      {
        method: 'POST',
        body: fd,
      },
    )
    return {
      id: raw.id,
      createdAt: raw.createdAt,
      dataUrl: toDataUrl(raw),
      kind: raw.kind,
    }
  },
}

