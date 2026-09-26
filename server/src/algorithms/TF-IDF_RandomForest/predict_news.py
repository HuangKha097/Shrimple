import sys
import os
import joblib
import re
import json
from pyvi import ViTokenizer
import numpy as np

# Suppress warnings
import warnings
warnings.filterwarnings("ignore")

# Define path to model
current_dir = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(current_dir, 'fake_news_rf_model.pkl')

def preprocess_text(text):
    if not isinstance(text, str):
        return ""
    text = text.lower()
    text = re.sub(r"http\S+", "", text)
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def vi_tokenizer(text):
    tokenized = ViTokenizer.tokenize(text)
    return tokenized.split()

def main():
    # Use sys.stdin for reading content to avoid argument length limits
    try:
        # Check if arguments are passed (legacy mode) or read from stdin
        if len(sys.argv) > 1:
            input_text = " ".join(sys.argv[1:])
        else:
            # Read from stdin (better for long texts)
            import io
            sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
            input_text = sys.stdin.read().strip()
            
        if not input_text:
             print(json.dumps({"error": "No text provided"}))
             sys.exit(1)

        if not os.path.exists(MODEL_PATH):
            print(json.dumps({"error": f"Model not found at {MODEL_PATH}"}))
            sys.exit(1)

        # Load model and vectorizer
        # Note: We need vi_tokenizer defined in the scope if it was pickled by reference
        rf_model, tfidf = joblib.load(MODEL_PATH)
        
        # Process input
        clean_text = preprocess_text(input_text)
        vec = tfidf.transform([clean_text])
        
        # Check if vector is empty (no words from vocabulary found)
        if vec.nnz == 0:
             # Default to Real if we have no information (e.g. all stopwords or unknown words)
             # rather than letting the model guess blindly.
             prediction = 0 
             probability = 0.0 # No confidence
        else:
            # Predict
            prediction = rf_model.predict(vec)[0] # 0 = Real, 1 = Fake
            # prediction is likely numpy int, convert to python int
            prediction = int(prediction)
            
            probability = rf_model.predict_proba(vec)[0][prediction]
        
        is_fake = (prediction == 1)
        
        result = {
            "isFake": is_fake,
            "label": "Fake" if is_fake else "Real",
            "confidence": float(probability),
            "originalText": clean_text
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        # In case of module import errors (common with pickling functions), we might need to handle specific errors
        # But for now, print the error JSON
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
