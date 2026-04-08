export function nowIso(): string {
  return new Date().toISOString()
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
}

export function uuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const c = (typeof crypto !== 'undefined' ? crypto : undefined) as Crypto | undefined
  if (c?.getRandomValues) {
    const bytes = new Uint8Array(16)
    c.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2).padEnd(12, '0').slice(0, 12)}`
}

export function formatCardDate(iso: string): string {
  const d = new Date(iso)
  const m = d.toLocaleString(undefined, { month: 'short' }).toUpperCase()
  const day = String(d.getDate()).padStart(2, '0')
  const year = d.getFullYear()
  return `${m} ${day}, ${year}`
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.min(1, Math.max(0, n))
}

export function svgDataUrl(svg: string): string {
  const encoded = encodeURIComponent(svg)
    .replace(/%0A/g, '')
    .replace(/%20/g, ' ')
    .replace(/%3D/g, '=')
    .replace(/%3A/g, ':')
    .replace(/%2F/g, '/')
    .replace(/%2C/g, ',')
    .replace(/%3B/g, ';')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%23/g, '#')
  return `data:image/svg+xml,${encoded}`
}

