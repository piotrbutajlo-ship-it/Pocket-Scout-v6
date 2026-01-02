/**
 * Pocket Scout v6.0 - Multi-Candle Historical Analysis System
 * 
 * NEW IN v6.0:
 * 1. Historical multi-candle analysis (50-600 candles)
 * 2. 15 active indicators with regime-based weighting
 * 3. Multi-candle pattern recognition (20-100 candles lookback)
 * 4. Support/Resistance detection from 50+ candles
 * 5. Trend detection over 30-minute windows
 * 6. Pattern detection: double top/bottom, head & shoulders, triangles
 * 7. No fallback mode - minimum 35% confidence threshold
 * 8. Historical learning system - adjusts weights every 30 signals
 * 9. Per-indicator performance tracking
 * 10. Enhanced UI with pattern analysis
 * 
 * PRESERVED FROM v5.0:
 * - Auto Trader signal compatibility
 * - Configurable signal intervals (1-10 minutes)
 * - Regime detection (TRENDING/RANGING/VOLATILE)
 * - Win rate tracking and learning
 * 
 * Target WR: 55-60% (profitable with proper money management)
 * by Claude Opus
 */

(function() {
  'use strict';

  const VERSION = '6.0.0';
  const FEED_KEY = 'PS_AT_FEED';
  const WARMUP_MINUTES = 50; // Need 50 M1 candles minimum
  const WARMUP_CANDLES = WARMUP_MINUTES;

  // State
  const circularBuffer = window.CircularBuffer.getInstance();
  let ohlcM1 = [];
  let lastPrice = null;
  let warmupComplete = false;
  let lastSignal = null;
  let signalHistory = [];
  const MAX_HISTORY = 100; // Track more history for learning
  
  // Win Rate tracking
  let totalSignals = 0;
  let winningSignals = 0;
  let losingSignals = 0;
  
  // Configurable signal interval (minutes)
  let signalIntervalMinutes = 3; // Default 3 minutes (optimized for M3 trading)
  
  // Advanced Learning System with ALL 15 INDICATORS
  // v6.0: Complete indicator suite with per-indicator performance tracking
  let learningData = {
    indicatorWeights: { 
      rsi: 4.0,           // RSI (14)
      williamsR: 3.5,     // Williams %R (14)
      cci: 3.0,           // CCI (20)
      ao: 2.5,            // Awesome Oscillator
      bb: 2.0,            // Bollinger Bands (20,2)
      stoch: 2.0,         // Stochastic (14,3,3)
      macd: 1.5,          // MACD (12,26,9)
      osma: 1.5,          // OsMA
      momentum: 1.5,      // Momentum (10)
      psar: 2.0,          // Parabolic SAR (0.02, 0.2)
      stc: 1.8,           // Schaff Trend Cycle
      vortex: 1.8,        // Vortex Indicator
      aroon: 1.8,         // Aroon (25)
      bears: 1.5,         // Bears Power (13)
      bulls: 1.5,         // Bulls Power (13)
      demarker: 1.5       // DeMarker (14)
    },
    // Per-indicator performance tracking for learning
    indicatorPerformance: {
      rsi: { wins: 0, losses: 0, wr: 0 },
      williamsR: { wins: 0, losses: 0, wr: 0 },
      cci: { wins: 0, losses: 0, wr: 0 },
      ao: { wins: 0, losses: 0, wr: 0 },
      bb: { wins: 0, losses: 0, wr: 0 },
      stoch: { wins: 0, losses: 0, wr: 0 },
      macd: { wins: 0, losses: 0, wr: 0 },
      osma: { wins: 0, losses: 0, wr: 0 },
      momentum: { wins: 0, losses: 0, wr: 0 },
      psar: { wins: 0, losses: 0, wr: 0 },
      stc: { wins: 0, losses: 0, wr: 0 },
      vortex: { wins: 0, losses: 0, wr: 0 },
      aroon: { wins: 0, losses: 0, wr: 0 },
      bears: { wins: 0, losses: 0, wr: 0 },
      bulls: { wins: 0, losses: 0, wr: 0 },
      demarker: { wins: 0, losses: 0, wr: 0 }
    },
    successfulPatterns: [],
    failedPatterns: [],
    bestConfidenceRange: {}
  };
  
  // REMOVED: Multi-Timeframe buffers (MTF had 100% conflicts on M3)
  let currentMarketRegime = 'TRENDING';

  // UI Elements
  let UI = {};
  
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
      
      const savedLearning = localStorage.getItem('PS_LEARNING_DATA');
      if (savedLearning) {
        learningData = JSON.parse(savedLearning);
      }
    } catch (e) {
      console.warn('[Pocket Scout v6.0] Error loading settings:', e);
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
      localStorage.setItem('PS_LEARNING_DATA', JSON.stringify(learningData));
    } catch (e) {
      console.warn('[Pocket Scout v6.0] Error saving settings:', e);
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
        console.log(`[Pocket Scout v6.0] ✅ Warmup complete! ${ohlcM1.length} candles`);
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
    
    // REMOVED: buildMultiTimeframeCandles() - MTF had 100% conflicts on M3 interval
  }
  
  // REMOVED: buildMultiTimeframeCandles() function - MTF analysis not effective on M3
  
  // Detect market regime: TRENDING, RANGING, or VOLATILE
  function detectMarketRegime(closes, highs, lows) {
    const TI = window.TechnicalIndicators;
    const adx = TI.calculateADX(highs, lows, closes, 14);
    const atr = TI.calculateATR(highs, lows, closes, 14);
    
    if (!adx || !atr) return 'TRENDING';
    
    const volatility = atr / closes[closes.length - 1];
    
    // Determine regime
    if (volatility > 0.02) {
      return 'VOLATILE'; // High volatility - chaotic market
    } else if (adx.adx > 25) {
      return 'TRENDING'; // Strong trend
    } else if (adx.adx < 20) {
      return 'RANGING'; // Consolidation/sideways
    }
    
    return 'TRENDING'; // Default
  }
  
  // Adjust indicator weights based on market regime (v6.0: All 15 indicators)
  function getRegimeAdjustedWeights(regime) {
    const baseWeights = { ...learningData.indicatorWeights };
    
    if (regime === 'TRENDING') {
      // Boost trend-following indicators
      baseWeights.macd *= 1.3;
      baseWeights.osma *= 1.3;
      baseWeights.ao *= 1.3;
      baseWeights.momentum *= 1.4;
      baseWeights.psar *= 1.4;
      baseWeights.stc *= 1.3;
      baseWeights.vortex *= 1.3;
      baseWeights.aroon *= 1.3;
      // Reduce mean-reversion
      baseWeights.rsi *= 0.8;
      baseWeights.williamsR *= 0.8;
      baseWeights.cci *= 0.8;
      baseWeights.stoch *= 0.8;
      baseWeights.bb *= 0.9;
      baseWeights.bears *= 0.9;
      baseWeights.bulls *= 0.9;
      baseWeights.demarker *= 0.8;
    } else if (regime === 'RANGING') {
      // Boost mean-reversion indicators
      baseWeights.rsi *= 1.5;
      baseWeights.williamsR *= 1.5;
      baseWeights.cci *= 1.4;
      baseWeights.stoch *= 1.3;
      baseWeights.bb *= 1.3;
      baseWeights.demarker *= 1.3;
      // Reduce trend-following
      baseWeights.ao *= 0.7;
      baseWeights.macd *= 0.6;
      baseWeights.osma *= 0.6;
      baseWeights.momentum *= 0.7;
      baseWeights.psar *= 0.7;
      baseWeights.stc *= 0.7;
      baseWeights.vortex *= 0.7;
      baseWeights.aroon *= 0.7;
      baseWeights.bears *= 0.8;
      baseWeights.bulls *= 0.8;
    } else if (regime === 'VOLATILE') {
      // Be more conservative in volatile markets
      baseWeights.rsi *= 0.9;
      baseWeights.williamsR *= 0.9;
      baseWeights.cci *= 0.9;
      baseWeights.macd *= 0.8;
      baseWeights.osma *= 0.8;
      baseWeights.bb *= 1.2; // BB works well in volatile
      baseWeights.stoch *= 0.9;
      baseWeights.ao *= 0.9;
      baseWeights.momentum *= 0.8;
      baseWeights.psar *= 0.9;
      baseWeights.stc *= 0.9;
      baseWeights.vortex *= 0.9;
      baseWeights.aroon *= 0.9;
      baseWeights.bears *= 0.9;
      baseWeights.bulls *= 0.9;
      baseWeights.demarker *= 0.9;
    }
    
    return baseWeights;
  }
  
  // REMOVED: checkTimeframeAlignment() - MTF not used in v4.0
  // REMOVED: analyzeSingleTimeframe() - MTF not used in v4.0

  // Calculate confidence based on ALL 15 indicators + Multi-Candle Analysis (v6.0)
  function analyzeIndicators() {
    if (!warmupComplete || ohlcM1.length < WARMUP_CANDLES) {
      return null;
    }

    const TI = window.TechnicalIndicators;
    const closes = ohlcM1.map(c => c.c);
    const highs = ohlcM1.map(c => c.h);
    const lows = ohlcM1.map(c => c.l);
    
    // 1. DETECT MARKET REGIME
    currentMarketRegime = detectMarketRegime(closes, highs, lows);
    console.log(`[Pocket Scout v6.0] 🌊 Market Regime: ${currentMarketRegime}`);

    // 2. GET REGIME-ADJUSTED WEIGHTS (all 15 indicators)
    const weights = getRegimeAdjustedWeights(currentMarketRegime);

    // 3. CALCULATE ALL 15 INDICATORS
    const rsi = TI.calculateRSI(closes, 14);
    const macd = TI.calculateMACD(closes, 12, 26, 9);
    const bb = TI.calculateBollingerBands(closes, 20, 2);
    const adx = TI.calculateADX(highs, lows, closes, 14);
    const atr = TI.calculateATR(highs, lows, closes, 14);
    const stoch = TI.calculateStochastic(highs, lows, closes, 14, 3);
    const williamsR = TI.calculateWilliamsR(highs, lows, closes, 14);
    const cci = TI.calculateCCI(highs, lows, closes, 20);
    const ao = TI.calculateAwesomeOscillator(highs, lows);
    const osma = TI.calculateOsMA(closes, 12, 26, 9);
    const momentum = TI.calculateMomentum(closes, 10);
    const psar = TI.calculateParabolicSAR(highs, lows, closes, 0.02, 0.2);
    const stc = TI.calculateSchaffTrendCycle(closes, 23, 50, 10);
    const vortex = TI.calculateVortexIndicator(highs, lows, closes, 14);
    const aroon = TI.calculateAroon(highs, lows, 25);
    const bears = TI.calculateBearsPower(highs, lows, closes, 13);
    const bulls = TI.calculateBullsPower(highs, lows, closes, 13);
    const demarker = TI.calculateDeMarker(highs, lows, closes, 14);

    // v6.0: NO FALLBACK MODE - require real data
    if (!rsi || !macd || !bb || !adx || !atr) {
      console.log('[Pocket Scout v6.0] ⚠️ Insufficient indicator data - skipping signal');
      return null;
    }

    const currentPrice = closes[closes.length - 1];
    
    // 4. HISTORICAL MULTI-CANDLE ANALYSIS
    const supportResistance = TI.detectSupportResistance(ohlcM1, Math.min(100, ohlcM1.length));
    const trend = TI.detectTrend(ohlcM1, Math.min(30, ohlcM1.length));
    const multiPatterns = TI.detectMultiCandlePatterns(ohlcM1, Math.min(100, ohlcM1.length));
    
    console.log(`[Pocket Scout v6.0] 📊 Trend: ${trend}, Patterns: ${multiPatterns.patterns.length}`);
    
    // Enhanced vote system with ALL 15 INDICATORS + REGIME-ADJUSTED weights
    let buyVotes = 0;
    let sellVotes = 0;
    let totalWeight = 0;
    const reasons = [];
    const indicatorSignals = {}; // Track which indicators contributed

    // RSI vote - Use regime-adjusted weight with ENHANCED THRESHOLDS
    const rsiWeight = weights.rsi;
    totalWeight += rsiWeight;
    let rsiBoost = 0; // Extra boost for extreme RSI values (RSI is only working indicator - 54.9% WR)
    
    if (rsi < 30) {
      const strength = (30 - rsi) / 30; // 0-1 range
      buyVotes += rsiWeight * strength;
      rsiBoost = 20; // Strong oversold boost
      reasons.push(`RSI oversold (${rsi.toFixed(1)}) +20%`);
    } else if (rsi < 40) {
      const strength = (40 - rsi) / 40; // 0-1 range
      buyVotes += rsiWeight * strength;
      reasons.push(`RSI oversold (${rsi.toFixed(1)})`);
    } else if (rsi > 70) {
      const strength = (rsi - 70) / 30; // 0-1 range
      sellVotes += rsiWeight * strength;
      rsiBoost = 20; // Strong overbought boost
      reasons.push(`RSI overbought (${rsi.toFixed(1)}) +20%`);
    } else if (rsi > 60) {
      const strength = (rsi - 60) / 40; // 0-1 range
      sellVotes += rsiWeight * strength;
      reasons.push(`RSI overbought (${rsi.toFixed(1)})`);
    } else if (rsi > 40 && rsi < 60) {
      // Neutral zone - reduce confidence
      const neutralPenalty = -10;
      reasons.push(`RSI neutral (${rsi.toFixed(1)}) -10%`);
      rsiBoost = neutralPenalty;
    }

    // MACD vote - Use regime-adjusted weight
    const macdWeight = weights.macd;
    totalWeight += macdWeight;
    const macdStrength = Math.min(1, Math.abs(macd.histogram) * 1000);
    if (macd.histogram > 0 && macd.macd > macd.signal) {
      buyVotes += macdWeight * macdStrength;
      reasons.push(`MACD bullish (${macd.histogram.toFixed(5)})`);
    } else if (macd.histogram < 0 && macd.macd < macd.signal) {
      sellVotes += macdWeight * macdStrength;
      reasons.push(`MACD bearish (${macd.histogram.toFixed(5)})`);
    }

    // EMA Crossover vote - Use regime-adjusted weight
    const emaWeight = weights.ema;
    totalWeight += emaWeight;
    const emaDiff = Math.abs(ema9 - ema21) / ema21;
    const emaStrength = Math.min(1, emaDiff * 100);
    if (ema9 > ema21 && currentPrice > ema9) {
      buyVotes += emaWeight * emaStrength;
      reasons.push('EMA9 > EMA21 (bullish)');
    } else if (ema9 < ema21 && currentPrice < ema9) {
      sellVotes += emaWeight * emaStrength;
      reasons.push('EMA9 < EMA21 (bearish)');
    }

    // Bollinger Bands vote - Use regime-adjusted weight
    const bbWeight = weights.bb;
    totalWeight += bbWeight;
    const bbRange = bb.upper - bb.lower;
    const bbPosition = (currentPrice - bb.lower) / bbRange; // 0-1 where price is in BB
    if (bbPosition < 0.2) {
      buyVotes += bbWeight * (0.2 - bbPosition) * 5; // Scale to 0-1
      reasons.push('Price at lower BB');
    } else if (bbPosition > 0.8) {
      sellVotes += bbWeight * (bbPosition - 0.8) * 5; // Scale to 0-1
      reasons.push('Price at upper BB');
    }
    
    // Stochastic vote - Use regime-adjusted weight
    if (stoch) {
      const stochWeight = weights.stoch;
      totalWeight += stochWeight;
      if (stoch.k < 30 && stoch.d < 30) {
        const strength = (30 - stoch.k) / 30;
        buyVotes += stochWeight * strength;
        reasons.push(`Stochastic oversold (${stoch.k.toFixed(1)})`);
      } else if (stoch.k > 70 && stoch.d > 70) {
        const strength = (stoch.k - 70) / 30;
        sellVotes += stochWeight * strength;
        reasons.push(`Stochastic overbought (${stoch.k.toFixed(1)})`);
      }
    }
    
    // v4.0 NEW: Williams %R vote - Fast momentum indicator (excellent for RANGING)
    if (williamsR) {
      const williamsWeight = weights.williamsR;
      totalWeight += williamsWeight;
      if (williamsR < -80) {
        const strength = ((-80) - williamsR) / 20; // 0-1 range
        buyVotes += williamsWeight * strength;
        reasons.push(`Williams %R oversold (${williamsR.toFixed(1)})`);
        
        // v4.0 RANGING STRATEGY: Extreme bonus
        if (currentMarketRegime === 'RANGING' && williamsR < -85) {
          buyVotes += williamsWeight * 0.5; // Extra push in RANGING
          reasons.push('Williams extreme oversold in RANGING (+)');
        }
      } else if (williamsR > -20) {
        const strength = (williamsR - (-20)) / 20; // 0-1 range
        sellVotes += williamsWeight * strength;
        reasons.push(`Williams %R overbought (${williamsR.toFixed(1)})`);
        
        // v4.0 RANGING STRATEGY: Extreme bonus
        if (currentMarketRegime === 'RANGING' && williamsR > -15) {
          sellVotes += williamsWeight * 0.5; // Extra push in RANGING
          reasons.push('Williams extreme overbought in RANGING (-)');
        }
      }
    }
    
    // v4.0 NEW: CCI vote - Commodity Channel Index (proven 58-62% WR in RANGING)
    if (cci) {
      const cciWeight = weights.cci;
      totalWeight += cciWeight;
      if (cci < -100) {
        const strength = Math.min(1, ((-100) - cci) / 100); // 0-1 range
        buyVotes += cciWeight * strength;
        reasons.push(`CCI oversold (${cci.toFixed(1)})`);
        
        // v4.0 RANGING STRATEGY: Extreme bonus
        if (currentMarketRegime === 'RANGING' && cci < -150) {
          buyVotes += cciWeight * 0.8; // Strong push in RANGING
          reasons.push('CCI extreme oversold in RANGING (++)');
        }
      } else if (cci > 100) {
        const strength = Math.min(1, (cci - 100) / 100); // 0-1 range
        sellVotes += cciWeight * strength;
        reasons.push(`CCI overbought (${cci.toFixed(1)})`);
        
        // v4.0 RANGING STRATEGY: Extreme bonus
        if (currentMarketRegime === 'RANGING' && cci > 150) {
          sellVotes += cciWeight * 0.8; // Strong push in RANGING
          reasons.push('CCI extreme overbought in RANGING (--)');
        }
      }
    }
    
    // v4.0 NEW: Awesome Oscillator vote - Momentum reversal detector
    if (ao) {
      const aoWeight = weights.ao;
      totalWeight += aoWeight;
      const aoStrength = Math.min(1, Math.abs(ao) * 10000); // Scale to 0-1
      if (ao > 0) {
        buyVotes += aoWeight * aoStrength;
        reasons.push(`AO bullish (${ao.toFixed(5)})`);
        indicatorSignals.ao = 'BUY';
      } else if (ao < 0) {
        sellVotes += aoWeight * aoStrength;
        reasons.push(`AO bearish (${ao.toFixed(5)})`);
        indicatorSignals.ao = 'SELL';
      }
    }

    // v6.0 NEW: OsMA vote
    if (osma) {
      const osmaWeight = weights.osma;
      totalWeight += osmaWeight;
      const osmaStrength = Math.min(1, Math.abs(osma) * 1000);
      if (osma > 0) {
        buyVotes += osmaWeight * osmaStrength;
        reasons.push(`OsMA bullish (${osma.toFixed(5)})`);
        indicatorSignals.osma = 'BUY';
      } else if (osma < 0) {
        sellVotes += osmaWeight * osmaStrength;
        reasons.push(`OsMA bearish (${osma.toFixed(5)})`);
        indicatorSignals.osma = 'SELL';
      }
    }

    // v6.0 NEW: Momentum vote
    if (momentum !== null) {
      const momentumWeight = weights.momentum;
      totalWeight += momentumWeight;
      const momentumStrength = Math.min(1, Math.abs(momentum) * 1000);
      if (momentum > 0) {
        buyVotes += momentumWeight * momentumStrength;
        reasons.push(`Momentum bullish (${momentum.toFixed(5)})`);
        indicatorSignals.momentum = 'BUY';
      } else if (momentum < 0) {
        sellVotes += momentumWeight * momentumStrength;
        reasons.push(`Momentum bearish (${momentum.toFixed(5)})`);
        indicatorSignals.momentum = 'SELL';
      }
    }

    // v6.0 NEW: Parabolic SAR vote
    if (psar && psar.signal) {
      const psarWeight = weights.psar;
      totalWeight += psarWeight;
      if (psar.signal === 'BUY') {
        buyVotes += psarWeight;
        reasons.push(`PSAR bullish (${psar.sar.toFixed(5)})`);
        indicatorSignals.psar = 'BUY';
      } else if (psar.signal === 'SELL') {
        sellVotes += psarWeight;
        reasons.push(`PSAR bearish (${psar.sar.toFixed(5)})`);
        indicatorSignals.psar = 'SELL';
      }
    }

    // v6.0 NEW: Schaff Trend Cycle vote
    if (stc !== null) {
      const stcWeight = weights.stc;
      totalWeight += stcWeight;
      if (stc < 25) {
        const strength = (25 - stc) / 25;
        buyVotes += stcWeight * strength;
        reasons.push(`STC oversold (${stc.toFixed(1)})`);
        indicatorSignals.stc = 'BUY';
      } else if (stc > 75) {
        const strength = (stc - 75) / 25;
        sellVotes += stcWeight * strength;
        reasons.push(`STC overbought (${stc.toFixed(1)})`);
        indicatorSignals.stc = 'SELL';
      }
    }

    // v6.0 NEW: Vortex Indicator vote
    if (vortex && vortex.signal) {
      const vortexWeight = weights.vortex;
      totalWeight += vortexWeight;
      if (vortex.signal === 'BUY') {
        buyVotes += vortexWeight;
        reasons.push(`Vortex bullish (VI+: ${vortex.viPlus.toFixed(2)})`);
        indicatorSignals.vortex = 'BUY';
      } else if (vortex.signal === 'SELL') {
        sellVotes += vortexWeight;
        reasons.push(`Vortex bearish (VI-: ${vortex.viMinus.toFixed(2)})`);
        indicatorSignals.vortex = 'SELL';
      }
    }

    // v6.0 NEW: Aroon vote
    if (aroon) {
      const aroonWeight = weights.aroon;
      totalWeight += aroonWeight;
      if (aroon.oscillator > 20) {
        const strength = Math.min(1, aroon.oscillator / 100);
        buyVotes += aroonWeight * strength;
        reasons.push(`Aroon bullish (${aroon.oscillator.toFixed(1)})`);
        indicatorSignals.aroon = 'BUY';
      } else if (aroon.oscillator < -20) {
        const strength = Math.min(1, Math.abs(aroon.oscillator) / 100);
        sellVotes += aroonWeight * strength;
        reasons.push(`Aroon bearish (${aroon.oscillator.toFixed(1)})`);
        indicatorSignals.aroon = 'SELL';
      }
    }

    // v6.0 NEW: Bears/Bulls Power vote
    if (bears !== null && bulls !== null) {
      const bearsWeight = weights.bears;
      const bullsWeight = weights.bulls;
      totalWeight += bearsWeight + bullsWeight;
      
      if (bulls > 0 && bulls > Math.abs(bears)) {
        const strength = Math.min(1, Math.abs(bulls) * 1000);
        buyVotes += bullsWeight * strength;
        reasons.push(`Bulls Power (${bulls.toFixed(5)})`);
        indicatorSignals.bulls = 'BUY';
      } else if (bears < 0 && Math.abs(bears) > bulls) {
        const strength = Math.min(1, Math.abs(bears) * 1000);
        sellVotes += bearsWeight * strength;
        reasons.push(`Bears Power (${bears.toFixed(5)})`);
        indicatorSignals.bears = 'SELL';
      }
    }

    // v6.0 NEW: DeMarker vote
    if (demarker !== null) {
      const demarkerWeight = weights.demarker;
      totalWeight += demarkerWeight;
      if (demarker < 0.3) {
        const strength = (0.3 - demarker) / 0.3;
        buyVotes += demarkerWeight * strength;
        reasons.push(`DeMarker oversold (${demarker.toFixed(2)})`);
        indicatorSignals.demarker = 'BUY';
      } else if (demarker > 0.7) {
        const strength = (demarker - 0.7) / 0.3;
        sellVotes += demarkerWeight * strength;
        reasons.push(`DeMarker overbought (${demarker.toFixed(2)})`);
        indicatorSignals.demarker = 'SELL';
      }
    }

    // 5. ADD PATTERN ANALYSIS VOTES
    if (multiPatterns.patterns.length > 0) {
      const patternWeight = 2.0; // Moderate weight for patterns
      totalWeight += patternWeight;
      
      for (const pattern of multiPatterns.patterns) {
        if (pattern.bias === 'BULLISH') {
          buyVotes += patternWeight * pattern.confidence;
          reasons.push(`Pattern: ${pattern.name} (${(pattern.confidence * 100).toFixed(0)}%)`);
        } else if (pattern.bias === 'BEARISH') {
          sellVotes += patternWeight * pattern.confidence;
          reasons.push(`Pattern: ${pattern.name} (${(pattern.confidence * 100).toFixed(0)}%)`);
        }
      }
    }

    // 6. ADD SUPPORT/RESISTANCE ANALYSIS
    if (supportResistance.length > 0) {
      const srWeight = 1.5;
      totalWeight += srWeight;
      
      for (const level of supportResistance.slice(0, 2)) { // Top 2 levels
        const distance = Math.abs(currentPrice - level.price) / currentPrice;
        if (distance < 0.001) { // Within 0.1% of level
          if (level.type === 'SUPPORT' && currentPrice >= level.price) {
            buyVotes += srWeight * (level.touches / 5); // Normalize by max touches
            reasons.push(`Near support ${level.price.toFixed(5)} (${level.touches} touches)`);
          } else if (level.type === 'RESISTANCE' && currentPrice <= level.price) {
            sellVotes += srWeight * (level.touches / 5);
            reasons.push(`Near resistance ${level.price.toFixed(5)} (${level.touches} touches)`);
          }
        }
      }
    }

    // 7. ADD TREND ANALYSIS VOTE
    const trendWeight = 2.0;
    totalWeight += trendWeight;
    if (trend === 'UPTREND') {
      buyVotes += trendWeight * 0.8;
      reasons.push('30-min trend: UPTREND');
    } else if (trend === 'DOWNTREND') {
      sellVotes += trendWeight * 0.8;
      reasons.push('30-min trend: DOWNTREND');
    }

    // ADX strengthens signal (multiplier, not vote)
    let adxMultiplier = 1.0;
    if (adx.adx > 25) {
      adxMultiplier = 1.0 + ((adx.adx - 25) / 100); // 1.0 to 1.75 range
      reasons.push(`ADX strong trend (${adx.adx.toFixed(1)})`);
    }

    // 8. CALCULATE BASE CONFIDENCE based on vote strength
    const buyConfidence = (buyVotes / totalWeight) * 100 * adxMultiplier;
    const sellConfidence = (sellVotes / totalWeight) * 100 * adxMultiplier;
    
    // 9. APPLY REGIME CONFIDENCE BOOST
    let regimeBoost = 0;
    if (currentMarketRegime === 'TRENDING') {
      regimeBoost = 15;
      reasons.push('Regime: TRENDING (+15%)');
    } else if (currentMarketRegime === 'RANGING') {
      regimeBoost = 20;
      reasons.push('Regime: RANGING (+20%)');
    } else if (currentMarketRegime === 'VOLATILE') {
      regimeBoost = -10;
      reasons.push('Regime: VOLATILE (-10%)');
    }
    
    // 10. FINAL CONFIDENCE CALCULATION
    const finalBuyConfidence = Math.min(95, Math.round(buyConfidence + regimeBoost));
    const finalSellConfidence = Math.min(95, Math.round(sellConfidence + regimeBoost));
    
    let confidence = 0;
    let action = null;
    
    // v6.0: NO FALLBACK MODE - require minimum 35% confidence
    if (buyVotes > sellVotes && finalBuyConfidence >= 35) {
      action = 'BUY';
      confidence = finalBuyConfidence;
      console.log(`[Pocket Scout v6.0] 💰 Signal: BUY | Base: ${Math.round(buyConfidence)}% | Regime: ${regimeBoost > 0 ? '+' : ''}${regimeBoost}% | Final: ${confidence}%`);
    } else if (sellVotes > buyVotes && finalSellConfidence >= 35) {
      action = 'SELL';
      confidence = finalSellConfidence;
      console.log(`[Pocket Scout v6.0] 💰 Signal: SELL | Base: ${Math.round(sellConfidence)}% | Regime: ${regimeBoost > 0 ? '+' : ''}${regimeBoost}% | Final: ${confidence}%`);
    } else {
      // v6.0: SKIP SIGNAL if confidence < 35%
      console.log(`[Pocket Scout v6.0] ⚠️ Confidence too low (BUY: ${finalBuyConfidence}%, SELL: ${finalSellConfidence}%) - skipping signal`);
      return null;
    }
    
    // 11. CALCULATE DURATION based on ADX and volatility
    let duration = 3; // Base: 3 minutes
    
    const avgPrice = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volatilityRatio = atr / avgPrice;
    
    if (adx.adx > 30) {
      duration = 5; // Strong trend: 5 minutes
      reasons.push('Duration: 5min (strong trend)');
    } else if (volatilityRatio > 0.015) {
      duration = 2; // High volatility: 2 minutes
      reasons.push(`Duration: ${duration}min (high volatility)`);
    } else {
      reasons.push('Duration: 3min (normal)');
    }

    return {
      action,
      confidence,
      duration,
      reasons: reasons.slice(0, 10), // Top 10 reasons
      price: currentPrice,
      volatility: volatilityRatio,
      adxStrength: adx.adx,
      regime: currentMarketRegime,
      // All 15 indicators
      rsi,
      williamsR,
      cci,
      ao,
      osma,
      momentum,
      psar: psar ? psar.sar : null,
      stc,
      vortex: vortex ? vortex.viPlus : null,
      aroon: aroon ? aroon.oscillator : null,
      bears,
      bulls,
      demarker,
      macdHistogram: macd.histogram,
      // Pattern analysis
      patterns: multiPatterns.patterns,
      trend,
      supportResistance,
      indicatorSignals, // Which indicators contributed
      isFallback: false // v6.0: NO FALLBACK MODE
    };
  }

  // Generate signal (called by cyclic engine)
  function generateSignal() {
    if (!warmupComplete) {
      console.log(`[Pocket Scout v6.0] ⏸️ Warmup in progress: ${ohlcM1.length}/${WARMUP_CANDLES} candles`);
      return;
    }

    console.log(`[Pocket Scout v6.0] 🔄 Generating signal... (interval: ${signalIntervalMinutes} min)`);

    const analysis = analyzeIndicators();
    
    // v6.0: NO FALLBACK MODE - skip signal if confidence < 35%
    if (!analysis || !analysis.action) {
      console.log(`[Pocket Scout v6.0] ⏭️ Skipping signal - insufficient confidence or data`);
      return;
    }

    const signal = {
      action: analysis.action,
      confidence: analysis.confidence,
      duration: analysis.duration,
      expiry: analysis.duration * 60, // Convert to seconds
      reasons: analysis.reasons,
      price: lastPrice,
      timestamp: Date.now(),
      volatility: analysis.volatility,
      adxStrength: analysis.adxStrength,
      regime: analysis.regime,
      // All indicator values for learning
      rsi: analysis.rsi,
      williamsR: analysis.williamsR,
      cci: analysis.cci,
      ao: analysis.ao,
      osma: analysis.osma,
      momentum: analysis.momentum,
      psar: analysis.psar,
      stc: analysis.stc,
      vortex: analysis.vortex,
      aroon: analysis.aroon,
      bears: analysis.bears,
      bulls: analysis.bulls,
      demarker: analysis.demarker,
      macdHistogram: analysis.macdHistogram,
      patterns: analysis.patterns,
      trend: analysis.trend,
      indicatorSignals: analysis.indicatorSignals,
      wr: calculateWinRate(),
      isFallback: false,
      entryPrice: lastPrice,
      result: null // Will be set after duration expires
    };

    lastSignal = signal;
    totalSignals++;
    saveSettings();
    
    // Add to history
    signalHistory.unshift(signal);
    if (signalHistory.length > MAX_HISTORY) {
      signalHistory = signalHistory.slice(0, MAX_HISTORY);
    }

    console.log(`[Pocket Scout v6.0] ✅ Signal: ${signal.action} @ ${signal.confidence}% | WR: ${signal.wr.toFixed(1)}% | ${signal.duration}min | ${signal.price.toFixed(5)}`);
    console.log(`[Pocket Scout v6.0] 📝 Reasons: ${analysis.reasons.slice(0, 3).join(', ')}`);
    console.log(`[Pocket Scout v6.0] 📊 Indicators: ${Object.keys(signal.indicatorSignals).length} active`);
    
    // Schedule automatic result check after duration expires
    scheduleSignalResultCheck(signal);
    
    updateUI();
    
    // Publish to Auto Trader with exact required format
    publishToAutoTrader(signal);
    
    console.log(`[Pocket Scout v6.0] ⏰ Next signal in ${signalIntervalMinutes} minute(s)`);
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
    console.log(`[Pocket Scout v6.0] 📤 Published to Auto Trader:`, signalData);
  }
  
  // Schedule automatic result check after signal duration expires
  function scheduleSignalResultCheck(signal) {
    const durationMs = signal.duration * 60 * 1000; // Convert minutes to milliseconds
    
    setTimeout(() => {
      checkSignalResult(signal);
    }, durationMs);
    
    console.log(`[Pocket Scout v6.0] ⏰ Scheduled result check for ${signal.action} signal in ${signal.duration} minutes`);
  }
  
  // Check signal result after duration expires
  function checkSignalResult(signal) {
    if (!signal || signal.result !== null) {
      return; // Already checked or invalid signal
    }
    
    const currentPrice = lastPrice;
    const entryPrice = signal.entryPrice;
    
    if (!currentPrice || !entryPrice) {
      console.log(`[Pocket Scout v6.0] ⚠️ Cannot check signal result - missing price data`);
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
    
    // Record pattern for learning
    const pattern = {
      action: signal.action,
      confidence: signal.confidence,
      rsi: signal.rsi,
      macdHistogram: signal.macdHistogram,
      adxStrength: signal.adxStrength,
      volatility: signal.volatility,
      duration: signal.duration,
      isFallback: signal.isFallback,
      result: signal.result
    };
    
    if (isWin) {
      learningData.successfulPatterns.push(pattern);
    } else {
      learningData.failedPatterns.push(pattern);
    }
    
    // Track best confidence ranges
    const confidenceRange = Math.floor(signal.confidence / 10) * 10;
    if (!learningData.bestConfidenceRange[confidenceRange]) {
      learningData.bestConfidenceRange[confidenceRange] = { wins: 0, losses: 0 };
    }
    
    if (isWin) {
      learningData.bestConfidenceRange[confidenceRange].wins++;
    } else {
      learningData.bestConfidenceRange[confidenceRange].losses++;
    }
    
    saveSettings();
    
    const changeSymbol = signal.action === 'BUY' ? 
      (isWin ? '📈' : '📉') : 
      (isWin ? '📉' : '📈');
    
    console.log(`[Pocket Scout v6.0] ${isWin ? '✅' : '❌'} Signal verified | Action: ${signal.action} | Result: ${signal.result} | Entry: ${entryPrice.toFixed(5)} → Exit: ${currentPrice.toFixed(5)} ${changeSymbol} ${signal.priceChange >= 0 ? '+' : ''}${signal.priceChange.toFixed(2)}%`);
    console.log(`[Pocket Scout v6.0] 🎓 Learning: Pattern recorded | Successful: ${learningData.successfulPatterns.length} | Failed: ${learningData.failedPatterns.length}`);
    
    // Adjust indicator weights if we have enough data (every 30 signals as per optimization)
    if ((learningData.successfulPatterns.length + learningData.failedPatterns.length) % 30 === 0) {
      adjustIndicatorWeights();
    }
    
    updateUI();
  }
  
  // Schedule automatic result check after signal duration expires
  function scheduleSignalResultCheck(signal) {
    const durationMs = signal.duration * 60 * 1000; // Convert minutes to milliseconds
    
    setTimeout(() => {
      checkSignalResult(signal);
    }, durationMs);
    
    console.log(`[Pocket Scout v6.0] ⏰ Scheduled result check for ${signal.action} signal in ${signal.duration} minutes`);
  }
  
  // Check signal result after duration expires
  function checkSignalResult(signal) {
    if (!signal || signal.result !== null) {
      return; // Already checked or invalid signal
    }
    
    const currentPrice = lastPrice;
    const entryPrice = signal.entryPrice;
    
    if (!currentPrice || !entryPrice) {
      console.log(`[Pocket Scout v6.0] ⚠️ Cannot check signal result - missing price data`);
      return;
    }
    
    let isWin = false;
    
    if (signal.action === 'BUY') {
      // BUY wins if price went up
      isWin = currentPrice > entryPrice;
    } else if (signal.action === 'SELL') {
      // SELL wins if price went down
      isWin = currentPrice < entryPrice;
    }
    
    // Update signal result
    signal.result = isWin ? 'WIN' : 'LOSS';
    
    // Update statistics
    if (isWin) {
      winningSignals++;
    } else {
      losingSignals++;
    }
    
    // LEARNING: Analyze what made this signal win or lose
    learnFromSignalResult(signal, isWin);
    
    saveSettings();
    
    const priceChange = ((currentPrice - entryPrice) / entryPrice * 100).toFixed(3);
    const newWR = calculateWinRate();
    
    console.log(`[Pocket Scout v6.0] 🎯 Signal result: ${signal.result} | ${signal.action} @ ${entryPrice.toFixed(5)} → ${currentPrice.toFixed(5)} (${priceChange > 0 ? '+' : ''}${priceChange}%) | WR: ${newWR.toFixed(1)}%`);
    
    // Update UI to reflect new WR
    updateUI();
  }
  
  // LEARNING SYSTEM: Analyze signal patterns and adjust strategy (v6.0: Per-indicator tracking)
  function learnFromSignalResult(signal, isWin) {
    // Extract pattern data
    const pattern = {
      action: signal.action,
      confidence: signal.confidence,
      regime: signal.regime,
      adxStrength: signal.adxStrength,
      volatility: signal.volatility,
      duration: signal.duration,
      result: isWin ? 'WIN' : 'LOSS'
    };
    
    // Store pattern in appropriate list
    if (isWin) {
      learningData.successfulPatterns.push(pattern);
    } else {
      learningData.failedPatterns.push(pattern);
    }
    
    // v6.0: Track per-indicator performance
    if (signal.indicatorSignals) {
      for (const [indicator, signalDirection] of Object.entries(signal.indicatorSignals)) {
        if (!learningData.indicatorPerformance[indicator]) {
          learningData.indicatorPerformance[indicator] = { wins: 0, losses: 0, wr: 0 };
        }
        
        // Only track if indicator signal matched the action taken
        if (signalDirection === signal.action) {
          if (isWin) {
            learningData.indicatorPerformance[indicator].wins++;
          } else {
            learningData.indicatorPerformance[indicator].losses++;
          }
          
          // Update win rate
          const total = learningData.indicatorPerformance[indicator].wins + learningData.indicatorPerformance[indicator].losses;
          if (total > 0) {
            learningData.indicatorPerformance[indicator].wr = (learningData.indicatorPerformance[indicator].wins / total) * 100;
          }
        }
      }
    }
    
    // Track confidence range performance
    const confRange = Math.floor(pattern.confidence / 10) * 10;
    if (!learningData.bestConfidenceRange[confRange]) {
      learningData.bestConfidenceRange[confRange] = { wins: 0, losses: 0 };
    }
    if (isWin) {
      learningData.bestConfidenceRange[confRange].wins++;
    } else {
      learningData.bestConfidenceRange[confRange].losses++;
    }
    
    // v6.0: Adjust indicator weights every 30 signals
    if ((winningSignals + losingSignals) % 30 === 0 && winningSignals + losingSignals >= 30) {
      adjustIndicatorWeights();
    }
    
    console.log(`[Pocket Scout v6.0] 🎓 Learning: Pattern recorded | Successful: ${learningData.successfulPatterns.length} | Failed: ${learningData.failedPatterns.length}`);
  }
  
  // v6.0: Adjust indicator weights based on per-indicator learning
  function adjustIndicatorWeights() {
    console.log('[Pocket Scout v6.0] 🧠 Analyzing indicator performance and adjusting weights...');
    
    const successful = learningData.successfulPatterns;
    const failed = learningData.failedPatterns;
    
    if (successful.length < 10 || failed.length < 10) {
      console.log('[Pocket Scout v6.0] 🎓 Not enough data to adjust weights yet');
      return;
    }
    
    // v6.0: Adjust all 15 indicators based on their tracked performance
    const oldWeights = { ...learningData.indicatorWeights };
    const adjustments = [];
    
    for (const [indicator, perf] of Object.entries(learningData.indicatorPerformance)) {
      const total = perf.wins + perf.losses;
      if (total >= 5) { // Need at least 5 signals to adjust
        const wr = perf.wr;
        
        if (wr > 55) {
          // Increase weight if WR > 55%
          learningData.indicatorWeights[indicator] = Math.min(5.0, learningData.indicatorWeights[indicator] * 1.1);
          adjustments.push(`${indicator}: ${oldWeights[indicator].toFixed(2)} → ${learningData.indicatorWeights[indicator].toFixed(2)} (WR: ${wr.toFixed(1)}% ↑)`);
        } else if (wr < 45) {
          // Decrease weight if WR < 45%
          learningData.indicatorWeights[indicator] = Math.max(0.5, learningData.indicatorWeights[indicator] * 0.9);
          adjustments.push(`${indicator}: ${oldWeights[indicator].toFixed(2)} → ${learningData.indicatorWeights[indicator].toFixed(2)} (WR: ${wr.toFixed(1)}% ↓)`);
        }
      }
    }
    
    if (adjustments.length > 0) {
      console.log(`[Pocket Scout v6.0] 📊 Weight adjustments:`);
      adjustments.forEach(adj => console.log(`  ${adj}`));
    } else {
      console.log('[Pocket Scout v6.0] 📊 No weight adjustments needed (all indicators 45-55% WR)');
    }
    let bestRangeWR = 0;
    for (const [range, stats] of Object.entries(learningData.bestConfidenceRange)) {
      const total = stats.wins + stats.losses;
      if (total >= 5) {
        const wr = stats.wins / total;
        if (wr > bestRangeWR) {
          bestRangeWR = wr;
          bestRange = parseInt(range);
        }
      }
    }
    if (bestRange >= 0) {
      console.log(`[Pocket Scout v6.0] 📈 Best confidence range: ${bestRange}-${bestRange + 10}% (WR: ${(bestRangeWR * 100).toFixed(1)}%)`);
    }
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
  
  // Update analytics display (v6.0: Show all 15 indicators performance)
  function updateAnalyticsDisplay() {
    const analyticsContent = document.getElementById('ps-analytics-content');
    if (!analyticsContent) return;
    
    // v6.0: Get top performing indicators from per-indicator tracking
    let topIndicators = [];
    if (learningData.indicatorPerformance) {
      topIndicators = Object.entries(learningData.indicatorPerformance)
        .filter(([name, perf]) => (perf.wins + perf.losses) >= 3) // At least 3 signals
        .map(([name, perf]) => ({ 
          name: name.toUpperCase(), 
          wr: perf.wr,
          total: perf.wins + perf.losses
        }))
        .sort((a, b) => b.wr - a.wr)
        .slice(0, 5); // Top 5 indicators
    }
    
    // Show pattern detection stats
    let patternStats = '';
    if (lastSignal && lastSignal.patterns && lastSignal.patterns.length > 0) {
      patternStats = `
        <div style="margin-bottom:6px;">
          <div style="opacity:0.7; margin-bottom:3px;">Recent Patterns:</div>
          <div style="display:flex; gap:4px; flex-wrap:wrap;">
            ${lastSignal.patterns.map(p => 
              `<span style="background:${p.bias === 'BULLISH' ? '#10b981' : p.bias === 'BEARISH' ? '#ef4444' : '#64748b'}; color:#fff; padding:2px 6px; border-radius:3px; font-size:8px;">${p.name}</span>`
            ).join('')}
          </div>
        </div>
      `;
    }
    
    analyticsContent.innerHTML = `
      <div style="margin-bottom:8px;">
        <div>
          <div style="opacity:0.7; margin-bottom:2px;">Market Regime:</div>
          <div style="font-weight:700; color:#3b82f6;">${currentMarketRegime}</div>
        </div>
      </div>
      ${lastSignal && lastSignal.trend ? `
        <div style="margin-bottom:6px;">
          <div style="opacity:0.7; margin-bottom:2px;">30-min Trend:</div>
          <div style="font-weight:600; color:${lastSignal.trend === 'UPTREND' ? '#10b981' : lastSignal.trend === 'DOWNTREND' ? '#ef4444' : '#64748b'};">${lastSignal.trend}</div>
        </div>
      ` : ''}
      ${patternStats}
      ${topIndicators.length > 0 ? `
        <div style="margin-bottom:6px;">
          <div style="opacity:0.7; margin-bottom:3px;">Top Indicators (WR%):</div>
          <div style="display:flex; gap:4px; flex-wrap:wrap;">
            ${topIndicators.map(ind => 
              `<span style="background:#3b82f6; color:#fff; padding:2px 6px; border-radius:3px; font-size:8px;">${ind.name} ${ind.wr.toFixed(0)}% (${ind.total})</span>`
            ).join('')}
          </div>
        </div>
      ` : ''}
      <div style="margin-top:6px;">
        <div style="opacity:0.7; margin-bottom:2px;">Total Signals:</div>
        <div style="font-weight:700; color:#10b981;">${totalSignals}</div>
      </div>
    `;
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
          <div style="font-weight:700; font-size:18px; color:#60a5fa;">Pocket Scout v6.0</div>
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
        console.log(`[Pocket Scout v6.0] Signal interval updated to ${signalIntervalMinutes} minutes`);
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
      sendResponse({
        metrics: {
          winRate: calculateWinRate(),
          totalSignals: totalSignals,
          wins: winningSignals,
          losses: losingSignals,
          currentInterval: signalIntervalMinutes
        },
        lastSignal: lastSignal,
        signalHistory: signalHistory.slice(0, 10),
        candles: ohlcM1.length,
        warmupComplete: warmupComplete
      });
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
      console.log(`[Pocket Scout v6.0] Signal result: ${result} | WR: ${calculateWinRate().toFixed(1)}%`);
      sendResponse({ success: true });
      return true;
    }
    
    return false;
  });

  // Start processing
  function start() {
    console.log(`[Pocket Scout v6.0] Starting...`);
    
    // Load settings first
    loadSettings();
    
    // Wait for dependencies
    const requiredDeps = [
      'CircularBuffer',
      'TechnicalIndicators',
      'CyclicDecisionEngine'
    ];
    
    const checkDeps = setInterval(() => {
      const missing = requiredDeps.filter(d => !window[d]);
      
      if (missing.length === 0) {
        clearInterval(checkDeps);
        
        console.log(`[Pocket Scout v6.0] All dependencies loaded`);
        
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
        console.log(`[Pocket Scout v6.0] Waiting for: ${missing.join(', ')}`);
      }
    }, 200);
  }

  start();

})();

console.log('[Pocket Scout v6.0] Content script loaded - by Claude Opus');
