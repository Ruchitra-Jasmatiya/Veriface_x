// =========================================================
// images.js - finds your photos in  src/assets/images/
//
// Put files there named  img1.jpeg, img2.jpeg ... img10.jpeg
// (.jpg .png .webp .avif also work). Then use the name WITHOUT
// the extension:   getImage('img1')
//
// Nothing breaks if a file is missing: getImage returns undefined
// and the page shows a clearly marked placeholder box instead.
// =========================================================

// Vite finds every image in that folder at build time.
const files = import.meta.glob('../assets/images/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG}', {
  eager: true,
  query: '?url',
  import: 'default',
});

// Build a simple lookup:  { img1: '/src/assets/images/img1.jpeg', ... }
const lookup = {};
Object.entries(files).forEach(([path, url]) => {
  const file = path.split('/').pop(); // img1.jpeg
  const name = file.replace(/\.[^.]+$/, '').toLowerCase(); // img1
  lookup[name] = url;
});

export function getImage(name) {
  if (!name) return undefined;
  return lookup[String(name).toLowerCase()];
}
