import { useState, useRef } from "react";
import jsPDF from "jspdf";

// ─── Constants ───────────────────────────────────────────────────────────────
const API_BASE = "https://MoolChii-tox21-bench-api.hf.space";
const TARGET_INFO = {
  "NR-AR":       { label: "Androgen Receptor",           system: "Nuclear Receptor", desc: "Modulates male hormone signaling. Disruption linked to reproductive toxicity and endocrine disorders." },
  "NR-AR-LBD":   { label: "AR Ligand Binding Domain",    system: "Nuclear Receptor", desc: "The specific binding pocket of the androgen receptor. Key site for endocrine-disrupting chemicals." },
  "NR-AhR":      { label: "Aryl Hydrocarbon Receptor",   system: "Nuclear Receptor", desc: "Mediates responses to environmental contaminants. Activation may cause immunotoxicity and carcinogenesis." },
  "NR-Aromatase":{ label: "Aromatase (CYP19A1)",         system: "Nuclear Receptor", desc: "Enzyme converting androgens to estrogens. Inhibition disrupts estrogen balance and fertility." },
  "NR-ER":       { label: "Estrogen Receptor",           system: "Nuclear Receptor", desc: "Regulates female hormone signaling. Disruption is associated with breast cancer risk and developmental effects." },
  "NR-ER-LBD":   { label: "ER Ligand Binding Domain",    system: "Nuclear Receptor", desc: "Specific binding domain of the estrogen receptor; primary site for estrogenic chemical interference." },
  "NR-PPAR-gamma":{ label: "PPAR-gamma",                 system: "Nuclear Receptor", desc: "Regulates fat cell differentiation and metabolism. Disruption linked to obesity and metabolic disorders." },
  "SR-ARE":      { label: "Antioxidant Response Element", system: "Stress Response", desc: "Activates detoxification genes. Chronic activation signals oxidative stress and potential genotoxicity." },
  "SR-ATAD5":    { label: "ATAD5 (DNA Damage)",          system: "Stress Response", desc: "Indicator of DNA damage and genotoxic potential. ATAD5 stabilization flags replication stress." },
  "SR-HSE":      { label: "Heat Shock Element",          system: "Stress Response", desc: "Marks protein-folding stress and cellular damage response. Often elevated by proteotoxic agents." },
  "SR-MMP":      { label: "Mitochondrial Membrane Potential", system: "Stress Response", desc: "Disruption indicates mitochondrial toxicity, a common mechanism of organ damage and cell death." },
  "SR-p53":      { label: "p53 Tumor Suppressor",        system: "Stress Response", desc: "Central node for DNA damage response and apoptosis. Activation signals potential carcinogenic exposure." },
};

const THRESHOLD = 0.5;
const HIGH_RISK = 0.7;

// ─── Utility ─────────────────────────────────────────────────────────────────
function riskLevel(prob) {
  if (prob >= HIGH_RISK) return "high";
  if (prob >= THRESHOLD) return "moderate";
  return "low";
}

function riskColor(level) {
  return level === "high" ? "#FF4757" : level === "moderate" ? "#FFA502" : "#2ED573";
}

function riskLabel(level) {
  return level === "high" ? "High Risk" : level === "moderate" ? "Moderate Risk" : "Low Risk";
}

function overallVerdict(predictions) {
  const toxic = predictions.filter(p => p.probability >= THRESHOLD);
  const highRisk = predictions.filter(p => p.probability >= HIGH_RISK);
  if (highRisk.length >= 3) return "toxic";
  if (highRisk.length >= 1 || toxic.length >= 4) return "likely-toxic";
  if (toxic.length >= 1) return "uncertain";
  return "non-toxic";
}

function verdictStyle(verdict) {
  const map = {
    "toxic":        { bg: "#FF475720", border: "#FF4757", text: "#FF4757", label: "TOXIC", icon: "⚠" },
    "likely-toxic": { bg: "#FFA50220", border: "#FFA502", text: "#FFA502", label: "LIKELY TOXIC", icon: "⚡" },
    "uncertain":    { bg: "#00D4B120", border: "#00D4B1", text: "#00D4B1", label: "UNCERTAIN", icon: "?" },
    "non-toxic":    { bg: "#2ED57320", border: "#2ED573", text: "#2ED573", label: "NON-TOXIC", icon: "✓" },
  };
  return map[verdict];
}

// ─── Hexagon Background ───────────────────────────────────────────────────────
function HexGrid() {
  const hexes = [];
  for (let i = 0; i < 80; i++) {
    const x = (i % 10) * 90 + (Math.floor(i / 10) % 2 === 0 ? 0 : 45);
    const y = Math.floor(i / 10) * 78;
    const opacity = 0.03 + Math.random() * 0.06;
    hexes.push({ x, y, opacity, key: i });
  }
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} viewBox="0 0 900 640" preserveAspectRatio="xMidYMid slice">
      {hexes.map(h => (
        <polygon
          key={h.key}
          points={`${h.x+40},${h.y} ${h.x+80},${h.y+22} ${h.x+80},${h.y+66} ${h.x+40},${h.y+88} ${h.x},${h.y+66} ${h.x},${h.y+22}`}
          fill="none"
          stroke="#00D4B1"
          strokeWidth="1"
          opacity={h.opacity}
        />
      ))}
    </svg>
  );
}

// ─── Logo ─────────────────────────────────────────────────────────────────────
function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" stroke="#00D4B1" strokeWidth="2" fill="#00D4B108" />
      <circle cx="20" cy="14" r="3" fill="#00D4B1" />
      <circle cx="13" cy="24" r="3" fill="#00D4B1" />
      <circle cx="27" cy="24" r="3" fill="#00D4B1" />
      <line x1="20" y1="14" x2="13" y2="24" stroke="#00D4B180" strokeWidth="1.5" />
      <line x1="20" y1="14" x2="27" y2="24" stroke="#00D4B180" strokeWidth="1.5" />
      <line x1="13" y1="24" x2="27" y2="24" stroke="#00D4B180" strokeWidth="1.5" />
    </svg>
  );
}

// ─── Progress Arc ─────────────────────────────────────────────────────────────
function ProbabilityGauge({ probability, size = 56 }) {
  const level = riskLevel(probability);
  const color = riskColor(level);
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const dash = (probability * circ).toFixed(1);
  const gap = (circ - dash).toFixed(1);
  const fontSize = size * 0.24;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1a2540" strokeWidth="5" />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={circ * 0.25}
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
      <text x={size/2} y={size/2 + fontSize * 0.35} textAnchor="middle" fontSize={fontSize} fontWeight="700" fill={color} fontFamily="monospace">
        {Math.round(probability * 100)}%
      </text>
    </svg>
  );
}

// ─── PDF Generator ────────────────────────────────────────────────────────────

// Converts an SVG string into a PNG data URL so jsPDF can embed it
// (jsPDF has no native SVG support, only raster images).
function svgToPngDataUrl(svgText, targetWidthPx = 600) {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      const aspect = img.height / img.width || 1;
      const canvas = document.createElement("canvas");
      canvas.width = targetWidthPx;
      canvas.height = Math.round(targetWidthPx * aspect);

      const ctx = canvas.getContext("2d");
      // white backing so the molecule (drawn for a light background) stays legible
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      URL.revokeObjectURL(url);
      resolve({ dataUrl: canvas.toDataURL("image/png"), aspect });
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
}

async function generatePDF(smiles, predictions, honesty_note, structure_svg, top_bit_present) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, margin = 20;
  // eslint-disable-next-line no-useless-assignment
  let y = margin;

  // ── helpers ──
  const line = (x1, y1, x2, y2, color = [40, 60, 100], w = 0.3) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(w);
    doc.line(x1, y1, x2, y2);
  };

  const text = (str, x, yy, opts = {}) => {
    const { size = 11, color = [220, 230, 255], weight = "normal", align = "left" } = opts;
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setFont("helvetica", weight);
    doc.text(str, x, yy, { align });
  };

  const rect = (x, yy, w, h, fillColor, radius = 2) => {
    doc.setFillColor(...fillColor);
    doc.roundedRect(x, yy, w, h, radius, radius, "F");
  };

  const newPage = () => {
    doc.addPage();
    doc.setFillColor(10, 15, 30);
    doc.rect(0, 0, W, 297, "F");
    doc.setFillColor(0, 212, 177);
    doc.rect(0, 0, 6, 297, "F");
    return 20;
  };

  // ── Cover: dark bg ──
  doc.setFillColor(10, 15, 30);
  doc.rect(0, 0, W, 297, "F");

  // teal header band
  doc.setFillColor(0, 212, 177);
  doc.rect(0, 0, 6, 297, "F");

  // Title area
  text("TOX21 BENCH", margin + 6, 35, { size: 30, weight: "bold", color: [220, 240, 255] });
  text("Molecular Toxicity Prediction Report", margin + 6, 45, { size: 13, color: [120, 160, 210] });

  line(margin + 6, 51, W - margin, 51, [0, 212, 177], 0.5);

  // metadata
  text(`Generated: ${new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" })}`, margin + 6, 59, { size: 9.5, color: [120, 150, 190] });
  text(`Model: Random Forest (2048-bit Morgan FP, radius 2)  |  Tox21 Dataset  |  12 Endpoints`, margin + 6, 65, { size: 9.5, color: [120, 150, 190] });

  // SMILES section
  y = 80;
  text("INPUT STRUCTURE", margin + 6, y, { size: 9, color: [0, 212, 177], weight: "bold" });
  y += 6;
  rect(margin + 6, y, W - margin * 2 - 6, 15, [20, 32, 60], 3);
  text(smiles.length > 65 ? smiles.slice(0, 65) + "…" : smiles, margin + 12, y + 6, { size: 9.5, color: [200, 220, 255] });
  text("SMILES notation", margin + 12, y + 11.5, { size: 8, color: [100, 130, 170] });
  y += 22;

  // ── Molecular structure image ──
  if (structure_svg) {
    try {
      const { dataUrl, aspect } = await svgToPngDataUrl(structure_svg, 700);
      text("MOLECULAR STRUCTURE", margin + 6, y, { size: 9, color: [0, 212, 177], weight: "bold" });
      y += 6;

      const imgW = 80; // mm
      const imgH = imgW * aspect;
      rect(margin + 6, y, W - margin * 2 - 6, imgH + 10, [255, 255, 255], 3);
      doc.addImage(dataUrl, "PNG", (W - imgW) / 2, y + 5, imgW, imgH);

      if (top_bit_present) {
        text("Highlighted region: Bit 1750 (extended aromatic ring — top NR-AhR feature)", margin + 6, y + imgH + 9, { size: 7.5, color: [0, 150, 130] });
      }
      y += imgH + 16;
    } catch {
      // If rasterization fails for any reason, skip the image rather than
      // breaking the whole report — the SMILES text above still identifies
      // the molecule.
    }
  }

  // Verdict
  const verdict = overallVerdict(predictions);
  const vs = verdictStyle(verdict);
  const verdictColors = {
    "toxic":        [255, 71, 87],
    "likely-toxic": [255, 165, 2],
    "uncertain":    [0, 212, 177],
    "non-toxic":    [46, 213, 115],
  };
  const vc = verdictColors[verdict];

  if (y > 230) y = newPage();

  text("OVERALL ASSESSMENT", margin + 6, y, { size: 9, color: [0, 212, 177], weight: "bold" });
  y += 6;
  rect(margin + 6, y, W - margin * 2 - 6, 24, [20, 32, 60], 3);
  doc.setFillColor(...vc);
  doc.roundedRect(margin + 10, y + 4, 42, 16, 2, 2, "F");
  text(vs.label, margin + 31, y + 13, { size: 10.5, weight: "bold", color: [10, 15, 30], align: "center" });

  const toxicCount = predictions.filter(p => p.probability >= THRESHOLD).length;
  const highCount = predictions.filter(p => p.probability >= HIGH_RISK).length;
  text(`${toxicCount}/12 endpoints flagged  |  ${highCount} high-risk`, margin + 58, y + 10, { size: 10.5, color: [210, 225, 255] });
  text(`Threshold: ≥50% = active  |  ≥70% = high risk`, margin + 58, y + 17, { size: 8.5, color: [120, 150, 190] });
  y += 32;

  // ── Predictions table ──
  if (y > 230) y = newPage();
  text("ENDPOINT PREDICTIONS", margin + 6, y, { size: 9, color: [0, 212, 177], weight: "bold" });
  y += 6;

  // Column headers
  rect(margin + 6, y, W - margin * 2 - 6, 8, [20, 40, 80], 2);
  text("Endpoint", margin + 10, y + 5.5, { size: 8.5, weight: "bold", color: [165, 195, 230] });
  text("System", margin + 70, y + 5.5, { size: 8.5, weight: "bold", color: [165, 195, 230] });
  text("Score", margin + 120, y + 5.5, { size: 8.5, weight: "bold", color: [165, 195, 230] });
  text("Risk", margin + 140, y + 5.5, { size: 8.5, weight: "bold", color: [165, 195, 230] });
  text("Assessment", margin + 158, y + 5.5, { size: 8.5, weight: "bold", color: [165, 195, 230] });
  y += 11;

  for (const pred of predictions) {
    if (y > 258) y = newPage();
    const info = TARGET_INFO[pred.target] || {};
    const level = riskLevel(pred.probability);
    const rc = level === "high" ? [255, 71, 87] : level === "moderate" ? [255, 165, 2] : [46, 213, 115];
    const rowBg = pred.probability >= THRESHOLD ? [25, 38, 70] : [18, 28, 50];

    rect(margin + 6, y - 1.5, W - margin * 2 - 6, 9, rowBg, 1);

    // risk indicator
    doc.setFillColor(...rc);
    doc.rect(margin + 6, y - 1.5, 2.5, 9, "F");

    text(pred.target, margin + 10, y + 4, { size: 8.5, color: [205, 222, 255] });
    text(info.system || "—", margin + 70, y + 4, { size: 8, color: [115, 145, 185] });
    text(`${(pred.probability * 100).toFixed(1)}%`, margin + 120, y + 4, { size: 9, weight: "bold", color: rc });

    // mini bar
    rect(margin + 138, y + 0.5, 18, 4.5, [20, 40, 80], 1);
    rect(margin + 138, y + 0.5, Math.round(18 * pred.probability), 4.5, rc, 1);

    text(riskLabel(level), margin + 158, y + 4, { size: 8, color: rc });
    y += 11;
  }

  // ── Explanations ──
  y += 6;
  if (y > 235) y = newPage();
  text("ENDPOINT EXPLANATIONS", margin + 6, y, { size: 9, color: [0, 212, 177], weight: "bold" });
  y += 6;

  const flagged = predictions.filter(p => p.probability >= THRESHOLD);

  for (const pred of flagged) {
    if (y > 262) y = newPage();
    const info = TARGET_INFO[pred.target] || {};
    const level = riskLevel(pred.probability);
    const rc = level === "high" ? [255, 71, 87] : [255, 165, 2];
    rect(margin + 6, y, W - margin * 2 - 6, 25, [22, 35, 65], 3);
    doc.setFillColor(...rc);
    doc.rect(margin + 6, y, 3, 25, "F");
    text(`${pred.target}  —  ${info.label || ""}`, margin + 12, y + 7, { size: 9.5, weight: "bold", color: [215, 230, 255] });
    text(`${(pred.probability * 100).toFixed(1)}% probability  |  ${riskLabel(level)}`, margin + 12, y + 13.5, { size: 8.5, color: rc });
    const wrapped = doc.splitTextToSize(info.desc || "No description available.", W - margin * 2 - 22);
    doc.setFontSize(8);
    doc.setTextColor(135, 165, 205);
    doc.text(wrapped, margin + 12, y + 19);
    y += 29;
  }

  // ── Structural note ──
  if (honesty_note) {
    y += 4;
    if (y > 240) y = newPage();
    text("STRUCTURAL NOTE (NR-AhR — Bit 1750)", margin + 6, y, { size: 9, color: [0, 212, 177], weight: "bold" });
    y += 6;
    rect(margin + 6, y, W - margin * 2 - 6, 30, [18, 30, 55], 3);
    doc.setFillColor(0, 212, 177);
    doc.rect(margin + 6, y, 3, 30, "F");
    const wrapped = doc.splitTextToSize(honesty_note, W - margin * 2 - 18);
    doc.setFontSize(8.5);
    doc.setTextColor(170, 200, 235);
    doc.text(wrapped, margin + 12, y + 7);
    y += 36;
  }

  // ── Disclaimer ──
  y += 4;
  if (y > 255) y = newPage();
  line(margin + 6, y, W - margin, y, [40, 60, 100], 0.3);
  y += 7;
  text("DISCLAIMER", margin + 6, y, { size: 9, color: [95, 125, 165], weight: "bold" });
  y += 6;
  const disclaimer = "This report is generated by a machine learning model trained on the Tox21 dataset. Predictions are probabilistic and do not constitute regulatory toxicology assessments. All results should be validated through wet-lab assays before use in any decision-making context. The model may produce false positives or false negatives. No warranty of accuracy is expressed or implied.";
  const dWrapped = doc.splitTextToSize(disclaimer, W - margin * 2 - 6);
  doc.setFontSize(8);
  doc.setTextColor(85, 115, 155);
  doc.text(dWrapped, margin + 6, y);

  // footer
  doc.setFontSize(8.5);
  doc.setTextColor(55, 85, 125);
  doc.text("Tox21 Bench  •  Powered by Random Forest Classifiers  •  Tox21 Challenge Dataset", W / 2, 290, { align: "center" });

  doc.save(`tox21_report_${smiles.slice(0, 12).replace(/[^a-zA-Z0-9]/g, "")}_${Date.now()}.pdf`);
}
// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [smiles, setSmiles] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [pdfLoading, setPdfLoading] = useState(false);
  const inputRef = useRef(null);

  const examples = [
    { label: "Bisphenol A", smiles: "CC(C)(c1ccc(O)cc1)c1ccc(O)cc1" },
    { label: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O" },
    { label: "TCDD (Dioxin)", smiles: "Clc1cc2oc3cc(Cl)c(Cl)cc3c2cc1Cl" },
    { label: "Caffeine", smiles: "Cn1cnc2c1c(=O)n(C)c(=O)n2C" },
  ];

  const runPrediction = async () => {
    if (!smiles.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smiles: smiles.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Prediction failed.");
      }
      const data = await res.json();
      setResult(data);
      setActiveTab("overview");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePDF = async () => {
    if (!result) return;
    setPdfLoading(true);
    try {
      await generatePDF(
        result.smiles,
        result.predictions,
        result.honesty_note,
        result.structure_svg,
        result.top_bit_present
      );
    } finally {
      setPdfLoading(false);
    }
  };

  const toxicPreds = result?.predictions.filter(p => p.probability >= THRESHOLD) || [];
  const safePreds = result?.predictions.filter(p => p.probability < THRESHOLD) || [];
  const verdict = result ? overallVerdict(result.predictions) : null;
  const vs = verdict ? verdictStyle(verdict) : null;

  return (
    <div style={{ minHeight: "100vh", background: "#060D1F", color: "#E0EAFF", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      {/* ── Nav ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
  background: "#060D1Fd9",
  backdropFilter: "blur(16px) saturate(140%)",
  WebkitBackdropFilter: "blur(16px) saturate(140%)",
  borderBottom: "1px solid #1a2a4a",
  boxShadow: "0 1px 0 #00D4B120, 0 8px 24px -16px #00000080",
  display: "flex", alignItems: "center",
  padding: "0 36px", height: 76,
  gap: 20,
      }}>
        <Logo size={36} />
        <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px", color: "#E0EAFF" }}>Tox21 Bench</span>
        <span style={{ color: "#3a5080", fontSize: 12, marginLeft: 4 }}>/ Toxicity Predictor</span>
        <div style={{ flex: 1 }} />
        <a href="https://tox21.gov" target="_blank" rel="noreferrer"
           style={{ fontSize: 12, color: "#6080a0", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
          Tox21 Dataset ↗
        </a>
        <span style={{
    background: "#00D4B118", border: "1px solid #00D4B150",
    color: "#1AE8C6", fontSize: 13, fontWeight: 700,
    padding: "6px 14px", borderRadius: 20,
    letterSpacing: "0.03em",
  }}>
    12 Endpoints
  </span>
      </nav>

      {/* ── Hero ── */}
      <header style={{ position: "relative", padding: "64px 32px 48px", overflow: "hidden", borderBottom: "1px solid #1a2a4a" }}>
        <HexGrid />
        <div style={{ position: "relative", maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#00D4B110", border: "1px solid #00D4B130", borderRadius: 20, padding: "5px 14px", marginBottom: 20, fontSize: 12, color: "#00D4B1" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00D4B1", display: "inline-block" }} />
            AI-Powered Toxicity Screening
          </div>
          <h1 style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-1px", margin: "0 0 16px", color: "#EEF4FF" }}>
            Predict Molecular<br />
            <span style={{ color: "#00D4B1" }}>Toxicity Endpoints</span>
          </h1>
          <p style={{ color: "#6080a0", fontSize: 16, lineHeight: 1.7, maxWidth: 560, margin: "0 auto" }}>
            Input any SMILES string and instantly screen against 12 Tox21 endpoints across nuclear receptor and stress response pathways.
          </p>
        </div>
      </header>

      {/* ── Main ── */}
<main style={{ maxWidth: 1280, margin: "0 auto", padding: "56px 32px" }}>
  <div style={{ display: "grid", gridTemplateColumns: result ? "440px 1fr" : "1fr", gap: 32, transition: "all 0.3s" }}>

    {/* ── Input Panel ── */}
<div>
  <div style={{ background: "#0D1A35", border: "1px solid #1a2a4a", borderRadius: 20, padding: 32 }}>
    <h2 style={{ margin: "0 0 10px", fontSize: 19, fontWeight: 800, color: "#1AE8C6", textTransform: "uppercase", letterSpacing: "0.06em" }}>Input Molecule</h2>
    <p style={{ margin: "0 0 22px", fontSize: 16, color: "#84a0c0" }}>Enter a valid SMILES string</p>

    <textarea
      ref={inputRef}
      value={smiles}
      onChange={e => setSmiles(e.target.value)}
      onKeyDown={e => e.key === "Enter" && e.ctrlKey && runPrediction()}
      placeholder="e.g. CC(=O)Oc1ccccc1C(=O)O"
      rows={1}
      style={{
        width: "100%", boxSizing: "border-box",
        background: "#081020", border: "1.5px solid #24386a",
        borderRadius: 14, padding: "14px 18px",
        color: "#c8e0fa", fontSize: 16, fontFamily: "monospace",
        resize: "none", outline: "none",
        lineHeight: 1.5,
      }}
    />

    {error && (
      <div style={{ marginTop: 12, background: "#FF475718", border: "1px solid #FF475740", borderRadius: 12, padding: "12px 16px", fontSize: 15, color: "#FF7088" }}>
        ⚠ {error}
      </div>
    )}

    <button
      onClick={runPrediction}
      disabled={loading || !smiles.trim()}
      style={{
        marginTop: 18, width: "100%",
        background: loading ? "#1a3060" : "#00D4B1",
        color: loading ? "#6090c0" : "#060D1F",
        border: "none", borderRadius: 14,
        padding: "18px 0", fontSize: 18, fontWeight: 800,
        cursor: loading ? "not-allowed" : "pointer",
        transition: "all 0.2s", letterSpacing: "0.01em",
      }}
    >
      {loading ? "Analyzing…" : "Run Prediction →"}
    </button>

    <p style={{ textAlign: "center", fontSize: 14, color: "#5a7898", marginTop: 12 }}>Ctrl + Enter to run</p>

    {/* Examples */}
    <div style={{ marginTop: 28 }}>
      <p style={{ fontSize: 14, color: "#5a7898", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Quick examples</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {examples.map(ex => (
          <button
            key={ex.label}
            onClick={() => { setSmiles(ex.smiles); setError(""); }}
            style={{
              background: "#0a1830", border: "1.5px solid #24386a",
              color: "#84a0c0", borderRadius: 10,
              padding: "9px 16px", fontSize: 15, fontWeight: 600, cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.target.style.borderColor = "#00D4B180"; e.target.style.color = "#1AE8C6"; e.target.style.background = "#0c2030"; }}
            onMouseLeave={e => { e.target.style.borderColor = "#24386a"; e.target.style.color = "#84a0c0"; e.target.style.background = "#0a1830"; }}
          >
            {ex.label}
          </button>
        ))}
      </div>
    </div>
  </div>
      {/* Model Info */}
      <div style={{ marginTop: 22, background: "#0D1A35", border: "1px solid #1a2a4a", borderRadius: 20, padding: 28 }}>
        <h3 style={{ margin: "0 0 18px", fontSize: 16, color: "#7898ba", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 800 }}>Model Details</h3>
        {[
          ["Algorithm", "Random Forest"],
          ["Fingerprint", "Morgan (ECFP4)"],
          ["Bits", "2048"],
          ["Radius", "2"],
          ["Endpoints", "12 (Tox21)"],
          ["Training", "Tox21 Challenge"],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 11, fontSize: 16 }}>
            <span style={{ color: "#7898ba" }}>{k}</span>
            <span style={{ color: "#c8dcf4", fontFamily: "monospace", fontWeight: 700 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>

          {/* ── Results Panel ── */}
{result && (
  <div>
    {/* Verdict Banner */}
    <div style={{
      background: `${vs.bg}`,
      border: `1px solid ${vs.border}40`,
      borderRadius: 20,
      padding: "28px 30px",
      marginBottom: 24,
      display: "flex",
      alignItems: "center",
      gap: 24,
    }}>
      <div style={{
        width: 80, height: 80,
        borderRadius: "50%",
        background: `${vs.border}20`,
        border: `2.5px solid ${vs.border}60`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 36, color: vs.border, flexShrink: 0,
      }}>
        {vs.icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: vs.border, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6, fontWeight: 700 }}>Overall Assessment</div>
        <div style={{ fontSize: 30, fontWeight: 800, color: vs.border, letterSpacing: "-0.5px" }}>{vs.label}</div>
        <div style={{ fontSize: 15, color: "#84a0c0", marginTop: 6 }}>
          {toxicPreds.length} of 12 endpoints flagged active
          {result.predictions.filter(p => p.probability >= HIGH_RISK).length > 0 &&
            ` · ${result.predictions.filter(p => p.probability >= HIGH_RISK).length} high-risk`}
        </div>
      </div>
      <div style={{ display: "flex", gap: 22, flexShrink: 0 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: "#FF4757" }}>{result.predictions.filter(p=>p.probability>=HIGH_RISK).length}</div>
          <div style={{ fontSize: 12, color: "#7090b0", fontWeight: 600, letterSpacing: "0.04em" }}>HIGH RISK</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: "#FFA502" }}>{result.predictions.filter(p=>p.probability>=THRESHOLD&&p.probability<HIGH_RISK).length}</div>
          <div style={{ fontSize: 12, color: "#7090b0", fontWeight: 600, letterSpacing: "0.04em" }}>MODERATE</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: "#2ED573" }}>{result.predictions.filter(p=>p.probability<THRESHOLD).length}</div>
          <div style={{ fontSize: 12, color: "#7090b0", fontWeight: 600, letterSpacing: "0.04em" }}>LOW RISK</div>
        </div>
      </div>
    </div>

    {/* Honesty Note */}
    {result.honesty_note && (
      <div style={{ background: "#00D4B10c", border: "1px solid #00D4B140", borderRadius: 16, padding: "18px 22px", marginBottom: 24, display: "flex", gap: 16 }}>
        <span style={{ color: "#1AE8C6", fontSize: 24, flexShrink: 0 }}>🔬</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1AE8C6", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Structural Feature Note — NR-AhR</div>
          <p style={{ margin: 0, fontSize: 15, color: "#84a0c0", lineHeight: 1.65 }}>{result.honesty_note}</p>
        </div>
      </div>
    )}

   {/* Tabs */}
<div style={{ display: "flex", gap: 8, marginBottom: 24, background: "#0a1628", borderRadius: 16, padding: 8 }}>
  {["overview", "details", "structure"].map(tab => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      style={{
        flex: 1, padding: "14px 0",
        background: activeTab === tab ? "#0D1A35" : "transparent",
        border: activeTab === tab ? "1px solid #2c4070" : "1px solid transparent",
        borderRadius: 12,
        color: activeTab === tab ? "#f0f6ff" : "#6688a8",
        fontSize: 16.5, fontWeight: activeTab === tab ? 800 : 600,
        cursor: "pointer", transition: "all 0.15s",
        textTransform: "capitalize",
      }}
      onMouseEnter={e => { if (activeTab !== tab) e.currentTarget.style.color = "#9bb4d4"; }}
      onMouseLeave={e => { if (activeTab !== tab) e.currentTarget.style.color = "#6688a8"; }}
    >
      {tab === "overview" ? "Overview" : tab === "details" ? "Endpoint Details" : "Structure"}
    </button>
  ))}
</div>

    {/* Tab: Overview */}
{activeTab === "overview" && (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
    {result.predictions.map(pred => {
      const level = riskLevel(pred.probability);
      const color = riskColor(level);
      const active = pred.probability >= THRESHOLD;
      return (
        <div
          key={pred.target}
          style={{
            background: "#0D1A35",
            border: `1.5px solid ${active ? `${color}45` : "#1a2a4a"}`,
            borderRadius: 18, padding: "20px 22px",
            display: "flex", alignItems: "center", gap: 18,
            transition: "border-color 0.2s, transform 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
        >
          <ProbabilityGauge probability={pred.probability} size={72} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 16.5, fontWeight: 700, color: "#e8f2ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {pred.target}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: active ? color : "#5a7898", flexShrink: 0 }}>
                {(pred.probability * 100).toFixed(0)}%
              </div>
            </div>
            <div style={{ fontSize: 13, color: "#5a7898", marginTop: 4 }}>
              {TARGET_INFO[pred.target]?.system || ""}
            </div>
            <div style={{ marginTop: 11, background: "#081020", borderRadius: 6, height: 7, width: "100%" }}>
              <div style={{ height: 7, borderRadius: 6, background: color, width: `${pred.probability * 100}%`, transition: "width 0.8s ease" }} />
            </div>
          </div>
        </div>
      );
    })}
  </div>
)}
              {/* Tab: Details */}
{activeTab === "details" && (
  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    {toxicPreds.length > 0 && (
      <>
        <div style={{ fontSize: 13, color: "#7090b0", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontWeight: 700 }}>
          Flagged Endpoints
        </div>
        {toxicPreds.map(pred => {
          const info = TARGET_INFO[pred.target] || {};
          const level = riskLevel(pred.probability);
          const color = riskColor(level);
          return (
            <div key={pred.target} style={{
              background: "#0D1A35",
              border: `1px solid ${color}35`,
              borderRadius: 16,
              padding: "22px 24px",
              borderLeft: `4px solid ${color}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#e8f2ff" }}>{pred.target}</div>
                  <div style={{ fontSize: 13.5, color: "#7090b0", marginTop: 4 }}>
                    {info.label} · {info.system}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 27, fontWeight: 800, color }}>
                    {(pred.probability * 100).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 12, color, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginTop: 2 }}>
                    {riskLabel(level)}
                  </div>
                </div>
              </div>
              <div style={{ background: "#081020", borderRadius: 8, height: 8, marginBottom: 14 }}>
                <div style={{ height: 8, borderRadius: 8, background: color, width: `${pred.probability * 100}%`, transition: "width 0.6s ease" }} />
              </div>
              <p style={{ margin: 0, fontSize: 14.5, color: "#84a0c0", lineHeight: 1.7 }}>
                {info.desc}
              </p>
            </div>
          );
        })}
      </>
    )}

    {safePreds.length > 0 && (
      <>
        <div style={{ fontSize: 13, color: "#4a6888", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 12, marginBottom: 6, fontWeight: 700 }}>
          Below Threshold
        </div>
        {safePreds.map(pred => {
          const info = TARGET_INFO[pred.target] || {};
          return (
            <div key={pred.target} style={{
              background: "#090f1e",
              border: "1px solid #1a2a4a",
              borderRadius: 14,
              padding: "16px 20px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <span style={{ fontSize: 15.5, color: "#7090b0", fontWeight: 600 }}>{pred.target}</span>
                <span style={{ fontSize: 13, color: "#3a5878", marginLeft: 10 }}>{info.system}</span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#2ED573" }}>
                {(pred.probability * 100).toFixed(1)}%
              </span>
            </div>
          );
        })}
      </>
    )}
  </div>
)}

              {/* Tab: Structure */}
{activeTab === "structure" && (
  <div style={{ background: "#0D1A35", border: "1px solid #1a2a4a", borderRadius: 20, padding: 30 }}>
    <div style={{ fontSize: 14, color: "#7090b0", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
      Molecular Structure
      {result.top_bit_present && (
        <span style={{ color: "#1AE8C6", marginLeft: 12 }}>· Bit 1750 highlighted</span>
      )}
    </div>

    <div
      style={{
        background: "#f8f8f8",
        borderRadius: 14, padding: 16,
        display: "flex", justifyContent: "center",
      }}
      dangerouslySetInnerHTML={{ __html: result.structure_svg }}
    />

    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 13, color: "#5a7898", marginBottom: 9, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
        SMILES
      </div>
      <div style={{
        background: "#060d1f", border: "1px solid #24386a", borderRadius: 12,
        padding: "14px 16px", fontFamily: "monospace", fontSize: 15,
        color: "#9ec8ec", wordBreak: "break-all", lineHeight: 1.6,
      }}>
        {result.smiles}
      </div>
    </div>

    {result.top_bit_present && (
      <div style={{
        marginTop: 20, background: "#00D4B10c", border: "1px solid #00D4B140",
        borderRadius: 12, padding: "14px 18px", fontSize: 14.5, color: "#84a0c0",
        lineHeight: 1.65,
      }}>
        The highlighted region (teal) shows the Morgan fingerprint substructure corresponding to bit 1750, the top NR-AhR feature.
      </div>
    )}
  </div>
)}

              {/* Download Button */}
<div style={{ marginTop: 20 }}>
  <button
    onClick={handlePDF}
    disabled={pdfLoading}
    style={{
      width: "100%",
      background: pdfLoading ? "#0a1628" : "#0D1A35",
      border: "1px solid #1e3870",
      color: pdfLoading ? "#304060" : "#90b8e0",
      borderRadius: 12, padding: "17px 0",
      fontSize: 16, fontWeight: 700,
      cursor: pdfLoading ? "not-allowed" : "pointer",
      transition: "all 0.2s",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    }}
    onMouseEnter={e => { if (!pdfLoading) { e.currentTarget.style.borderColor = "#00D4B150"; e.currentTarget.style.color = "#00D4B1"; }}}
    onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e3870"; e.currentTarget.style.color = "#90b8e0"; }}
  >
    <span style={{ fontSize: 19 }}>⬇</span>
    {pdfLoading ? "Generating PDF…" : "Download Scientific Report (PDF)"}
  </button>
  <p style={{ textAlign: "center", fontSize: 13, color: "#2a3a58", marginTop: 8 }}>
    Includes full endpoint analysis, structural notes, and model details
  </p>
</div>
            </div>
          )}
        </div>
      </main>

     {/* ── Footer ── */}
<footer style={{ borderTop: "1px solid #1a2a4a", padding: "32px 32px", textAlign: "center", fontSize: 14, color: "#5a7898" }}>
  Tox21 Bench · Random Forest classifiers trained on the Tox21 Challenge dataset 
</footer>
    </div>
  );
}