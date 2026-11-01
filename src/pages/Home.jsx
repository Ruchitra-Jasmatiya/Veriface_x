import { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload,
  Search,
  FileText,
  Loader2,
  Download,
  Eye,
  ShieldAlert,
  ShieldCheck,
  Layers,
  Cpu,
  Image as ImageIcon,
  Globe,
  CheckCircle,
  Lock,
  ScanFace,
  ChevronRight,
  Activity,
  Server,
  Zap,
} from "lucide-react";
import bannerVideo from "../assets/images/banner.mp4";
import { API_BASE, scanImage, fetchLedger, fetchScan, fetchStats } from "../lib/api";
import "./Home.css";

/* ==========================================================================
   CONSTANTS
   ========================================================================== */

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_MB = 10;

const SCAN_STEPS = [
  "Validating the file",
  "Measuring error levels",
  "Checking noise consistency",
  "Reading metadata markers",
  "Building the report",
];

const CHECKS = [
  {
    icon: Layers,
    title: "Error Level Analysis",
    text: "Recompresses a JPEG and compares error levels across blocks. Pasted or re-saved regions often stand out.",
    scope: "JPEG only",
  },
  {
    icon: Activity,
    title: "Noise consistency",
    text: "A single camera capture has one sensor-noise profile. Regions with a different noise level can point to an edit.",
    scope: "All formats",
  },
  {
    icon: Zap,
    title: "Pixel smoothness",
    text: "Unusually smooth pixels can indicate synthetic or heavily processed content. Flat graphics also score here.",
    scope: "All formats",
  },
  {
    icon: Cpu,
    title: "AI-generation markers",
    text: "Reads metadata for generator names and AI provenance labels. Markers can be removed, so absence proves nothing.",
    scope: "When present",
  },
  {
    icon: Eye,
    title: "Editing software",
    text: "Detects editing apps recorded in metadata. Editing is common and is not proof of tampering.",
    scope: "When present",
  },
  {
    icon: ScanFace,
    title: "Camera metadata",
    text: "Make, model and capture time. Supporting evidence only, since metadata can be forged.",
    scope: "When present",
  },
];

const FAQ = [
  {
    q: "Does a low score mean the image is real?",
    a: "No. A low score means these checks did not find strong signals. An edited or AI-generated image can still pass them. Treat the result as one indicator among others.",
  },
  {
    q: "Can it tell which AI tool made an image?",
    a: "Not from the pixels. It can only report a generator name when that name is written in the file's metadata, and metadata is easy to remove.",
  },
  {
    q: "Are my uploads stored?",
    a: "Each scan stores the file's fingerprint (SHA-256), the scores, and the uploader's IP and browser. The image itself is kept only if the server operator enables it.",
  },
  {
    q: "Why does a screenshot get a higher smoothness score?",
    a: "Screenshots and graphics have large flat areas with little sensor noise, which the smoothness check reads as processed. This is a known false positive.",
  },
  {
    q: "What file types work?",
    a: "JPG, PNG and WEBP images up to 10 MB. The error-level check runs only on JPEG files.",
  },
];

/* ==========================================================================
   HELPERS
   ========================================================================== */

const bandFromLevel = (level) => (level === "High" ? "high" : level === "Medium" ? "medium" : "low");

const BAND_LABEL = { low: "Low risk", medium: "Medium risk", high: "High risk" };

const toneOf = (signal) => {
  if (!signal.applicable) return "na";
  if (signal.score >= 75) return "bad";
  if (signal.score >= 30) return "warn";
  return "ok";
};

const TONE_LABEL = { ok: "Low", warn: "Moderate", bad: "High", na: "Not applicable" };

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d)) return value;
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatKb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

function buildReportText(r) {
  return [
    "VERIFACE-X FORENSIC REPORT",
    "==========================",
    `Record ID                : ${r.system_hash}`,
    `Generated (IST)          : ${formatDate(r.created_at)}`,
    `File name                : ${r.file_name}`,
    `File size                : ${formatKb(r.file_size_bytes)}`,
    `Format / dimensions      : ${r.image_format} ${r.width}x${r.height}`,
    `SHA-256                  : ${r.sha256}`,
    `Times this file scanned  : ${r.times_this_image_scanned}`,
    "",
    `Verdict                  : ${r.verdict}`,
    `Risk level               : ${r.risk_level}`,
    `Manipulation-risk score  : ${r.risk_score} / 100`,
    `Summary                  : ${r.summary}`,
    "",
    "CHECKS",
    "------",
    ...r.signals.map(
      (s) => `- ${s.label}: ${s.value} | ${s.applicable ? `score ${s.score}` : "not applicable"} | ${s.meaning}`
    ),
    "",
    "FINDINGS",
    "--------",
    ...r.findings.map((f) => `- ${f}`),
    "",
    "LIMITATIONS",
    "-----------",
    ...r.limitations.map((l) => `- ${l}`),
    "",
    `Engine: ${r.engine_version}`,
  ].join("\n");
}

/* ==========================================================================
   HOOKS
   ========================================================================== */

// Reveals elements with the .vx-reveal class as they scroll into view.
function useReveal(deps) {
  useEffect(() => {
    const items = document.querySelectorAll(".vx-reveal:not(.is-visible)");
    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-visible"));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// Animates a number from 0 to target. Returns the current display value.
function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof target !== "number") {
      setValue(0);
      return undefined;
    }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

/* ==========================================================================
   SMALL COMPONENTS
   ========================================================================== */

function RiskRing({ score, band }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, Number(score) || 0));
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <div className={`vx-ring vx-ring-${band}`}>
      <svg viewBox="0 0 128 128" role="img" aria-label={`Risk score ${clamped} out of 100`}>
        <circle className="vx-ring-track" cx="64" cy="64" r={radius} />
        <circle
          className="vx-ring-bar"
          cx="64"
          cy="64"
          r={radius}
          strokeDasharray={circumference}
          style={{ "--ring-c": circumference, "--ring-offset": offset }}
        />
      </svg>
      <div className="vx-ring-label">
        <strong>{clamped}</strong>
        <span>of 100</span>
      </div>
    </div>
  );
}

function ScanProgress({ stepIndex }) {
  return (
    <ol className="vx-steps" aria-label="Analysis progress">
      {SCAN_STEPS.map((label, i) => {
        const state = i < stepIndex ? "done" : i === stepIndex ? "active" : "todo";
        return (
          <li key={label} className={`vx-step is-${state}`}>
            <span className="vx-step-dot">
              {state === "done" ? <CheckCircle size={16} /> : state === "active" ? <Loader2 size={16} className="vx-spin" /> : null}
            </span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ==========================================================================
   REPORT
   ========================================================================== */

function Report({ result, innerRef }) {
  const band = bandFromLevel(result.risk_level);
  const cameraEntries = Object.entries(result.camera_metadata || {});

  const download = () => {
    const blob = new Blob([buildReportText(result)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VeriFace-X_${result.system_hash}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <article ref={innerRef} className={`vx-card vx-report vx-band-${band} vx-reveal`} aria-live="polite">
      <header className="vx-report-head">
        <div>
          <p className="vx-eyebrow">Forensic report</p>
          <h3 className="vx-report-title">{result.file_name}</h3>
          <p className="vx-muted">
            Record <code className="vx-code">{result.system_hash}</code> · {formatDate(result.created_at)}
          </p>
        </div>
        <span className={`vx-badge vx-badge-${band}`}>{BAND_LABEL[band]}</span>
      </header>

      <div className="vx-verdict">
        <RiskRing score={result.risk_score} band={band} />
        <div className="vx-verdict-text">
          <h4>{result.verdict}</h4>
          <p>{result.summary}</p>
          <div className="vx-meter" aria-hidden="true">
            <span className={`vx-meter-fill vx-fill-${band}`} style={{ "--fill": `${result.risk_score}%` }} />
          </div>
          <div className="vx-scale">
            <span>0 · no signals</span>
            <span>50</span>
            <span>80</span>
            <span>100 · strong signals</span>
          </div>
          <p className="vx-note">
            Bands: 0–50 Low · 51–80 Medium (processed or altered) · 81–100 High (strong AI or manipulation indicators).
            This is an automated indicator, not proof.
          </p>
        </div>
      </div>

      <div className="vx-info-grid">
        <div className="vx-info">
          <span className="vx-info-label">File</span>
          <strong>{result.file_name}</strong>
          <span className="vx-muted">
            {result.image_format} · {result.width}×{result.height} · {formatKb(result.file_size_bytes)}
          </span>
          <span className="vx-muted vx-mono">SHA-256 {result.sha256}</span>
        </div>
        <div className="vx-info">
          <span className="vx-info-label">Upload history</span>
          <strong>
            Scanned {result.times_this_image_scanned} time{result.times_this_image_scanned === 1 ? "" : "s"}
          </strong>
          <span className="vx-muted">
            Uploads from this IP: {result.uploads_from_this_ip ?? "—"}
          </span>
          <span className="vx-muted">Processed in {result.processing_time_ms} ms</span>
        </div>
        <div className="vx-info">
          <span className="vx-info-label">Camera metadata</span>
          {cameraEntries.length ? (
            cameraEntries.map(([k, v]) => (
              <span key={k} className="vx-muted">
                <strong className="vx-inline-key">{k.replace("_", " ")}:</strong> {v}
              </span>
            ))
          ) : (
            <span className="vx-muted">None recorded in this file.</span>
          )}
        </div>
      </div>

      <h4 className="vx-subhead">Checks performed</h4>
      <div className="vx-checks">
        <div className="vx-check vx-check-head" aria-hidden="true">
          <span>Check</span>
          <span>Measured</span>
          <span>Result</span>
          <span>What it means</span>
        </div>
        {result.signals.map((s) => {
          const tone = toneOf(s);
          return (
            <div key={s.key} className="vx-check">
              <span className="vx-check-name">{s.label}</span>
              <span className="vx-check-value vx-mono">{s.value}</span>
              <span className={`vx-pill vx-pill-${tone}`}>{TONE_LABEL[tone]}</span>
              <span className="vx-muted">{s.meaning}</span>
            </div>
          );
        })}
      </div>

      <div className="vx-two-col">
        <div>
          <h4 className="vx-subhead">Findings</h4>
          <ul className="vx-list vx-list-check">
            {result.findings.map((f, i) => (
              <li key={i}>
                <CheckCircle size={16} className="vx-list-icon" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="vx-subhead">Limitations</h4>
          <ul className="vx-list vx-list-warn">
            {result.limitations.map((l, i) => (
              <li key={i}>
                <ShieldAlert size={16} className="vx-list-icon" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="vx-actions no-print">
        <button type="button" className="vx-btn vx-btn-primary" onClick={download}>
          <Download size={16} /> Download report (.txt)
        </button>
        <button type="button" className="vx-btn vx-btn-ghost" onClick={() => window.print()}>
          <FileText size={16} /> Print / save as PDF
        </button>
      </div>
    </article>
  );
}

/* ==========================================================================
   PAGE
   ========================================================================== */

const Home = () => {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const [stats, setStats] = useState(null);
  const [backendDown, setBackendDown] = useState(false);

  const [ledger, setLedger] = useState([]);
  const [ledgerError, setLedgerError] = useState("");
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [query, setQuery] = useState("");

  const inputRef = useRef(null);
  const reportRef = useRef(null);

  const totalScans = useCountUp(stats?.total_scans);
  const uniqueFiles = useCountUp(stats?.unique_images);
  const highRisk = useCountUp(stats?.by_verdict?.["HIGH MANIPULATION RISK"]);

  const loadStats = useCallback(async () => {
    try {
      setStats(await fetchStats());
      setBackendDown(false);
    } catch {
      setBackendDown(true);
    }
  }, []);

  const loadLedger = useCallback(async (q) => {
    setLedgerLoading(true);
    try {
      setLedger(await fetchLedger(q));
      setLedgerError("");
    } catch (err) {
      setLedgerError(err.message || "Could not load the scan ledger.");
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const timer = setTimeout(() => loadLedger(query.trim()), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [query, loadLedger]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!scanning) return undefined;
    setStepIndex(0);
    const timer = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, SCAN_STEPS.length - 1));
    }, 900);
    return () => clearInterval(timer);
  }, [scanning]);

  useReveal([result, ledger.length, stats, backendDown]);

  const chooseFile = (chosen) => {
    setError("");
    if (!chosen) return;
    if (!ACCEPTED_TYPES.includes(chosen.type)) {
      setError("That file type is not supported. Please choose a JPG, PNG or WEBP image.");
      return;
    }
    if (chosen.size > MAX_MB * 1024 * 1024) {
      setError(`That file is larger than ${MAX_MB} MB.`);
      return;
    }
    setResult(null);
    setFile(chosen);
  };

  const clearFile = () => {
    setFile(null);
    setResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const runScan = async () => {
    if (!file || scanning) return;
    setScanning(true);
    setError("");
    setResult(null);
    try {
      const data = await scanImage(file);
      setResult(data);
      loadStats();
      loadLedger(query.trim());
      requestAnimationFrame(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      setError(err.message || "The scan failed. Check that the backend is running.");
    } finally {
      setScanning(false);
    }
  };

  const openRecord = async (systemHash) => {
    setError("");
    try {
      const data = await fetchScan(systemHash);
      setResult(data);
      requestAnimationFrame(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      setError(err.message || "Could not open that record.");
    }
  };

  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="vx-page">
      {/* ============================ HERO ============================ */}
      <section className="vx-hero" id="home">
        <div className="vx-blob vx-blob-a" aria-hidden="true" />
        <div className="vx-blob vx-blob-b" aria-hidden="true" />

        <div className="vx-container vx-hero-grid">
          <div className="vx-hero-copy vx-reveal is-visible">
            <span className="vx-pill-hero">
              <ShieldCheck size={15} /> Measurable checks, stated limits
            </span>
            <h1>
              Find out whether an image was <span className="vx-gradient-text">edited or AI-generated</span>
            </h1>
            <p className="vx-lead">
              Upload a photo and get a manipulation-risk score, every check behind it, and a report you can save.
              Each signal shows its measured value, so you can see exactly why a result was given.
            </p>

            <div className="vx-hero-actions">
              <button type="button" className="vx-btn vx-btn-primary vx-btn-lg" onClick={() => scrollTo("scan")}>
                <Upload size={18} /> Scan an image
              </button>
              <button type="button" className="vx-btn vx-btn-ghost vx-btn-lg" onClick={() => scrollTo("how")}>
                See how it works <ChevronRight size={18} />
              </button>
            </div>

            <ul className="vx-trust">
              <li><Lock size={15} /> Analysed on your server</li>
              <li><Eye size={15} /> Every signal shown</li>
              <li><ShieldAlert size={15} /> Limits stated on each report</li>
            </ul>
          </div>

          <div className="vx-hero-visual vx-reveal is-visible">
            <div className="vx-floating vx-float-1">
              <CheckCircle size={18} />
              <div>
                <strong>Example: no strong signals</strong>
                <span>Noise is consistent across regions</span>
              </div>
            </div>
            <div className="vx-video-frame">
              <video className="vx-video" src={bannerVideo} autoPlay muted loop playsInline aria-label="Product preview" />
              <div className="vx-video-caption">
                <span className="vx-live-dot" /> Live analysis preview
              </div>
            </div>
            <div className="vx-floating vx-float-2">
              <ShieldAlert size={18} />
              <div>
                <strong>Example: editing software found</strong>
                <span>Recorded in the file's metadata</span>
              </div>
            </div>
          </div>
        </div>

        {backendDown && (
          <div className="vx-container">
            <div className="vx-banner vx-banner-warn vx-reveal" role="status">
              <Server size={18} />
              <div>
                <strong>The analysis server is not reachable.</strong>
                <span>Start the Django server, then reload. Expected address: <code className="vx-code">{API_BASE}</code></span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ============================ STATS ============================ */}
      <section className="vx-stats-band vx-reveal" aria-label="Statistics recorded on this server">
        <div className="vx-container vx-stats-grid">
          <div className="vx-stat">
            <Activity size={22} />
            <strong>{stats ? totalScans.toLocaleString("en-IN") : "—"}</strong>
            <span>Scans recorded</span>
          </div>
          <div className="vx-stat">
            <ImageIcon size={22} />
            <strong>{stats ? uniqueFiles.toLocaleString("en-IN") : "—"}</strong>
            <span>Unique files</span>
          </div>
          <div className="vx-stat">
            <ShieldAlert size={22} />
            <strong>{stats ? highRisk.toLocaleString("en-IN") : "—"}</strong>
            <span>High-risk results</span>
          </div>
          <p className="vx-stats-note">Counts come from this server's database only.</p>
        </div>
      </section>

      {/* ============================ SCAN ============================ */}
      <section className="vx-section" id="scan">
        <div className="vx-container">
          <header className="vx-section-head vx-reveal">
            <p className="vx-eyebrow">Step 1</p>
            <h2>Scan an image</h2>
            <p className="vx-muted">JPG, PNG or WEBP, up to {MAX_MB} MB. Nothing is shown publicly.</p>
          </header>

          <div className="vx-scan-grid">
            <div className="vx-card vx-reveal">
              <div
                className={`vx-dropzone ${dragging ? "is-drag" : ""} ${file ? "has-file" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => !file && inputRef.current?.click()}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && !file) inputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  chooseFile(e.dataTransfer.files[0]);
                }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={(e) => chooseFile(e.target.files[0])}
                />
                {previewUrl ? (
                  <div className="vx-preview">
                    <img src={previewUrl} alt="Selected upload preview" />
                    <div className="vx-preview-meta">
                      <span className="vx-preview-name">{file.name}</span>
                      <span>{formatKb(file.size)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="vx-drop-empty">
                    <div className="vx-drop-icon">
                      <Upload size={28} />
                    </div>
                    <h3>Drop an image here</h3>
                    <p>or</p>
                    <button
                      type="button"
                      className="vx-btn vx-btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        inputRef.current?.click();
                      }}
                    >
                      Choose a file
                    </button>
                  </div>
                )}
              </div>

              {error && (
                <div className="vx-banner vx-banner-error" role="alert">
                  <ShieldAlert size={18} />
                  <span>{error}</span>
                </div>
              )}

              <div className="vx-scan-actions">
                <button type="button" className="vx-btn vx-btn-primary vx-btn-lg" disabled={!file || scanning} onClick={runScan}>
                  {scanning ? (
                    <>
                      <Loader2 size={18} className="vx-spin" /> Analysing…
                    </>
                  ) : (
                    <>
                      <Zap size={18} /> Run analysis
                    </>
                  )}
                </button>
                {file && !scanning && (
                  <button type="button" className="vx-btn vx-btn-ghost" onClick={clearFile}>
                    Choose another
                  </button>
                )}
              </div>
            </div>

            <aside className="vx-card vx-side vx-reveal">
              <h3>What you will get</h3>
              {scanning || result ? null : (
                <ul className="vx-bullets">
                  <li>A 0–100 manipulation-risk score</li>
                  <li>Each check with its measured value</li>
                  <li>Findings and the limits of the method</li>
                  <li>A downloadable or printable report</li>
                </ul>
              )}
              {scanning && <ScanProgress stepIndex={stepIndex} />}
              {!scanning && result && (
                <p className="vx-muted">
                  Analysis complete. The full report is below. Scan another image any time.
                </p>
              )}
              <div className="vx-divider" />
              <p className="vx-note">
                A result is an indicator, not a verdict. Read the limitations before drawing conclusions.
              </p>
            </aside>
          </div>

          {result && <Report result={result} innerRef={reportRef} />}
        </div>
      </section>

      {/* ============================ HOW ============================ */}
      <section className="vx-section vx-section-tint" id="how">
        <div className="vx-container">
          <header className="vx-section-head vx-reveal">
            <p className="vx-eyebrow">How it works</p>
            <h2>From upload to report in four steps</h2>
          </header>
          <div className="vx-steps-grid">
            {[
              { icon: Upload, title: "Receive", text: "The file is checked for type, size and readability, then fingerprinted with SHA-256." },
              { icon: Layers, title: "Measure pixels", text: "Error levels, noise and smoothness are measured on a downscaled copy of the image." },
              { icon: Search, title: "Read metadata", text: "EXIF, PNG text and XMP are checked for generator names, editing software and camera data." },
              { icon: FileText, title: "Report", text: "Every signal is listed with its value, its score, and what it does and does not show." },
            ].map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="vx-card vx-step-card vx-reveal" style={{ "--delay": `${i * 90}ms` }}>
                  <span className="vx-step-num">{String(i + 1).padStart(2, "0")}</span>
                  <div className="vx-step-icon">
                    <Icon size={22} />
                  </div>
                  <h3>{step.title}</h3>
                  <p className="vx-muted">{step.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================ CHECKS ============================ */}
      <section className="vx-section" id="checks">
        <div className="vx-container">
          <header className="vx-section-head vx-reveal">
            <p className="vx-eyebrow">What is measured</p>
            <h2>Six checks, each with its own evidence</h2>
          </header>
          <div className="vx-checks-grid">
            {CHECKS.map((c, i) => {
              const Icon = c.icon;
              return (
                <div key={c.title} className="vx-card vx-check-card vx-reveal" style={{ "--delay": `${i * 70}ms` }}>
                  <div className="vx-check-card-head">
                    <div className="vx-step-icon vx-step-icon-alt">
                      <Icon size={20} />
                    </div>
                    <span className="vx-scope">{c.scope}</span>
                  </div>
                  <h3>{c.title}</h3>
                  <p className="vx-muted">{c.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================ LIMITS ============================ */}
      <section className="vx-section vx-section-tint" id="limits">
        <div className="vx-container vx-limits-grid">
          <div className="vx-reveal">
            <p className="vx-eyebrow">Honest limits</p>
            <h2>What this tool cannot tell you</h2>
            <p className="vx-muted">
              No automated check can prove an image is real or fake. These are the cases where this one can be wrong.
            </p>
          </div>
          <ul className="vx-limit-list vx-reveal">
            <li><ShieldAlert size={18} /><span>It cannot prove an image is authentic. A low score means no strong signals were found.</span></li>
            <li><ShieldAlert size={18} /><span>It cannot name the tool that made an image from pixels alone.</span></li>
            <li><ShieldAlert size={18} /><span>Screenshots and graphics often score high on smoothness without being edited.</span></li>
            <li><ShieldAlert size={18} /><span>Thresholds are heuristics that have not been validated on a labelled dataset.</span></li>
          </ul>
        </div>
      </section>

      {/* ============================ LEDGER ============================ */}
      <section className="vx-section" id="ledger">
        <div className="vx-container">
          <header className="vx-section-head vx-section-head-row vx-reveal">
            <div>
              <p className="vx-eyebrow">Recent scans</p>
              <h2>Scan ledger</h2>
              <p className="vx-muted">The latest 50 records on this server. Select one to open its report.</p>
            </div>
            <label className="vx-search">
              <Search size={18} />
              <input
                type="search"
                value={query}
                placeholder="Search by file name or record ID"
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search scan records"
              />
            </label>
          </header>

          {ledgerError && (
            <div className="vx-banner vx-banner-error vx-reveal" role="alert">
              <ShieldAlert size={18} />
              <span>{ledgerError}</span>
            </div>
          )}

          <div className="vx-ledger vx-reveal">
            <div className="vx-ledger-head" aria-hidden="true">
              <span>File</span>
              <span>Verdict</span>
              <span>Score</span>
              <span>Scanned</span>
              <span />
            </div>

            {ledgerLoading && ledger.length === 0 && <div className="vx-ledger-empty">Loading records…</div>}

            {!ledgerLoading && ledger.length === 0 && !ledgerError && (
              <div className="vx-ledger-empty">
                {query ? "No records match that search." : "No scans yet. Run an analysis to see it here."}
              </div>
            )}

            {ledger.map((item) => {
              const band = bandFromLevel(item.risk_level);
              return (
                <button
                  type="button"
                  key={item.system_hash}
                  className="vx-ledger-row"
                  onClick={() => openRecord(item.system_hash)}
                >
                  <span className="vx-ledger-file">
                    <span className={`vx-ledger-thumb vx-band-dot-${band}`}>
                      <ImageIcon size={16} />
                    </span>
                    <span>
                      <strong>{item.file_name}</strong>
                      <small className="vx-mono">{item.system_hash}</small>
                    </span>
                  </span>
                  <span>
                    <span className={`vx-badge vx-badge-${band}`}>{item.verdict}</span>
                  </span>
                  <span className="vx-ledger-score">{item.risk_score} / 100</span>
                  <span className="vx-muted">{formatDate(item.created_at)}</span>
                  <span className="vx-ledger-open">
                    <Eye size={16} /> Open
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================ FAQ ============================ */}
      <section className="vx-section vx-section-tint" id="faq">
        <div className="vx-container vx-faq-grid">
          <header className="vx-section-head vx-reveal">
            <p className="vx-eyebrow">Questions</p>
            <h2>Frequently asked</h2>
          </header>
          <div className="vx-faq vx-reveal">
            {FAQ.map((item) => (
              <details key={item.q} className="vx-faq-item">
                <summary>
                  {item.q}
                  <ChevronRight size={18} className="vx-faq-chevron" />
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ REPORTING GUIDE ============================ */}
      <section className="vx-section" id="report-cybercrime">
        <div className="vx-container">
          <header className="vx-section-head vx-reveal">
            <p className="vx-eyebrow">If you are a victim</p>
            <h2>Reporting a manipulated or abusive image</h2>
            <p className="vx-muted">
              If an image of you or someone else was altered or created with AI to deceive, defame, or sexualise the
              person shown, you can report it to India's National Cyber Crime Reporting Portal.
            </p>
          </header>

          <div className="vx-banner vx-banner-caution vx-reveal">
            <ShieldAlert size={18} />
            <div>
              <strong>Before you report</strong>
              <span>
                This website's result is an automated indicator, not a legal finding. Keep the original file and the
                report, and do not share the image further.
              </span>
            </div>
          </div>

          <ol className="vx-cyber-steps">
            {[
              "Save the original file exactly as you received it. Do not edit or re-save it.",
              "Download the VeriFace-X report. The record ID and SHA-256 identify the file.",
              "Note where you found it: the web address, platform, account name, and the date and time.",
              "Go to cybercrime.gov.in, choose Report Cyber Crime, and attach the original file and the report.",
              "For urgent help or financial fraud, call the national cyber helpline 1930.",
              "You can also file a First Information Report (FIR) at your local police station and keep the reference number.",
              "Ask the hosting platform to remove the image using its report option.",
            ].map((text, i) => (
              <li key={i} className="vx-card vx-cyber-step vx-reveal" style={{ "--delay": `${i * 60}ms` }}>
                <span className="vx-cyber-num">{i + 1}</span>
                <span>{text}</span>
              </li>
            ))}
          </ol>

          <div className="vx-cyber-links vx-reveal">
            <a className="vx-btn vx-btn-primary" href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer">
              Open cybercrime.gov.in <ChevronRight size={16} />
            </a>
            <span className="vx-muted">
              Helpline <strong>1930</strong>. Relevant laws (the IT Act, 2000 and the Bharatiya Nyaya Sanhita) depend on
              the facts. Ask a police officer or lawyer to confirm them. This page is general information, not legal advice.
            </span>
          </div>
        </div>
      </section>

      {/* ============================ HOW IT WORKS FOOTNOTE ============================ */}
      <section className="vx-closing">
        <div className="vx-container vx-closing-inner vx-reveal">
          <Globe size={22} />
          <p>
            Built on Django and React. Every number on this page is measured or read from the server's database. If
            you need help interpreting a report, read its limitations first.
          </p>
        </div>
      </section>
    </div>
  );
};

export default Home;