import { NavLink } from 'react-router-dom'

export default function Navbar() {
  return (
    <nav className="app-nav">
      <NavLink to="/dungeons" className="app-nav__brand">
        Dungeon Creator
      </NavLink>
      <div className="app-nav__links">
        <NavLink
          to="/dungeons"
          end
          className={({ isActive }) =>
            isActive ? 'app-nav__link app-nav__link--active' : 'app-nav__link'
          }
        >
          Library
        </NavLink>
        <NavLink
          to="/dungeons/new"
          className={({ isActive }) =>
            isActive
              ? 'app-nav__link app-nav__link--cta app-nav__link--active'
              : 'app-nav__link app-nav__link--cta'
          }
        >
          + New Dungeon
        </NavLink>
      </div>
    </nav>
  )
}
