import joblib
import numpy as np
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from rdkit import Chem
from rdkit.Chem import AllChem, Draw
from rdkit.Chem.Draw import rdMolDraw2D # type: ignore

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

TARGETS = [
    "NR-AR", "NR-AR-LBD", "NR-AhR", "NR-Aromatase", "NR-ER",
    "NR-ER-LBD", "NR-PPAR-gamma", "SR-ARE", "SR-ATAD5",
    "SR-HSE", "SR-MMP", "SR-p53",
]

MODELS_DIR = Path(__file__).parent / "models"
N_BITS = 2048
RADIUS = 2

# Bit 1750 = top driver of NR-AhR predictions specifically. Its meaning was
# derived from NR-AhR's feature importances and SHAP values only — feature
# importance is model-specific, so this note must not be implied to apply to
# the other 11 targets, whose top bits were never individually analyzed.
WATCHED_BIT = 1750
WATCHED_BIT_TARGET = "NR-AhR"
WATCHED_BIT_NOTE = (
    "this molecule contains the extended aromatic ring pattern the NR-AhR "
    "model relies on most heavily (bit 1750). in testing, this pattern drove "
    "both correct toxic calls and false positives for this target specifically — "
    "treat a high NR-AhR score here as a flag for review, not a verdict. "
    "this note does not extend to the other 11 targets, whose top features "
    "were not individually analyzed in this project."
)

# ---------------------------------------------------------------------------
# Load models once at startup
# ---------------------------------------------------------------------------

app = FastAPI(title="Tox21 Bench API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MODELS = {}


@app.on_event("startup")
def load_models():
    for target in TARGETS:
        path = MODELS_DIR / f"rf_{target}.joblib"
        if not path.exists():
            raise RuntimeError(f"Missing model file: {path}")
        MODELS[target] = joblib.load(path)
    print(f"Loaded {len(MODELS)} models.")


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class PredictRequest(BaseModel):
    smiles: str


class TargetPrediction(BaseModel):
    target: str
    probability: float


class PredictResponse(BaseModel):
    smiles: str
    valid: bool
    predictions: list[TargetPrediction]
    top_bit: int
    top_bit_target: str
    top_bit_present: bool
    honesty_note: str | None
    structure_svg: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def smiles_to_fingerprint(mol, radius=RADIUS, n_bits=N_BITS):
    """Mirror of the training-time featurization, with bit info captured
    so we can map important bits back to actual atoms for drawing."""
    bit_info = {}
    fp = AllChem.GetMorganFingerprintAsBitVect(
        mol, radius=radius, nBits=n_bits, bitInfo=bit_info
    )
    arr = np.zeros((n_bits,), dtype=int)
    for i in range(n_bits):
        arr[i] = fp.GetBit(i)
    return arr, bit_info


def draw_molecule_with_highlight(mol, bit_info, bit_idx):
    """Render the molecule as SVG, highlighting the atoms/bonds tied to
    bit_idx if that bit is present in this molecule."""
    atoms_to_highlight = []
    bonds_to_highlight = []

    if bit_idx in bit_info:
        atom_idx, radius = bit_info[bit_idx][0]
        if radius == 0:
            atoms_to_highlight = [atom_idx]
        else:
            env = Chem.FindAtomEnvironmentOfRadiusN(mol, radius, atom_idx)
            bonds_to_highlight = list(env)
            atoms_to_highlight = list({
                idx
                for bond_idx in env
                for idx in (
                    mol.GetBondWithIdx(bond_idx).GetBeginAtomIdx(),
                    mol.GetBondWithIdx(bond_idx).GetEndAtomIdx(),
                )
            })

    drawer = rdMolDraw2D.MolDraw2DSVG(320, 260)
    rdMolDraw2D.PrepareAndDrawMolecule(
        drawer, mol,
        highlightAtoms=atoms_to_highlight,
        highlightBonds=bonds_to_highlight,
    )
    drawer.FinishDrawing()
    return drawer.GetDrawingText()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": len(MODELS)}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    mol = Chem.MolFromSmiles(req.smiles)
    if mol is None:
        raise HTTPException(status_code=400, detail="Could not parse SMILES string.")

    fingerprint, bit_info = smiles_to_fingerprint(mol)
    X = fingerprint.reshape(1, -1)

    predictions = []
    for target in TARGETS:
        model = MODELS[target]
        proba = float(model.predict_proba(X)[0, 1])
        predictions.append(TargetPrediction(target=target, probability=round(proba, 4)))

    top_bit_present = bool(fingerprint[WATCHED_BIT] == 1)
    svg = draw_molecule_with_highlight(mol, bit_info, WATCHED_BIT)

    return PredictResponse(
        smiles=req.smiles,
        valid=True,
        predictions=predictions,
        top_bit=WATCHED_BIT,
        top_bit_target=WATCHED_BIT_TARGET,
        top_bit_present=top_bit_present,
        honesty_note=WATCHED_BIT_NOTE if top_bit_present else None,
        structure_svg=svg,
    )