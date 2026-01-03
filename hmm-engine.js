/**
 * Pocket Scout v7 - Hidden Markov Model (HMM) Regime Detection
 * 4 states: TRENDING, RANGING, VOLATILE, CHAOTIC
 * Transitions based on ADX, ATR, and microstructure
 */

window.HMMEngine = (function() {
  'use strict';

  // 4 market states
  const STATES = {
    TRENDING: 0,
    RANGING: 1,
    VOLATILE: 2,
    CHAOTIC: 3
  };

  const STATE_NAMES = ['TRENDING', 'RANGING', 'VOLATILE', 'CHAOTIC'];

  // Current state
  let currentState = STATES.RANGING; // Default to RANGING
  let stateHistory = [];
  const MAX_HISTORY = 100;

  // Transition probability matrix (4x4)
  // Rows: current state, Columns: next state
  let transitionMatrix = [
    // From TRENDING -> [TRENDING, RANGING, VOLATILE, CHAOTIC]
    [0.7, 0.2, 0.08, 0.02],
    // From RANGING -> [TRENDING, RANGING, VOLATILE, CHAOTIC]
    [0.15, 0.75, 0.08, 0.02],
    // From VOLATILE -> [TRENDING, RANGING, VOLATILE, CHAOTIC]
    [0.1, 0.15, 0.65, 0.1],
    // From CHAOTIC -> [TRENDING, RANGING, VOLATILE, CHAOTIC]
    [0.05, 0.1, 0.35, 0.5]
  ];

  // Emission probabilities (simplified - based on observed indicators)
  function calculateEmissionProbabilities(adx, atrRatio, tickFrequency, spreadEstimate) {
    // Returns probability of each state given the observations
    const probabilities = [0, 0, 0, 0];

    // TRENDING: High ADX, moderate volatility
    if (adx > 25) {
      probabilities[STATES.TRENDING] = Math.min(1, adx / 50) * 0.9;
    } else {
      probabilities[STATES.TRENDING] = 0.1;
    }

    // RANGING: Low ADX, low-moderate volatility
    if (adx < 20 && atrRatio < 0.015) {
      probabilities[STATES.RANGING] = 0.8;
    } else if (adx < 25) {
      probabilities[STATES.RANGING] = 0.5;
    } else {
      probabilities[STATES.RANGING] = 0.1;
    }

    // VOLATILE: Moderate ADX, high ATR
    if (atrRatio > 0.015 && atrRatio < 0.03) {
      probabilities[STATES.VOLATILE] = Math.min(1, atrRatio / 0.03) * 0.85;
    } else {
      probabilities[STATES.VOLATILE] = 0.15;
    }

    // CHAOTIC: Low ADX + very high ATR OR extreme tick frequency changes
    if ((adx < 15 && atrRatio > 0.025) || atrRatio > 0.035) {
      probabilities[STATES.CHAOTIC] = 0.9;
    } else if (atrRatio > 0.02) {
      probabilities[STATES.CHAOTIC] = 0.4;
    } else {
      probabilities[STATES.CHAOTIC] = 0.05;
    }

    // Normalize probabilities to sum to 1
    const sum = probabilities.reduce((a, b) => a + b, 0);
    return probabilities.map(p => p / sum);
  }

  /**
   * Detect current market regime using HMM
   * @param {Object} indicators - { adx, atr, avgPrice, tickFrequency, spreadEstimate }
   * @returns {Object} - { state, stateName, confidence, stateProbs }
   */
  function detectRegime(indicators) {
    const { adx, atr, avgPrice, tickFrequency = 1, spreadEstimate = 0.0001 } = indicators;

    if (!adx || !atr || !avgPrice) {
      return {
        state: currentState,
        stateName: STATE_NAMES[currentState],
        confidence: 50,
        stateProbs: [0.25, 0.25, 0.25, 0.25]
      };
    }

    // Calculate ATR ratio
    const atrRatio = atr / avgPrice;

    // Get emission probabilities (observation likelihood)
    const emissionProbs = calculateEmissionProbabilities(adx, atrRatio, tickFrequency, spreadEstimate);

    // Calculate posterior probabilities using Bayes' rule with transition matrix
    const posteriorProbs = [0, 0, 0, 0];
    
    for (let nextState = 0; nextState < 4; nextState++) {
      // P(nextState | observations) = P(observations | nextState) * P(nextState | currentState)
      posteriorProbs[nextState] = 
        emissionProbs[nextState] * transitionMatrix[currentState][nextState];
    }

    // Normalize posterior probabilities
    const sum = posteriorProbs.reduce((a, b) => a + b, 0);
    const normalizedProbs = posteriorProbs.map(p => p / sum);

    // Select state with highest probability
    let maxProb = 0;
    let bestState = currentState;
    
    for (let i = 0; i < 4; i++) {
      if (normalizedProbs[i] > maxProb) {
        maxProb = normalizedProbs[i];
        bestState = i;
      }
    }

    // Update current state
    const previousState = currentState;
    currentState = bestState;

    // Store in history
    stateHistory.push({
      timestamp: Date.now(),
      state: currentState,
      stateName: STATE_NAMES[currentState],
      confidence: maxProb * 100,
      adx,
      atrRatio,
      probs: normalizedProbs
    });

    if (stateHistory.length > MAX_HISTORY) {
      stateHistory.shift();
    }

    // Log state transitions
    if (previousState !== currentState) {
      console.log(`[HMM Engine] 🔄 State transition: ${STATE_NAMES[previousState]} → ${STATE_NAMES[currentState]} (${(maxProb * 100).toFixed(1)}%)`);
    }

    return {
      state: currentState,
      stateName: STATE_NAMES[currentState],
      confidence: maxProb * 100,
      stateProbs: normalizedProbs,
      previousState: STATE_NAMES[previousState]
    };
  }

  /**
   * Get regime-specific strategy adjustments
   */
  function getRegimeStrategy(stateName) {
    const strategies = {
      TRENDING: {
        preferTrend: true,
        preferMeanReversion: false,
        riskMultiplier: 1.2,
        confidenceBoost: 15,
        description: 'Follow trends, use momentum indicators'
      },
      RANGING: {
        preferTrend: false,
        preferMeanReversion: true,
        riskMultiplier: 1.0,
        confidenceBoost: 20,
        description: 'Mean-reversion, trade boundaries'
      },
      VOLATILE: {
        preferTrend: false,
        preferMeanReversion: false,
        riskMultiplier: 0.8,
        confidenceBoost: 5,
        description: 'Cautious, reduce risk, wider stops'
      },
      CHAOTIC: {
        preferTrend: false,
        preferMeanReversion: false,
        riskMultiplier: 0.5,
        confidenceBoost: -15,
        description: 'Avoid trading, wait for clarity'
      }
    };

    return strategies[stateName] || strategies.RANGING;
  }

  /**
   * Get state stability score (how stable is the current regime)
   */
  function getStateStability() {
    if (stateHistory.length < 10) {
      return 50;
    }

    const recent = stateHistory.slice(-10);
    const currentStateName = STATE_NAMES[currentState];
    const sameStateCount = recent.filter(h => h.stateName === currentStateName).length;
    
    return (sameStateCount / 10) * 100;
  }

  /**
   * Update transition matrix based on observed transitions (learning)
   */
  function updateTransitionMatrix() {
    if (stateHistory.length < 20) {
      return;
    }

    // Count transitions
    const transitions = Array(4).fill(null).map(() => Array(4).fill(0));
    
    for (let i = 1; i < stateHistory.length; i++) {
      const prevState = stateHistory[i - 1].state;
      const currState = stateHistory[i].state;
      transitions[prevState][currState]++;
    }

    // Update transition matrix with exponential moving average
    const alpha = 0.1; // Learning rate
    
    for (let i = 0; i < 4; i++) {
      const rowSum = transitions[i].reduce((a, b) => a + b, 0);
      if (rowSum > 0) {
        for (let j = 0; j < 4; j++) {
          const observedProb = transitions[i][j] / rowSum;
          transitionMatrix[i][j] = 
            (1 - alpha) * transitionMatrix[i][j] + alpha * observedProb;
        }
      }
    }

    console.log('[HMM Engine] Transition matrix updated with recent observations');
  }

  /**
   * Reset HMM state
   */
  function reset() {
    currentState = STATES.RANGING;
    stateHistory = [];
    console.log('[HMM Engine] 🔄 State reset to RANGING');
  }

  /**
   * Get statistics
   */
  function getStats() {
    return {
      currentState: STATE_NAMES[currentState],
      stateHistory: stateHistory.slice(-10),
      stability: getStateStability(),
      transitionMatrix: transitionMatrix
    };
  }

  return {
    detectRegime,
    getRegimeStrategy,
    getStateStability,
    updateTransitionMatrix,
    reset,
    getStats,
    STATES,
    STATE_NAMES
  };
})();

console.log('[Pocket Scout v7] HMM Engine loaded - 4-state regime detection');
