/**
 * Pocket Scout v7 - AI Engine with TensorFlow.js
 * Neural Network for BUY/SELL probability prediction
 * Dynamic retraining every 50 signals
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
   * Initialize TensorFlow.js and create the model
   */
  async function initialize() {
    try {
      // Check if TensorFlow.js is loaded
      if (typeof tf === 'undefined') {
        console.error('[AI Engine] TensorFlow.js not loaded. Loading from CDN...');
        await loadTensorFlowJS();
      }

      console.log('[AI Engine] Initializing neural network...');
      
      // Create a simple feedforward neural network
      // 5 inputs -> 16 hidden -> 8 hidden -> 2 outputs (BUY/SELL probability)
      model = tf.sequential({
        layers: [
          tf.layers.dense({ inputShape: [5], units: 16, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({ units: 8, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({ units: 2, activation: 'softmax' })
        ]
      });

      model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
      });

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
   * Load TensorFlow.js from CDN
   */
  function loadTensorFlowJS() {
    return new Promise((resolve, reject) => {
      if (typeof tf !== 'undefined') {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.11.0/dist/tf.min.js';
      script.onload = () => {
        console.log('[AI Engine] TensorFlow.js loaded from CDN');
        resolve();
      };
      script.onerror = () => {
        console.error('[AI Engine] Failed to load TensorFlow.js');
        reject(new Error('Failed to load TensorFlow.js'));
      };
      document.head.appendChild(script);
    });
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

      // Make prediction
      const inputTensor = tf.tensor2d([features]);
      const prediction = model.predict(inputTensor);
      const probabilities = await prediction.data();
      
      // Clean up tensors
      inputTensor.dispose();
      prediction.dispose();

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
      const xs = tf.tensor2d(trainingData.map(d => d.features));
      const ys = tf.tensor2d(trainingData.map(d => d.label));

      // Train the model
      await model.fit(xs, ys, {
        epochs: 10,
        batchSize: 16,
        shuffle: true,
        validationSplit: 0.2,
        verbose: 0
      });

      // Clean up tensors
      xs.dispose();
      ys.dispose();

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

console.log('[Pocket Scout v7] AI Engine loaded - TensorFlow.js Neural Network');
