# apps/nlp-service/train.py
"""CLI wrapper entrypoint untuk melatih model NLP."""
import os
import sys

# Pastikan apps/nlp-service berada di sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from app.model.train import main, train_model, clean_text

if __name__ == '__main__':
    main()
