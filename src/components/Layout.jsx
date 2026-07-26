import { NavLink } from "react-router-dom";
import site from "../site.config.js";

export default function Layout({ children }) {
  return (
    <div className="site-frame">
      <header className="site-header">
        <div className="site-header-inner">
          <NavLink to="/" className="site-wordmark">
            <span aria-hidden="true" />
            {site.title}
          </NavLink>
          <div className="site-header-actions">
            <span>EPA record explorer</span>
            <a href={site.support.url} target="_blank" rel="noreferrer">
              Support the work
            </a>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="site-footer">
        <div>
          <p>
            Data from{" "}
            <a
              href={site.attribution.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {site.attribution.sourceName}
            </a>
            .
          </p>
          <p>{site.attribution.note}</p>
        </div>
      </footer>
    </div>
  );
}
