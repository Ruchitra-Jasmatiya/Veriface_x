// =========================================================
// Logo.jsx - the Taran Hari badge logo (maroon plaque, gold serif
// name, small tagline). Built from text + CSS so it never breaks.
// It links to Home.
//
// REPLACE: to use your own logo image, put it at
// public/images/logo.png and replace the <span className="logo__badge">
// block with <img src="/images/logo.png" alt="" className="logo__img" />.
// =========================================================

import { Link } from 'react-router-dom';
import './Logo.css';

export function LogoMark({ size = 'md' }) {
  return (
    <span className={`logo logo--${size}`}>
      <span className="logo__badge">Taran Hari</span>
      <span className="logo__tag">Snacks &bull; Happiness &bull; Always</span>
    </span>
  );
}

// Clickable logo (goes home)
export default function Logo({ size = 'md', onClick }) {
  return (
    <Link to="/" className="logo-link" aria-label="Taran Hari - go to home" onClick={onClick}>
      <LogoMark size={size} />
    </Link>
  );
}
