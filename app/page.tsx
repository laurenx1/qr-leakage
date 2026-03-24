"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import s from "./page.module.css";

// ── Types ──
interface Features {
  entropy: number;
  rowEntropyMean: number;
  colEntropyMean: number;
  fftPeakRatio: number;
  blackRatio: number;
  fftMagnitude: number[][];
}

// ── Results data ──
const RESULTS = [
  { label: "Raw pixels", accuracy: 99.22, note: "MLP on flattened modules" },
  { label: "FFT features", accuracy: 99.94, note: "2D frequency spectrum" },
  { label: "Row+Col entropy", accuracy: 99.31, note: "Per-row/col Shannon H" },
  { label: "Top-left crop", accuracy: 80.78, note: "20×20 module region only" },
  { label: "CNN (raw)", accuracy: 97.66, note: "Diverse dataset, all EC levels" },
  { label: "CNN (1st pass)", accuracy: 100.0, note: "Single EC level baseline" },
];

const ENTROPY_DATA = [
  { cls: "C1", label: "Constant (AAAA…)", h: 0.0, max: 8 },
  { cls: "C2", label: "Periodic (ABAB…)", h: 1.0, max: 8 },
  { cls: "C3", label: "English text", h: 3.95, max: 8 },
  { cls: "C4", label: "Random bytes", h: 6.65, max: 8 },
];

// ── QR generator (dynamic import avoids SSR issues) ──
async function generateQR(text: string): Promise<{ canvas: HTMLCanvasElement; matrix: number[][] }> {
  const QRCode = (await import("qrcode")).default;
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, text, { width: 256, margin: 1, color: { dark: "#0a0a0a", light: "#f5f5f0" } });

  // extract binary matrix from canvas pixels
  const ctx = canvas.getContext("2d")!;
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const cellSize = canvas.width / width; // approximate — we'll just read per-pixel darkness
  const matrix: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      row.push(data[idx] < 128 ? 1 : 0); // 1=dark module
    }
    matrix.push(row);
  }
  return { canvas, matrix };
}

// ── Client-side FFT preview (lightweight, matches API visual) ──
function drawFFTPreview(matrix: number[][], canvas: HTMLCanvasElement) {
  const N = matrix.length;
  const size = Math.min(N, 64);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);

  // compute row magnitudes as proxy for FFT visualization
  for (let y = 0; y < size; y++) {
    const row = matrix[y] ?? [];
    const rowSum = row.slice(0, size).reduce((a, b) => a + b, 0);
    for (let x = 0; x < size; x++) {
      const val = matrix[y]?.[x] ?? 0;
      const bright = val === 1 ? 10 : 245;
      const idx = (y * size + x) * 4;
      img.data[idx] = bright;
      img.data[idx + 1] = val === 1 && rowSum > size * 0.6 ? 45 : bright;
      img.data[idx + 2] = bright;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export default function Home() {
  const [input, setInput] = useState("hello world");
  const [loading, setLoading] = useState(false);
  const [features, setFeatures] = useState<Features | null>(null);
  const [error, setError] = useState<string | null>(null);

  const qrRef = useRef<HTMLCanvasElement>(null);
  const fftRef = useRef<HTMLCanvasElement>(null);
  const matrixRef = useRef<number[][] | null>(null);

  const analyze = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setFeatures(null);

    try {
      const { canvas, matrix } = await generateQR(input);
      matrixRef.current = matrix;

      // render QR
      if (qrRef.current) {
        const ctx = qrRef.current.getContext("2d")!;
        qrRef.current.width = canvas.width;
        qrRef.current.height = canvas.height;
        ctx.drawImage(canvas, 0, 0);
      }

      // send matrix to Python API for real feature extraction
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matrix }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const feats: Features = await res.json();
      setFeatures(feats);

      // draw FFT preview on canvas
      if (fftRef.current && feats.fftMagnitude) {
        const ctx = fftRef.current.getContext("2d")!;
        const mag = feats.fftMagnitude;
        const H = mag.length, W = mag[0].length;
        fftRef.current.width = W;
        fftRef.current.height = H;
        const img = ctx.createImageData(W, H);
        const flat = mag.flat();
        const maxVal = Math.max(...flat);
        flat.forEach((v, i) => {
          const norm = Math.round((v / maxVal) * 255);
          img.data[i * 4] = norm;
          img.data[i * 4 + 1] = v / maxVal > 0.8 ? 45 : norm; // red tint on peaks
          img.data[i * 4 + 2] = norm;
          img.data[i * 4 + 3] = 255;
        });
        ctx.putImageData(img, 0, 0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }, [input]);

  // run on mount with default text
  useEffect(() => { analyze(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={s.page}>

      {/* ── Nav ── */}
      <nav className={s.nav}>
        <span><span className={s.red}>QR</span>_LEAKAGE</span>
        <div className={s.navLinks}>
          <a href="#results">Results</a>
          <a href="#demo">Demo</a>
          <a href="#notebook">Notebook</a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className={s.hero}>
        <div className={s.heroMeta}>
          <span className={`${s.tag} ${s.tagRed}`}>Side-channel research</span>
          <h1>Visual encodings<br /><span className={s.red}>leak.</span></h1>
          <p className={s.heroSub}>
            Can a classifier infer properties of a QR code&apos;s payload — without ever decoding it?
            Yes. QR encoding partially diffuses payload structure but does not decorrelate it.
            High-level structure survives. We proved it.
          </p>
        </div>
        <div className={s.heroStats}>
          <div className={s.stat}>
            <span className={s.statNum}><span className={s.red}>100</span>%</span>
            <span className={s.statLabel}>CNN accuracy</span>
          </div>
          <div className={s.stat}>
            <span className={s.statNum}>4</span>
            <span className={s.statLabel}>payload classes</span>
          </div>
          <div className={s.stat}>
            <span className={s.statNum}>3.2<span className={s.red}>K</span></span>
            <span className={s.statLabel}>samples</span>
          </div>
        </div>
      </section>

      {/* ── Results ── */}
      <section className={s.section} id="results">
        <div className={s.sectionHeader}>
          <span className={s.sectionNum}>01</span>
          <h2>Classifier accuracy by feature set</h2>
        </div>

        <div className={s.resultsGrid}>
          {RESULTS.map((r) => (
            <div key={r.label} className={s.resultCard}>
              <h3 className={s.resultFeature}>{r.label}</h3>
              <div className={s.resultAccuracy}>
                {r.accuracy === 100 ? (
                  <><span>100</span>.00%</>
                ) : (
                  <><span>{Math.floor(r.accuracy)}</span>.{String(r.accuracy.toFixed(2).split(".")[1])}%</>
                )}
              </div>
              <div className={s.grey} style={{ fontSize: "0.7rem" }}>{r.note}</div>
              <div className={s.resultBar} style={{ width: `${r.accuracy}%` }} />
            </div>
          ))}
        </div>

        {/* entropy ladder */}
        <div style={{ marginTop: "3rem" }}>
          <div className={s.sectionHeader}>
            <span className={s.sectionNum}>01b</span>
            <h2>Payload entropy by class</h2>
          </div>
          <table className={s.entropyTable}>
            <thead>
              <tr>
                <th>Class</th>
                <th>Description</th>
                <th>Shannon H (bits)</th>
                <th style={{ width: "35%" }}>Distribution</th>
              </tr>
            </thead>
            <tbody>
              {ENTROPY_DATA.map((row) => (
                <tr key={row.cls}>
                  <td><strong>{row.cls}</strong></td>
                  <td>{row.label}</td>
                  <td>{row.h.toFixed(2)}</td>
                  <td>
                    <span
                      className={s.entropyBar}
                      style={{ width: `${(row.h / row.max) * 100}%` }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Demo ── */}
      <section className={s.section} id="demo">
        <div className={s.sectionHeader}>
          <span className={s.sectionNum}>02</span>
          <h2>Live feature extraction</h2>
        </div>

        <div className={s.demoGrid}>
          {/* input pane */}
          <div className={s.demoPane}>
            <div className={s.demoLabel}>Payload input</div>
            <textarea
              className={s.demoTextarea}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="type anything..."
              rows={3}
            />
            <button className={s.demoBtn} onClick={analyze} disabled={loading}>
              {loading ? "analyzing…" : "analyze →"}
            </button>
            {error && <div style={{ color: "var(--red)", fontSize: "0.75rem", marginTop: "0.5rem" }}>{error}</div>}

            <div style={{ marginTop: "1.5rem" }}>
              <div className={s.demoLabel}>Generated QR</div>
              <canvas ref={qrRef} className={s.qrCanvas} width={256} height={256} />
            </div>
          </div>

          {/* features pane */}
          <div className={s.demoPane}>
            <div className={s.demoLabel}>Extracted features (Python / numpy)</div>

            {features ? (
              <>
                <div className={s.featuresGrid}>
                  <div className={s.featureBox}>
                    <div className={s.featureBoxLabel}>Shannon H (bytes)</div>
                    <div className={s.featureBoxVal}>{features.entropy.toFixed(3)}</div>
                    <div className={s.featureBoxSub}>bits of entropy</div>
                  </div>
                  <div className={s.featureBox}>
                    <div className={s.featureBoxLabel}>Black module ratio</div>
                    <div className={s.featureBoxVal}>{(features.blackRatio * 100).toFixed(1)}%</div>
                    <div className={s.featureBoxSub}>dark pixels</div>
                  </div>
                  <div className={s.featureBox}>
                    <div className={s.featureBoxLabel}>Row entropy (mean)</div>
                    <div className={s.featureBoxVal}>{features.rowEntropyMean.toFixed(3)}</div>
                    <div className={s.featureBoxSub}>per-row H̄</div>
                  </div>
                  <div className={s.featureBox}>
                    <div className={s.featureBoxLabel}>FFT peak ratio</div>
                    <div className={s.featureBoxVal}>{features.fftPeakRatio.toFixed(3)}</div>
                    <div className={s.featureBoxSub}>dominant freq / total</div>
                  </div>
                </div>

                <div style={{ marginTop: "1rem" }}>
                  <div className={s.demoLabel}>FFT magnitude spectrum</div>
                  <canvas
                    ref={fftRef}
                    className={s.fftCanvas}
                    style={{ height: "140px", border: "var(--border)" }}
                  />
                </div>
              </>
            ) : (
              <div className={s.grey} style={{ marginTop: "1rem", fontSize: "0.8rem" }}>
                {loading ? "running numpy on server…" : "enter text and click analyze"}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Notebook ── */}
      <section className={s.section} id="notebook">
        <div className={s.sectionHeader}>
          <span className={s.sectionNum}>03</span>
          <h2>Full notebook</h2>
        </div>
        <p className={s.grey} style={{ marginBottom: "1rem", fontSize: "0.8rem" }}>
          Rendered via nbviewer — replace the URL below with your public GitHub notebook path.
        </p>
        <iframe
          className={s.notebookFrame}
          src="https://nbviewer.org/github/laurenx1/qr-leakage/blob/main/visual_encoding_leakage_v2.ipynb"
          title="QR Leakage Notebook"
          sandbox="allow-scripts allow-same-origin"
        />
      </section>

      {/* ── Footer ── */}
      <footer className={s.footer}>
        <span>QR_LEAKAGE — visual side-channel research</span>
        <span className={s.red}>∎</span>
      </footer>

    </div>
  );
}
