from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import joblib
import json
import os
import numpy as np

app = Flask(__name__, static_folder="../public", static_url_path="/")
CORS(app) # Enable CORS for frontend

# Paths
MODEL_PATH = "estato_model.pkl"
ENCODERS_PATH = "encoders.pkl"
COLUMNS_PATH = "model_columns.json"

# Load Artifacts
print("Loading model and artifacts...")
try:
    if os.path.exists(MODEL_PATH):
        model = joblib.load(MODEL_PATH)
        encoders = joblib.load(ENCODERS_PATH)
        with open(COLUMNS_PATH, 'r') as f:
            model_columns = json.load(f)
        print("Model loaded successfully.")
    else:
        print("Model artifacts not found. Please run train.py first.")
        model = None
except Exception as e:
    print(f"Error loading model: {e}")
    model = None

# Serve Frontend
@app.route('/')
def index():
    return app.send_static_file('index.html')

# Serve other pages (like predict.html)
@app.route('/<path:path>')
def static_proxy(path):
    return app.send_static_file(path)

@app.route('/predict', methods=['POST'])
def predict():
    if not model:
        return jsonify({"error": "Model not loaded. Train the model first."}), 500

    try:
        data = request.json
        
        # Create DataFrame from input
        # Ensure all columns from training exist, initialize with defaults if missing
        input_data = {col: [data.get(col, 0)] for col in model_columns}
        df = pd.DataFrame(input_data)
        
        # Preprocess/Encode
        for col, le in encoders.items():
            if col in df.columns:
                val = str(df[col][0])
                if val in le.classes_:
                    df[col] = le.transform([val])
                else:
                    # Handle unseen labels by picking the first class (or mode)
                    print(f"Warning: Unseen label '{val}' for column '{col}'. Using default.")
                    df[col] = le.transform([le.classes_[0]])

        # Predict
        log_prediction = model.predict(df)
        # Reverse log-transform
        prediction = np.expm1(log_prediction)
        
        return jsonify({
            "predicted_price": round(float(prediction[0]), 2),
            "currency": "PKR"
        })

    except Exception as e:
        print(f"Prediction error: {e}")
        return jsonify({"error": str(e)}), 400

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "running", "model_loaded": model is not None})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
