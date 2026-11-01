// =========================================================
// Img.jsx - an <img> that never looks broken.
// If the file is missing, a flat coloured placeholder card is
// shown instead, with the alt text and the file path, so you
// know exactly which photo to add.
//
//   <Img src="/images/hero/hero.png" alt="Bowl of aloo bhujia" />
//
// REPLACE: just drop your real files at the paths used in the
// code (see README) and the placeholders disappear by themselves.
// =========================================================

import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import './Img.css';

export default function Img({ src, alt, className = '', compact = false, eager = false, hint, ...rest }) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div className={`img-ph ${compact ? 'img-ph--compact' : ''} ${className}`} role="img" aria-label={alt}>
        <ImageIcon size={compact ? 22 : 36} strokeWidth={2.5} aria-hidden="true" />
        {!compact && (
          <>
            <span className="img-ph__alt">{alt}</span>
            <span className="img-ph__path">REPLACE: {hint || src}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <img
      className={`img ${className}`}
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}
