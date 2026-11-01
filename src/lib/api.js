// Central place for backend calls. Set VITE_API_BASE in a .env.local file to change the address.
export const API_BASE = (import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000/api").replace(/\/$/, "");

const UNREACHABLE =
  `Cannot reach the analysis server at ${API_BASE}. ` +
  "Make sure the Django server is running (python manage.py runserver), then try again.";

// fetch() throws a TypeError when the server cannot be reached at all.
// Turn that into a clear message instead of the browser's "Failed to fetch".
async function send(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(UNREACHABLE);
  }
}

async function readJson(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = (body && body.error) || `The server returned an error (status ${response.status}).`;
    throw new Error(message);
  }
  return body;
}

export async function scanImage(file) {
  const formData = new FormData();
  formData.append("image", file);
  return readJson(await send(`${API_BASE}/scan/`, { method: "POST", body: formData }));
}

export async function fetchLedger(query = "") {
  const url = query ? `${API_BASE}/scans/?q=${encodeURIComponent(query)}` : `${API_BASE}/scans/`;
  return readJson(await send(url));
}

export async function fetchScan(systemHash) {
  return readJson(await send(`${API_BASE}/scans/${encodeURIComponent(systemHash)}/`));
}

export async function fetchStats() {
  return readJson(await send(`${API_BASE}/stats/`));
}