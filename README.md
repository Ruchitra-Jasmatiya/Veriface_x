# VeriFace-X

VeriFace-X is an image-manipulation and AI-generation checking tool. You upload a JPG, PNG or WEBP image and get:

- a **manipulation-risk score** from 0 to 100,
- every **individual check** with its measured value and what it means,
- the **findings** and the **limitations** of the method,
- a stored **record** with a SHA-256 fingerprint, upload count, and uploader IP and device.

## What it does NOT do

- It does **not** prove an image is authentic or fake. A low score means "no strong signals were found", never "100% safe".
- It cannot identify a specific generator (Google, ChatGPT, Claude, Midjourney, …) from pixels. It can only read metadata that is present in the file, and metadata is easy to strip.
- The score thresholds are heuristics. They have **not** been validated on a labelled dataset of real, edited and AI-generated images. Do not present the numbers as measured accuracy until that validation is done.

## Security note (action required)

The original repository committed a Django `SECRET_KEY`, a plaintext admin password in this README, and a SQLite database. Those values are still in git history. **Rotate the admin password and generate a new secret key**, then consider rewriting the history (for example with `git filter-repo`) before making the repository public.

## Requirements

- Python 3.11 or newer
- Node.js 18+ and npm

## Backend setup

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env               # then edit the values
export $(grep -v '^#' .env | xargs)   # Windows: set the variables manually

python manage.py makemigrations api
python manage.py migrate
python manage.py createsuperuser   # needed only for the admin site and DELETE
python manage.py runserver
```

`makemigrations` must be run once after cloning, because the old migrations were removed when the models were rewritten.

Set `DJANGO_DEBUG=0` and a real `DJANGO_SECRET_KEY` for any deployment. With debug off, the server refuses to start without a secret key.

## Engine tests (no Django needed)

```bash
python tests/test_forensics.py
```

## Django tests

```bash
python manage.py test api
```

## Frontend setup

```bash
npm install
npm run dev          # http://localhost:5173
```

If the backend is not on `http://127.0.0.1:8000/api`, create `.env.local` with:

```
VITE_API_BASE=http://your-host:8000/api
```

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/scan/` | Upload an image (multipart field `image`). Returns the record and report. |
| GET | `/api/scans/?q=` | Latest 50 records, optionally filtered by file name or record ID. |
| GET | `/api/scans/<record id>/` | One full record. |
| DELETE | `/api/scans/<record id>/` | Admin login required. |
| GET | `/api/stats/` | Counts computed from the database. |

## Verdict bands

| Score | Verdict | Meaning |
|---|---|---|
| 0–50 | AUTHENTIC IMAGE | No strong manipulation or AI signals. Not proof of authenticity. |
| 51–80 | MODIFIED ASSET | Signs that the image was processed or altered after capture. |
| 81–100 | HIGH MANIPULATION RISK | Strong AI-generation or manipulation indicators. |

## Privacy

- Each scan stores the file's SHA-256, the scores, the findings, the uploader's IP address and the browser user-agent.
- Uploaded images are **not** stored unless `VERIFACE_STORE_UPLOADS=1`. Enable it only with a privacy notice and a lawful basis under applicable law (for India, the Digital Personal Data Protection Act, 2023).
- Uploader IP is taken from the connection address only. Forwarded-for headers are not trusted, because clients can forge them.

## Limitations of the checks

| Check | What it measures | Known false positives / negatives |
|---|---|---|
| Error Level Analysis (JPEG only) | Local recompression error | Re-saved or heavily compressed genuine images; skipped for PNG/WEBP |
| Noise consistency | Spread of sensor-noise levels across regions | Mixed-content scenes; strong blur or heavy compression |
| Smoothness | Overall fine detail | Flat graphics, UI screenshots and illustrations score high |
| AI markers / editing software | Metadata text | Easily removed or edited; absence means nothing |
| Camera metadata | Make, model and capture date | Easily forged; caps the score only when no editing or AI markers exist |

## Project layout

```
api/forensics.py      analysis engine (no Django imports, unit-testable)
api/views.py          HTTP endpoints
api/models.py         ScanRecord table
tests/test_forensics.py   engine tests
src/components/Home.jsx   main page and scan flow
src/components/Report.jsx forensic report
src/components/CybercellGuide.jsx  reporting guidance below the home content
```
