"""
Unit & Integration Tests for SIPMAS NLP Service (Fase 17.6)
Menguji clean_text, endpoint /health, dan endpoint /predict.
"""

import os
import sys
import pytest

# Pastikan path modul terdaftar
current_dir = os.path.dirname(os.path.abspath(__file__))
nlp_root = os.path.dirname(current_dir)
sys.path.insert(0, nlp_root)

from app.model.preprocess import clean_text
from app.main import app, load_model

@pytest.fixture(scope="session", autouse=True)
def setup_model():
    """Memastikan model termuat sebelum tes berjalan."""
    load_model()

@pytest.fixture
def client():
    """Flask test client."""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

class TestPreprocess:
    def test_clean_text_case_folding(self):
        result = clean_text("LAPORAN JALAN RUSAK PARAH")
        assert result == "laporan jalan rusak parah"

    def test_clean_text_punctuation_removal(self):
        result = clean_text("Halo!!! Ada sampah di kali??? Tolong ya...")
        assert "!" not in result
        assert "?" not in result
        assert "." not in result

    def test_clean_text_di_prefix_separation(self):
        # dijalan -> di jalan
        assert "di jalan" in clean_text("banyak lobang dijalan raya")
        assert "di selokan" in clean_text("sampah menumpuk diselokan")

    def test_clean_text_slang_normalization(self):
        assert "lubang" in clean_text("banyak lobang jalanan ancur")
        assert "hancur" in clean_text("jalanan ancur bgt")
        assert "tidak" in clean_text("petugas ga ramah")
        assert "kartu tanda penduduk" in clean_text("mau cetak ktp")

    def test_clean_text_empty(self):
        assert clean_text("") == ""
        assert clean_text(None) == ""

class TestHealthEndpoint:
    def test_health_success(self, client):
        response = client.get('/health')
        assert response.status_code == 200
        data = response.get_json()
        assert data['status'] == 'healthy'
        assert data['model_loaded'] is True
        assert 'classes' in data
        assert isinstance(data['classes'], list)
        assert 'trained_at' in data
        assert 'n_samples' in data
        assert data['n_samples'] > 0

class TestPredictEndpoint:
    def test_predict_valid_infrastructure(self, client):
        payload = {"text": "Ada jalanan berlubang parah dan aspal mengelupas membahayakan pengendara"}
        response = client.post('/predict', json=payload)
        assert response.status_code == 200
        data = response.get_json()
        assert data['category'] == 'infrastruktur'
        assert isinstance(data['confidence'], float)
        assert data['confidence'] > 0.0
        assert 'uncertain' in data
        assert data['uncertain'] is False

    def test_predict_valid_lingkungan(self, client):
        payload = {"text": "Tumpukan sampah plastik di selokan sangat bau busuk dan belum diangkut"}
        response = client.post('/predict', json=payload)
        assert response.status_code == 200
        data = response.get_json()
        assert data['category'] == 'lingkungan'
        assert data['uncertain'] is False

    def test_predict_valid_pelayanan(self, client):
        payload = {"text": "Petugas loket kecamatan sangat lambat dan ada pungli untuk pembuatan KTP"}
        response = client.post('/predict', json=payload)
        assert response.status_code == 200
        data = response.get_json()
        assert data['category'] == 'pelayanan'
        assert data['uncertain'] is False

    def test_predict_empty_text_returns_400(self, client):
        # Teks kosong
        response = client.post('/predict', json={"text": ""})
        assert response.status_code == 400
        assert "tidak boleh kosong" in response.get_json()['error']

        # Hanya spasi
        response = client.post('/predict', json={"text": "   "})
        assert response.status_code == 400

        # Field text tidak ada
        response = client.post('/predict', json={})
        assert response.status_code == 400

    def test_predict_too_long_returns_400(self, client):
        long_text = "a" * 5001
        response = client.post('/predict', json={"text": long_text})
        assert response.status_code == 400
        assert "terlalu panjang" in response.get_json()['error']

    def test_predict_uncertain_out_of_domain(self, client, monkeypatch):
        # Set ambang minimal ke 0.5 (default)
        monkeypatch.setenv('NLP_MIN_CONFIDENCE', '0.5')
        response = client.post('/predict', json={"text": "halo"})
        assert response.status_code == 200
        data = response.get_json()
        assert data['confidence'] < 0.5
        assert data['uncertain'] is True

    def test_predict_custom_min_confidence(self, client, monkeypatch):
        # Jika ambang dinaikkan ke 0.99, hampir semua input menjadi uncertain
        monkeypatch.setenv('NLP_MIN_CONFIDENCE', '0.99')
        response = client.post('/predict', json={"text": "Jalanan rusak di depan rumah"})
        assert response.status_code == 200
        data = response.get_json()
        assert data['uncertain'] is True
