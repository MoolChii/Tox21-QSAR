import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight

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