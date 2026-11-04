# apps/nlp-service/app/model/train.py
import os
import sys
import csv
import json
import pickle
import re
import argparse
from datetime import datetime, timezone
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.metrics import accuracy_score, f1_score, precision_recall_fscore_support, confusion_matrix
from sklearn.linear_model import LogisticRegression

try:
    from .preprocess import clean_text, INDON_STOP_WORDS
except ImportError:
    from preprocess import clean_text, INDON_STOP_WORDS

LOCATIONS_REGEX = re.compile(r'\b(cibeber|cilegon|citangkil|grogol|jombang|pulomerak|purwakarta|sanja)\b', re.IGNORECASE)

def get_template_group(text: str) -> str:
    """Ekstraksi template dasar dengan menyamarkan nama lokasi untuk pengelompokan bebas bocor."""
    return LOCATIONS_REGEX.sub('<LOC>', text).strip()

def train_model(dataset_path: str = None, output_path: str = None, n_splits: int = 5, random_state: int = 42) -> dict:
    """
    Melatih model klasifikasi teks laporan menggunakan TF-IDF + Logistic Regression
    dengan evaluasi jujur 5-fold StratifiedGroupKFold dan penyimpanan atomik.
    """
    current_dir = os.path.dirname(os.path.abspath(__file__))
    app_dir = os.path.dirname(current_dir)
    service_root = os.path.dirname(app_dir)

    if dataset_path is None:
        clean_dataset = os.path.join(service_root, 'dataset', 'dataset_training.csv')
        raw_dataset = os.path.join(service_root, 'dataset', 'dataset_pengaduan_masyarakat_3000.csv')
        dataset_path = clean_dataset if os.path.exists(clean_dataset) else raw_dataset

    if output_path is None:
        output_path = os.path.join(app_dir, 'artifacts', 'nlp_model.pkl')

    print(f"[NLP Train] Membaca dataset dari: {dataset_path}")
    if not os.path.exists(dataset_path):
        raise FileNotFoundError(f"Berkas dataset tidak ditemukan di: {dataset_path}")

    texts = []
    labels = []
    groups = []

    with open(dataset_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            isi = row.get('text') or row.get('Isi Laporan')
            kategori = row.get('label') or row.get('Kategori')
            if isi and kategori:
                clean = clean_text(isi)
                texts.append(clean)
                labels.append(kategori.strip().lower())
                groups.append(get_template_group(clean))

    n_samples = len(texts)
    print(f"[NLP Train] Berhasil memuat {n_samples} sampel data laporan ({len(set(groups))} template groups).")
    if n_samples == 0:
        raise ValueError("Dataset kosong, tidak bisa melatih model.")

    X = np.array(texts)
    y = np.array(labels)
    g = np.array(groups)
    classes = sorted(list(set(y)))

    print(f"[NLP Train] Melakukan evaluasi {n_splits}-Fold StratifiedGroupKFold...")
    sgkf = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=random_state)

    fold_accuracies = []
    fold_macro_f1s = []
    all_y_true = []
    all_y_pred = []

    for fold, (train_idx, val_idx) in enumerate(sgkf.split(X, y, g), 1):
        X_train_f, X_val_f = X[train_idx], X[val_idx]
        y_train_f, y_val_f = y[train_idx], y[val_idx]

        vec_f = TfidfVectorizer(stop_words=INDON_STOP_WORDS, max_features=5000, ngram_range=(1, 2))
        X_tr_vec = vec_f.fit_transform(X_train_f)
        X_vl_vec = vec_f.transform(X_val_f)

        clf_f = LogisticRegression(C=1.0, max_iter=1000, random_state=random_state)
        clf_f.fit(X_tr_vec, y_train_f)

        preds_f = clf_f.predict(X_vl_vec)
        acc_f = accuracy_score(y_val_f, preds_f)
        f1_f = f1_score(y_val_f, preds_f, average='macro')

        fold_accuracies.append(acc_f)
        fold_macro_f1s.append(f1_f)
        all_y_true.extend(y_val_f)
        all_y_pred.extend(preds_f)

    mean_acc = float(np.mean(fold_accuracies))
    std_acc = float(np.std(fold_accuracies))
    mean_macro_f1 = float(np.mean(fold_macro_f1s))
    std_macro_f1 = float(np.std(fold_macro_f1s))

    precisions, recalls, f1s, supports = precision_recall_fscore_support(
        all_y_true, all_y_pred, labels=classes, zero_division=0
    )
    conf_matrix = confusion_matrix(all_y_true, all_y_pred, labels=classes)

    class_metrics = {}
    for idx, cls_name in enumerate(classes):
        class_metrics[cls_name] = {
            'precision': float(precisions[idx]),
            'recall': float(recalls[idx]),
            'f1_score': float(f1s[idx]),
            'support': int(supports[idx])
        }

    print("\n" + "=" * 60)
    print("HASIL EVALUASI JUJUR (5-Fold StratifiedGroupKFold):")
    print(f"  Rata-rata Akurasi : {mean_acc * 100:.2f}% ± {std_acc * 100:.2f}%")
    print(f"  Rata-rata Macro-F1: {mean_macro_f1 * 100:.2f}% ± {std_macro_f1 * 100:.2f}%")
    print("  Metrik per Kelas:")
    for cls_name, met in class_metrics.items():
        print(f"    - {cls_name:<14}: P={met['precision']:.3f}, R={met['recall']:.3f}, F1={met['f1_score']:.3f} (N={met['support']})")
    print("  Confusion Matrix:")
    print(f"    Labels: {classes}")
    for row in conf_matrix:
        print(f"    {row.tolist()}")
    print("=" * 60 + "\n")

    # Melatih model final pada seluruh dataset
    print("[NLP Train] Melatih model final pada seluruh data sampel...")
    final_vectorizer = TfidfVectorizer(stop_words=INDON_STOP_WORDS, max_features=5000, ngram_range=(1, 2))
    X_all_vec = final_vectorizer.fit_transform(X)

    final_model = LogisticRegression(C=1.0, max_iter=1000, random_state=random_state)
    final_model.fit(X_all_vec, y)

    now_iso = datetime.now(timezone.utc).isoformat()

    metrics_payload = {
        'trained_at': now_iso,
        'model_type': 'LogisticRegression',
        'n_samples': n_samples,
        'classes': classes,
        'cross_validation': {
            'n_splits': n_splits,
            'mean_accuracy': round(mean_acc, 4),
            'std_accuracy': round(std_acc, 4),
            'mean_macro_f1': round(mean_macro_f1, 4),
            'std_macro_f1': round(std_macro_f1, 4),
            'fold_accuracies': [round(a, 4) for a in fold_accuracies],
            'fold_macro_f1s': [round(f, 4) for f in fold_macro_f1s]
        },
        'class_metrics': class_metrics,
        'confusion_matrix': conf_matrix.tolist()
    }

    # Simpan metrics.json di samping model
    artifacts_dir = os.path.dirname(output_path)
    os.makedirs(artifacts_dir, exist_ok=True)
    metrics_path = os.path.join(artifacts_dir, 'metrics.json')

    with open(metrics_path, 'w', encoding='utf-8') as f:
        json.dump(metrics_payload, f, indent=2)
    print(f"[NLP Train] Metrik evaluasi disimpan ke: {metrics_path}")

    # Simpan model secara atomik (file sementara lalu os.replace)
    temp_output_path = f"{output_path}.tmp.{os.getpid()}"
    model_payload = {
        'model': final_model,
        'vectorizer': final_vectorizer,
        'classes': classes,
        'trained_at': now_iso,
        'n_samples': n_samples,
        'model_type': 'LogisticRegression'
    }

    with open(temp_output_path, 'wb') as f:
        pickle.dump(model_payload, f)

    os.replace(temp_output_path, output_path)
    print(f"[NLP Train] Model final berhasil disimpan secara atomik ke: {output_path}")

    return metrics_payload

def main():
    parser = argparse.ArgumentParser(description="CLI Pelatihan Model Klasifikasi Aduan NLP SIPMAS")
    parser.add_argument("--dataset", type=str, default=None, help="Path ke berkas dataset CSV")
    parser.add_argument("--output", type=str, default=None, help="Path output untuk berkas model pickle (.pkl)")
    parser.add_argument("--splits", type=int, default=5, help="Jumlah lipatan GroupKFold (default: 5)")
    parser.add_argument("--random-state", type=int, default=42, help="Seed acak (default: 42)")

    args = parser.parse_args()

    try:
        metrics = train_model(
            dataset_path=args.dataset,
            output_path=args.output,
            n_splits=args.splits,
            random_state=args.random_state
        )
        print(f"\n Pelatihan selesai sukses. Macro-F1 CV: {metrics['cross_validation']['mean_macro_f1'] * 100:.2f}%")
        sys.exit(0)
    except Exception as err:
        print(f"\n Terjadi kesalahan saat pelatihan: {err}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
