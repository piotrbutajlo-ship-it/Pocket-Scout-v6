/**
 * Pocket Scout Dynamic Time - Technical Indicators
 * Enhanced version with additional indicators for OTC trading
 */

window.TechnicalIndicators = (function() {
  'use strict';

  // Shared thresholds across modules (volatility, patterns, squeeze)
  const THRESHOLDS = window.PocketScoutThresholds = window.PocketScoutThresholds || {
    VOL_RISK_LOW: 0.002,
    VOL_RISK_ELEVATED: 0.012,
    VOL_RISK_EXTREME: 0.02,
    VOL_RISK_CAP: 0.025,
    BB_SQUEEZE_THRESHOLD: 0.02,
    PATTERN_SCORE_PER_MATCH: 0.25,
    PATTERN_WEIGHT: 0.6,
    BODY_WEIGHT: 0.4
  };
  const MIN_CANDLE_RANGE = 0.00001;

  function calculateSMA(data, period) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    return slice.reduce((sum, val) => sum + val, 0) / period;
  }

  function calculateEMA(data, period) {
    if (data.length < period) return null;
    
    const multiplier = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }

  function calculateRSI(closes, period = 14) {
    if (closes.length < period + 1) return null;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = closes.length - period; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  function calculateMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (closes.length < slowPeriod + signalPeriod) return null;
    
    const fastEMA = calculateEMA(closes, fastPeriod);
    const slowEMA = calculateEMA(closes, slowPeriod);
    
    if (!fastEMA || !slowEMA) return null;
    
    const macdLine = fastEMA - slowEMA;
    
    const macdHistory = [];
    for (let i = slowPeriod; i < closes.length; i++) {
      const f = calculateEMA(closes.slice(0, i + 1), fastPeriod);
      const s = calculateEMA(closes.slice(0, i + 1), slowPeriod);
      if (f && s) macdHistory.push(f - s);
    }
    
    if (macdHistory.length < signalPeriod) return null;
    
    const signalLine = calculateEMA(macdHistory, signalPeriod);
    if (!signalLine) return null;
    
    const histogram = macdLine - signalLine;
    
    return { macd: macdLine, signal: signalLine, histogram };
  }

  function calculateBollingerBands(closes, period = 20, stdDev = 2) {
    if (closes.length < period) return null;
    
    const slice = closes.slice(-period);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    
    const squaredDiffs = slice.map(val => Math.pow(val - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(variance);
    
    const currentPrice = closes[closes.length - 1];
    const bandwidth = 2 * std * stdDev;
    const percentB = bandwidth > 0.0001 ? (currentPrice - (sma - std * stdDev)) / bandwidth : 0.5;
    
    return {
      upper: sma + (std * stdDev),
      middle: sma,
      lower: sma - (std * stdDev),
      percentB
    };
  }

  function calculateATR(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) return null;
    
    const trs = [];
    for (let i = 1; i < highs.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trs.push(tr);
    }
    
    if (trs.length < period) return null;
    
    const atrSlice = trs.slice(-period);
    return atrSlice.reduce((a, b) => a + b, 0) / period;
  }

  function calculateStochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
    if (highs.length < kPeriod + dPeriod) return null;
    
    const kValues = [];
    for (let i = kPeriod - 1; i < highs.length; i++) {
      const periodHighs = highs.slice(i - kPeriod + 1, i + 1);
      const periodLows = lows.slice(i - kPeriod + 1, i + 1);
      const highestHigh = Math.max(...periodHighs);
      const lowestLow = Math.min(...periodLows);
      const currentClose = closes[i];
      
      if (highestHigh === lowestLow) {
        kValues.push(50);
      } else {
        const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
        kValues.push(k);
      }
    }
    
    if (kValues.length < dPeriod) return null;
    
    // Calculate %K (fast stochastic)
    const k = kValues[kValues.length - 1];
    
    // Calculate %D (slow stochastic = SMA of %K)
    const dSlice = kValues.slice(-dPeriod);
    const d = dSlice.reduce((a, b) => a + b, 0) / dPeriod;
    
    return { k, d, kValues };
  }

  function calculateADX(highs, lows, closes, period = 14) {
    if (highs.length < period * 2) return null;
    
    // Calculate True Range
    const trs = [];
    for (let i = 1; i < highs.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trs.push(tr);
    }
    
    // Calculate Directional Movement
    const plusDMs = [];
    const minusDMs = [];
    
    for (let i = 1; i < highs.length; i++) {
      const upMove = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];
      
      if (upMove > downMove && upMove > 0) {
        plusDMs.push(upMove);
        minusDMs.push(0);
      } else if (downMove > upMove && downMove > 0) {
        plusDMs.push(0);
        minusDMs.push(downMove);
      } else {
        plusDMs.push(0);
        minusDMs.push(0);
      }
    }
    
    if (trs.length < period || plusDMs.length < period || minusDMs.length < period) return null;
    
    // Smooth the values (Wilder's smoothing)
    let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let plusDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let minusDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < trs.length; i++) {
      atr = (atr * (period - 1) + trs[i]) / period;
      plusDM = (plusDM * (period - 1) + plusDMs[i]) / period;
      minusDM = (minusDM * (period - 1) + minusDMs[i]) / period;
    }
    
    // Calculate DI+ and DI-
    const plusDI = atr > 0 ? (plusDM / atr) * 100 : 0;
    const minusDI = atr > 0 ? (minusDM / atr) * 100 : 0;
    
    // Calculate DX
    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
    
    // ADX is smoothed DX (simplified - using current DX as approximation)
    // In full implementation, ADX would be smoothed over multiple periods
    const adx = dx;
    
    return { adx, plusDI, minusDI, dx };
  }

  function calculateCCI(highs, lows, closes, period = 20) {
    if (highs.length < period) return null;
    
    // Calculate Typical Price
    const typicalPrices = [];
    for (let i = 0; i < highs.length; i++) {
      typicalPrices.push((highs[i] + lows[i] + closes[i]) / 3);
    }
    
    if (typicalPrices.length < period) return null;
    
    // Calculate SMA of Typical Price
    const smaSlice = typicalPrices.slice(-period);
    const sma = smaSlice.reduce((a, b) => a + b, 0) / period;
    
    // Calculate Mean Deviation
    const meanDeviation = smaSlice.reduce((sum, tp) => sum + Math.abs(tp - sma), 0) / period;
    
    if (meanDeviation === 0) return 0;
    
    // Calculate CCI
    const currentTP = typicalPrices[typicalPrices.length - 1];
    const cci = (currentTP - sma) / (0.015 * meanDeviation);
    
    return cci;
  }

  function calculateWilliamsR(highs, lows, closes, period = 14) {
    if (highs.length < period) return null;
    
    const slice = highs.slice(-period);
    const highestHigh = Math.max(...slice);
    const lowestLow = Math.min(...lows.slice(-period));
    const currentClose = closes[closes.length - 1];
    
    if (highestHigh === lowestLow) return -50;
    
    const williamsR = ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
    
    return williamsR;
  }

  function calculateAwesomeOscillator(highs, lows) {
    // Awesome Oscillator = SMA(Median Price, 5) - SMA(Median Price, 34)
    // Median Price = (High + Low) / 2
    if (highs.length < 34 || lows.length < 34) return null;
    
    // Calculate median prices
    const medianPrices = [];
    for (let i = 0; i < highs.length; i++) {
      medianPrices.push((highs[i] + lows[i]) / 2);
    }
    
    const sma5 = calculateSMA(medianPrices, 5);
    const sma34 = calculateSMA(medianPrices, 34);
    
    if (!sma5 || !sma34) return null;
    
    return sma5 - sma34;
  }

  function calculateOsMA(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    // OsMA (MACD Oscillator) = MACD histogram
    const macd = calculateMACD(closes, fastPeriod, slowPeriod, signalPeriod);
    return macd ? macd.histogram : null;
  }

  function calculateMomentum(closes, period = 10) {
    // Momentum = Current Price - Price N periods ago
    if (closes.length < period + 1) return null;
    const current = closes[closes.length - 1];
    const past = closes[closes.length - 1 - period];
    return current - past;
  }

  function calculateParabolicSAR(highs, lows, closes, stepFactor = 0.02, maxStep = 0.2) {
    // Simplified Parabolic SAR implementation
    if (highs.length < 5) return null;
    
    let sar = lows[0];
    let isUptrend = true;
    let ep = highs[0]; // Extreme point
    let af = stepFactor; // Acceleration factor
    
    // Process each candle
    for (let i = 1; i < highs.length; i++) {
      // Update SAR
      sar = sar + af * (ep - sar);
      
      if (isUptrend) {
        // Uptrend logic
        if (lows[i] < sar) {
          // Trend reversal
          isUptrend = false;
          sar = ep;
          ep = lows[i];
          af = stepFactor;
        } else {
          // Continue uptrend
          if (highs[i] > ep) {
            ep = highs[i];
            af = Math.min(af + stepFactor, maxStep);
          }
        }
      } else {
        // Downtrend logic
        if (highs[i] > sar) {
          // Trend reversal
          isUptrend = true;
          sar = ep;
          ep = highs[i];
          af = stepFactor;
        } else {
          // Continue downtrend
          if (lows[i] < ep) {
            ep = lows[i];
            af = Math.min(af + stepFactor, maxStep);
          }
        }
      }
    }
    
    const currentPrice = closes[closes.length - 1];
    return {
      sar: sar,
      isUptrend: isUptrend,
      signal: isUptrend ? (currentPrice > sar ? 'BUY' : null) : (currentPrice < sar ? 'SELL' : null)
    };
  }

  function calculateSchaffTrendCycle(closes, fastPeriod = 23, slowPeriod = 50, cyclePeriod = 10) {
    // Simplified Schaff Trend Cycle
    if (closes.length < slowPeriod + cyclePeriod) return null;
    
    const macd = calculateMACD(closes, fastPeriod, slowPeriod, 1);
    if (!macd) return null;
    
    // Calculate stochastic of MACD
    const macdValues = [];
    for (let i = slowPeriod; i < closes.length; i++) {
      const m = calculateMACD(closes.slice(0, i + 1), fastPeriod, slowPeriod, 1);
      if (m) macdValues.push(m.macd);
    }
    
    if (macdValues.length < cyclePeriod) return null;
    
    const recentMacd = macdValues.slice(-cyclePeriod);
    const maxMacd = Math.max(...recentMacd);
    const minMacd = Math.min(...recentMacd);
    
    if (maxMacd === minMacd) return 50;
    
    const stc = ((macd.macd - minMacd) / (maxMacd - minMacd)) * 100;
    return stc;
  }

  function calculateVortexIndicator(highs, lows, closes, period = 14) {
    // Vortex Indicator (VI+ and VI-)
    if (highs.length < period + 1) return null;
    
    let sumVMPlus = 0;
    let sumVMMinus = 0;
    let sumTR = 0;
    
    for (let i = closes.length - period; i < closes.length; i++) {
      if (i > 0) {
        // VM+ = |High[i] - Low[i-1]|
        const vmPlus = Math.abs(highs[i] - lows[i - 1]);
        // VM- = |Low[i] - High[i-1]|
        const vmMinus = Math.abs(lows[i] - highs[i - 1]);
        
        // True Range
        const tr = Math.max(
          highs[i] - lows[i],
          Math.abs(highs[i] - closes[i - 1]),
          Math.abs(lows[i] - closes[i - 1])
        );
        
        sumVMPlus += vmPlus;
        sumVMMinus += vmMinus;
        sumTR += tr;
      }
    }
    
    if (sumTR === 0) return null;
    
    const viPlus = sumVMPlus / sumTR;
    const viMinus = sumVMMinus / sumTR;
    
    return {
      viPlus: viPlus,
      viMinus: viMinus,
      signal: viPlus > viMinus ? 'BUY' : 'SELL'
    };
  }

  function calculateAroon(highs, lows, period = 25) {
    // Aroon Up and Aroon Down
    if (highs.length < period) return null;
    
    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);
    
    // Find periods since highest high and lowest low
    let periodsSinceHigh = 0;
    let periodsSinceLow = 0;
    let maxHigh = recentHighs[0];
    let minLow = recentLows[0];
    
    for (let i = 0; i < period; i++) {
      if (recentHighs[i] >= maxHigh) {
        maxHigh = recentHighs[i];
        periodsSinceHigh = period - i - 1;
      }
      if (recentLows[i] <= minLow) {
        minLow = recentLows[i];
        periodsSinceLow = period - i - 1;
      }
    }
    
    const aroonUp = ((period - periodsSinceHigh) / period) * 100;
    const aroonDown = ((period - periodsSinceLow) / period) * 100;
    
    return {
      aroonUp: aroonUp,
      aroonDown: aroonDown,
      oscillator: aroonUp - aroonDown
    };
  }

  function calculateBearsPower(highs, lows, closes, period = 13) {
    // Bears Power = Low - EMA
    if (closes.length < period) return null;
    const ema = calculateEMA(closes, period);
    if (!ema) return null;
    const low = lows[lows.length - 1];
    return low - ema;
  }

  function calculateBullsPower(highs, lows, closes, period = 13) {
    // Bulls Power = High - EMA
    if (closes.length < period) return null;
    const ema = calculateEMA(closes, period);
    if (!ema) return null;
    const high = highs[highs.length - 1];
    return high - ema;
  }

  function calculateDeMarker(highs, lows, closes, period = 14) {
    // DeMarker Indicator
    if (highs.length < period + 1) return null;
    
    let sumDeMax = 0;
    let sumDeMin = 0;
    
    for (let i = closes.length - period; i < closes.length; i++) {
      if (i > 0) {
        const deMax = highs[i] > highs[i - 1] ? highs[i] - highs[i - 1] : 0;
        const deMin = lows[i] < lows[i - 1] ? lows[i - 1] - lows[i] : 0;
        sumDeMax += deMax;
        sumDeMin += deMin;
      }
    }
    
    if (sumDeMax + sumDeMin === 0) return 0.5;
    
    const deMarker = sumDeMax / (sumDeMax + sumDeMin);
    return deMarker;
  }

  /**
   * Detect support and resistance levels from historical candles (50+ lookback)
   * Returns array of levels with strength scores
   */
  function detectSupportResistance(candles, lookback = 50) {
    if (!candles || candles.length < lookback) return [];
    
    const recent = candles.slice(-lookback);
    const levels = [];
    const tolerance = 0.0002; // 0.02% tolerance for level clustering
    
    // Find pivot highs and lows
    for (let i = 2; i < recent.length - 2; i++) {
      const candle = recent[i];
      const prev2 = recent[i - 2];
      const prev1 = recent[i - 1];
      const next1 = recent[i + 1];
      const next2 = recent[i + 2];
      
      // Resistance (pivot high)
      if (candle.h >= prev2.h && candle.h >= prev1.h && 
          candle.h >= next1.h && candle.h >= next2.h) {
        levels.push({ price: candle.h, type: 'RESISTANCE', touches: 1 });
      }
      
      // Support (pivot low)
      if (candle.l <= prev2.l && candle.l <= prev1.l && 
          candle.l <= next1.l && candle.l <= next2.l) {
        levels.push({ price: candle.l, type: 'SUPPORT', touches: 1 });
      }
    }
    
    // Cluster nearby levels
    const clusteredLevels = [];
    for (const level of levels) {
      let merged = false;
      for (const cluster of clusteredLevels) {
        if (Math.abs(level.price - cluster.price) / cluster.price < tolerance) {
          cluster.touches++;
          cluster.price = (cluster.price * (cluster.touches - 1) + level.price) / cluster.touches;
          merged = true;
          break;
        }
      }
      if (!merged) {
        clusteredLevels.push({ ...level });
      }
    }
    
    // Sort by strength (number of touches)
    return clusteredLevels.sort((a, b) => b.touches - a.touches).slice(0, 5);
  }

  /**
   * Detect trend direction over a window (uptrend/downtrend/sideways)
   */
  function detectTrend(candles, windowSize = 30) {
    if (!candles || candles.length < windowSize) return 'SIDEWAYS';
    
    const recent = candles.slice(-windowSize);
    const closes = recent.map(c => c.c);
    
    // Linear regression to find trend
    const n = closes.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += closes[i];
      sumXY += i * closes[i];
      sumX2 += i * i;
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgPrice = sumY / n;
    const slopePercent = (slope / avgPrice) * 100;
    
    if (slopePercent > 0.05) return 'UPTREND';
    if (slopePercent < -0.05) return 'DOWNTREND';
    return 'SIDEWAYS';
  }

  /**
   * Detect multi-candle patterns (double top/bottom, head & shoulders, triangles)
   */
  function detectMultiCandlePatterns(candles, lookback = 100) {
    if (!candles || candles.length < lookback) return { patterns: [], confidence: 0 };
    
    const recent = candles.slice(-lookback);
    const patterns = [];
    
    // Detect double top
    const peaks = [];
    for (let i = 2; i < recent.length - 2; i++) {
      if (recent[i].h > recent[i-1].h && recent[i].h > recent[i-2].h &&
          recent[i].h > recent[i+1].h && recent[i].h > recent[i+2].h) {
        peaks.push({ index: i, price: recent[i].h });
      }
    }
    
    if (peaks.length >= 2) {
      const lastTwo = peaks.slice(-2);
      const priceDiff = Math.abs(lastTwo[0].price - lastTwo[1].price) / lastTwo[0].price;
      if (priceDiff < 0.002) { // Within 0.2%
        patterns.push({ name: 'DOUBLE_TOP', bias: 'BEARISH', confidence: 0.7 });
      }
    }
    
    // Detect double bottom
    const valleys = [];
    for (let i = 2; i < recent.length - 2; i++) {
      if (recent[i].l < recent[i-1].l && recent[i].l < recent[i-2].l &&
          recent[i].l < recent[i+1].l && recent[i].l < recent[i+2].l) {
        valleys.push({ index: i, price: recent[i].l });
      }
    }
    
    if (valleys.length >= 2) {
      const lastTwo = valleys.slice(-2);
      const priceDiff = Math.abs(lastTwo[0].price - lastTwo[1].price) / lastTwo[0].price;
      if (priceDiff < 0.002) {
        patterns.push({ name: 'DOUBLE_BOTTOM', bias: 'BULLISH', confidence: 0.7 });
      }
    }
    
    // Detect head and shoulders (simplified)
    if (peaks.length >= 3) {
      const lastThree = peaks.slice(-3);
      const left = lastThree[0].price;
      const head = lastThree[1].price;
      const right = lastThree[2].price;
      
      if (head > left && head > right && Math.abs(left - right) / left < 0.002) {
        patterns.push({ name: 'HEAD_AND_SHOULDERS', bias: 'BEARISH', confidence: 0.8 });
      }
    }
    
    // Detect inverse head and shoulders
    if (valleys.length >= 3) {
      const lastThree = valleys.slice(-3);
      const left = lastThree[0].price;
      const head = lastThree[1].price;
      const right = lastThree[2].price;
      
      if (head < left && head < right && Math.abs(left - right) / left < 0.002) {
        patterns.push({ name: 'INVERSE_HEAD_AND_SHOULDERS', bias: 'BULLISH', confidence: 0.8 });
      }
    }
    
    // Detect triangles (simplified - check for converging highs and lows)
    const recentHighs = recent.slice(-20).map(c => c.h);
    const recentLows = recent.slice(-20).map(c => c.l);
    
    const highRange = Math.max(...recentHighs) - Math.min(...recentHighs);
    const lowRange = Math.max(...recentLows) - Math.min(...recentLows);
    const totalRange = Math.max(...recentHighs) - Math.min(...recentLows);
    
    if (totalRange > 0 && (highRange / totalRange < 0.3 || lowRange / totalRange < 0.3)) {
      patterns.push({ name: 'TRIANGLE', bias: 'NEUTRAL', confidence: 0.6 });
    }
    
    const avgConfidence = patterns.length > 0 
      ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length 
      : 0;
    
    return { patterns, confidence: avgConfidence };
  }

  /**
   * Lightweight candlestick pattern detector (last 2-3 candles)
   * Returns detected pattern names, directional bias, and a confidence score (0-1)
   */
  function detectCandlestickPatterns(candles) {
    if (!candles || candles.length < 2) {
      return { patterns: [], bias: null, score: 0 };
    }

    const recent = candles.slice(-3);
    const last = recent[recent.length - 1];
    const prev = recent[recent.length - 2];

    const patterns = [];
    let biasScore = 0;
    let bias = null;

    function body(candle) {
      return Math.abs(candle.c - candle.o);
    }

    function range(candle) {
      return Math.max(MIN_CANDLE_RANGE, candle.h - candle.l);
    }

    const lastBody = body(last);
    const lastRange = range(last);
    const prevBody = body(prev);

    // Doji (indecision)
    if (lastBody / lastRange < 0.1) {
      patterns.push('DOJI');
    }

    // Hammer / Shooting Star
    const upperWick = last.h - Math.max(last.o, last.c);
    const lowerWick = Math.min(last.o, last.c) - last.l;
    if (lastBody / lastRange < 0.3 && lowerWick > upperWick * 2 && lowerWick > lastBody * 1.5) {
      patterns.push('HAMMER');
      biasScore += 1;
    } else if (lastBody / lastRange < 0.3 && upperWick > lowerWick * 2 && upperWick > lastBody * 1.5) {
      patterns.push('SHOOTING_STAR');
      biasScore -= 1;
    }

    // Engulfing (requires previous candle)
    if (prev) {
      const bullishEngulf = last.c > last.o && prev.c < prev.o && last.c >= prev.o && last.o <= prev.c;
      const bearishEngulf = last.c < last.o && prev.c > prev.o && last.o >= prev.c && last.c <= prev.o;
      if (bullishEngulf) {
        patterns.push('BULLISH_ENGULFING');
        biasScore += 2;
      } else if (bearishEngulf) {
        patterns.push('BEARISH_ENGULFING');
        biasScore -= 2;
      }
    }

    // Morning/Evening Star (needs 3 candles)
    if (recent.length >= 3) {
      const c1 = recent[recent.length - 3];
      const c2 = recent[recent.length - 2];
      const c3 = last;
      const c2Body = body(c2);
      const c2Range = range(c2);
      const gapDown = c2.c < c1.c && c2.o < c1.c;
      const gapUp = c2.c > c1.c && c2.o > c1.c;

      if (gapDown && c2Body / c2Range < 0.3 && c3.c > c1.o) {
        patterns.push('MORNING_STAR');
        biasScore += 2;
      } else if (gapUp && c2Body / c2Range < 0.3 && c3.c < c1.o) {
        patterns.push('EVENING_STAR');
        biasScore -= 2;
      }
    }

    bias = biasScore > 0 ? 'BULLISH' : biasScore < 0 ? 'BEARISH' : null;

    // Confidence score based on number of patterns and body-to-range quality
    const baseScore = Math.min(1, patterns.length * THRESHOLDS.PATTERN_SCORE_PER_MATCH);
    const bodyQuality = Math.max(0, 1 - (lastBody / lastRange));
    const score = Math.min(1, (baseScore * THRESHOLDS.PATTERN_WEIGHT) + (bodyQuality * THRESHOLDS.BODY_WEIGHT));

    return { patterns, bias, score };
  }

  return {
    calculateSMA,
    calculateEMA,
    calculateRSI,
    calculateMACD,
    calculateBollingerBands,
    calculateATR,
    calculateStochastic,
    calculateADX,
    calculateCCI,
    calculateWilliamsR,
    calculateAwesomeOscillator,
    calculateOsMA,
    calculateMomentum,
    calculateParabolicSAR,
    calculateSchaffTrendCycle,
    calculateVortexIndicator,
    calculateAroon,
    calculateBearsPower,
    calculateBullsPower,
    calculateDeMarker,
    detectCandlestickPatterns,
    detectSupportResistance,
    detectTrend,
    detectMultiCandlePatterns
  };
})();

console.log('[Pocket Scout v6.0] Technical Indicators loaded - 15 indicators + pattern detection');
