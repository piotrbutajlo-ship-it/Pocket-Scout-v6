/**
 * Pocket Scout v7 - Enhanced Pattern Recognition
 * Chart patterns: Head & Shoulders, Triangles, Double Tops/Bottoms
 * Support/Resistance clustering
 */

window.PatternRecognition = (function() {
  'use strict';

  /**
   * Detect Head and Shoulders pattern
   * @param {Array} candles - OHLC candles
   * @returns {Object|null} - Pattern info or null
   */
  function detectHeadAndShoulders(candles) {
    if (candles.length < 30) return null;

    // Look for 3 peaks pattern in recent candles
    const recent = candles.slice(-30);
    const peaks = findPeaks(recent);
    const troughs = findTroughs(recent);

    if (peaks.length < 3 || troughs.length < 2) return null;

    // Check for head and shoulders structure
    const [leftShoulder, head, rightShoulder] = peaks.slice(-3);

    // Head should be higher than shoulders
    if (head.price > leftShoulder.price && head.price > rightShoulder.price) {
      // Shoulders should be roughly equal
      const shoulderDiff = Math.abs(leftShoulder.price - rightShoulder.price) / leftShoulder.price;
      
      if (shoulderDiff < 0.02) { // Within 2%
        return {
          type: 'HEAD_AND_SHOULDERS',
          direction: 'BEARISH',
          confidence: 0.75,
          neckline: (troughs[troughs.length - 2].price + troughs[troughs.length - 1].price) / 2,
          head: head.price,
          leftShoulder: leftShoulder.price,
          rightShoulder: rightShoulder.price
        };
      }
    }

    return null;
  }

  /**
   * Detect Inverse Head and Shoulders pattern
   */
  function detectInverseHeadAndShoulders(candles) {
    if (candles.length < 30) return null;

    const recent = candles.slice(-30);
    const peaks = findPeaks(recent);
    const troughs = findTroughs(recent);

    if (troughs.length < 3 || peaks.length < 2) return null;

    // Check for inverse head and shoulders structure
    const [leftShoulder, head, rightShoulder] = troughs.slice(-3);

    // Head should be lower than shoulders
    if (head.price < leftShoulder.price && head.price < rightShoulder.price) {
      const shoulderDiff = Math.abs(leftShoulder.price - rightShoulder.price) / leftShoulder.price;
      
      if (shoulderDiff < 0.02) {
        return {
          type: 'INVERSE_HEAD_AND_SHOULDERS',
          direction: 'BULLISH',
          confidence: 0.75,
          neckline: (peaks[peaks.length - 2].price + peaks[peaks.length - 1].price) / 2,
          head: head.price,
          leftShoulder: leftShoulder.price,
          rightShoulder: rightShoulder.price
        };
      }
    }

    return null;
  }

  /**
   * Detect Triangle patterns (Ascending, Descending, Symmetrical)
   */
  function detectTriangles(candles) {
    if (candles.length < 20) return null;

    const recent = candles.slice(-20);
    const highs = recent.map(c => c.h);
    const lows = recent.map(c => c.l);

    // Calculate trendlines
    const highTrend = calculateTrendline(highs);
    const lowTrend = calculateTrendline(lows);

    if (!highTrend || !lowTrend) return null;

    const highSlope = highTrend.slope;
    const lowSlope = lowTrend.slope;

    // Ascending Triangle: Flat resistance, rising support
    if (Math.abs(highSlope) < 0.0001 && lowSlope > 0.0001) {
      return {
        type: 'ASCENDING_TRIANGLE',
        direction: 'BULLISH',
        confidence: 0.65,
        resistance: highTrend.intercept,
        supportSlope: lowSlope
      };
    }

    // Descending Triangle: Flat support, declining resistance
    if (Math.abs(lowSlope) < 0.0001 && highSlope < -0.0001) {
      return {
        type: 'DESCENDING_TRIANGLE',
        direction: 'BEARISH',
        confidence: 0.65,
        support: lowTrend.intercept,
        resistanceSlope: highSlope
      };
    }

    // Symmetrical Triangle: Converging trendlines
    if (highSlope < -0.0001 && lowSlope > 0.0001) {
      const convergence = Math.abs(highSlope) + lowSlope;
      if (convergence > 0.0002) {
        return {
          type: 'SYMMETRICAL_TRIANGLE',
          direction: 'NEUTRAL',
          confidence: 0.55,
          convergenceRate: convergence
        };
      }
    }

    return null;
  }

  /**
   * Detect Double Top pattern
   */
  function detectDoubleTop(candles) {
    if (candles.length < 20) return null;

    const recent = candles.slice(-20);
    const peaks = findPeaks(recent);

    if (peaks.length < 2) return null;

    const [peak1, peak2] = peaks.slice(-2);

    // Check if peaks are similar height (within 1%)
    const priceDiff = Math.abs(peak1.price - peak2.price) / peak1.price;
    
    if (priceDiff < 0.01 && peak2.index - peak1.index >= 5) {
      // Find the trough between peaks
      const between = recent.slice(peak1.index, peak2.index);
      const minPrice = Math.min(...between.map(c => c.l));

      return {
        type: 'DOUBLE_TOP',
        direction: 'BEARISH',
        confidence: 0.70,
        peak1: peak1.price,
        peak2: peak2.price,
        support: minPrice
      };
    }

    return null;
  }

  /**
   * Detect Double Bottom pattern
   */
  function detectDoubleBottom(candles) {
    if (candles.length < 20) return null;

    const recent = candles.slice(-20);
    const troughs = findTroughs(recent);

    if (troughs.length < 2) return null;

    const [trough1, trough2] = troughs.slice(-2);

    // Check if troughs are similar depth (within 1%)
    const priceDiff = Math.abs(trough1.price - trough2.price) / trough1.price;
    
    if (priceDiff < 0.01 && trough2.index - trough1.index >= 5) {
      // Find the peak between troughs
      const between = recent.slice(trough1.index, trough2.index);
      const maxPrice = Math.max(...between.map(c => c.h));

      return {
        type: 'DOUBLE_BOTTOM',
        direction: 'BULLISH',
        confidence: 0.70,
        bottom1: trough1.price,
        bottom2: trough2.price,
        resistance: maxPrice
      };
    }

    return null;
  }

  /**
   * Identify Support and Resistance levels using clustering
   */
  function identifySupportResistance(candles, tolerance = 0.002) {
    if (candles.length < 30) return { support: [], resistance: [] };

    const allLevels = [];

    // Collect all highs and lows
    candles.forEach((candle, index) => {
      allLevels.push({ price: candle.h, type: 'high', index });
      allLevels.push({ price: candle.l, type: 'low', index });
    });

    // Cluster nearby levels
    const clusters = [];
    allLevels.sort((a, b) => a.price - b.price);

    let currentCluster = [allLevels[0]];
    
    for (let i = 1; i < allLevels.length; i++) {
      const level = allLevels[i];
      const prevPrice = currentCluster[0].price;

      if (Math.abs(level.price - prevPrice) / prevPrice < tolerance) {
        currentCluster.push(level);
      } else {
        if (currentCluster.length >= 3) {
          const avgPrice = currentCluster.reduce((sum, l) => sum + l.price, 0) / currentCluster.length;
          const touches = currentCluster.length;
          const highCount = currentCluster.filter(l => l.type === 'high').length;
          const lowCount = currentCluster.filter(l => l.type === 'low').length;

          clusters.push({
            price: avgPrice,
            touches,
            type: highCount > lowCount ? 'resistance' : 'support',
            strength: Math.min(1, touches / 10)
          });
        }
        currentCluster = [level];
      }
    }

    // Add last cluster
    if (currentCluster.length >= 3) {
      const avgPrice = currentCluster.reduce((sum, l) => sum + l.price, 0) / currentCluster.length;
      const touches = currentCluster.length;
      const highCount = currentCluster.filter(l => l.type === 'high').length;
      const lowCount = currentCluster.filter(l => l.type === 'low').length;

      clusters.push({
        price: avgPrice,
        touches,
        type: highCount > lowCount ? 'resistance' : 'support',
        strength: Math.min(1, touches / 10)
      });
    }

    // Separate support and resistance
    const support = clusters.filter(c => c.type === 'support').sort((a, b) => b.strength - a.strength);
    const resistance = clusters.filter(c => c.type === 'resistance').sort((a, b) => b.strength - a.strength);

    return { support, resistance };
  }

  /**
   * Helper: Find peaks in candle data
   */
  function findPeaks(candles) {
    const peaks = [];
    
    for (let i = 2; i < candles.length - 2; i++) {
      const current = candles[i].h;
      const prev1 = candles[i - 1].h;
      const prev2 = candles[i - 2].h;
      const next1 = candles[i + 1].h;
      const next2 = candles[i + 2].h;

      if (current > prev1 && current > prev2 && current > next1 && current > next2) {
        peaks.push({ index: i, price: current });
      }
    }

    return peaks;
  }

  /**
   * Helper: Find troughs in candle data
   */
  function findTroughs(candles) {
    const troughs = [];
    
    for (let i = 2; i < candles.length - 2; i++) {
      const current = candles[i].l;
      const prev1 = candles[i - 1].l;
      const prev2 = candles[i - 2].l;
      const next1 = candles[i + 1].l;
      const next2 = candles[i + 2].l;

      if (current < prev1 && current < prev2 && current < next1 && current < next2) {
        troughs.push({ index: i, price: current });
      }
    }

    return troughs;
  }

  /**
   * Helper: Calculate trendline using linear regression
   */
  function calculateTrendline(values) {
    if (values.length < 2) return null;

    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  /**
   * Analyze all patterns
   */
  function analyzeAllPatterns(candles) {
    if (!candles || candles.length < 20) {
      return {
        patterns: [],
        supportResistance: { support: [], resistance: [] }
      };
    }

    const patterns = [];

    // Detect chart patterns
    const hs = detectHeadAndShoulders(candles);
    if (hs) patterns.push(hs);

    const ihs = detectInverseHeadAndShoulders(candles);
    if (ihs) patterns.push(ihs);

    const triangle = detectTriangles(candles);
    if (triangle) patterns.push(triangle);

    const doubleTop = detectDoubleTop(candles);
    if (doubleTop) patterns.push(doubleTop);

    const doubleBottom = detectDoubleBottom(candles);
    if (doubleBottom) patterns.push(doubleBottom);

    // Identify support/resistance
    const supportResistance = identifySupportResistance(candles);

    return {
      patterns,
      supportResistance
    };
  }

  return {
    detectHeadAndShoulders,
    detectInverseHeadAndShoulders,
    detectTriangles,
    detectDoubleTop,
    detectDoubleBottom,
    identifySupportResistance,
    analyzeAllPatterns
  };
})();

console.log('[Pocket Scout v7] Pattern Recognition loaded - Chart patterns & S/R clustering');
