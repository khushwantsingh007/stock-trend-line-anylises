from flask import Flask, render_template, jsonify
import yfinance as yf
import datetime
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import PolynomialFeatures
from sklearn.pipeline import make_pipeline
import threading
import time
import traceback

app = Flask(__name__)

# Config
LOOKBACK_DAYS = 7
PREDICTION_WINDOW = 10
REFRESH_INTERVAL = 60

class StockManager:
    def __init__(self):
        self.cache = {}
        self.last_updated = {}

    def fetch_data(self, ticker):
        try:
            # Download data with auto_adjust=False to get raw prices
            df = yf.download(ticker, period='1d', interval='1m', auto_adjust=False)
            if df.empty or len(df) < 10:
                return None
                
            # Simplify MultiIndex columns if they exist
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.droplevel(1)  # Keep only the price type (Open, High, etc.)
            
            df = df.dropna()
            
            # Debug the processed DataFrame
            print(f"\n--- DEBUG PROCESSED DATA: {ticker} ---")
            print("Columns:", df.columns.tolist())
            print(df.head(1))
            
            # Add indicators
            df = self.add_indicators(df)

            print(f"\n--- FINAL DATA WITH INDICATORS ---")
            print(df.tail(3))
            
            self.cache[ticker] = df
            self.last_updated[ticker] = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            return df
        except Exception as e:
            print(f"Error fetching data for {ticker}: {e}")
            traceback.print_exc()
            return None

    def add_indicators(self, df):
        try:
            # Calculate RSI
            delta = df['Close'].diff()
            gain = (delta.where(delta > 0, 0)).rolling(14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
            rs = gain / loss
            df['RSI'] = 100 - (100 / (1 + rs))

            # Calculate MACD
            exp1 = df['Close'].ewm(span=12, adjust=False).mean()
            exp2 = df['Close'].ewm(span=26, adjust=False).mean()
            df['MACD'] = exp1 - exp2
            df['MACD_Signal'] = df['MACD'].ewm(span=9, adjust=False).mean()
            df['MACD_Hist'] = df['MACD'] - df['MACD_Signal']

            # Calculate Bollinger Bands
            df['BB_Middle'] = df['Close'].rolling(20).mean()
            df['BB_Upper'] = df['BB_Middle'] + 2 * df['Close'].rolling(20).std()
            df['BB_Lower'] = df['BB_Middle'] - 2 * df['Close'].rolling(20).std()
            
            return df
        except Exception as e:
            print(f"Error adding indicators: {e}")
            traceback.print_exc()
            raise

    def predict(self, df):
        try:
            x = np.arange(len(df)).reshape(-1, 1)
            y = df['Close'].values

            models = {
                'linear': LinearRegression(),
                'quadratic': make_pipeline(PolynomialFeatures(2), LinearRegression()),
                'cubic': make_pipeline(PolynomialFeatures(3), LinearRegression())
            }

            result = {}
            for name, model in models.items():
                model.fit(x, y)
                future_x = np.arange(len(df), len(df) + PREDICTION_WINDOW).reshape(-1, 1)
                result[name] = {
                    'current': model.predict(x).tolist(),
                    'future': model.predict(future_x).tolist()
                }
            return result
        except Exception as e:
            print(f"Error in prediction: {e}")
            traceback.print_exc()
            return {}

stock_manager = StockManager()

def background_updater():
    while True:
        try:
            for ticker in list(stock_manager.cache.keys()):
                stock_manager.fetch_data(ticker)
            time.sleep(REFRESH_INTERVAL)
        except Exception as e:
            print(f"Error in background updater: {e}")
            time.sleep(5)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/stock/<ticker>')
def stock_api(ticker):
    try:
        if ticker not in stock_manager.cache:
            df = stock_manager.fetch_data(ticker)
            if df is None:
                return jsonify({'error': 'Could not fetch data'}), 404
        else:
            df = stock_manager.cache[ticker]

        # Prepare data for JSON response
        df_reset = df.reset_index()
        df_reset['Datetime'] = df_reset['Datetime'].astype(str)
        
        prices_data = df_reset[['Datetime', 'Open', 'High', 'Low', 'Close', 'Volume']].to_dict('records')
        
        indicators_data = {
            'RSI': df['RSI'].fillna(0).tolist(),
            'MACD': df['MACD'].fillna(0).tolist(),
            'MACD_Signal': df['MACD_Signal'].fillna(0).tolist(),
            'MACD_Hist': df['MACD_Hist'].fillna(0).tolist(),
            'BB_Upper': df['BB_Upper'].fillna(0).tolist(),
            'BB_Middle': df['BB_Middle'].fillna(0).tolist(),
            'BB_Lower': df['BB_Lower'].fillna(0).tolist()
        }
        
        predictions = stock_manager.predict(df)
        
        return jsonify({
            'prices': prices_data,
            'indicators': indicators_data,
            'predictions': predictions,
            'last_updated': stock_manager.last_updated.get(ticker, 'Never'),
            'news': []
        })
    except Exception as e:
        print(f"API error for {ticker}: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    threading.Thread(target=background_updater, daemon=True).start()
    app.run(debug=True)