/**
 * Pocket Scout v7 - Popup Script
 */

function updateMetrics() {
  const metricsDiv = document.getElementById('metrics');
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      metricsDiv.innerHTML = '<div style="opacity:0.7;">No active tab found</div>';
      return;
    }
    
    chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_METRICS' }, (response) => {
      if (chrome.runtime.lastError) {
        metricsDiv.innerHTML = `<div style="opacity:0.7;">Please open PocketOption.com first</div>`;
        return;
      }
      
      if (response && response.metrics) {
        const m = response.metrics;
        const lastSignal = response.lastSignal;
        const wrColor = m.winRate >= 65 ? '#10b981' : m.winRate >= 55 ? '#f59e0b' : '#ef4444';
        
        metricsDiv.innerHTML = `
          <div class="metric">
            <div class="metric-label">Win Rate</div>
            <div class="metric-value" style="color:${wrColor};">${m.winRate.toFixed(1)}%</div>
          </div>
          <div class="metric">
            <div class="metric-label">Total Signals</div>
            <div class="metric-value">${m.totalSignals}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Wins / Losses</div>
            <div class="metric-value">${m.wins} / ${m.losses}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Signal Interval</div>
            <div class="metric-value">${m.currentInterval} min</div>
          </div>
          <div class="metric">
            <div class="metric-label">Candles Collected</div>
            <div class="metric-value">${response.candles}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Warmup Status</div>
            <div class="metric-value">${response.warmupComplete ? '✅ Complete' : '🔥 In Progress'}</div>
          </div>
          ${m.aiStats ? `
          <div class="metric" style="border-top: 1px solid #334155; margin-top: 8px; padding-top: 8px;">
            <div class="metric-label">🤖 AI Engine</div>
            <div class="metric-value" style="font-size:11px;">
              ${m.aiStats.isReady ? '✅ Ready' : '⏳ Loading'}<br/>
              ${m.aiStats.trainingDataCount} samples<br/>
              Next retrain: ${m.aiStats.nextRetrainIn} signals
            </div>
          </div>
          ` : ''}
          ${m.regime ? `
          <div class="metric">
            <div class="metric-label">🌊 Market Regime</div>
            <div class="metric-value" style="font-size:12px;">${m.regime}</div>
          </div>
          ` : ''}
          ${m.rlStats ? `
          <div class="metric">
            <div class="metric-label">🎯 RL Q-Learning</div>
            <div class="metric-value" style="font-size:11px;">
              ${m.rlStats.totalUpdates} updates<br/>
              WR: ${m.rlStats.winRate ? m.rlStats.winRate.toFixed(1) + '%' : 'N/A'}
            </div>
          </div>
          ` : ''}
          ${lastSignal ? `
          <div class="metric" style="border-top: 1px solid #334155; margin-top: 8px; padding-top: 8px;">
            <div class="metric-label">Last Signal</div>
            <div class="metric-value" style="color:${lastSignal.action === 'BUY' ? '#10b981' : '#ef4444'};">
              ${lastSignal.action} @ ${lastSignal.confidence}%
            </div>
          </div>
          ` : ''}
          <div style="margin-top:12px; padding-top:12px; border-top:1px solid #334155;">
            <button id="resetBtn" style="
              width:100%;
              padding:8px;
              background:#ef4444;
              color:#fff;
              border:none;
              border-radius:6px;
              cursor:pointer;
              font-weight:600;
              font-size:12px;
            ">Reset Signal History</button>
          </div>
        `;
        
        // Add reset button handler
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
          resetBtn.onclick = () => {
            if (confirm('Are you sure you want to reset all signal history and learning data? This cannot be undone.')) {
              chrome.tabs.sendMessage(tabs[0].id, { type: 'RESET_HISTORY' }, (response) => {
                if (response && response.success) {
                  alert('Signal history reset successfully!');
                  updateMetrics();
                }
              });
            }
          };
        }
      } else {
        metricsDiv.innerHTML = '<div style="opacity:0.7;">No data available - waiting for signals...</div>';
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Initial update
  updateMetrics();
  
  // Auto-refresh every 2 seconds
  setInterval(updateMetrics, 2000);
});
