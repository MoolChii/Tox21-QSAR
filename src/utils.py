import numpy as np
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.utils.class_weight import compute_class_weight
from sklearn.metrics import roc_auc_score, average_precision_score, confusion_matrix, accuracy_score


def get_target_data(X, y, target_idx, test_size=0.2, random_state=42):
    """
    For a given target index:
    1. Remove NaN rows
    2. Split into train/test
    3. Compute class weights
    """
    # Step 1 — remove NaNs
    mask = ~np.isnan(y[:, target_idx])
    X_clean = X[mask]
    y_clean = y[mask, target_idx].astype(int)

    # Step 2 — stratified train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X_clean, y_clean,
        test_size=test_size,
        random_state=random_state,
        stratify=y_clean
    )

    # Step 3 — compute class weights
    classes = np.array([0, 1])
    weights = compute_class_weight('balanced', classes=classes, y=y_train)
    class_weight_dict = {0: weights[0], 1: weights[1]}

    return X_train, X_test, y_train, y_test, class_weight_dict


def cross_validate_target(X, y, target_idx, model_fn, n_splits=5, random_state=42):
    """
    Run stratified k-fold cross-validation for one target.

    model_fn: a function that takes (class_weight_dict, y_train) and returns
              a FRESH, unfitted model instance (so each fold trains a clean
              model with no leftover state from the previous fold).

    Returns a dict with mean/std for ROC-AUC, PR-AUC, accuracy (for contrast
    only — not used for model selection), and the accumulated confusion
    matrix across all folds.
    """
    # Step 1 — remove NaNs for this target (same as get_target_data)
    mask = ~np.isnan(y[:, target_idx])
    X_clean = X[mask]
    y_clean = y[mask, target_idx].astype(int)

    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=random_state)

    fold_roc, fold_pr, fold_acc = [], [], []
    all_cm = np.zeros((2, 2), dtype=int)  # accumulate confusion matrix across folds

    for train_idx, test_idx in skf.split(X_clean, y_clean):
        X_train, X_test = X_clean[train_idx], X_clean[test_idx]
        y_train, y_test = y_clean[train_idx], y_clean[test_idx]

        # class weights computed PER FOLD, not globally — each fold has a
        # slightly different class distribution
        classes = np.array([0, 1])
        weights = compute_class_weight('balanced', classes=classes, y=y_train)
        cw_dict = {0: weights[0], 1: weights[1]}

        model = model_fn(cw_dict, y_train)
        model.fit(X_train, y_train)

        proba = model.predict_proba(X_test)[:, 1]
        pred = model.predict(X_test)

        fold_roc.append(roc_auc_score(y_test, proba))
        fold_pr.append(average_precision_score(y_test, proba))
        fold_acc.append(accuracy_score(y_test, pred))
        all_cm += confusion_matrix(y_test, pred, labels=[0, 1])

    return {
        "roc_auc_mean": np.mean(fold_roc), "roc_auc_std": np.std(fold_roc),
        "pr_auc_mean": np.mean(fold_pr), "pr_auc_std": np.std(fold_pr),
        "accuracy_mean": np.mean(fold_acc), "accuracy_std": np.std(fold_acc),
        "confusion_matrix": all_cm,
    }