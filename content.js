/**
 * Pocket Scout v7.0 - AI-Powered Trading System
 * Revolutionary upgrade with TensorFlow.js, HMM, Q-Learning, and Market Microstructure
 * 
 * NEW IN v7.0:
 * 1. TensorFlow.js Neural Network for BUY/SELL prediction
 * 2. HMM 4-state regime detection (TRENDING/RANGING/VOLATILE/CHAOTIC)
 * 3. Q-Learning reinforcement for adaptive strategies
 * 4. Market microstructure analysis (tick frequency, volatility clustering, spread)
 * 5. Reduced to 5 core indicators (RSI, ADX, ATR, Williams %R, CCI)
 * 6. Enhanced chart pattern recognition
 * 7. Backtesting and Monte Carlo validation
 * 
 * Target WR: 65-80% through ML edge and adaptive learning
 */

(function() {
  'use strict';

  const VERSION = '7.0.0';
  const FEED_KEY = 'PS_AT_FEED';
  const WARMUP_MINUTES = 50; // Need 50 M1 candles for indicators
  const WARMUP_CANDLES = WARMUP_MINUTES;

  // State
  const circularBuffer = window.CircularBuffer.getInstance();
  let ohlcM1 = [];
  let lastPrice = null;
  let warmupComplete = false;
  let lastSignal = null;
  let signalHistory = [];
  const MAX_HISTORY = 500; // Track more history for AI training
  
  // Win Rate tracking
  let totalSignals = 0;
  let winningSignals = 0;
  let losingSignals = 0;
  
  // Configurable signal interval (minutes)
  let signalIntervalMinutes = 3; // Default 3 minutes
  
  // Market Microstructure tracking
  let tickHistory = [];
  const MAX_TICK_HISTORY = 100;
  let lastTickTime = 0;
  let tickFrequencyMA = 1; // Moving average of ticks per second
  
  // v7: AI/HMM/RL engines (will be initialized after warmup)
  let aiEngineReady = false;
  let hmmEngineReady = false;
  let rlEngineReady = false;
  let currentRegime = 'RANGING';
  
  // v7: REMOVED old learning system - replaced with AI
  // Old learningData replaced by AI training in ai-engine.js

  // UI Elements
  let UI = {};
  
  // v7: Check for v7 first run and reset old learning data
  function checkFirstRunV7() {
    const v7FirstRun = localStorage.getItem('PS_V7_FIRST_RUN');
    if (!v7FirstRun) {
      console.log('[Pocket Scout v7] 🆕 First run detected - resetting old learning data');
      
      // Clear old v5/v6 learning data
      localStorage.removeItem('PS_LEARNING_DATA');
      
      // Mark v7 as initialized
      localStorage.setItem('PS_V7_FIRST_RUN', 'true');
      
      console.log('[Pocket Scout v7] ✅ Fresh start initialized');
    }
  }
  
  // Load settings from localStorage
  function loadSettings() {
    try {
      const savedInterval = localStorage.getItem('PS_SIGNAL_INTERVAL');
      if (savedInterval) {
        signalIntervalMinutes = parseInt(savedInterval, 10);
        if (signalIntervalMinutes < 1) signalIntervalMinutes = 1;
        if (signalIntervalMinutes > 10) signalIntervalMinutes = 10;
      }
      
      const savedStats = localStorage.getItem('PS_STATS');
      if (savedStats) {
        const stats = JSON.parse(savedStats);
        totalSignals = stats.total || 0;
        winningSignals = stats.wins || 0;
        losingSignals = stats.losses || 0;
      }
      
      // v7: Load signal history for AI training
      const savedHistory = localStorage.getItem('PS_V7_SIGNAL_HISTORY');
      if (savedHistory) {
        signalHistory = JSON.parse(savedHistory);
        console.log(`[Pocket Scout v7] Loaded ${signalHistory.length} historical signals`);
      }
    } catch (e) {
      console.warn('[Pocket Scout v7] Error loading settings:', e);
    }
  }
  
  // Save settings to localStorage
  function saveSettings() {
    try {
      localStorage.setItem('PS_SIGNAL_INTERVAL', signalIntervalMinutes.toString());
      localStorage.setItem('PS_STATS', JSON.stringify({
        total: totalSignals,
        wins: winningSignals,
        losses: losingSignals
      }));
      
      // v7: Save signal history for AI training
      // Keep only recent signals to avoid storage overflow
      const recentHistory = signalHistory.slice(-MAX_HISTORY);
      localStorage.setItem('PS_V7_SIGNAL_HISTORY', JSON.stringify(recentHistory));
    } catch (e) {
      console.warn('[Pocket Scout v7] Error saving settings:', e);
    }
  }
  
  // Calculate Win Rate
  function calculateWinRate() {
    if (totalSignals === 0) return 0;
    return (winningSignals / totalSignals) * 100;
  }

  // Read price from DOM
  function readPriceFromDom() {
    const selectors = [
      '.current-rate-value',
      '.current-rate__value',
      '.chart-rate__value',
      '.rate-value',
      '[data-role="current-rate"]',
      '.assets-table__cell--rate',
      '.strike-rate__value',
      'span.open-time-number',
      '#price',
      '.current-price'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (element.offsetParent === null) continue;
        
        const text = element.textContent.trim().replace(/[^0-9.]/g, '');
        const price = parseFloat(text);
        
        if (!isNaN(price) && price > 0) {
          return price;
        }
      }
    }
    
    return null;
  }

  // Push tick and build M1 candles
  function pushTick(timestamp, price) {
    if (!price || isNaN(price)) return;
    
    lastPrice = price;
    
    // v7: Track tick frequency for microstructure analysis
    if (lastTickTime > 0) {
      const tickInterval = (timestamp - lastTickTime) / 1000; // seconds
      tickHistory.push({
        timestamp,
        price,
        interval: tickInterval
      });
      
      if (tickHistory.length > MAX_TICK_HISTORY) {
        tickHistory.shift();
      }
      
      // Update tick frequency moving average
      if (tickHistory.length >= 10) {
        const recentIntervals = tickHistory.slice(-10).map(t => t.interval);
        const avgInterval = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
        tickFrequencyMA = 1 / avgInterval; // ticks per second
      }
    }
    lastTickTime = timestamp;
    
    updateStatusDisplay();
    
    const candleTime = Math.floor(timestamp / 60000) * 60000;
    const lastCandle = circularBuffer.getLatest();
    
    if (!lastCandle || lastCandle.t < candleTime) {
      // New candle
      const newCandle = {
        t: candleTime,
        o: price,
        h: price,
        l: price,
        c: price
      };
      circularBuffer.add(newCandle);
      ohlcM1 = circularBuffer.getAll();
      
      // Check warmup
      if (!warmupComplete && ohlcM1.length >= WARMUP_CANDLES) {
        warmupComplete = true;
        console.log(`[Pocket Scout v7] ✅ Warmup complete! ${ohlcM1.length} candles`);
        
        // v7: Initialize AI engines after warmup
        initializeAIEngines();
        
        updateStatusDisplay();
        
        // Start cyclic engine after warmup
        if (window.CyclicDecisionEngine) {
          window.CyclicDecisionEngine.initialize(generateSignal, signalIntervalMinutes);
        }
      }
    } else {
      // Update last candle
      circularBuffer.updateLast({
        h: Math.max(lastCandle.h, price),
        l: Math.min(lastCandle.l, price),
        c: price
      });
      ohlcM1 = circularBuffer.getAll();
    }
    
    updateStatusDisplay();
  }
  
  // v7: Initialize AI, HMM, and RL engines
  async function initializeAIEngines() {
    console.log('[Pocket Scout v7] 🤖 Initializing AI engines...');
    
    try {
      // Initialize AI Engine (TensorFlow.js)
      if (window.AIEngine) {
        aiEngineReady = await window.AIEngine.initialize();
        if (aiEngineReady) {
          console.log('[Pocket Scout v7] ✅ AI Engine ready');
        }
      }
      
      // Initialize RL Engine (Q-Learning)
      if (window.RLEngine) {
        rlEngineReady = window.RLEngine.initialize();
        if (rlEngineReady) {
          console.log('[Pocket Scout v7] ✅ RL Engine ready');
        }
      }
      
      // HMM Engine is always ready (no async init)
      if (window.HMMEngine) {
        hmmEngineReady = true;
        console.log('[Pocket Scout v7] ✅ HMM Engine ready');
      }
      
      console.log('[Pocket Scout v7] 🚀 All AI engines initialized');
    } catch (error) {
      console.error('[Pocket Scout v7] ❌ Error initializing AI engines:', error);
    }
  }
  
  // v7: Calculate market microstructure features
  function calculateMicrostructure() {
    if (tickHistory.length < 20) {
      return {
        tickFrequency: 1,
        volatilityClustering: 0,
        spreadEstimate: 0.0001
      };
    }
    
    // Tick frequency (ticks per second)
    const tickFrequency = tickFrequencyMA;
    
    // Volatility clustering: Check if recent volatility is higher than average
    const recentPrices = tickHistory.slice(-20).map(t => t.price);
    const returns = [];
    for (let i = 1; i < recentPrices.length; i++) {
      returns.push(Math.abs((recentPrices[i] - recentPrices[i-1]) / recentPrices[i-1]));
    }
    
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const recentAvgReturn = returns.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const volatilityClustering = avgReturn > 0 ? recentAvgReturn / avgReturn : 1;
    
    // Spread estimate from price movements (bid-ask spread proxy)
    const priceChanges = [];
    for (let i = 1; i < recentPrices.length; i++) {
      priceChanges.push(Math.abs(recentPrices[i] - recentPrices[i-1]));
    }
    const spreadEstimate = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
    
    return {
      tickFrequency,
      volatilityClustering,
      spreadEstimate
    };
  }
  
  // v7: Simplified regime detection - removed old function, now using HMM
  
  // v7: NEW - AI-powered signal analysis with 5 core indicators
  async function analyzeIndicators() {
    if (!warmupComplete || ohlcM1.length < WARMUP_CANDLES) {
      return null;
    }

    const TI = window.TechnicalIndicators;
    const closes = ohlcM1.map(c => c.c);
    const highs = ohlcM1.map(c => c.h);
    const lows = ohlcM1.map(c => c.l);
    
    // v7: Calculate 5 CORE indicators only (reduced from 15)
    const rsi = TI.calculateRSI(closes, 14);
    const adx = TI.calculateADX(highs, lows, closes, 14);
    const atr = TI.calculateATR(highs, lows, closes, 14);
    const williamsR = TI.calculateWilliamsR(highs, lows, closes, 14);
    const cci = TI.calculateCCI(highs, lows, closes, 20);

    if (!rsi || !adx || !atr || !williamsR || !cci) {
      return null;
    }

    const currentPrice = closes[closes.length - 1];
    const avgPrice = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const atrRatio = atr / avgPrice;
    
    // v7: Get market microstructure features
    const microstructure = calculateMicrostructure();
    
    // v7: HMM Regime Detection (4 states)
    let regimeInfo = null;
    if (hmmEngineReady && window.HMMEngine) {
      regimeInfo = window.HMMEngine.detectRegime({
        adx: adx.adx,
        atr,
        avgPrice,
        tickFrequency: microstructure.tickFrequency,
        spreadEstimate: microstructure.spreadEstimate
      });
      currentRegime = regimeInfo.stateName;
      
      console.log(`[Pocket Scout v7] 🌊 Regime: ${currentRegime} (${regimeInfo.confidence.toFixed(1)}%)`);
    }
    
    // v7: AI Engine Prediction
    let aiPrediction = null;
    if (aiEngineReady && window.AIEngine) {
      aiPrediction = await window.AIEngine.predict({
        rsi,
        adx: adx.adx,
        atr: atrRatio,
        williamsR,
        cci
      });
    }
    
    // v7: Get regime strategy adjustments
    const regimeStrategy = window.HMMEngine ? 
      window.HMMEngine.getRegimeStrategy(currentRegime) : 
      { confidenceBoost: 0, description: 'Default' };
    
    // v7: Determine action - Priority: AI > RL > Fallback
    let action = null;
    let confidence = 50;
    const reasons = [];
    
    if (aiPrediction) {
      // Use AI prediction
      action = aiPrediction.action;
      confidence = aiPrediction.confidence;
      reasons.push(`AI Neural Network: ${action} (${confidence.toFixed(1)}%)`);
      
      // Apply RL adjustment if available
      if (rlEngineReady && window.RLEngine) {
        const rlAction = window.RLEngine.selectAction(currentRegime, action);
        const rlConfAdj = window.RLEngine.getConfidenceAdjustment(currentRegime, rlAction);
        
        if (rlAction !== action) {
          console.log(`[Pocket Scout v7] 🎲 RL override: ${action} → ${rlAction}`);
          action = rlAction;
          // Reset confidence to moderate level when RL overrides AI
          confidence = 60;
          reasons.push(`RL Q-Learning override: ${rlAction}`);
        }
        
        if (rlConfAdj !== 0) {
          confidence += rlConfAdj;
          reasons.push(`RL confidence: ${rlConfAdj > 0 ? '+' : ''}${rlConfAdj}%`);
        }
      }
    } else if (rlEngineReady && window.RLEngine) {
      // Fallback to RL if AI not ready
      action = window.RLEngine.selectAction(currentRegime, null);
      confidence = 55;
      reasons.push(`RL Q-Learning: ${action}`);
    } else {
      // Ultimate fallback: Use simple indicator logic
      if (rsi < 35 || williamsR < -80 || cci < -100) {
        action = 'BUY';
        confidence = 50;
        reasons.push('Fallback: Oversold indicators');
      } else if (rsi > 65 || williamsR > -20 || cci > 100) {
        action = 'SELL';
        confidence = 50;
        reasons.push('Fallback: Overbought indicators');
      } else {
        action = Math.random() < 0.5 ? 'BUY' : 'SELL';
        confidence = 45;
        reasons.push('Fallback: Neutral (random)');
      }
    }
    
    // Apply regime boost
    confidence += regimeStrategy.confidenceBoost;
    reasons.push(`Regime ${currentRegime}: ${regimeStrategy.confidenceBoost > 0 ? '+' : ''}${regimeStrategy.confidenceBoost}%`);
    
    // Apply microstructure adjustment
    if (microstructure.volatilityClustering > 1.5) {
      confidence -= 10;
      reasons.push('High volatility clustering: -10%');
    } else if (microstructure.volatilityClustering < 0.7) {
      confidence += 5;
      reasons.push('Low volatility clustering: +5%');
    }
    
    // v7: Pattern Recognition Analysis
    let patternBoost = 0;
    if (window.PatternRecognition) {
      const patternAnalysis = window.PatternRecognition.analyzeAllPatterns(ohlcM1);
      
      if (patternAnalysis.patterns.length > 0) {
        // Check if patterns align with our signal
        patternAnalysis.patterns.forEach(pattern => {
          if (pattern.direction === 'BULLISH' && action === 'BUY') {
            patternBoost += pattern.confidence * 10;
            reasons.push(`${pattern.type} (Bullish) +${(pattern.confidence * 10).toFixed(0)}%`);
          } else if (pattern.direction === 'BEARISH' && action === 'SELL') {
            patternBoost += pattern.confidence * 10;
            reasons.push(`${pattern.type} (Bearish) +${(pattern.confidence * 10).toFixed(0)}%`);
          } else if (pattern.direction === 'BULLISH' && action === 'SELL') {
            patternBoost -= pattern.confidence * 5;
            reasons.push(`Conflicting ${pattern.type} -${(pattern.confidence * 5).toFixed(0)}%`);
          } else if (pattern.direction === 'BEARISH' && action === 'BUY') {
            patternBoost -= pattern.confidence * 5;
            reasons.push(`Conflicting ${pattern.type} -${(pattern.confidence * 5).toFixed(0)}%`);
          }
        });
      }
      
      // Check support/resistance proximity
      const sr = patternAnalysis.supportResistance;
      if (sr.support.length > 0 || sr.resistance.length > 0) {
        const nearSupport = sr.support.find(s => 
          Math.abs(currentPrice - s.price) / currentPrice < 0.005
        );
        const nearResistance = sr.resistance.find(r => 
          Math.abs(currentPrice - r.price) / currentPrice < 0.005
        );
        
        if (nearSupport && action === 'BUY') {
          patternBoost += 5 * nearSupport.strength;
          reasons.push(`Near support +${(5 * nearSupport.strength).toFixed(0)}%`);
        } else if (nearResistance && action === 'SELL') {
          patternBoost += 5 * nearResistance.strength;
          reasons.push(`Near resistance +${(5 * nearResistance.strength).toFixed(0)}%`);
        }
      }
    }
    
    confidence += patternBoost;
    
    // Ensure confidence is in reasonable range
    confidence = Math.max(30, Math.min(95, Math.round(confidence)));
    
    // Calculate duration based on ADX and volatility
    let duration = 3; // Base: 3 minutes
    
    if (adx.adx > 30) {
      duration = 5; // Strong trend: 5 minutes
      reasons.push('Duration: 5min (strong trend)');
    } else if (atrRatio > 0.015) {
      duration = Math.floor(Math.random() * 2) + 1; // High volatility: 1-2 minutes
      reasons.push(`Duration: ${duration}min (high volatility)`);
    } else {
      reasons.push('Duration: 3min (normal)');
    }

    return {
      action,
      confidence,
      duration,
      reasons: reasons.slice(0, 10), // Increased to 10 for pattern info
      price: currentPrice,
      volatility: atrRatio,
      adxStrength: adx.adx,
      rsi,
      williamsR,
      cci,
      regime: currentRegime,
      regimeConfidence: regimeInfo ? regimeInfo.confidence : 50,
      microstructure,
      aiPrediction
    };
  }


  // v7: Generate signal (called by cyclic engine)
  async function generateSignal() {
    if (!warmupComplete) {
      console.log(`[Pocket Scout v7] ⏸️ Warmup in progress: ${ohlcM1.length}/${WARMUP_CANDLES} candles`);
      return;
    }

    console.log(`[Pocket Scout v7] 🔄 Generating signal... (interval: ${signalIntervalMinutes} min)`);

    const analysis = await analyzeIndicators();
    
    // v7: ALWAYS generate a signal using AI/HMM/RL engines
    let action, confidence, reasons, duration, volatility, adxStrength, rsi, williamsR, cci, regime;
    
    if (analysis && analysis.action && analysis.confidence >= 30) {
      // Use AI+HMM+RL analyzed signal (lowered threshold to 30% for v7)
      action = analysis.action;
      confidence = analysis.confidence;
      reasons = analysis.reasons;
      duration = analysis.duration;
      volatility = analysis.volatility;
      adxStrength = analysis.adxStrength;
      rsi = analysis.rsi;
      williamsR = analysis.williamsR;
      cci = analysis.cci;
      regime = analysis.regime;
      console.log(`[Pocket Scout v7] 🤖 AI/HMM/RL: ${action} @ ${confidence}% | Regime: ${regime}`);
    } else {
      // Fallback signal (should rarely happen with v7 AI)
      const closes = ohlcM1.map(c => c.c);
      const TI = window.TechnicalIndicators;
      
      const currentPrice = closes[closes.length - 1];
      const rsiValue = TI.calculateRSI(closes, 14) || 50;
      
      action = rsiValue < 50 ? 'BUY' : 'SELL';
      confidence = 45 + Math.floor(Math.random() * 10);
      
      reasons = [
        `Fallback: ${action} (RSI: ${rsiValue.toFixed(1)})`,
        'AI engines not ready yet',
        `Based on ${ohlcM1.length} M1 candles`
      ];
      
      duration = 3;
      volatility = 0.01;
      adxStrength = 20;
      rsi = rsiValue;
      williamsR = -50;
      cci = 0;
      regime = currentRegime || 'RANGING';
      
      console.log(`[Pocket Scout v7] ⚡ Fallback: ${action} @ ${confidence}%`);
    }

    const signal = {
      action: action,
      confidence: confidence,
      duration: duration,
      expiry: duration * 60,
      reasons: reasons,
      price: lastPrice,
      timestamp: Date.now(),
      volatility: volatility,
      adxStrength: adxStrength,
      rsi: rsi,
      williamsR: williamsR,
      cci: cci,
      regime: regime,
      wr: calculateWinRate(),
      isFallback: !analysis || !analysis.action || analysis.confidence < 30,
      entryPrice: lastPrice,
      result: null,
      // v7: Store indicators for AI training
      indicators: {
        rsi,
        adx: adxStrength,
        atr: volatility,
        williamsR,
        cci
      }
    };

    lastSignal = signal;
    totalSignals++;
    saveSettings();
    
    // Add to history
    signalHistory.unshift(signal);
    if (signalHistory.length > MAX_HISTORY) {
      signalHistory = signalHistory.slice(0, MAX_HISTORY);
    }

    console.log(`[Pocket Scout v7] ✅ ${signal.isFallback ? 'FALLBACK' : 'AI'} Signal: ${signal.action} @ ${signal.confidence}% | WR: ${signal.wr.toFixed(1)}% | ${signal.duration}min | ${signal.price.toFixed(5)}`);
    console.log(`[Pocket Scout v7] 📝 Reasons: ${reasons.slice(0, 3).join(', ')}`);
    
    // Schedule automatic result check after duration expires
    scheduleSignalResultCheck(signal);
    
    updateUI();
    
    // ALWAYS publish to Auto Trader - no threshold filtering
    // Auto Trader will decide based on its own threshold settings
    publishToAutoTrader(signal);
    
    console.log(`[Pocket Scout v7] ⏰ Next signal in ${signalIntervalMinutes} minute(s)`);
  }

  // Publish to Auto Trader
  function publishToAutoTrader(signal) {
    const signalData = {
      action: signal.action,
      confidence: signal.confidence,
      duration: signal.duration,
      timestamp: signal.timestamp,
      entryPrice: signal.price,
      wr: signal.wr, // Win Rate for Auto Trader
      expiry: signal.expiry,
      isFallback: signal.isFallback
    };

    // Wrap signal in bestSignal format for Auto Trader compatibility
    const feed = {
      bestSignal: signalData
    };

    localStorage.setItem(FEED_KEY, JSON.stringify(feed));
    console.log(`[Pocket Scout v7] 📤 Published to Auto Trader:`, signalData);
  }
  
  // Schedule automatic result check after signal duration expires
  function scheduleSignalResultCheck(signal) {
    const durationMs = signal.duration * 60 * 1000; // Convert minutes to milliseconds
    
    setTimeout(() => {
      checkSignalResult(signal);
    }, durationMs);
    
    console.log(`[Pocket Scout v7] ⏰ Scheduled result check for ${signal.action} signal in ${signal.duration} minutes`);
  }
  
  // v7: Check signal result after duration expires
  function checkSignalResult(signal) {
    if (!signal || signal.result !== null) {
      return; // Already checked or invalid signal
    }
    
    const currentPrice = lastPrice;
    const entryPrice = signal.entryPrice;
    
    if (!currentPrice || !entryPrice) {
      console.log(`[Pocket Scout v7] ⚠️ Cannot check signal result - missing price data`);
      return;
    }
    
    let isWin = false;
    
    if (signal.action === 'BUY') {
      // BUY wins if price went up
      isWin = currentPrice > entryPrice;
    } else {
      // SELL wins if price went down
      isWin = currentPrice < entryPrice;
    }
    
    signal.result = isWin ? 'WIN' : 'LOSS';
    signal.exitPrice = currentPrice;
    signal.priceChange = ((currentPrice - entryPrice) / entryPrice) * 100;
    
    // Update stats
    if (isWin) {
      winningSignals++;
    } else {
      losingSignals++;
    }
    
    // v7: Train AI Engine with result
    if (signal.indicators && aiEngineReady && window.AIEngine) {
      const reward = isWin ? 1 : -1;
      window.AIEngine.addTrainingSample(
        signal.indicators,
        signal.action,
        isWin
      );
      console.log(`[Pocket Scout v7] 🎓 AI Engine: Training sample added (${isWin ? 'WIN' : 'LOSS'})`);
    }
    
    // v7: Update RL Q-values
    if (signal.regime && rlEngineReady && window.RLEngine) {
      const reward = isWin ? 1 : -1;
      const nextRegime = currentRegime || signal.regime;
      window.RLEngine.updateQValue(
        signal.regime,
        signal.action,
        reward,
        nextRegime
      );
    }
    
    // v7: Update HMM transition matrix periodically
    if (hmmEngineReady && window.HMMEngine && totalSignals % 20 === 0) {
      window.HMMEngine.updateTransitionMatrix();
    }
    
    saveSettings();
    
    const changeSymbol = signal.action === 'BUY' ? 
      (isWin ? '📈' : '📉') : 
      (isWin ? '📉' : '📈');
    
    console.log(`[Pocket Scout v7] ${isWin ? '✅' : '❌'} Signal verified | Action: ${signal.action} | Result: ${signal.result} | Entry: ${entryPrice.toFixed(5)} → Exit: ${currentPrice.toFixed(5)} ${changeSymbol} ${signal.priceChange >= 0 ? '+' : ''}${signal.priceChange.toFixed(2)}%`);
    console.log(`[Pocket Scout v7] 📊 Stats: ${winningSignals}W / ${losingSignals}L | WR: ${calculateWinRate().toFixed(1)}%`);
    
    updateUI();
  }
  
  // Schedule automatic result check after signal duration expires
  function scheduleSignalResultCheck(signal) {
    const durationMs = signal.duration * 60 * 1000; // Convert minutes to milliseconds
    
    setTimeout(() => {
      checkSignalResult(signal);
    }, durationMs);
    
    console.log(`[Pocket Scout v7] ⏰ Scheduled result check for ${signal.action} signal in ${signal.duration} minutes`);
  }

  // Update status display
  function updateStatusDisplay() {
    if (!UI.status) return;
    
    const progress = Math.min(100, (ohlcM1.length / WARMUP_CANDLES) * 100);
    const warmupStatus = warmupComplete ? '✅ Complete' : '🔥 In Progress';
    const warmupColor = warmupComplete ? '#10b981' : '#f59e0b';
    
    UI.status.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="opacity:0.7;">Current Price:</span>
        <span style="font-weight:700; color:#fff; font-family:monospace; font-size:13px;">${lastPrice ? lastPrice.toFixed(5) : 'N/A'}</span>
      </div>
      <div style="padding-top:8px; border-top:1px solid #334155; margin-top:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="opacity:0.7; font-size:11px;">Warmup:</span>
          <span style="font-weight:600; color:${warmupColor}; font-size:11px;">${warmupStatus}</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="opacity:0.7; font-size:11px;">M1 Candles:</span>
          <span style="font-weight:700; color:#60a5fa; font-size:12px; font-family:monospace;">${ohlcM1.length}/${WARMUP_CANDLES}</span>
        </div>
        ${!warmupComplete ? `
          <div style="background:#1e293b; border-radius:6px; height:8px; overflow:hidden; margin-top:6px;">
            <div style="background:#3b82f6; height:100%; width:${progress}%; transition:width 0.3s;"></div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // Update UI with signal and countdown
  function updateUI() {
    if (!UI.panel) return;
    
    updateStatusDisplay();
    updateAnalyticsDisplay(); // Add analytics update

    if (!warmupComplete) {
      const progress = Math.min(100, (ohlcM1.length / WARMUP_CANDLES) * 100);
      if (UI.signalDisplay) {
        UI.signalDisplay.innerHTML = `
          <div style="padding:20px; text-align:center;">
            <div style="font-size:16px; margin-bottom:10px;">🔥 Warmup in Progress</div>
            <div style="font-size:14px; color:#60a5fa; margin-bottom:10px;">${ohlcM1.length}/${WARMUP_CANDLES} candles</div>
            <div style="background:#1e293b; border-radius:8px; height:20px; overflow:hidden;">
              <div style="background:#3b82f6; height:100%; width:${progress}%; transition:width 0.3s;"></div>
            </div>
            <div style="font-size:11px; opacity:0.7; margin-top:8px;">Collecting market data...</div>
          </div>
        `;
      }
      return;
    }

    // Display countdown to next signal
    if (UI.countdown && window.CyclicDecisionEngine) {
      const remaining = window.CyclicDecisionEngine.getRemainingTime();
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      
      UI.countdown.innerHTML = `
        <div style="text-align:center; padding:12px; background:#1e293b; border-radius:8px; margin-bottom:12px;">
          <div style="font-size:11px; opacity:0.7; margin-bottom:4px;">Next Signal In:</div>
          <div style="font-size:24px; font-weight:700; color:#3b82f6; font-family:monospace;">
            ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}
          </div>
        </div>
      `;
    }

    // Display current signal
    if (!lastSignal) {
      if (UI.signalDisplay) {
        UI.signalDisplay.innerHTML = `
          <div style="padding:20px; text-align:center; opacity:0.7;">
            <div style="font-size:14px;">⏳ Waiting for first signal...</div>
            <div style="font-size:11px; margin-top:6px;">Signal will be generated in 10 minutes</div>
          </div>
        `;
      }
      return;
    }

    const sig = lastSignal;
    const actionColor = sig.action === 'BUY' ? '#10b981' : '#ef4444';
    const bgColor = sig.action === 'BUY' ? '#064e3b' : '#7f1d1d';

    if (UI.signalDisplay) {
      const wrValue = sig.wr || 0;
      const wrColor = wrValue >= 60 ? '#10b981' : wrValue >= 50 ? '#f59e0b' : '#ef4444';
      const isFallback = sig.isFallback || false;
      
      // Badge logic
      const signalBadge = isFallback ? 
        '<span style="font-size:9px; background:#f59e0b; color:#000; padding:2px 6px; border-radius:3px; font-weight:600; margin-left:8px;">TREND</span>' : 
        '<span style="font-size:9px; background:#10b981; color:#fff; padding:2px 6px; border-radius:3px; font-weight:600; margin-left:8px;">AI</span>';
      
      // Regime badge
      const regimeColors = {
        'TRENDING': { bg: '#3b82f6', text: '#fff' },
        'RANGING': { bg: '#f59e0b', text: '#000' },
        'VOLATILE': { bg: '#ef4444', text: '#fff' }
      };
      const regimeColor = regimeColors[sig.regime || 'TRENDING'];
      const regimeBadge = `<span style="font-size:8px; background:${regimeColor.bg}; color:${regimeColor.text}; padding:2px 6px; border-radius:3px; font-weight:600; margin-left:4px;">${sig.regime || 'TREND'}</span>`;
      
      UI.signalDisplay.innerHTML = `
        <div style="background:${bgColor}; padding:14px; border-radius:10px; border:2px solid ${actionColor};">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="display:flex; align-items:center;">
              <div style="font-size:24px; font-weight:800; color:${actionColor};">${sig.action}</div>
              ${signalBadge}
              ${regimeBadge}
            </div>
            <div style="text-align:right;">
              <div style="font-size:20px; font-weight:700; color:#60a5fa;">${sig.duration} MIN</div>
              <div style="font-size:10px; opacity:0.7;">Entry Duration</div>
            </div>
          </div>
          
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:10px;">
            <div style="background:rgba(0,0,0,0.3); padding:8px; border-radius:6px;">
              <div style="font-size:9px; opacity:0.7; margin-bottom:3px;">Confidence</div>
              <div style="font-size:18px; font-weight:700; color:#3b82f6;">${sig.confidence}%</div>
            </div>
            <div style="background:rgba(0,0,0,0.3); padding:8px; border-radius:6px;">
              <div style="font-size:9px; opacity:0.7; margin-bottom:3px;">Win Rate</div>
              <div style="font-size:18px; font-weight:700; color:${wrColor};">${wrValue.toFixed(1)}%</div>
            </div>
            <div style="background:rgba(0,0,0,0.3); padding:8px; border-radius:6px;">
              <div style="font-size:9px; opacity:0.7; margin-bottom:3px;">Entry Price</div>
              <div style="font-size:13px; font-weight:600; color:#60a5fa; font-family:monospace;">${sig.price.toFixed(5)}</div>
            </div>
          </div>
          
          <div style="font-size:10px; opacity:0.8; margin-bottom:8px; padding:8px; background:rgba(0,0,0,0.2); border-radius:6px;">
            ${sig.reasons.map(r => `<div style="margin-bottom:3px;">✓ ${r}</div>`).join('')}
          </div>
          
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <div style="flex:1; height:8px; border-radius:6px; background:linear-gradient(90deg, #ef4444 0%, #f59e0b 40%, #22c55e 100%); position:relative; overflow:hidden;">
              <div style="position:absolute; top:0; bottom:0; left:0; width:${sig.confidence}%; background:rgba(15,23,42,0.4);"></div>
            </div>
          </div>
          
          <div style="font-size:10px; opacity:0.7; display:flex; justify-content:space-between;">
            <span>Vol: ${(sig.volatility * 100).toFixed(2)}%</span>
            <span>ADX: ${sig.adxStrength.toFixed(1)}</span>
            <span>Signals: ${totalSignals}</span>
          </div>
        </div>
      `;
    }

    // Display signal history
    if (UI.historyDisplay && signalHistory.length > 0) {
      UI.historyDisplay.innerHTML = `
        <div style="font-size:11px; font-weight:600; color:#60a5fa; margin-bottom:8px;">📊 HISTORY (Last ${Math.min(5, signalHistory.length)})</div>
        <div style="max-height:150px; overflow-y:auto;">
          ${signalHistory.slice(0, 5).map(s => {
            const time = new Date(s.timestamp).toLocaleTimeString();
            const color = s.action === 'BUY' ? '#10b981' : '#ef4444';
            const resultBadge = s.result ? 
              (s.result === 'WIN' ? 
                '<span style="background:#10b981; color:#fff; padding:1px 4px; border-radius:3px; font-size:8px; margin-left:4px;">WIN</span>' : 
                '<span style="background:#ef4444; color:#fff; padding:1px 4px; border-radius:3px; font-size:8px; margin-left:4px;">LOSS</span>') : 
              '<span style="background:#64748b; color:#fff; padding:1px 4px; border-radius:3px; font-size:8px; margin-left:4px;">PENDING</span>';
            return `
              <div style="padding:6px; background:#1e293b; border-radius:6px; margin-bottom:6px; font-size:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <span style="color:${color}; font-weight:700;">${s.action}</span>
                    ${resultBadge}
                  </div>
                  <span style="opacity:0.7;">${time}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:2px;">
                  <span style="color:#3b82f6;">Conf: ${s.confidence}%</span>
                  <span style="opacity:0.7;">${s.duration}min</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
  }
  
  // v7: Update analytics display
  function updateAnalyticsDisplay() {
    const analyticsContent = document.getElementById('ps-analytics-content');
    if (!analyticsContent) return;
    
    const wr = calculateWinRate();
    const wrColor = wr >= 65 ? '#10b981' : wr >= 55 ? '#f59e0b' : '#ef4444';
    
    // v7: Show AI/RL/HMM stats instead of old indicator weights
    let statsHtml = `
      <div style="margin-bottom:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="opacity:0.7;">Win Rate:</span>
          <div style="font-weight:700; color:${wrColor};">${wr.toFixed(1)}%</div>
        </div>
      </div>
      <div style="margin-bottom:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="opacity:0.7;">Signals:</span>
          <div style="font-weight:700; color:#60a5fa;">${totalSignals} (${winningSignals}W / ${losingSignals}L)</div>
        </div>
      </div>
    `;
    
    // Show AI Engine stats
    if (aiEngineReady && window.AIEngine) {
      const aiStats = window.AIEngine.getStats();
      statsHtml += `
        <div style="margin-bottom:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="opacity:0.7;">AI Training:</span>
            <div style="font-weight:700; color:#3b82f6;">${aiStats.trainingDataCount} samples</div>
          </div>
        </div>
      `;
    }
    
    // Show current regime
    if (currentRegime) {
      const regimeColor = currentRegime === 'RANGING' ? '#10b981' : 
                          currentRegime === 'TRENDING' ? '#3b82f6' : 
                          currentRegime === 'VOLATILE' ? '#f59e0b' : '#ef4444';
      statsHtml += `
        <div style="margin-bottom:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="opacity:0.7;">Regime:</span>
            <div style="font-weight:700; color:${regimeColor};">${currentRegime}</div>
          </div>
        </div>
      `;
    }
    
    // Show signal history
    if (signalHistory.length > 0) {
      statsHtml += `
        <div style="margin-top:8px; padding-top:8px; border-top:1px solid #334155;">
          <div style="opacity:0.7; margin-bottom:4px;">Last 5 Signals:</div>
      `;
      
      signalHistory.slice(0, 5).forEach(signal => {
        const resultIcon = signal.result === 'WIN' ? '✅' : 
                          signal.result === 'LOSS' ? '❌' : '⏳';
        const actionColor = signal.action === 'BUY' ? '#10b981' : '#ef4444';
        statsHtml += `
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:9px; margin-bottom:2px;">
            <span style="color:${actionColor};">${signal.action} ${signal.confidence}%</span>
            <span>${resultIcon}</span>
          </div>
        `;
      });
      
      statsHtml += `</div>`;
    }
    
    analyticsContent.innerHTML = statsHtml;
  }

  // Make panel draggable
  function makeDraggable(panel, header) {
    let isDragging = false;
    let currentX, currentY, initialX, initialY;
    
    const savedPos = localStorage.getItem('PS_PANEL_POS');
    if (savedPos) {
      try {
        const pos = JSON.parse(savedPos);
        panel.style.left = pos.x + 'px';
        panel.style.top = pos.y + 'px';
        panel.style.right = 'auto';
      } catch(e) {}
    }
    
    header.style.cursor = 'move';
    header.style.userSelect = 'none';
    
    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
    
    function dragStart(e) {
      initialX = e.clientX - (parseInt(panel.style.left) || panel.offsetLeft);
      initialY = e.clientY - (parseInt(panel.style.top) || panel.offsetTop);
      
      if (e.target === header || header.contains(e.target)) {
        isDragging = true;
        panel.style.right = 'auto';
      }
    }
    
    function drag(e) {
      if (!isDragging) return;
      
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      
      const maxX = window.innerWidth - panel.offsetWidth;
      const maxY = window.innerHeight - panel.offsetHeight;
      
      currentX = Math.max(0, Math.min(currentX, maxX));
      currentY = Math.max(0, Math.min(currentY, maxY));
      
      panel.style.left = currentX + 'px';
      panel.style.top = currentY + 'px';
    }
    
    function dragEnd() {
      if (isDragging) {
        isDragging = false;
        
        try {
          localStorage.setItem('PS_PANEL_POS', JSON.stringify({
            x: parseInt(panel.style.left),
            y: parseInt(panel.style.top)
          }));
        } catch(e) {}
      }
    }
  }

  // Inject panel
  function injectPanel() {
    const panel = document.createElement('div');
    panel.id = 'ps-v3-panel';
    
    panel.style.cssText = `
      position:fixed; top:60px; right:12px; z-index:999999;
      width:360px; background:#0f172a; border-radius:12px;
      box-shadow:0 8px 32px rgba(0,0,0,0.6);
      font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color:#e2e8f0; font-size:13px; padding:16px; border:1px solid #1e293b;
    `;

    panel.innerHTML = `
      <div id="ps-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:12px; border-bottom:2px solid #3b82f6;">
        <div>
          <div style="font-weight:700; font-size:18px; color:#60a5fa;">Pocket Scout v7</div>
          <div style="font-size:9px; opacity:0.6; margin-top:2px;">by Claude Opus</div>
        </div>
        <div style="font-size:10px; background:#ef4444; color:#fff; padding:2px 6px; border-radius:4px; font-weight:600;">LIVE</div>
      </div>
      
      <div id="ps-status" style="padding:10px; background:#1e293b; border-radius:8px; margin-bottom:12px; font-size:12px; border:1px solid #334155;"></div>
      
      <div style="padding:10px; background:#1e293b; border-radius:8px; margin-bottom:12px; border:1px solid #334155;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:11px; opacity:0.7;">Signal Interval:</span>
          <span id="ps-interval-value" style="font-size:12px; font-weight:700; color:#3b82f6;">${signalIntervalMinutes} min</span>
        </div>
        <input type="range" id="ps-interval-slider" min="1" max="10" value="${signalIntervalMinutes}" 
          style="width:100%; height:6px; border-radius:3px; background:#334155; outline:none; -webkit-appearance:none;">
        <style>
          #ps-interval-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #3b82f6;
            cursor: pointer;
          }
          #ps-interval-slider::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #3b82f6;
            cursor: pointer;
            border: none;
          }
        </style>
      </div>
      
      <div id="ps-analytics" style="padding:10px; background:#1e293b; border-radius:8px; margin-bottom:12px; border:1px solid #334155;">
        <div style="font-size:10px; font-weight:600; color:#60a5fa; margin-bottom:8px;">📊 ANALYTICS</div>
        <div id="ps-analytics-content" style="font-size:10px;"></div>
      </div>
      
      <div id="ps-countdown"></div>
      
      <div style="margin-bottom:12px;">
        <div style="font-size:11px; font-weight:600; color:#60a5fa; margin-bottom:8px;">🎯 CURRENT SIGNAL</div>
        <div id="ps-signal"></div>
      </div>
      
      <div id="ps-history"></div>
      
      <div style="font-size:9px; opacity:0.5; text-align:center; margin-top:12px; padding-top:12px; border-top:1px solid #334155;">
        AI-Powered Multi-Indicator Analysis | WR: <span id="ps-wr-footer">${calculateWinRate().toFixed(1)}%</span>
      </div>
    `;
    
    document.body.appendChild(panel);
    
    const header = document.getElementById('ps-header');
    makeDraggable(panel, header);
    
    UI.panel = panel;
    UI.status = document.getElementById('ps-status');
    UI.countdown = document.getElementById('ps-countdown');
    UI.signalDisplay = document.getElementById('ps-signal');
    UI.historyDisplay = document.getElementById('ps-history');
    UI.wrFooter = document.getElementById('ps-wr-footer');
    
    // Setup interval slider
    const intervalSlider = document.getElementById('ps-interval-slider');
    const intervalValue = document.getElementById('ps-interval-value');
    
    intervalSlider.addEventListener('input', (e) => {
      signalIntervalMinutes = parseInt(e.target.value, 10);
      intervalValue.textContent = `${signalIntervalMinutes} min`;
      saveSettings();
      
      // Restart cyclic engine with new interval
      if (window.CyclicDecisionEngine && warmupComplete) {
        window.CyclicDecisionEngine.stop();
        window.CyclicDecisionEngine.initialize(generateSignal, signalIntervalMinutes);
        console.log(`[Pocket Scout v7] Signal interval updated to ${signalIntervalMinutes} minutes`);
      }
    });
  }

  // Start countdown timer update
  function startCountdownTimer() {
    setInterval(() => {
      if (warmupComplete) {
        updateUI();
        // Update WR footer
        if (UI.wrFooter) {
          UI.wrFooter.textContent = `${calculateWinRate().toFixed(1)}%`;
        }
      }
    }, 1000); // Update every second
  }
  
  // Message handler for popup and result tracking
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_METRICS') {
      // v7: Include AI/HMM/RL stats
      const aiStats = aiEngineReady && window.AIEngine ? window.AIEngine.getStats() : null;
      const rlStats = rlEngineReady && window.RLEngine ? window.RLEngine.getStats() : null;
      
      sendResponse({
        metrics: {
          winRate: calculateWinRate(),
          totalSignals: totalSignals,
          wins: winningSignals,
          losses: losingSignals,
          currentInterval: signalIntervalMinutes,
          regime: currentRegime,
          aiStats: aiStats,
          rlStats: rlStats ? {
            totalUpdates: rlStats.totalUpdates,
            winRate: rlStats.performance.winRate
          } : null
        },
        lastSignal: lastSignal,
        signalHistory: signalHistory.slice(0, 10),
        candles: ohlcM1.length,
        warmupComplete: warmupComplete
      });
      return true;
    }
    
    if (message.type === 'RESET_HISTORY') {
      // v7: Reset all AI/RL learning data
      console.log('[Pocket Scout v7] 🔄 Resetting all learning data...');
      
      // Reset stats
      totalSignals = 0;
      winningSignals = 0;
      losingSignals = 0;
      signalHistory = [];
      
      // Reset AI engines
      if (aiEngineReady && window.AIEngine) {
        window.AIEngine.reset();
      }
      if (rlEngineReady && window.RLEngine) {
        window.RLEngine.reset();
      }
      if (hmmEngineReady && window.HMMEngine) {
        window.HMMEngine.reset();
      }
      
      // Clear localStorage
      localStorage.removeItem('PS_V7_SIGNAL_HISTORY');
      localStorage.removeItem('PS_V7_TRAINING_DATA');
      localStorage.removeItem('PS_V7_Q_TABLE');
      
      saveSettings();
      
      console.log('[Pocket Scout v7] ✅ All learning data reset');
      sendResponse({ success: true });
      return true;
    }
    
    if (message.type === 'SIGNAL_RESULT') {
      // Track signal outcome from Auto Trader or manual verification
      const { result } = message; // 'WIN' or 'LOSS'
      totalSignals++;
      if (result === 'WIN') {
        winningSignals++;
      } else if (result === 'LOSS') {
        losingSignals++;
      }
      saveSettings();
      console.log(`[Pocket Scout v7] Signal result: ${result} | WR: ${calculateWinRate().toFixed(1)}%`);
      sendResponse({ success: true });
      return true;
    }
    
    return false;
  });

  // Start processing
  function start() {
    console.log(`[Pocket Scout v7] 🚀 Starting AI-Powered Trading System...`);
    
    // v7: Check for first run and reset old learning data
    checkFirstRunV7();
    
    // Load settings first
    loadSettings();
    
    // Wait for dependencies (including v7 AI engines)
    const requiredDeps = [
      'CircularBuffer',
      'TechnicalIndicators',
      'PatternRecognition',
      'CyclicDecisionEngine',
      'AIEngine',
      'HMMEngine',
      'RLEngine',
      'BacktestingEngine'
    ];
    
    const checkDeps = setInterval(() => {
      const missing = requiredDeps.filter(d => !window[d]);
      
      if (missing.length === 0) {
        clearInterval(checkDeps);
        
        console.log(`[Pocket Scout v7] ✅ All dependencies loaded (including AI engines)`);
        
        // Inject panel
        injectPanel();
        
        // Start tick processing (collect price every second)
        setInterval(() => {
          const price = readPriceFromDom();
          if (price) {
            pushTick(Date.now(), price);
          }
        }, 1000);
        
        // Start countdown timer
        startCountdownTimer();
      } else {
        console.log(`[Pocket Scout v7] Waiting for: ${missing.join(', ')}`);
      }
    }, 200);
  }

  start();

})();

console.log('[Pocket Scout v7] Content script loaded - by Claude Opus');
