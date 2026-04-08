export function SettingsPage() {
  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">Placeholder screen (hook up app preferences here)</p>

      <div className="cards">
        <div className="card" style={{ gridTemplateColumns: '1fr' }}>
          <div className="meta">
            <h3 className="card-title">Storage</h3>
            <div className="card-sub">
              Data is stored locally in your browser (localStorage) for now.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

