import { useEffect } from 'react'
import { useChrome } from '../components/AppLayout'

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="tab-panel"
      style={{
        background: 'rgba(255, 255, 255, 0.85)',
      }}
    >
      <div style={{ fontWeight: 950, fontSize: 14 }}>{props.title}</div>
      <div style={{ marginTop: 10, display: 'grid', gap: 8, color: 'rgba(15, 23, 42, 0.78)', fontSize: 14, lineHeight: 1.45 }}>
        {props.children}
      </div>
    </div>
  )
}

function Bullet(props: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ marginTop: 7, width: 6, height: 6, borderRadius: 999, background: 'rgba(15, 23, 42, 0.35)' }} />
      <div style={{ minWidth: 0 }}>{props.children}</div>
    </div>
  )
}

export function HelpPage() {
  const chrome = useChrome()

  useEffect(() => {
    chrome.setTitle('Help')
    return () => chrome.setTitle('Vanguard')
  }, [chrome])

  return (
    <div className="page">
      <h1 className="page-title">Help</h1>
      <p className="page-subtitle">How to use Vanguard</p>

      <div className="form" style={{ marginTop: 14 }}>
        <Section title="Buildings">
          <Bullet>
            Open <b>Buildings</b> from the menu to see all buildings.
          </Bullet>
          <Bullet>
            Click <b>+</b> to create a building. Name and main photo are required.
          </Bullet>
          <Bullet>
            Click a building card to open the building photo and tags.
          </Bullet>
        </Section>

        <Section title="Navigating the photo (pan & zoom)">
          <Bullet>
            <b>Pan</b>: drag on the photo with one finger (mobile) or click-drag (desktop).
          </Bullet>
          <Bullet>
            <b>Zoom</b>: pinch with two fingers (mobile) or use the mouse wheel (desktop).
          </Bullet>
          <Bullet>
            While you pan/zoom, tag selection is cleared so you can navigate without accidental actions.
          </Bullet>
        </Section>

        <Section title="Creating a tag">
          <Bullet>
            Tap/click on the photo to open the <b>Create tag</b> radial menu.
          </Bullet>
          <Bullet>
            Choose a type: <b>Anchor point</b>, <b>Cleaning</b>, or <b>Issue</b>.
          </Bullet>
          <Bullet>
            The newly created tag is selected automatically.
          </Bullet>
        </Section>

        <Section title="Selecting a tag & sharing a link">
          <Bullet>
            Tap/click a tag dot to open its actions and details.
          </Bullet>
          <Bullet>
            The selected tag is stored in the URL as <code>?tag=&lt;id&gt;</code>, so refresh/share keeps the same tag open.
          </Bullet>
          <Bullet>
            When you unselect the tag, the URL is updated to remove the <code>tag</code> parameter.
          </Bullet>
        </Section>

        <Section title="Moving a tag">
          <Bullet>
            Long-press a tag dot (mobile) or press and drag it (desktop) to move.
          </Bullet>
          <Bullet>
            Drop it to save the new position. The app prevents accidental selection immediately after a drag.
          </Bullet>
        </Section>

        <Section title="Tag actions">
          <Bullet>
            <b>Delete</b>: uses a confirmation dialog to avoid accidental deletions.
          </Bullet>
          <Bullet>
            <b>Anchor</b>: mark status (Before check / Passed / Didn’t pass).
          </Bullet>
          <Bullet>
            <b>Cleaning</b>: toggle status (Before / After) and upload “before/after” photos.
          </Bullet>
          <Bullet>
            <b>Issue</b>: upload photos and add comments.
          </Bullet>
        </Section>

        <Section title="Comments">
          <Bullet>
            Use <b>Add comment</b> from tag actions or the tag details panel.
          </Bullet>
          <Bullet>
            Comments are saved to the server and shown in reverse chronological order.
          </Bullet>
        </Section>

        <Section title="Photos">
          <Bullet>
            Uploading a tag photo sends the file to the server (<code>/api/buildings/.../files</code>) and then refreshes the building.
          </Bullet>
          <Bullet>
            If an upload fails, a red toast will show the error.
          </Bullet>
        </Section>
      </div>
    </div>
  )
}

