import { NavLink } from 'react-router-dom'

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      <NavLink
        to="/buildings"
        className="nav-item"
        data-active={undefined}
        end
      >
        {({ isActive }) => (
          <span className="nav-item" data-active={isActive}>
            <BuildingsIcon />
            <span>BUILDINGS</span>
          </span>
        )}
      </NavLink>

      <NavLink to="/settings" className="nav-item">
        {({ isActive }) => (
          <span className="nav-item" data-active={isActive}>
            <SettingsIcon />
            <span>SETTINGS</span>
          </span>
        )}
      </NavLink>
    </nav>
  )
}

function BuildingsIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20V5a1 1 0 011-1h14a1 1 0 011 1v15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M7 8h3M7 12h3M7 16h3M14 8h3M14 12h3M14 16h3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M19.4 13a7.9 7.9 0 000-2l2-1.2-2-3.5-2.2.7a7.7 7.7 0 00-1.7-1l-.2-2.3H11l-.2 2.3a7.7 7.7 0 00-1.7 1l-2.2-.7-2 3.5 2 1.2a7.9 7.9 0 000 2l-2 1.2 2 3.5 2.2-.7c.5.4 1.1.7 1.7 1l.2 2.3h4.1l.2-2.3c.6-.3 1.2-.6 1.7-1l2.2.7 2-3.5-2-1.2z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

