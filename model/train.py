import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
import matplotlib.pyplot as plt
import seaborn as sns
import joblib
import json
import os

# Configuration
DATASET_PATH = r"C:\Users\Talal Tahir\Desktop\etstate\Sample_House_Price_Prediction_Dataset.csv"
MODEL_PATH = "estato_model.pkl"
ENCODERS_PATH = "encoders.pkl"

def train_model():
    print("Loading dataset...")
    df = pd.read_csv(DATASET_PATH)
    
    # 1. Preprocessing
    print("Preprocessing data...")
    
    # Drop irrelevant or too granular columns
    # 'Street Number' is likely too specific and behaves like an ID
    drop_cols = ['Street Number']
    df = df.drop(columns=[c for c in drop_cols if c in df.columns])

    # Handle Categorical Variables
    # Fix: Explicitly selecting object and string types to avoid Pandas FutureWarning
    categorical_cols = df.select_dtypes(include=['object', 'string']).columns
    encoders = {}

    for col in categorical_cols:
        le = LabelEncoder()
        df[col] = df[col].astype(str) # Ensure everything is string
        df[col] = le.fit_transform(df[col])
        encoders[col] = le
    
    
    # Features (X) and Target (y)
    X = df.drop(columns=['PricePKR'])
    # Log-transform the target variable to stabilize variance
    y = np.log1p(df['PricePKR'])

    # 2. Split Data: 70% Train, 15% Validation, 15% Test
    print("Splitting data into Train (70%), Validation (15%), and Test (15%)...")
    # First split: 70% Train, 30% Temp
    X_train, X_temp, y_train, y_temp = train_test_split(X, y, test_size=0.3, random_state=42)
    # Second split: Split Temp into 50% Val, 50% Test (which is 15% of total each)
    X_val, X_test, y_val, y_test = train_test_split(X_temp, y_temp, test_size=0.5, random_state=42)

    # 3. Train Model
    print("Training Random Forest Model (with Log-Transformed Target)...")
    rf = RandomForestRegressor(n_estimators=200, max_depth=20, random_state=42)
    rf.fit(X_train, y_train)

    # 4. Evaluate on Validation Set (for tuning - printed to console)
    print("\n--- Validation Results ---")
    val_pred_log = rf.predict(X_val)
    val_pred = np.expm1(val_pred_log)
    val_actual = np.expm1(y_val)
    print(f"Validation MAE: {mean_absolute_error(val_actual, val_pred):,.0f} PKR")
    print(f"Validation R2: {r2_score(val_actual, val_pred):.4f}")

    # 5. Final Evaluation on Test Set
    print("\n--- Test Set Results ---")
    y_pred_log = rf.predict(X_test)
    
    # Convert back to original scale
    y_test_orig = np.expm1(y_test)
    y_pred_orig = np.expm1(y_pred_log)
    
    r2 = r2_score(y_test_orig, y_pred_orig)
    mae = mean_absolute_error(y_test_orig, y_pred_orig)
    rmse = np.sqrt(mean_squared_error(y_test_orig, y_pred_orig))
    
    print(f"R2 Score: {r2:.4f}")
    print(f"Mean Absolute Error: {mae:,.0f} PKR")
    print(f"Root Mean Sq Error:  {rmse:,.0f} PKR")

    # 6. Generate "Confusion Matrix" Equivalent (Prediction Error Analysis)
    print("\nGenerating evaluation report...")
    results_df = pd.DataFrame({
        'Actual_Price': y_test_orig,
        'Predicted_Price': y_pred_orig,
        'Difference': y_test_orig - y_pred_orig,
        'Error_Percentage': np.abs((y_test_orig - y_pred_orig) / y_test_orig) * 100
    })
    
    # Save CSV Matrix
    results_df.to_csv("model/prediction_analysis.csv", index=False)
    print("Saved 'model/prediction_analysis.csv'")

    # Generate Scatter Plot (Visual Confusion Matrix)
    plt.figure(figsize=(10, 6))
    sns.scatterplot(x=y_test_orig, y=y_pred_orig, alpha=0.6)
    
    # perfect prediction line
    m, b = np.polyfit(y_test_orig, y_pred_orig, 1)
    plt.plot(y_test_orig, m*y_test_orig + b, color='red', linestyle='--', label='Trend')
    plt.plot([y_test_orig.min(), y_test_orig.max()], [y_test_orig.min(), y_test_orig.max()], color='green', linestyle=':', label='Perfect Prediction')

    plt.xlabel('Actual Price (PKR)')
    plt.ylabel('Predicted Price (PKR)')
    plt.title(f'Actual vs Predicted Prices (R2: {r2:.2f})')
    plt.legend()
    plt.grid(True)
    plt.savefig("model/accuracy_plot.png")
    print("Saved 'model/accuracy_plot.png'")

    # 7. Save Artifacts
    print("\nSaving model and encoders...")
    joblib.dump(rf, MODEL_PATH)
    joblib.dump(encoders, ENCODERS_PATH)
    
    # Save column structure for API reference
    with open("model_columns.json", "w") as f:
        json.dump(list(X.columns), f)
        
    print("Training Complete! Model saved to 'model/estato_model.pkl'")

if __name__ == "__main__":
    try:
        train_model()
    except Exception as e:
        print(f"Error during training: {e}")
