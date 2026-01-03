/**
 * Pocket Scout v7 - Reinforcement Learning Engine
 * Q-Learning for regime-specific strategies
 * Rewards: +1 WIN, -1 LOSS, dynamic adaptation
 */

window.RLEngine = (function() {
  'use strict';

  // Q-Table: state x action matrix
  // States: 4 regime states (TRENDING, RANGING, VOLATILE, CHAOTIC)
  // Actions: 2 actions (BUY, SELL)
  let qTable = {
    TRENDING: { BUY: 0.5, SELL: 0.5 },
    RANGING: { BUY: 0.5, SELL: 0.5 },
    VOLATILE: { BUY: 0.5, SELL: 0.5 },
    CHAOTIC: { BUY: 0.5, SELL: 0.5 }
  };

  // Q-Learning parameters
  const LEARNING_RATE = 0.1; // Alpha
  const DISCOUNT_FACTOR = 0.9; // Gamma
  const EXPLORATION_RATE = 0.15; // Epsilon (15% random exploration)

  // Statistics
  let totalUpdates = 0;
  let rewardHistory = [];
  const MAX_HISTORY = 500;

  /**
   * Load Q-table from localStorage
   */
  function loadQTable() {
    try {
      const saved = localStorage.getItem('PS_V7_Q_TABLE');
      if (saved) {
        qTable = JSON.parse(saved);
        console.log('[RL Engine] Q-table loaded from storage');
      }
    } catch (error) {
      console.warn('[RL Engine] Error loading Q-table:', error);
    }
  }

  /**
   * Save Q-table to localStorage
   */
  function saveQTable() {
    try {
      localStorage.setItem('PS_V7_Q_TABLE', JSON.stringify(qTable));
    } catch (error) {
      console.warn('[RL Engine] Error saving Q-table:', error);
    }
  }

  /**
   * Select action using epsilon-greedy policy
   * @param {string} regime - Current regime (TRENDING, RANGING, VOLATILE, CHAOTIC)
   * @param {string} aiAction - Action suggested by AI engine
   * @returns {string} - Selected action (BUY or SELL)
   */
  function selectAction(regime, aiAction = null) {
    // Exploration: Random action with probability EXPLORATION_RATE
    if (Math.random() < EXPLORATION_RATE) {
      const action = Math.random() < 0.5 ? 'BUY' : 'SELL';
      console.log(`[RL Engine] 🎲 Exploration: ${action}`);
      return action;
    }

    // Exploitation: Choose best action from Q-table
    const qValues = qTable[regime];
    if (!qValues) {
      console.warn(`[RL Engine] Unknown regime: ${regime}, using AI action`);
      return aiAction || (Math.random() < 0.5 ? 'BUY' : 'SELL');
    }

    // If AI action is available and Q-values are similar, trust AI
    if (aiAction && Math.abs(qValues.BUY - qValues.SELL) < 0.1) {
      console.log(`[RL Engine] 🤖 Using AI action (Q-values similar): ${aiAction}`);
      return aiAction;
    }

    // Otherwise, use Q-table
    const action = qValues.BUY > qValues.SELL ? 'BUY' : 'SELL';
    console.log(`[RL Engine] 📊 Q-table: ${action} (BUY: ${qValues.BUY.toFixed(3)}, SELL: ${qValues.SELL.toFixed(3)})`);
    return action;
  }

  /**
   * Update Q-value based on reward
   * Q(s,a) = Q(s,a) + α * [reward + γ * max(Q(s',a')) - Q(s,a)]
   * 
   * @param {string} regime - Regime when action was taken
   * @param {string} action - Action taken (BUY or SELL)
   * @param {number} reward - Reward received (+1 for win, -1 for loss)
   * @param {string} nextRegime - Regime after action (for future value estimation)
   */
  function updateQValue(regime, action, reward, nextRegime) {
    if (!qTable[regime] || !qTable[nextRegime]) {
      console.warn('[RL Engine] Invalid regime for Q-update');
      return;
    }

    const currentQ = qTable[regime][action];
    const maxNextQ = Math.max(qTable[nextRegime].BUY, qTable[nextRegime].SELL);

    // Q-Learning update formula
    const newQ = currentQ + LEARNING_RATE * (reward + DISCOUNT_FACTOR * maxNextQ - currentQ);
    
    qTable[regime][action] = newQ;
    totalUpdates++;

    // Store reward history
    rewardHistory.push({
      timestamp: Date.now(),
      regime,
      action,
      reward,
      oldQ: currentQ,
      newQ: newQ
    });

    if (rewardHistory.length > MAX_HISTORY) {
      rewardHistory.shift();
    }

    // Save to localStorage
    saveQTable();

    console.log(`[RL Engine] 🎓 Q-update: ${regime} ${action} | Reward: ${reward > 0 ? '+1' : '-1'} | Q: ${currentQ.toFixed(3)} → ${newQ.toFixed(3)}`);
  }

  /**
   * Get confidence adjustment based on Q-values
   * Higher Q-values = higher confidence
   */
  function getConfidenceAdjustment(regime, action) {
    if (!qTable[regime]) {
      return 0;
    }

    const qValue = qTable[regime][action];
    const otherAction = action === 'BUY' ? 'SELL' : 'BUY';
    const otherQValue = qTable[regime][otherAction];

    // If Q-value is significantly better than the other action, boost confidence
    const qDiff = qValue - otherQValue;
    
    if (qDiff > 0.2) {
      return 10; // Strong preference
    } else if (qDiff > 0.1) {
      return 5; // Moderate preference
    } else if (qDiff < -0.1) {
      return -5; // Discourage this action
    }

    return 0;
  }

  /**
   * Get regime-specific win rate from reward history
   */
  function getRegimeWinRate(regime) {
    if (rewardHistory.length === 0) {
      return null;
    }

    const regimeRewards = rewardHistory.filter(r => r.regime === regime);
    if (regimeRewards.length === 0) {
      return null;
    }

    const wins = regimeRewards.filter(r => r.reward > 0).length;
    return (wins / regimeRewards.length) * 100;
  }

  /**
   * Get action-specific win rate in current regime
   */
  function getActionWinRate(regime, action) {
    if (rewardHistory.length === 0) {
      return null;
    }

    const actionRewards = rewardHistory.filter(
      r => r.regime === regime && r.action === action
    );

    if (actionRewards.length === 0) {
      return null;
    }

    const wins = actionRewards.filter(r => r.reward > 0).length;
    return (wins / actionRewards.length) * 100;
  }

  /**
   * Get overall performance statistics
   */
  function getPerformanceStats() {
    if (rewardHistory.length === 0) {
      return {
        totalRewards: 0,
        avgReward: 0,
        winRate: 0,
        sampleSize: 0
      };
    }

    const totalReward = rewardHistory.reduce((sum, r) => sum + r.reward, 0);
    const wins = rewardHistory.filter(r => r.reward > 0).length;

    return {
      totalRewards: totalReward,
      avgReward: totalReward / rewardHistory.length,
      winRate: (wins / rewardHistory.length) * 100,
      sampleSize: rewardHistory.length
    };
  }

  /**
   * Reset Q-table and history
   */
  function reset() {
    qTable = {
      TRENDING: { BUY: 0.5, SELL: 0.5 },
      RANGING: { BUY: 0.5, SELL: 0.5 },
      VOLATILE: { BUY: 0.5, SELL: 0.5 },
      CHAOTIC: { BUY: 0.5, SELL: 0.5 }
    };
    rewardHistory = [];
    totalUpdates = 0;
    saveQTable();
    console.log('[RL Engine] 🔄 Q-table reset');
  }

  /**
   * Get statistics
   */
  function getStats() {
    return {
      qTable: qTable,
      totalUpdates: totalUpdates,
      rewardHistory: rewardHistory.slice(-20),
      performance: getPerformanceStats(),
      regimeWinRates: {
        TRENDING: getRegimeWinRate('TRENDING'),
        RANGING: getRegimeWinRate('RANGING'),
        VOLATILE: getRegimeWinRate('VOLATILE'),
        CHAOTIC: getRegimeWinRate('CHAOTIC')
      }
    };
  }

  /**
   * Initialize RL engine
   */
  function initialize() {
    loadQTable();
    console.log('[RL Engine] ✅ Initialized with Q-Learning');
    return true;
  }

  return {
    initialize,
    selectAction,
    updateQValue,
    getConfidenceAdjustment,
    getRegimeWinRate,
    getActionWinRate,
    getPerformanceStats,
    reset,
    getStats
  };
})();

console.log('[Pocket Scout v7] RL Engine loaded - Q-Learning for adaptive strategies');
