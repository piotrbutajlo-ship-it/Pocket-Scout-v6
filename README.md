# Pocket Scout v6.0 - Multi-Candle Historical Analysis System

Advanced Chrome extension for binary options trading on PocketOption with 15 technical indicators, multi-candle pattern recognition, and adaptive learning.

## 🎯 Key Features

### ✨ NEW in v6.0

1. **Historical Multi-Candle Analysis (50-600 candles)**
   - Analyzes entire candle history, not just recent data
   - Support/Resistance detection from 50+ candles
   - Trend detection over 30-minute windows
   - Multi-candle pattern recognition (20-100 candles lookback)

2. **15 Active Technical Indicators**
   - Mean-Reversion: RSI, Williams %R, CCI, Stochastic, Bollinger Bands, DeMarker
   - Trend-Following: MACD, OsMA, Momentum, Parabolic SAR, Schaff Trend Cycle, Vortex, Aroon
   - Power Indicators: Bulls Power, Bears Power, Awesome Oscillator

3. **Advanced Pattern Recognition**
   - Double Top/Bottom patterns
   - Head and Shoulders (regular and inverse)
   - Triangle formations
   - Candlestick patterns (hammer, engulfing, doji, stars)

4. **Regime-Based Signal Weighting**
   - Automatic detection: TRENDING / RANGING / VOLATILE
   - Dynamic indicator weight adjustment per regime
   - All 15 indicators weighted appropriately

5. **Historical Learning System**
   - Per-indicator win rate tracking
   - Automatic weight adjustment every 30 signals
   - Increase weight if WR > 55%, decrease if WR < 45%
   - Persistent learning across sessions via localStorage

6. **No Fallback Mode**
   - Requires real calculated indicators
   - Minimum 35% confidence threshold
   - Skips signal generation if insufficient data

## 📦 Installation

### Method 1: Load from Source

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `Pocket-Scout-v6` folder
6. The extension icon will appear in your toolbar

### Method 2: Build and Load

```bash
# No build process required - pure JavaScript
# Just load the extension folder directly in Chrome
```

## 🚀 Usage

### Initial Setup

1. Install the extension following the steps above
2. Navigate to [pocketoption.com](https://pocketoption.com)
3. The Pocket Scout panel will appear on the right side of the screen
4. Wait for warmup (50 M1 candles needed, ~50 minutes)

### Signal Generation

- **Warmup Phase**: Extension collects M1 candles for 50 minutes
- **Active Phase**: Generates signals every 1-10 minutes (configurable slider)
- **Default Interval**: 3 minutes (optimized for M3 trading)

### Understanding the UI

#### Main Panel Sections

1. **Status**
   - Current price
   - Warmup progress
   - Candle count (target: 50+)

2. **Signal Display**
   - Action: BUY or SELL
   - Confidence: 35-95%
   - Duration: 1-5 minutes
   - Entry price
   - Win rate
   - Market regime badge
   - Signal reasons (top 10)

3. **Analytics**
   - Market regime (TRENDING/RANGING/VOLATILE)
   - 30-minute trend direction
   - Recent patterns detected
   - Top 5 performing indicators with win rates
   - Total signals generated

4. **History**
   - Last 5 signals
   - WIN/LOSS/PENDING status
   - Timestamps and confidence levels

#### Interval Slider

- Adjust signal generation frequency: 1-10 minutes
- Default: 3 minutes (recommended for most trading)
- Lower values = more frequent signals, higher values = more selective

## 🎓 Learning System

### How It Works

1. **Signal Tracking**: Each signal records which indicators contributed
2. **Result Verification**: After signal duration expires, system checks if the signal was a WIN or LOSS
3. **Per-Indicator Learning**: Tracks win rate for each of the 15 indicators
4. **Weight Adjustment**: Every 30 signals, adjusts weights based on performance
   - WR > 55%: Increase indicator weight by 10%
   - WR < 45%: Decrease indicator weight by 10%
5. **Persistence**: All learning data stored in localStorage

### Viewing Learning Progress

Check the Analytics section to see:
- Top performing indicators
- Individual indicator win rates
- Total signals analyzed

## 🔧 Auto Trader Compatibility

Pocket Scout v6.0 maintains **100% compatibility** with Auto Trader extensions.

### Signal Format

```javascript
{
  action: "BUY" | "SELL",
  confidence: 65,              // 35-95%
  entryPrice: 1.08456,
  duration: 3,                 // minutes
  reasons: [...],
  volatility: 0.0023,
  adxStrength: 28.5,
  isFallback: false            // always false in v6.0
}
```

Published to localStorage under key: `PS_AT_FEED`

## 📊 Technical Indicators

### Mean-Reversion Indicators (best for RANGING markets)

- **RSI (14)**: Relative Strength Index
- **Williams %R (14)**: Fast momentum oscillator
- **CCI (20)**: Commodity Channel Index
- **Stochastic (14,3,3)**: %K and %D oscillators
- **Bollinger Bands (20,2)**: Price envelope bands
- **DeMarker (14)**: Oscillator for identifying exhaustion points

### Trend-Following Indicators (best for TRENDING markets)

- **MACD (12,26,9)**: Moving Average Convergence Divergence
- **OsMA**: MACD histogram
- **Momentum (10)**: Rate of price change
- **Parabolic SAR (0.02, 0.2)**: Stop and Reverse trend indicator
- **Schaff Trend Cycle**: Cyclical oscillator
- **Vortex Indicator (14)**: Directional movement
- **Aroon (25)**: Trend strength and direction

### Power Indicators

- **Bulls Power (13)**: Buyer strength
- **Bears Power (13)**: Seller strength
- **Awesome Oscillator**: Momentum from 5/34 SMA difference

## 🎯 Trading Strategy

### Market Regime Adaptation

1. **TRENDING Markets** (+15% confidence boost)
   - Emphasizes: MACD, OsMA, Momentum, PSAR, STC, Vortex, Aroon
   - Reduces: RSI, Williams %R, CCI (mean-reversion)

2. **RANGING Markets** (+20% confidence boost)
   - Emphasizes: RSI, Williams %R, CCI, Stochastic, BB, DeMarker
   - Reduces: Trend-following indicators

3. **VOLATILE Markets** (-10% confidence penalty)
   - Conservative approach
   - Emphasizes: Bollinger Bands
   - Reduces most other indicators

### Pattern-Based Trading

- **Bullish Patterns**: Double Bottom, Inverse H&S, Hammer, Bullish Engulfing
- **Bearish Patterns**: Double Top, H&S, Shooting Star, Bearish Engulfing
- **Neutral Patterns**: Triangles, Doji (used for caution)

## 📈 Performance

### Target Metrics

- **Win Rate**: 55-60% (profitable with proper money management)
- **Minimum Confidence**: 35% (signals below this are skipped)
- **Optimal Confidence**: 50-70% range
- **Signal Frequency**: 3-10 minutes apart

### Continuous Improvement

- System learns and adapts every 30 signals
- Indicators that underperform are automatically downweighted
- Indicators that outperform are automatically upweighted
- No manual tuning required

## 🔍 Advanced Features

### Support & Resistance Detection

- Identifies key price levels from 50-100 candles
- Clusters nearby levels for accuracy
- Considers touch count for level strength
- Factors into signal confidence when price near level

### Trend Detection

- Linear regression over 30-candle windows
- Classifies as UPTREND, DOWNTREND, or SIDEWAYS
- Used to bias signal direction
- Updates every signal generation

### Multi-Candle Patterns

- Analyzes up to 100 historical candles
- Detects complex chart patterns
- Provides confidence score per pattern
- Combines with indicator signals

## ⚠️ Important Notes

### Trading Risks

- Binary options trading carries significant risk
- Past performance does not guarantee future results
- Use proper money management
- Never trade with money you cannot afford to lose
- This is a tool to assist decision-making, not a guarantee of profits

### System Requirements

- Google Chrome (latest version recommended)
- Active internet connection
- Access to pocketoption.com
- Minimum 512MB RAM available
- 50+ minutes initial warmup time

### Limitations

- Requires stable internet for price data
- Cannot predict news-driven market movements
- Performance varies by asset and market conditions
- Learning requires significant signal history (100+ signals for optimal weights)

## 🐛 Troubleshooting

### Panel Not Appearing

1. Refresh the pocketoption.com page
2. Check extension is enabled in `chrome://extensions/`
3. Verify host permissions include `pocketoption.com`

### No Signals Generated

1. Wait for warmup to complete (50 candles)
2. Check console for error messages (F12 Developer Tools)
3. Verify price data is being read from DOM
4. Confirm at least 35% confidence is reached

### Learning Data Lost

1. Check browser localStorage is enabled
2. Verify not browsing in Incognito mode
3. Check localStorage quota not exceeded

## 📝 Changelog

### v6.0.0 (2026-01-02)

**New Features:**
- Added 7 new indicators: OsMA, Momentum, PSAR, STC, Vortex, Aroon, Bears/Bulls Power, DeMarker
- Implemented historical multi-candle analysis (50-600 candles)
- Added support/resistance detection
- Added trend detection over 30-minute windows
- Added multi-candle pattern recognition
- Implemented per-indicator performance tracking
- Added regime-based weighting for all 15 indicators

**Improvements:**
- Removed fallback mode completely
- Enforce 35% minimum confidence threshold
- Learning system adjusts weights every 30 signals
- Enhanced UI with pattern display and indicator performance
- Improved analytics section with top 5 indicators

**Maintenance:**
- Updated to v6.0.0 version number across all files
- Maintained 100% Auto Trader compatibility
- Enhanced console logging for debugging

### v5.0.0 (Previous)
- Fixed critical bugs from v4.0
- Added Williams %R, CCI, Awesome Oscillator
- Improved error handling

## 📄 License

This project is provided "as is" without warranty of any kind.

## 👤 Author

Created by Claude Opus

## 🤝 Contributing

This is a private trading tool. Contributions are not currently accepted.

## 📧 Support

For issues or questions, check the console logs (F12) for error messages.
