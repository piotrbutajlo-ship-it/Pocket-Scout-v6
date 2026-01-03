/**
 * Pocket Scout v7 - Backtesting Module
 * Historical validation and Monte Carlo robustness testing
 */

window.BacktestingEngine = (function() {
  'use strict';

  let backtestResults = [];
  let isRunning = false;

  /**
   * Run backtest on collected signal history
   * @param {Array} signals - Array of historical signals with results
   * @returns {Object} - Backtest results and statistics
   */
  function runBacktest(signals) {
    if (!signals || signals.length === 0) {
      return {
        error: 'No signals to backtest',
        totalSignals: 0
      };
    }

    console.log(`[Backtesting] Running backtest on ${signals.length} signals...`);

    let wins = 0;
    let losses = 0;
    let totalProfit = 0;
    let maxDrawdown = 0;
    let peak = 0;
    let equity = 1000; // Start with $1000 virtual balance
    const tradeSize = 10; // $10 per trade
    const payoutRatio = 0.85; // 85% payout

    const equityCurve = [equity];
    const regimePerformance = {
      TRENDING: { wins: 0, losses: 0 },
      RANGING: { wins: 0, losses: 0 },
      VOLATILE: { wins: 0, losses: 0 },
      CHAOTIC: { wins: 0, losses: 0 }
    };

    signals.forEach((signal, index) => {
      if (signal.result === 'WIN') {
        wins++;
        totalProfit += tradeSize * payoutRatio;
        equity += tradeSize * payoutRatio;
        
        if (signal.regime && regimePerformance[signal.regime]) {
          regimePerformance[signal.regime].wins++;
        }
      } else if (signal.result === 'LOSS') {
        losses++;
        totalProfit -= tradeSize;
        equity -= tradeSize;
        
        if (signal.regime && regimePerformance[signal.regime]) {
          regimePerformance[signal.regime].losses++;
        }
      }

      equityCurve.push(equity);

      // Track drawdown
      if (equity > peak) {
        peak = equity;
      }
      const drawdown = ((peak - equity) / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });

    const totalTrades = wins + losses;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const profitFactor = losses > 0 ? (wins * tradeSize * payoutRatio) / (losses * tradeSize) : 0;
    const netProfit = equity - 1000;
    const roi = ((equity - 1000) / 1000) * 100;

    // Calculate regime-specific win rates
    const regimeWinRates = {};
    Object.keys(regimePerformance).forEach(regime => {
      const { wins: w, losses: l } = regimePerformance[regime];
      const total = w + l;
      regimeWinRates[regime] = total > 0 ? (w / total) * 100 : null;
    });

    const results = {
      totalSignals: signals.length,
      totalTrades,
      wins,
      losses,
      winRate,
      profitFactor,
      netProfit,
      roi,
      maxDrawdown,
      equityCurve,
      regimePerformance,
      regimeWinRates,
      startBalance: 1000,
      endBalance: equity
    };

    backtestResults.push({
      timestamp: Date.now(),
      results
    });

    console.log(`[Backtesting] ✅ Backtest complete: WR ${winRate.toFixed(1)}%, ROI ${roi.toFixed(1)}%, Max DD ${maxDrawdown.toFixed(1)}%`);

    return results;
  }

  /**
   * Run Monte Carlo simulation
   * Randomly shuffle historical signals to test robustness
   * @param {Array} signals - Historical signals
   * @param {number} iterations - Number of simulations to run
   * @returns {Object} - Monte Carlo statistics
   */
  function runMonteCarloSimulation(signals, iterations = 100) {
    if (!signals || signals.length === 0) {
      return {
        error: 'No signals for Monte Carlo simulation'
      };
    }

    console.log(`[Backtesting] Running Monte Carlo simulation with ${iterations} iterations...`);

    const results = [];
    
    for (let i = 0; i < iterations; i++) {
      // Shuffle signals randomly
      const shuffled = [...signals].sort(() => Math.random() - 0.5);
      const backtestResult = runBacktest(shuffled);
      
      results.push({
        winRate: backtestResult.winRate,
        roi: backtestResult.roi,
        maxDrawdown: backtestResult.maxDrawdown,
        profitFactor: backtestResult.profitFactor
      });
    }

    // Calculate statistics
    const winRates = results.map(r => r.winRate);
    const rois = results.map(r => r.roi);
    const drawdowns = results.map(r => r.maxDrawdown);
    const profitFactors = results.map(r => r.profitFactor);

    const stats = {
      iterations,
      winRate: {
        mean: average(winRates),
        median: median(winRates),
        stdDev: stdDev(winRates),
        min: Math.min(...winRates),
        max: Math.max(...winRates)
      },
      roi: {
        mean: average(rois),
        median: median(rois),
        stdDev: stdDev(rois),
        min: Math.min(...rois),
        max: Math.max(...rois)
      },
      maxDrawdown: {
        mean: average(drawdowns),
        median: median(drawdowns),
        stdDev: stdDev(drawdowns),
        min: Math.min(...drawdowns),
        max: Math.max(...drawdowns)
      },
      profitFactor: {
        mean: average(profitFactors),
        median: median(profitFactors),
        stdDev: stdDev(profitFactors),
        min: Math.min(...profitFactors),
        max: Math.max(...profitFactors)
      },
      profitableSims: results.filter(r => r.roi > 0).length,
      profitablePercent: (results.filter(r => r.roi > 0).length / iterations) * 100
    };

    console.log(`[Backtesting] ✅ Monte Carlo complete: Avg WR ${stats.winRate.mean.toFixed(1)}% (±${stats.winRate.stdDev.toFixed(1)}%)`);
    console.log(`[Backtesting] Profitable in ${stats.profitablePercent.toFixed(1)}% of simulations`);

    return stats;
  }

  /**
   * Helper: Calculate average
   */
  function average(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * Helper: Calculate median
   */
  function median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  /**
   * Helper: Calculate standard deviation
   */
  function stdDev(arr) {
    const avg = average(arr);
    const squareDiffs = arr.map(val => Math.pow(val - avg, 2));
    const avgSquareDiff = average(squareDiffs);
    return Math.sqrt(avgSquareDiff);
  }

  /**
   * Forward test: Validate strategy on most recent data
   * @param {Array} signals - All historical signals
   * @param {number} testPeriod - Number of recent signals to use for testing
   * @returns {Object} - Forward test results
   */
  function runForwardTest(signals, testPeriod = 50) {
    if (!signals || signals.length < testPeriod) {
      return {
        error: 'Insufficient signals for forward test',
        required: testPeriod,
        available: signals ? signals.length : 0
      };
    }

    console.log(`[Backtesting] Running forward test on last ${testPeriod} signals...`);

    const testSignals = signals.slice(-testPeriod);
    const results = runBacktest(testSignals);

    return {
      ...results,
      testPeriod,
      isForwardTest: true
    };
  }

  /**
   * Get backtest statistics
   */
  function getStats() {
    return {
      totalBacktests: backtestResults.length,
      latestBacktest: backtestResults.length > 0 ? 
        backtestResults[backtestResults.length - 1] : null
    };
  }

  /**
   * Reset backtesting data
   */
  function reset() {
    backtestResults = [];
    console.log('[Backtesting] 🔄 Backtest data reset');
  }

  return {
    runBacktest,
    runMonteCarloSimulation,
    runForwardTest,
    getStats,
    reset
  };
})();

console.log('[Pocket Scout v7] Backtesting Engine loaded - Historical validation & Monte Carlo');
