# Tox21 QSAR — Molecular Toxicity Prediction

Predicting toxicity of 7,831 molecules across 12 biological targets
using Morgan fingerprints (RDKit) and classical ML (Random Forest, XGBoost, Logistic Regression).

## Results Summary

- Mean ROC-AUC across all targets: 0.828
- Best target: NR-AhR (ROC-AUC = 0.891)
- Hardest target: NR-ER (ROC-AUC = 0.731)
- Random Forest (tuned) was the best model on 11/12 targets

## Methodology

1. Data exploration and class imbalance analysis (Tox21, 12 targets)
2. Morgan fingerprint feature engineering (radius=2, 2048 bits)
3. Per-target missing value masking and class weight computation
4. 5-fold stratified cross-validation (Random Forest, XGBoost, Logistic Regression)
5. Hyperparameter tuning via RandomizedSearchCV
6. Feature importance analysis with chemical substructure decoding
7. SHAP interpretability analysis
8. Error analysis on misclassified molecules

## Key Finding

The model's dominant learned signal is the presence of extended aromatic
ring systems (e.g. Bit 1750), consistent with known AhR pathway biology.
False positives and false negatives both trace back to this single signal:
over-generalization on aromatic-but-non-toxic molecules, and under-detection
of non-aromatic toxicity mechanisms.

## Project structure

- `data/` → raw and processed datasets
- `notebooks/` → step-by-step analysis notebooks
- `src/` → reusable Python modules
- `models/` → saved tuned model files
- `reports/` → figures and final report
