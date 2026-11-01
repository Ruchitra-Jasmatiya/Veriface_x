import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import "./Navbar.css";

// Each id must match an element id on the home page (see Home.jsx).
const LINKS = [
  { id: "home", label: "Home" },
  { id: "scan", label: "Scan" },
  { id: "how", label: "How it works" },
  { id: "checks", label: "Checks" },
  { id: "ledger", label: "Ledger" },
  { id: "faq", label: "FAQ" },
  { id: "report-cybercrime", label: "Report abuse" },
];

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState("home");

  // Add a shadow to the bar once the page has scrolled.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu with the Escape key.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Highlight the link for the section currently in the middle of the screen.
  useEffect(() => {
    const sections = LINKS.map((link) => document.getElementById(link.id)).filter(Boolean);
    if (!("IntersectionObserver" in window) || sections.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={`vx-nav ${scrolled ? "is-scrolled" : ""}`}>
      <div className="vx-nav-inner">
        <a href="#home" className="vx-brand" onClick={closeMenu}>
          <span className="vx-brand-mark">
            <ShieldCheck size={20} />
          </span>
          <span className="vx-brand-text">
            VeriFace<span>-X</span>
          </span>
        </a>

        <nav aria-label="Main navigation">
          <ul id="vx-links" className={`vx-links ${menuOpen ? "is-open" : ""}`}>
            {LINKS.map((link) => (
              <li key={link.id}>
                <a
                  href={`#${link.id}`}
                  className={`vx-link ${active === link.id ? "is-active" : ""}`}
                  aria-current={active === link.id ? "true" : undefined}
                  onClick={() => {
                    setActive(link.id);
                    closeMenu();
                  }}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="vx-nav-actions">
          <a href="#scan" className="vx-nav-cta" onClick={closeMenu}>
            Scan an image
          </a>
          <button
            type="button"
            className={`vx-burger ${menuOpen ? "is-open" : ""}`}
            aria-expanded={menuOpen}
            aria-controls="vx-links"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}

export default Navbar;