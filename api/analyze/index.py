import json
import numpy as np
from http.server import BaseHTTPRequestHandler

def compute_features(matrix: list[list[int]]) -> dict:
    m = np.array(matrix, dtype=np.float32)
    H, W = m.shape

    # Shannon entropy over black/white pixel distribution
    black = m.sum()
    total = H * W
    white = total - black
    def safe_h(p): return 0.0 if p == 0 else -p * np.log2(p)
    p_b, p_w = black / total, white / total
    entropy = safe_h(p_b) + safe_h(p_w)

    # per-row entropy
    def row_ent(row):
        vals, counts = np.unique(row, return_counts=True)
        probs = counts / counts.sum()
        return float(-np.sum(probs * np.log2(probs + 1e-9)))

    row_entropies = [row_ent(m[i]) for i in range(H)]
    col_entropies = [row_ent(m[:, j]) for j in range(W)]

    # 2D FFT magnitude spectrum (downsampled to 32x32 for transfer)
    fft_mag = np.abs(np.fft.fftshift(np.fft.fft2(m)))
    # downsample to 32x32 by block averaging
    bh, bw = H // 32, W // 32
    if bh > 0 and bw > 0:
        fft_small = fft_mag[:bh*32, :bw*32].reshape(32, bh, 32, bw).mean(axis=(1, 3))
    else:
        fft_small = fft_mag[:32, :32]

    # normalize to 0-255 range
    fft_norm = (fft_small / (fft_small.max() + 1e-9) * 255).astype(int)

    # FFT peak ratio: energy in top-5% frequencies vs total
    flat = fft_mag.flatten()
    threshold = np.percentile(flat, 95)
    fft_peak_ratio = float(flat[flat > threshold].sum() / (flat.sum() + 1e-9))

    return {
        "entropy": float(entropy),
        "rowEntropyMean": float(np.mean(row_entropies)),
        "colEntropyMean": float(np.mean(col_entropies)),
        "blackRatio": float(p_b),
        "fftPeakRatio": float(fft_peak_ratio),
        "fftMagnitude": fft_norm.tolist(),
    }


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        matrix = body.get("matrix", [])

        try:
            result = compute_features(matrix)
            payload = json.dumps(result).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(payload)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
