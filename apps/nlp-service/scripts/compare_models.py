#!/usr/bin/env python3
"""
Model Comparison Script for SIPMAS NLP Service (Fase 17.5).
Compares:
1. SVC (kernel='linear', probability=True)
2. LogisticRegression
3. LinearSVC + CalibratedClassifierCV
Evaluated using 5-Fold StratifiedGroupKFold on template groups + OOD Smoke Set.
"""

import os
import sys
import csv
import re
import numpy as np
from collections import defaultdict
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.metrics import accuracy_score, f1_score, precision_recall_fscore_support, confusion_matrix
from sklearn.svm import SVC, LinearSVC
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV

nlp_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(nlp_root, 'app'))

try:
    from model.preprocess import clean_text, INDON_STOP_WORDS
except ImportError:
    from app.model.preprocess import clean_text, INDON_STOP_WORDS

LOCATIONS_REGEX = re.compile(r'\b(cibeber|cilegon|citangkil|grogol|jombang|pulomerak|purwakarta|sanja)\b', re.IGNORECASE)

def get_template_group(text: str) -> str:
    return LOCATIONS_REGEX.sub('<LOC>', text).strip()

def run_comparison():
    training_csv = os.path.join(nlp_root, 'dataset', 'dataset_training.csv')
    smoke_csv = os.path.join(nlp_root, 'tests', 'ood_smoke.csv')

    # Load training data
    texts, labels, groups = [], [], []
    with open(training_csv, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for r in reader:
            txt = r['text']
            lbl = r['label']
            texts.append(txt)
            labels.append(lbl)
            groups.append(get_template_group(txt))

    X = np.array(texts)
    y = np.array(labels)
    g = np.array(groups)
    classes = sorted(list(set(y)))

    # Load smoke test data
    smoke_data = []
    with open(smoke_csv, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for r in reader:
            smoke_data.append({'raw': r['text'], 'clean': clean_text(r['text']), 'label': r['label']})

    models = {
        'SVC(linear)': lambda: SVC(kernel='linear', C=1.0, probability=True, random_state=42),
        'LogisticRegression': lambda: LogisticRegression(C=1.0, max_iter=1000, random_state=42),
        'CalibratedLinearSVC': lambda: CalibratedClassifierCV(estimator=LinearSVC(C=1.0, dual='auto', random_state=42), cv=3)
    }

    sgkf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)

    print("=" * 80)
    print(f"EVALUASI CROSS-VALIDATION 5-FOLD (StratifiedGroupKFold, 60 template groups)")
    print("=" * 80)

    results = {}

    for name, model_factory in models.items():
        fold_accs = []
        fold_f1s = []
        all_true = []
        all_pred = []

        for train_idx, val_idx in sgkf.split(X, y, g):
            X_train, X_val = X[train_idx], X[val_idx]
            y_train, y_val = y[train_idx], y[val_idx]

            vec = TfidfVectorizer(stop_words=INDON_STOP_WORDS, max_features=5000, ngram_range=(1, 2))
            X_tr_vec = vec.fit_transform(X_train)
            X_v_vec = vec.transform(X_val)

            clf = model_factory()
            clf.fit(X_tr_vec, y_train)
            preds = clf.predict(X_v_vec)

            fold_accs.append(accuracy_score(y_val, preds))
            fold_f1s.append(f1_score(y_val, preds, average='macro'))
            all_true.extend(y_val)
            all_pred.extend(preds)

        mean_acc = np.mean(fold_accs)
        mean_f1 = np.mean(fold_f1s)
        p, r, f, _ = precision_recall_fscore_support(all_true, all_pred, labels=classes, zero_division=0)

        # Train on full dataset to evaluate on smoke test
        full_vec = TfidfVectorizer(stop_words=INDON_STOP_WORDS, max_features=5000, ngram_range=(1, 2))
        X_full = full_vec.fit_transform(X)
        full_model = model_factory()
        full_model.fit(X_full, y)

        # Smoke set evaluation
        in_domain_correct = 0
        in_domain_total = 0
        in_domain_confidences = []
        ood_confidences = []

        for s in smoke_data:
            s_vec = full_vec.transform([s['clean']])
            pred = full_model.predict(s_vec)[0]
            probs = full_model.predict_proba(s_vec)[0]
            conf = float(max(probs))

            if s['label'] == 'uncertain':
                ood_confidences.append((s['raw'], pred, conf))
            else:
                in_domain_total += 1
                if pred == s['label']:
                    in_domain_correct += 1
                in_domain_confidences.append((s['raw'], s['label'], pred, conf))

        smoke_id_acc = in_domain_correct / in_domain_total if in_domain_total > 0 else 0.0
        mean_id_conf = np.mean([c for _, _, _, c in in_domain_confidences])
        mean_ood_conf = np.mean([c for _, _, c in ood_confidences])

        results[name] = {
            'cv_acc': mean_acc,
            'cv_macro_f1': mean_f1,
            'class_metrics': {cls: {'precision': p[i], 'recall': r[i], 'f1': f[i]} for i, cls in enumerate(classes)},
            'smoke_id_acc': smoke_id_acc,
            'mean_id_conf': mean_id_conf,
            'mean_ood_conf': mean_ood_conf,
            'ood_details': ood_confidences,
            'in_domain_details': in_domain_confidences
        }

        print(f"\n--- MODEL: {name} ---")
        print(f"  CV Accuracy       : {mean_acc * 100:.2f}%")
        print(f"  CV Macro F1       : {mean_f1 * 100:.2f}%")
        for i, cls in enumerate(classes):
            print(f"    {cls:<15}: P={p[i]:.3f}, R={r[i]:.3f}, F1={f[i]:.3f}")
        print(f"  Smoke In-Domain Acc: {smoke_id_acc * 100:.2f}% ({in_domain_correct}/{in_domain_total})")
        print(f"  Smoke In-Domain Avg Conf : {mean_id_conf:.3f}")
        print(f"  Smoke OOD/Uncertain Avg Conf: {mean_ood_conf:.3f}")

    print("\n" + "=" * 80)
    print("DETAIL PREDIKSI SMOKE OOD (Uncertain samples) per Model:")
    print("=" * 80)
    for sample_idx in range(len(results['LogisticRegression']['ood_details'])):
        raw_text = results['LogisticRegression']['ood_details'][sample_idx][0]
        print(f"\nTeks: \"{raw_text}\"")
        for name in models.keys():
            _, pred, conf = results[name]['ood_details'][sample_idx]
            print(f"  {name:<20}: Pred={pred:<15} Conf={conf:.3f}")

    return results

if __name__ == '__main__':
    run_comparison()
