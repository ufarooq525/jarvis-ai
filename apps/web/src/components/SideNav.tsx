import { NavLink, Link } from "react-router-dom";

export type SideItem = {
  to: string;
  label: string;
  end?: boolean;
  badge?: number | string;
};

export type SideGroup = {
  id: string;
  label: string;
  items: SideItem[];
};

export function SideNav({
  collapsed,
  onToggle,
  groups,
  mobileOpen,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle: () => void;
  groups: SideGroup[];
  mobileOpen: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div
        className={`side-scrim${mobileOpen ? " on" : ""}`}
        onClick={onNavigate}
        aria-hidden={!mobileOpen}
      />
      <aside
        className={`side${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-on" : ""}`}
        aria-label="Primary"
      >
        <div className="side-top">
          <Link to="/" className="mark" onClick={onNavigate} title="JARVIS">
            <span className="mark-glyph">
              <span />
            </span>
            <b>JARVIS</b>
          </Link>
          <button
            type="button"
            className="ico side-collapse"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
            onClick={onToggle}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>

        <nav className="side-nav">
          {groups.map((g) => (
            <div className="side-group" key={g.id}>
              <p className="side-label">{g.label}</p>
              {g.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className="side-link"
                  title={item.label}
                  onClick={onNavigate}
                >
                  <span className="side-link-glyph" aria-hidden>
                    {item.label.slice(0, 1)}
                  </span>
                  <span className="side-link-text">{item.label}</span>
                  {item.badge != null && item.badge !== "" ? (
                    <em className="side-badge">{item.badge}</em>
                  ) : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
