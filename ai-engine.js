/**
 * Pocket Scout v7 - AI Engine with Pure JavaScript Neural Network
 * Neural Network for BUY/SELL probability prediction
 * Dynamic retraining every 50 signals
 * Note: Using lightweight JS implementation instead of TensorFlow.js to avoid CSP issues in Manifest V3
 */

window.AIEngine = (function() {
  'use strict';

  let model = null;
  let isModelReady = false;
  let trainingData = [];
  let signalCount = 0;
  const RETRAIN_INTERVAL = 50; // Retrain every 50 signals
  const MAX_TRAINING_DATA = 500; // Keep last 500 signals for training

  /**
   * Simple Neural Network implementation in pure JavaScript
   */
  class SimpleNN {
    constructor(inputSize, hiddenSize1, hiddenSize2, outputSize) {
      // Initialize weights randomly
      this.w1 = this.randomMatrix(inputSize, hiddenSize1);
      this.b1 = this.randomMatrix(1, hiddenSize1)[0];
      this.w2 = this.randomMatrix(hiddenSize1, hiddenSize2);
      this.b2 = this.randomMatrix(1, hiddenSize2)[0];
      this.w3 = this.randomMatrix(hiddenSize2, outputSize);
      this.b3 = this.randomMatrix(1, outputSize)[0];
      
      this.learningRate = 0.001;
    }

    randomMatrix(rows, cols) {
      const matrix = [];
      for (let i = 0; i < rows; i++) {
        const row = [];
        for (let j = 0; j < cols; j++) {
          row.push((Math.random() - 0.5) * 0.2); // Small random values
        }
        matrix.push(row);
      }
      return matrix;
    }

    relu(x) {
      return Math.max(0, x);
    }

    softmax(arr) {
      const max = Math.max(...arr);
      const exps = arr.map(x => Math.exp(x - max));
      const sum = exps.reduce((a, b) => a + b, 0);
      return exps.map(x => x / sum);
    }

    matmul(matrix, vector) {
      return matrix.map(row => 
        row.reduce((sum, val, i) => sum + val * vector[i], 0)
      );
    }

    forward(input) {
      // Layer 1: input -> hidden1 with ReLU
      let h1 = this.matmul(this.w1, input).map((v, i) => this.relu(v + this.b1[i]));
      
      // Layer 2: hidden1 -> hidden2 with ReLU
      let h2 = this.matmul(this.w2, h1).map((v, i) => this.relu(v + this.b2[i]));
      
      // Layer 3: hidden2 -> output with Softmax
      let output = this.matmul(this.w3, h2).map((v, i) => v + this.b3[i]);
      
      return {
        h1,
        h2,
        output: this.softmax(output)
      };
    }

    predict(input) {
      const result = this.forward(input);
      return result.output;
    }

    train(inputs, labels, epochs = 10) {
      for (let epoch = 0; epoch < epochs; epoch++) {
        for (let i = 0; i < inputs.length; i++) {
          this.trainOne(inputs[i], labels[i]);
        }
      }
    }

    trainOne(input, label) {
      // Forward pass
      const result = this.forward(input);
      const { h1, h2, output } = result;

      // Compute loss gradient (cross-entropy with softmax)
      const dOutput = output.map((o, i) => o - label[i]);

      // Backpropagation
      // Update w3 and b3
      for (let i = 0; i < this.w3.length; i++) {
        for (let j = 0; j < this.w3[i].length; j++) {
          this.w3[i][j] -= this.learningRate * dOutput[j] * h2[i];
        }
      }
      for (let i = 0; i < this.b3.length; i++) {
        this.b3[i] -= this.learningRate * dOutput[i];
      }

      // Gradient for h2
      const dH2 = this.w3.map(row => 
        row.reduce((sum, w, i) => sum + w * dOutput[i], 0)
      ).map((v, i) => h2[i] > 0 ? v : 0); // ReLU derivative

      // Update w2 and b2
      for (let i = 0; i < this.w2.length; i++) {
        for (let j = 0; j < this.w2[i].length; j++) {
          this.w2[i][j] -= this.learningRate * dH2[j] * h1[i];
        }
      }
      for (let i = 0; i < this.b2.length; i++) {
        this.b2[i] -= this.learningRate * dH2[i];
      }

      // Gradient for h1
      const dH1 = this.w2.map(row => 
        row.reduce((sum, w, i) => sum + w * dH2[i], 0)
      ).map((v, i) => h1[i] > 0 ? v : 0); // ReLU derivative

      // Update w1 and b1
      for (let i = 0; i < this.w1.length; i++) {
        for (let j = 0; j < this.w1[i].length; j++) {
          this.w1[i][j] -= this.learningRate * dH1[j] * input[i];
        }
      }
      for (let i = 0; i < this.b1.length; i++) {
        this.b1[i] -= this.learningRate * dH1[i];
      }
    }
  }

  /**
   * Initialize neural network
   */
  async function initialize() {
    try {
      console.log('[AI Engine] Initializing pure JavaScript neural network...');
      
      // Create a simple feedforward neural network
      // 5 inputs -> 16 hidden -> 8 hidden -> 2 outputs (BUY/SELL probability)
      model = new SimpleNN(5, 16, 8, 2);

      isModelReady = true;
      console.log('[AI Engine] ✅ Neural network initialized');

      // Load training data from localStorage
      loadTrainingData();

      return true;
    } catch (error) {
      console.error('[AI Engine] ❌ Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Load training data from localStorage
   */
  function loadTrainingData() {
    try {
      const saved = localStorage.getItem('PS_V7_TRAINING_DATA');
      if (saved) {
        const parsed = JSON.parse(saved);
        trainingData = parsed.data || [];
        signalCount = parsed.count || 0;
        console.log(`[AI Engine] Loaded ${trainingData.length} training samples`);
      }
    } catch (error) {
      console.warn('[AI Engine] Error loading training data:', error);
      trainingData = [];
      signalCount = 0;
    }
  }

  /**
   * Save training data to localStorage
   */
  function saveTrainingData() {
    try {
      localStorage.setItem('PS_V7_TRAINING_DATA', JSON.stringify({
        data: trainingData,
        count: signalCount
      }));
    } catch (error) {
      console.warn('[AI Engine] Error saving training data:', error);
    }
  }

  /**
   * Normalize input features to 0-1 range
   */
  function normalizeFeatures(rsi, adx, atr, williamsR, cci) {
    return [
      rsi / 100,                    // RSI: 0-100 -> 0-1
      adx / 100,                    // ADX: 0-100 -> 0-1
      Math.min(atr * 100, 1),       // ATR: normalize to ~0-1
      (williamsR + 100) / 100,      // Williams %R: -100-0 -> 0-1
      (cci + 200) / 400             // CCI: -200-200 -> 0-1
    ];
  }

  /**
   * Predict BUY/SELL probability using neural network
   * @param {Object} indicators - Object with rsi, adx, atr, williamsR, cci
   * @returns {Object} - { action: 'BUY'|'SELL', buyProb, sellProb, confidence }
   */
  async function predict(indicators) {
    if (!isModelReady || !model) {
      console.warn('[AI Engine] Model not ready, using fallback');
      return null;
    }

    try {
      const { rsi, adx, atr, williamsR, cci } = indicators;
      
      // Normalize features
      const features = normalizeFeatures(rsi, adx, atr, williamsR, cci);

      // Make prediction using pure JS NN
      const probabilities = model.predict(features);

      const buyProb = probabilities[0];
      const sellProb = probabilities[1];

      // Determine action based on higher probability
      const action = buyProb > sellProb ? 'BUY' : 'SELL';
      const confidence = Math.max(buyProb, sellProb) * 100;

      console.log(`[AI Engine] Prediction: ${action} (BUY: ${(buyProb * 100).toFixed(1)}%, SELL: ${(sellProb * 100).toFixed(1)}%)`);

      return {
        action,
        buyProb,
        sellProb,
        confidence
      };
    } catch (error) {
      console.error('[AI Engine] Prediction error:', error);
      return null;
    }
  }

  /**
   * Add training sample and trigger retraining if needed
   * @param {Object} indicators - Object with rsi, adx, atr, williamsR, cci
   * @param {string} action - 'BUY' or 'SELL'
   * @param {boolean} wasWin - true if signal was winning
   */
  function addTrainingSample(indicators, action, wasWin) {
    const { rsi, adx, atr, williamsR, cci } = indicators;
    const features = normalizeFeatures(rsi, adx, atr, williamsR, cci);
    
    // Label: 1 for correct action, 0 for incorrect
    const label = wasWin ? 
      (action === 'BUY' ? [1, 0] : [0, 1]) : 
      (action === 'BUY' ? [0, 1] : [1, 0]);

    trainingData.push({ features, label });
    
    // Keep only last MAX_TRAINING_DATA samples
    if (trainingData.length > MAX_TRAINING_DATA) {
      trainingData = trainingData.slice(-MAX_TRAINING_DATA);
    }

    signalCount++;
    saveTrainingData();

    console.log(`[AI Engine] Added training sample (${trainingData.length} total, count: ${signalCount})`);

    // Trigger retraining every RETRAIN_INTERVAL signals
    if (signalCount % RETRAIN_INTERVAL === 0 && trainingData.length >= 20) {
      console.log('[AI Engine] 🔄 Triggering retraining...');
      retrain();
    }
  }

  /**
   * Retrain the model with collected data
   */
  async function retrain() {
    if (!isModelReady || !model || trainingData.length < 20) {
      console.warn('[AI Engine] Cannot retrain: insufficient data or model not ready');
      return;
    }

    try {
      console.log(`[AI Engine] 🎓 Retraining on ${trainingData.length} samples...`);

      // Prepare training data
      const inputs = trainingData.map(d => d.features);
      const labels = trainingData.map(d => d.label);

      // Train the model
      model.train(inputs, labels, 10);

      console.log('[AI Engine] ✅ Retraining complete');
    } catch (error) {
      console.error('[AI Engine] Retraining error:', error);
    }
  }

  /**
   * Reset all training data (for fresh start)
   */
  function reset() {
    trainingData = [];
    signalCount = 0;
    saveTrainingData();
    console.log('[AI Engine] 🔄 Training data reset');
  }

  /**
   * Get statistics about the AI engine
   */
  function getStats() {
    return {
      isReady: isModelReady,
      trainingDataCount: trainingData.length,
      signalCount: signalCount,
      nextRetrainIn: RETRAIN_INTERVAL - (signalCount % RETRAIN_INTERVAL)
    };
  }

  return {
    initialize,
    predict,
    addTrainingSample,
    retrain,
    reset,
    getStats
  };
})();

console.log('[Pocket Scout v7] AI Engine loaded - Pure JavaScript Neural Network');
