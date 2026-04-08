import type { Building } from './types'
import { nowIso, svgDataUrl, uid } from './utils'

function roofPlaceholder(title: string): string {
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="450" viewBox="0 0 600 450">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#c7d2fe"/>
          <stop offset="1" stop-color="#bfdbfe"/>
        </linearGradient>
        <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#0f172a" flood-opacity="0.18"/>
        </filter>
      </defs>
      <rect width="600" height="450" fill="url(#g)"/>
      <g filter="url(#s)">
        <rect x="70" y="70" width="460" height="310" rx="26" fill="rgba(255,255,255,0.55)" stroke="rgba(15,23,42,0.12)"/>
        <path d="M120 300 L210 190 L290 260 L350 215 L460 325" fill="none" stroke="rgba(15,23,42,0.25)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <text x="300" y="230" text-anchor="middle" font-family="system-ui,Segoe UI,Roboto,Arial" font-size="28" font-weight="800" fill="rgba(15,23,42,0.55)">
        ${title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
      </text>
    </svg>
  `)
}

export function seedBuildings(): Building[] {
  const baseCreated = new Date('2025-10-05T10:00:00.000Z').toISOString()
  const b1: Building = {
    id: uid('bld'),
    createdAt: new Date('2025-10-12T10:00:00.000Z').toISOString(),
    name: 'Skyline Tower',
    location: '101 Financial District, Metro City',
    status: 'active',
    mainPhotoDataUrl: roofPlaceholder('Skyline Tower'),
    tags: [],
  }
  const b2: Building = {
    id: uid('bld'),
    createdAt: new Date('2025-10-10T10:00:00.000Z').toISOString(),
    name: 'Green Valley Mall',
    location: '450 Retail Blvd, Suburbia',
    status: 'active',
    mainPhotoDataUrl: roofPlaceholder('Green Valley Mall'),
    tags: [],
  }
  const b3: Building = {
    id: uid('bld'),
    createdAt: new Date('2025-10-08T10:00:00.000Z').toISOString(),
    name: 'Nexus Corporate Park',
    location: '88 Tech Plaza, Innovation Way',
    status: 'active',
    mainPhotoDataUrl: roofPlaceholder('Nexus Corporate Park'),
    tags: [],
  }
  const b4: Building = {
    id: uid('bld'),
    createdAt: baseCreated,
    name: 'Industrial Hub B',
    location: '123 Industrial Way, Port Zone',
    status: 'completed',
    completedAt: nowIso(),
    mainPhotoDataUrl: roofPlaceholder('Industrial Hub B'),
    tags: [],
  }

  return [b1, b2, b3, b4]
}

