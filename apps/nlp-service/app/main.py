# apps/nlp-service/app/main.py
import os
import pickle
from flask import Flask, request, jsonify

try:
    from .model.preprocess import clean_text
except ImportError:
    from model.preprocess import clean_text

app = Flask(__name__)

current_dir = os.path.dirname(os.path.abspath(__file__))
ARTIFACTS_DIR = os.path.join(current_dir, 'artifacts')
MODEL_PATH = os.path.join(ARTIFACTS_DIR, 'nlp_model.pkl')

model_data = None

def get_min_confidence() -> float:
    """Mengambil ambang batas keyakinan dari variabel lingkungan NLP_MIN_CONFIDENCE."""
    try:
        return float(os.environ.get('NLP_MIN_CONFIDENCE', '0.5'))
    except ValueError:
        return 0.5

def load_model():
    """Memuat model NLP dari disk ke memori (hanya dari app/artifacts/nlp_model.pkl)."""
    global model_data

    if os.path.exists(MODEL_PATH):
        print(f"[NLP Serving] Memuat model NLP dari: {MODEL_PATH}")
        try:
            with open(MODEL_PATH, 'rb') as f:
                model_data = pickle.load(f)
            classes = model_data.get('classes', [])
            print(f"[NLP Serving] Model berhasil dimuat. Kelas: {classes}")
            return True
        except Exception as e:
            print(f"[NLP Serving] Gagal memuat model: {e}")
            model_data = None
            return False
    else:
        print("[NLP Serving] PERINGATAN: Berkas model NLP belum ditemukan.")
        print("[NLP Serving] Silakan jalankan CLI job: python -m app.model.train")
        model_data = None
        return False

# Muat model saat module diimpor
load_model()

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        'status': 'online',
        'service': 'SIPMAS NLP Classification Microservice',
        'version': '1.0.0',
        'endpoints': {
            '/health': 'GET - Health check status, info pelatihan & kesiapan model',
            '/predict': 'POST - Menerima teks laporan untuk diprediksi kategorinya'
        }
    })

@app.route('/health', methods=['GET'])
def health():
    is_ready = model_data is not None
    status_code = 200 if is_ready else 503
    classes = model_data.get('classes', []) if is_ready else []
    trained_at = model_data.get('trained_at') if is_ready else None
    n_samples = model_data.get('n_samples') if is_ready else 0

    return jsonify({
        'status': 'healthy' if is_ready else 'unhealthy',
        'model_loaded': is_ready,
        'model_classes': classes,
        'classes': classes,
        'trained_at': trained_at,
        'n_samples': n_samples,
        'version': '1.0.0'
    }), status_code

@app.route('/predict', methods=['POST'])
def predict():
    global model_data
    if not model_data:
        load_model()
        if not model_data:
            return jsonify({'error': 'Model NLP belum tersedia. Jalankan pelatihan terlebih dahulu.'}), 503

    data = request.get_json(silent=True)
    if not data or 'text' not in data:
        return jsonify({'error': 'Input field "text" wajib disertakan'}), 400

    raw_text = data.get('text')
    if not isinstance(raw_text, str) or not raw_text.strip():
        return jsonify({'error': 'Input teks tidak boleh kosong!'}), 400

    if len(raw_text) > 5000:
        return jsonify({'error': 'Teks terlalu panjang! Maksimal 5000 karakter.'}), 400

    text = raw_text.strip()

    try:
        cleaned = clean_text(text)
        vectorizer = model_data['vectorizer']
        model = model_data['model']

        features = vectorizer.transform([cleaned])
        prediction = model.predict(features)[0]

        # Probabilitas kepastian
        try:
            probs = model.predict_proba(features)[0]
            confidence = float(max(probs))
        except Exception:
            confidence = 1.0

        min_conf = get_min_confidence()
        uncertain = bool(confidence < min_conf)

        return jsonify({
            'category': str(prediction),
            'confidence': round(confidence, 4),
            'uncertain': uncertain
        })
    except Exception as e:
        print(f"[NLP Serving] Error saat memproses prediksi: {e}")
        return jsonify({'error': 'Terjadi kesalahan saat memproses prediksi teks.'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
