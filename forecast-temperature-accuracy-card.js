/* Last modified: 24-Jan-2026 22:45 */
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

const CARD_VERSION = '1.2.0';
const STORAGE_KEY_PREFIX = 'forecast-temp-accuracy-';
const DEFAULT_HISTORY_DAYS = 7;
const DEFAULT_REFRESH_INTERVAL = 60; // minutes (hourly - forecasts aren't more granular)
const APEXCHARTS_CDN = 'https://cdn.jsdelivr.net/npm/apexcharts@3.45.1/dist/apexcharts.min.js';

// Tooltip text for card elements
const TOOLTIPS = {
  forecast: 'What the forecast says the current temperature is',
  actual: 'The actual temperature reading from your sensor',
  delta: 'The difference between forecast and actual. Positive (red) means forecast is too high, negative (blue) means too low, green means accurate (within 1 degree)',
  mae: 'Mean Absolute Error: The average difference between forecasts and actual readings, ignoring direction. Lower is better.',
  bias: 'Systematic forecast error direction. Positive means forecasts typically run too high, negative means too low.',
  accuracy: 'Percentage of forecasts that were within +/- 2 degrees of the actual temperature',
  trend: 'Compares recent 24h accuracy vs previous 24h. Shows if forecast accuracy is improving, degrading, or stable.',
  chart: 'Historical comparison: what the forecast claimed (orange) vs what the temperature actually was (blue)'
};

// Load ApexCharts library
let apexChartsLoaded = false;
let apexChartsLoading = false;
const apexChartsCallbacks = [];

function loadApexCharts() {
  return new Promise((resolve, reject) => {
    if (apexChartsLoaded && window.ApexCharts) {
      resolve(window.ApexCharts);
      return;
    }

    apexChartsCallbacks.push({ resolve, reject });

    if (apexChartsLoading) {
      return;
    }

    apexChartsLoading = true;

    const script = document.createElement('script');
    script.src = APEXCHARTS_CDN;
    script.async = true;

    script.onload = () => {
      apexChartsLoaded = true;
      apexChartsLoading = false;
      apexChartsCallbacks.forEach(cb => cb.resolve(window.ApexCharts));
      apexChartsCallbacks.length = 0;
    };

    script.onerror = (error) => {
      apexChartsLoading = false;
      apexChartsCallbacks.forEach(cb => cb.reject(error));
      apexChartsCallbacks.length = 0;
    };

    document.head.appendChild(script);
  });
}

class ForecastTemperatureAccuracyCard extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object },
      _currentForecast: { type: Number, state: true },
      _currentActual: { type: Number, state: true },
      _statistics: { type: Object, state: true },
      _loading: { type: Boolean, state: true },
      _error: { type: String, state: true },
      _chartReady: { type: Boolean, state: true }
    };
  }

  static get styles() {
    return css`
      :host {
        display: block;
      }

      ha-card {
        padding: 16px;
      }

      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }

      .card-title {
        font-size: 18px;
        font-weight: 500;
        color: var(--primary-text-color);
      }

      .refresh-btn {
        cursor: pointer;
        color: var(--secondary-text-color);
        opacity: 0.7;
        transition: opacity 0.2s;
      }

      .refresh-btn:hover {
        opacity: 1;
      }

      .current-comparison {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 16px;
        margin-bottom: 24px;
        text-align: center;
      }

      .value-box {
        padding: 12px;
        border-radius: 8px;
        background: var(--ha-card-background, var(--card-background-color));
        border: 1px solid var(--divider-color);
        cursor: help;
      }

      .value-label {
        font-size: 12px;
        color: var(--secondary-text-color);
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .value-number {
        font-size: 28px;
        font-weight: 600;
        color: var(--primary-text-color);
      }

      .value-unit {
        font-size: 14px;
        color: var(--secondary-text-color);
        margin-left: 2px;
      }

      .delta-positive {
        color: var(--error-color, #db4437);
      }

      .delta-negative {
        color: var(--info-color, #4285f4);
      }

      .delta-neutral {
        color: var(--success-color, #43a047);
      }

      .statistics-section {
        margin-top: 16px;
      }

      .statistics-header {
        font-size: 14px;
        font-weight: 500;
        color: var(--primary-text-color);
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--divider-color);
      }

      .stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .stat-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: var(--ha-card-background, var(--card-background-color));
        border-radius: 6px;
        border: 1px solid var(--divider-color);
        cursor: help;
      }

      .stat-label {
        font-size: 12px;
        color: var(--secondary-text-color);
      }

      .stat-value {
        font-size: 16px;
        font-weight: 500;
        color: var(--primary-text-color);
      }

      .trend-improving {
        color: var(--success-color, #43a047);
      }

      .trend-degrading {
        color: var(--error-color, #db4437);
      }

      .trend-stable {
        color: var(--secondary-text-color);
      }

      .chart-container {
        margin-top: 16px;
        min-height: 200px;
        position: relative;
      }

      .chart-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 200px;
        color: var(--secondary-text-color);
        font-size: 14px;
      }

      .loading {
        text-align: center;
        padding: 24px;
        color: var(--secondary-text-color);
      }

      .error {
        color: var(--error-color, #db4437);
        padding: 16px;
        text-align: center;
        background: rgba(219, 68, 55, 0.1);
        border-radius: 8px;
      }

      .source-info {
        font-size: 11px;
        color: var(--secondary-text-color);
        text-align: center;
        margin-top: 16px;
        opacity: 0.7;
      }

      .no-data {
        text-align: center;
        padding: 24px;
        color: var(--secondary-text-color);
      }
    `;
  }

  constructor() {
    super();
    this._currentForecast = null;
    this._currentActual = null;
    this._statistics = null;
    this._loading = true;
    this._error = null;
    this._lastFetch = 0;
    this._refreshTimer = null;
    this._chart = null;
    this._chartReady = false;
  }

  setConfig(config) {
    if (!config.temperature_sensor) {
      throw new Error('temperature_sensor is required');
    }

    // Validate that one forecast source is provided
    const hasCoordinates = config.latitude !== undefined && config.longitude !== undefined;
    const hasTempest = !!config.tempest_api_key && !!config.tempest_station_id;

    if (!hasCoordinates && !hasTempest) {
      throw new Error('A forecast source is required: latitude/longitude (Open-Meteo) or tempest_api_key/tempest_station_id (Tempest)');
    }

    this.config = {
      title: config.title || 'Forecast Temperature Accuracy',
      temperature_sensor: config.temperature_sensor,
      latitude: config.latitude,
      longitude: config.longitude,
      tempest_api_key: config.tempest_api_key || null,
      tempest_station_id: config.tempest_station_id || null,
      unit: config.unit || null, // null = auto from HA
      history_days: config.history_days || DEFAULT_HISTORY_DAYS,
      refresh_interval: config.refresh_interval || DEFAULT_REFRESH_INTERVAL,
      show_chart: config.show_chart !== false,
      chart_height: config.chart_height || 200
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this._startRefreshTimer();

    // Load ApexCharts library
    if (this.config?.show_chart) {
      loadApexCharts()
        .then(() => {
          this._chartReady = true;
        })
        .catch(err => {
          console.error('Failed to load ApexCharts:', err);
        });
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopRefreshTimer();
    this._destroyChart();
  }

  _startRefreshTimer() {
    this._stopRefreshTimer();
    const intervalMs = this.config.refresh_interval * 60 * 1000;
    this._refreshTimer = setInterval(() => this._fetchData(), intervalMs);
  }

  _stopRefreshTimer() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  _destroyChart() {
    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }
  }

  updated(changedProps) {
    if (changedProps.has('hass') && this.hass) {
      const now = Date.now();
      const intervalMs = this.config.refresh_interval * 60 * 1000;

      // Fetch data if enough time has passed or first load
      if (now - this._lastFetch > intervalMs || this._lastFetch === 0) {
        this._fetchData();
      } else {
        // Just update actual temperature from sensor
        this._updateActualTemperature();
      }
    }

    // Render chart after DOM update if we have data and chart is ready
    if ((changedProps.has('_statistics') || changedProps.has('_chartReady')) &&
        this._statistics && this._chartReady && this.config.show_chart) {
      this.updateComplete.then(() => {
        this._renderApexChart();
      });
    }
  }

  async _fetchData() {
    if (!this.hass || !this.config) return;

    this._loading = true;
    this._error = null;
    this._lastFetch = Date.now();

    try {
      // Get actual temperature from sensor
      this._updateActualTemperature();

      // Get forecast temperature from configured source
      if (this.config.tempest_api_key && this.config.tempest_station_id) {
        await this._fetchFromTempest();
      } else {
        await this._fetchFromOpenMeteo();
      }

      // Record the comparison if we have both values
      if (this._currentForecast !== null && this._currentActual !== null) {
        this._recordComparison();
      }

      // Calculate statistics from stored history
      this._calculateStatistics();

    } catch (error) {
      console.error('Forecast validation error:', error);
      this._error = error.message;
    } finally {
      this._loading = false;
    }
  }

  _updateActualTemperature() {
    const sensorState = this.hass.states[this.config.temperature_sensor];
    if (!sensorState) {
      throw new Error(`Sensor not found: ${this.config.temperature_sensor}`);
    }

    const value = parseFloat(sensorState.state);
    if (isNaN(value)) {
      throw new Error(`Invalid sensor state: ${sensorState.state}`);
    }

    // Convert if needed
    this._currentActual = this._normalizeTemperature(
      value,
      sensorState.attributes.unit_of_measurement
    );
  }

  async _fetchFromOpenMeteo() {
    const { latitude, longitude } = this.config;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&timezone=auto`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.current || data.current.temperature_2m === undefined) {
      throw new Error('Invalid Open-Meteo response - no current temperature');
    }

    // Get current temperature from Open-Meteo
    const currentTemp = data.current.temperature_2m;

    // Open-Meteo returns Celsius by default
    this._currentForecast = this._normalizeTemperature(currentTemp, 'C');
  }

  async _fetchFromTempest() {
    const { tempest_api_key, tempest_station_id } = this.config;

    // Request temperature in Fahrenheit (we'll convert as needed)
    const url = `https://swd.weatherflow.com/swd/rest/better_forecast?station_id=${tempest_station_id}&units_temp=f&units_wind=mph&units_pressure=hpa&units_precip=in&units_distance=mi&api_key=${tempest_api_key}`;

    const response = await fetch(url, {
      headers: {
        'accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Tempest API: Invalid API key');
      } else if (response.status === 404) {
        throw new Error('Tempest API: Station not found');
      }
      throw new Error(`Tempest API error: ${response.status}`);
    }

    const data = await response.json();

    // Check for API-level errors
    if (data.status && data.status.status_code !== 0) {
      throw new Error(`Tempest API: ${data.status.status_message || 'Unknown error'}`);
    }

    // Get hourly forecast array
    const hourlyForecast = data.forecast?.hourly;
    if (!hourlyForecast || hourlyForecast.length === 0) {
      throw new Error('Tempest API: No hourly forecast data available');
    }

    // Find the forecast entry for the current hour
    // The first entry is typically the current hour, but let's match by timestamp to be safe
    const now = Date.now();
    const currentHourTimestamp = Math.floor(now / 1000); // Current time in seconds

    // Find the hourly entry closest to current time (within an hour)
    let currentHourForecast = hourlyForecast[0]; // Default to first entry
    for (const hourly of hourlyForecast) {
      // Each entry has a 'time' field (unix timestamp in seconds)
      if (hourly.time && Math.abs(hourly.time - currentHourTimestamp) < 3600) {
        currentHourForecast = hourly;
        break;
      }
    }

    const forecastTemp = currentHourForecast.air_temperature;
    if (forecastTemp === undefined || forecastTemp === null) {
      throw new Error('Tempest API: No air_temperature in forecast');
    }

    // We requested Fahrenheit (units_temp=f), so normalize from F
    this._currentForecast = this._normalizeTemperature(forecastTemp, 'F');
  }

  _normalizeTemperature(value, sourceUnit) {
    const targetUnit = this._getDisplayUnit();

    if (sourceUnit === targetUnit) {
      return value;
    }

    // Convert between C and F
    if (sourceUnit === 'C' && targetUnit === 'F') {
      return (value * 9/5) + 32;
    } else if (sourceUnit === 'F' && targetUnit === 'C') {
      return (value - 32) * 5/9;
    }

    // Handle variations in unit strings
    const sourceNorm = (sourceUnit || '').toUpperCase().replace('DEG', '').trim();
    const targetNorm = targetUnit.toUpperCase();

    if (sourceNorm.includes('C') && targetNorm === 'F') {
      return (value * 9/5) + 32;
    } else if (sourceNorm.includes('F') && targetNorm === 'C') {
      return (value - 32) * 5/9;
    }

    return value;
  }

  _getDisplayUnit() {
    if (this.config.unit) {
      return this.config.unit.toUpperCase();
    }

    // Try to get from HA locale
    if (this.hass?.config?.unit_system?.temperature) {
      return this.hass.config.unit_system.temperature === 'F' ? 'F' : 'C';
    }

    return 'C';
  }

  _getUnitWithDegree() {
    const unit = this._getDisplayUnit();
    return `°${unit}`;
  }

  _getStorageKey() {
    return STORAGE_KEY_PREFIX + this.config.temperature_sensor.replace(/\./g, '_');
  }

  _loadHistory() {
    try {
      const key = this._getStorageKey();
      const stored = localStorage.getItem(key);
      console.log('[ForecastValidation] _loadHistory:', { key, hasData: !!stored });
      if (stored) {
        const data = JSON.parse(stored);

        // Migrate from old formats (v1.x) to v2.0 simple format
        // Old format had pending_forecasts or records with forecast as array/object
        // New format has records with forecast as a simple number
        if (data.pending_forecasts) {
          console.info('Migrating forecast history to v2.0 format - clearing old pending_forecasts data');
          return { records: [], last_updated: 0 };
        }

        // Check if records exist and first record has the old format (forecast is not a number)
        if (data.records && data.records.length > 0) {
          const firstRecord = data.records[0];
          if (typeof firstRecord.forecast !== 'number') {
            console.info('Migrating forecast history to v2.0 format - old record format detected');
            return { records: [], last_updated: 0 };
          }
        }

        console.log('[ForecastValidation] Loaded records:', data.records?.length || 0);
        return data;
      }
    } catch (e) {
      console.warn('Failed to load forecast history:', e);
    }
    return { records: [], last_updated: 0 };
  }

  _saveHistory(history) {
    try {
      const key = this._getStorageKey();
      localStorage.setItem(key, JSON.stringify(history));
      console.log('[ForecastValidation] _saveHistory:', { key, records: history.records?.length || 0 });
    } catch (e) {
      console.warn('Failed to save forecast history:', e);
    }
  }

  _recordComparison() {
    const history = this._loadHistory();
    const now = Date.now();

    // Avoid duplicate records within 80% of refresh interval (prevents double-recording on page refresh)
    const dedupWindowMs = this.config.refresh_interval * 60 * 1000 * 0.8;
    const recentCutoff = now - dedupWindowMs;
    const hasRecentRecord = history.records.some(r => r.timestamp > recentCutoff);

    console.log('[ForecastValidation] _recordComparison:', {
      forecast: this._currentForecast,
      actual: this._currentActual,
      hasRecentRecord,
      dedupWindowMs,
      existingRecords: history.records.length,
      storageKey: this._getStorageKey()
    });

    if (!hasRecentRecord && this._currentForecast !== null && this._currentActual !== null) {
      const delta = this._currentForecast - this._currentActual;

      history.records.push({
        timestamp: now,
        forecast: this._currentForecast,
        actual: this._currentActual,
        delta: delta
      });
      console.log('[ForecastValidation] Added new record, total:', history.records.length);
    } else {
      console.log('[ForecastValidation] Skipped recording:', {
        reason: hasRecentRecord ? 'recent record exists' : 'missing forecast/actual'
      });
    }

    // Prune old data beyond history_days
    const cutoffTime = now - (this.config.history_days * 24 * 60 * 60 * 1000);
    history.records = history.records.filter(r => r.timestamp > cutoffTime);

    history.last_updated = now;
    this._saveHistory(history);
  }

  _calculateStatistics() {
    const history = this._loadHistory();
    const records = history.records;

    if (records.length === 0) {
      this._statistics = {
        mae: null,
        bias: null,
        trend: 'stable',
        accuracy: null,
        recordCount: 0,
        recentRecords: []
      };
      return;
    }

    // Calculate MAE (Mean Absolute Error)
    const sumAbsError = records.reduce((sum, r) => sum + Math.abs(r.delta), 0);
    const mae = sumAbsError / records.length;

    // Calculate bias (average signed delta)
    // Positive = forecasts typically run high, Negative = run low
    const sumDelta = records.reduce((sum, r) => sum + r.delta, 0);
    const bias = sumDelta / records.length;

    // Calculate trend (compare recent 24h MAE vs previous 24h MAE)
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const twoDaysAgo = now - 48 * 60 * 60 * 1000;

    const recentRecords = records.filter(r => r.timestamp > oneDayAgo);
    const previousRecords = records.filter(r => r.timestamp > twoDaysAgo && r.timestamp <= oneDayAgo);

    let trend = 'stable';
    if (recentRecords.length >= 2 && previousRecords.length >= 2) {
      const recentMAE = recentRecords.reduce((s, r) => s + Math.abs(r.delta), 0) / recentRecords.length;
      const previousMAE = previousRecords.reduce((s, r) => s + Math.abs(r.delta), 0) / previousRecords.length;

      const diff = recentMAE - previousMAE;
      if (diff < -0.5) {
        trend = 'improving';
      } else if (diff > 0.5) {
        trend = 'degrading';
      }
    }

    // Calculate accuracy percentage (within 2 degrees = accurate)
    const accurateCount = records.filter(r => Math.abs(r.delta) <= 2).length;
    const accuracyPct = (accurateCount / records.length) * 100;

    this._statistics = {
      mae: mae,
      bias: bias,
      trend: trend,
      accuracy: accuracyPct,
      recordCount: records.length,
      recentRecords: records.slice(-168) // Last 168 records (7 days at hourly)
    };
  }

  _formatDelta(delta) {
    if (delta === null || delta === undefined) return '--';
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${delta.toFixed(1)}`;
  }

  _getDeltaClass(delta) {
    if (delta === null || delta === undefined) return '';
    if (Math.abs(delta) <= 1) return 'delta-neutral';
    return delta > 0 ? 'delta-positive' : 'delta-negative';
  }

  _handleRefresh() {
    this._fetchData();
  }

  _renderApexChart() {
    const chartContainer = this.shadowRoot?.querySelector('#apex-chart');
    if (!chartContainer || !window.ApexCharts || !this._statistics?.recentRecords) {
      return;
    }

    const records = this._statistics.recentRecords;
    if (records.length < 2) {
      return;
    }

    const unitWithDegree = this._getUnitWithDegree();

    // Prepare data series
    const forecastData = records.map(r => ({
      x: r.timestamp,
      y: parseFloat(r.forecast.toFixed(1))
    }));

    const actualData = records.map(r => ({
      x: r.timestamp,
      y: parseFloat(r.actual.toFixed(1))
    }));

    // Get computed styles for theming
    const computedStyle = getComputedStyle(this);
    const textColor = computedStyle.getPropertyValue('--primary-text-color').trim() || '#333';
    const secondaryTextColor = computedStyle.getPropertyValue('--secondary-text-color').trim() || '#666';
    const dividerColor = computedStyle.getPropertyValue('--divider-color').trim() || '#e0e0e0';

    // Calculate x-axis range based on history_days config
    const now = Date.now();
    const xAxisMin = now - (this.config.history_days * 24 * 60 * 60 * 1000);
    const xAxisMax = now;

    const options = {
      chart: {
        type: 'line',
        height: this.config.chart_height,
        fontFamily: 'inherit',
        background: 'transparent',
        toolbar: {
          show: false
        },
        zoom: {
          enabled: false
        },
        animations: {
          enabled: true,
          easing: 'easeinout',
          speed: 500
        }
      },
      series: [
        {
          name: 'Forecast',
          data: forecastData,
          color: '#FF9800'
        },
        {
          name: 'Actual',
          data: actualData,
          color: '#2196F3'
        }
      ],
      stroke: {
        curve: 'straight',
        width: 2
      },
      markers: {
        size: 0,
        hover: {
          size: 5
        }
      },
      xaxis: {
        type: 'datetime',
        min: xAxisMin,
        max: xAxisMax,
        labels: {
          datetimeUTC: false,
          style: {
            colors: secondaryTextColor,
            fontSize: '11px'
          },
          datetimeFormatter: {
            year: 'yyyy',
            month: "MMM 'yy",
            day: 'dd MMM',
            hour: 'HH:mm'
          }
        },
        axisBorder: {
          show: false
        },
        axisTicks: {
          show: false
        }
      },
      yaxis: {
        labels: {
          style: {
            colors: secondaryTextColor,
            fontSize: '11px'
          },
          formatter: (value) => `${value.toFixed(0)}${unitWithDegree}`
        }
      },
      grid: {
        borderColor: dividerColor,
        strokeDashArray: 3,
        xaxis: {
          lines: {
            show: false
          }
        }
      },
      tooltip: {
        theme: 'dark',
        x: {
          format: 'MMM dd, HH:mm'
        },
        y: {
          formatter: (value) => `${value.toFixed(1)}${unitWithDegree}`
        }
      },
      legend: {
        position: 'top',
        horizontalAlign: 'center',
        labels: {
          colors: textColor
        },
        markers: {
          width: 10,
          height: 10,
          radius: 2
        }
      }
    };

    // Destroy existing chart if any
    this._destroyChart();

    // Create new chart
    this._chart = new window.ApexCharts(chartContainer, options);
    this._chart.render();
  }

  render() {
    if (!this.config || !this.hass) {
      return html``;
    }

    if (this._loading && this._currentActual === null) {
      return html`
        <ha-card>
          <div class="loading">Loading forecast data...</div>
        </ha-card>
      `;
    }

    if (this._error) {
      return html`
        <ha-card>
          <div class="card-header">
            <span class="card-title">${this.config.title}</span>
          </div>
          <div class="error">${this._error}</div>
        </ha-card>
      `;
    }

    const unitWithDegree = this._getUnitWithDegree();
    const delta = this._currentForecast !== null && this._currentActual !== null
      ? this._currentForecast - this._currentActual
      : null;

    let source = 'Open-Meteo';
    if (this.config.tempest_api_key && this.config.tempest_station_id) {
      source = `Tempest (Station ${this.config.tempest_station_id})`;
    }

    return html`
      <ha-card>
        <div class="card-header">
          <span class="card-title">${this.config.title}</span>
          <ha-icon
            class="refresh-btn"
            icon="mdi:refresh"
            @click=${this._handleRefresh}
            title="Refresh forecast and actual data now"
          ></ha-icon>
        </div>

        <div class="current-comparison">
          <div class="value-box" title="${TOOLTIPS.forecast}">
            <div class="value-label">Forecast</div>
            <div class="value-number">
              ${this._currentForecast !== null ? this._currentForecast.toFixed(1) : '--'}
              <span class="value-unit">${unitWithDegree}</span>
            </div>
          </div>

          <div class="value-box" title="${TOOLTIPS.actual}">
            <div class="value-label">Actual</div>
            <div class="value-number">
              ${this._currentActual !== null ? this._currentActual.toFixed(1) : '--'}
              <span class="value-unit">${unitWithDegree}</span>
            </div>
          </div>

          <div class="value-box" title="${TOOLTIPS.delta}">
            <div class="value-label">Delta</div>
            <div class="value-number ${this._getDeltaClass(delta)}">
              ${this._formatDelta(delta)}
              <span class="value-unit">${unitWithDegree}</span>
            </div>
          </div>
        </div>

        ${this._statistics ? html`
          <div class="statistics-section">
            <div class="statistics-header">Accuracy Statistics (${this.config.history_days} days)</div>
            ${this._statistics.recordCount > 0 ? html`
              <div class="stats-grid">
                <div class="stat-item" title="${TOOLTIPS.mae}">
                  <span class="stat-label">Mean Abs Error</span>
                  <span class="stat-value">${this._statistics.mae !== null ? this._statistics.mae.toFixed(1) + unitWithDegree : '--'}</span>
                </div>

                <div class="stat-item" title="${TOOLTIPS.bias}">
                  <span class="stat-label">Bias</span>
                  <span class="stat-value ${this._getDeltaClass(this._statistics.bias)}">
                    ${this._statistics.bias !== null ? this._formatDelta(this._statistics.bias) + unitWithDegree : '--'}
                  </span>
                </div>

                <div class="stat-item" title="${TOOLTIPS.accuracy}">
                  <span class="stat-label">Accuracy (+/-2${unitWithDegree})</span>
                  <span class="stat-value">${this._statistics.accuracy !== null ? this._statistics.accuracy.toFixed(0) + '%' : '--'}</span>
                </div>

                <div class="stat-item" title="${TOOLTIPS.trend}">
                  <span class="stat-label">Trend</span>
                  <span class="stat-value trend-${this._statistics.trend}">
                    ${this._statistics.trend === 'improving' ? 'Improving' :
                      this._statistics.trend === 'degrading' ? 'Degrading' : 'Stable'}
                  </span>
                </div>
              </div>

              ${this.config.show_chart ? html`
                <div class="chart-container" title="${TOOLTIPS.chart}">
                  ${this._chartReady && this._statistics.recentRecords?.length >= 2 ? html`
                    <div id="apex-chart"></div>
                  ` : html`
                    <div class="chart-loading">
                      ${this._statistics.recentRecords?.length < 2
                        ? 'Waiting for more validated forecasts...'
                        : 'Loading chart...'}
                    </div>
                  `}
                </div>
              ` : ''}
            ` : html`
              <div class="no-data">
                No comparisons recorded yet. Data will appear after the first hourly refresh.
              </div>
            `}
          </div>
        ` : html`
          <div class="no-data">
            No historical data yet. Statistics will appear after collecting data over time.
          </div>
        `}

        <div class="source-info">
          ${source} | ${this._statistics?.recordCount || 0} comparisons | ${this.config.history_days} day history
          <br>
          Charting from ApexCharts
        </div>
      </ha-card>
    `;
  }

  getCardSize() {
    return this.config?.show_chart ? 6 : 4;
  }

  static getConfigElement() {
    return document.createElement('forecast-temperature-accuracy-card-editor');
  }

  static getStubConfig() {
    return {
      title: 'Forecast Temperature Accuracy',
      temperature_sensor: 'sensor.outdoor_temperature',
      latitude: 40.7128,
      longitude: -74.0060
    };
  }
}

// Visual Editor for the card
class ForecastTemperatureAccuracyCardEditor extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      _config: { type: Object, state: true }
    };
  }

  static get styles() {
    return css`
      :host {
        display: block;
        padding: 16px;
      }

      .card-config {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .section {
        margin-bottom: 16px;
      }

      h3 {
        margin: 0 0 12px 0;
        font-size: 16px;
        font-weight: 500;
        color: var(--primary-text-color);
        border-bottom: 1px solid var(--divider-color);
        padding-bottom: 8px;
      }

      ha-textfield,
      ha-selector {
        display: block;
        margin-bottom: 12px;
        width: 100%;
      }

      .toggle-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid var(--divider-color);
      }

      .toggle-row:last-child {
        border-bottom: none;
      }

      .toggle-row label {
        font-size: 14px;
        color: var(--primary-text-color);
      }

      .helper-text {
        font-size: 12px;
        color: var(--secondary-text-color);
        margin: 0 0 12px 0;
      }

      .source-toggle {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
      }

      .source-toggle button {
        flex: 1;
        padding: 8px 16px;
        border: 1px solid var(--divider-color);
        background: var(--card-background-color);
        color: var(--primary-text-color);
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      }

      .source-toggle button.active {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        border-color: var(--primary-color);
      }

      .source-toggle button:hover:not(.active) {
        background: var(--secondary-background-color);
      }

      .coordinates-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
    `;
  }

  setConfig(config) {
    this._config = config;
  }

  // Fire config-changed event
  _fireConfigChanged(newConfig) {
    const event = new CustomEvent('config-changed', {
      detail: { config: newConfig },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  _valueChanged(key, value) {
    if (!this._config) return;

    const newConfig = { ...this._config };

    if (value === '' || value === undefined) {
      delete newConfig[key];
    } else {
      newConfig[key] = value;
    }

    this._config = newConfig;
    this._fireConfigChanged(newConfig);
  }

  // Returns 'openmeteo' or 'tempest'
  _getSourceType() {
    // Check if property exists (not just truthy, since empty string is valid during editing)
    if ('tempest_api_key' in (this._config || {}) || 'tempest_station_id' in (this._config || {})) {
      return 'tempest';
    }
    return 'openmeteo';
  }

  _setSourceType(sourceType) {
    const newConfig = { ...this._config };

    // Clear all source-specific fields first
    delete newConfig.latitude;
    delete newConfig.longitude;
    delete newConfig.tempest_api_key;
    delete newConfig.tempest_station_id;

    if (sourceType === 'tempest') {
      newConfig.tempest_api_key = '';
      newConfig.tempest_station_id = '';
    } else {
      // Open-Meteo
      newConfig.latitude = 0;
      newConfig.longitude = 0;
    }

    this._config = newConfig;
    this._fireConfigChanged(newConfig);
  }

  render() {
    if (!this._config || !this.hass) {
      return html``;
    }

    const sourceType = this._getSourceType();

    return html`
      <div class="card-config">
        ${this._renderBasicSettings()}
        ${this._renderDataSource(sourceType)}
        ${this._renderDisplayOptions()}
        ${this._renderAdvancedSettings()}
      </div>
    `;
  }

  _renderBasicSettings() {
    return html`
      <div class="section">
        <h3>Basic Settings</h3>

        <ha-textfield
          label="Card Title"
          .value=${this._config.title || 'Forecast Temperature Accuracy'}
          @input=${(e) => this._valueChanged('title', e.target.value)}
        ></ha-textfield>

        <ha-selector
          .hass=${this.hass}
          .selector=${{ entity: { domain: 'sensor', device_class: 'temperature' } }}
          .value=${this._config.temperature_sensor || ''}
          .label=${'Temperature Sensor'}
          .required=${true}
          @value-changed=${(e) => this._valueChanged('temperature_sensor', e.detail.value)}
        ></ha-selector>
        <p class="helper-text">Select the sensor that measures actual outdoor temperature</p>
      </div>
    `;
  }

  _renderDataSource(sourceType) {
    return html`
      <div class="section">
        <h3>Forecast Source</h3>

        <div class="source-toggle">
          <button
            class=${sourceType === 'openmeteo' ? 'active' : ''}
            @click=${() => this._setSourceType('openmeteo')}
          >
            Open-Meteo
          </button>
          <button
            class=${sourceType === 'tempest' ? 'active' : ''}
            @click=${() => this._setSourceType('tempest')}
          >
            Tempest
          </button>
        </div>

        ${sourceType === 'tempest' ? html`
          <ha-textfield
            label="Tempest API Key"
            type="password"
            .value=${this._config.tempest_api_key || ''}
            @input=${(e) => this._valueChanged('tempest_api_key', e.target.value)}
          ></ha-textfield>

          <ha-textfield
            label="Tempest Station ID"
            .value=${this._config.tempest_station_id || ''}
            @input=${(e) => this._valueChanged('tempest_station_id', e.target.value)}
          ></ha-textfield>
          <p class="helper-text">Enter your Tempest API key and station ID from tempestwx.com</p>
        ` : html`
          <div class="coordinates-row">
            <ha-textfield
              label="Latitude"
              type="number"
              step="0.0001"
              .value=${this._config.latitude ?? ''}
              @input=${(e) => this._valueChanged('latitude', e.target.value ? parseFloat(e.target.value) : undefined)}
            ></ha-textfield>

            <ha-textfield
              label="Longitude"
              type="number"
              step="0.0001"
              .value=${this._config.longitude ?? ''}
              @input=${(e) => this._valueChanged('longitude', e.target.value ? parseFloat(e.target.value) : undefined)}
            ></ha-textfield>
          </div>
          <p class="helper-text">Enter coordinates for Open-Meteo forecast data</p>
        `}
      </div>
    `;
  }

  _renderDisplayOptions() {
    return html`
      <div class="section">
        <h3>Display Options</h3>

        <ha-selector
          .hass=${this.hass}
          .selector=${{ select: { options: [
            { value: '', label: 'Auto (from HA settings)' },
            { value: 'C', label: 'Celsius' },
            { value: 'F', label: 'Fahrenheit' }
          ]}}}
          .value=${this._config.unit || ''}
          .label=${'Temperature Unit'}
          @value-changed=${(e) => this._valueChanged('unit', e.detail.value || null)}
        ></ha-selector>

        <div class="toggle-row">
          <label>Show History Chart</label>
          <ha-switch
            .checked=${this._config.show_chart !== false}
            @change=${(e) => this._valueChanged('show_chart', e.target.checked)}
          ></ha-switch>
        </div>

        ${this._config.show_chart !== false ? html`
          <ha-textfield
            label="Chart Height (pixels)"
            type="number"
            min="100"
            max="400"
            .value=${this._config.chart_height ?? 200}
            @input=${(e) => this._valueChanged('chart_height', e.target.value ? parseInt(e.target.value) : 200)}
          ></ha-textfield>
        ` : ''}
      </div>
    `;
  }

  _renderAdvancedSettings() {
    return html`
      <div class="section">
        <h3>Advanced Settings</h3>

        <ha-textfield
          label="History Days"
          type="number"
          min="1"
          max="30"
          .value=${this._config.history_days ?? DEFAULT_HISTORY_DAYS}
          @input=${(e) => this._valueChanged('history_days', e.target.value ? parseInt(e.target.value) : DEFAULT_HISTORY_DAYS)}
          helper-text="Days of history to retain for statistics (1-30)"
        ></ha-textfield>

        <ha-textfield
          label="Refresh Interval (minutes)"
          type="number"
          min="5"
          max="60"
          .value=${this._config.refresh_interval ?? DEFAULT_REFRESH_INTERVAL}
          @input=${(e) => this._valueChanged('refresh_interval', e.target.value ? parseInt(e.target.value) : DEFAULT_REFRESH_INTERVAL)}
          helper-text="How often to fetch new data (5-60 minutes)"
        ></ha-textfield>
      </div>
    `;
  }
}

// Register custom elements
if (!customElements.get('forecast-temperature-accuracy-card-editor')) {
  customElements.define('forecast-temperature-accuracy-card-editor', ForecastTemperatureAccuracyCardEditor);
}

if (!customElements.get('forecast-temperature-accuracy-card')) {
  customElements.define('forecast-temperature-accuracy-card', ForecastTemperatureAccuracyCard);
}

// Register with Home Assistant card picker
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'forecast-temperature-accuracy-card',
  name: 'Forecast Temperature Accuracy Card',
  description: 'Compare weather forecasts with actual temperature readings and track accuracy'
});

console.info(
  `%c FORECAST-TEMPERATURE-ACCURACY-CARD %c v${CARD_VERSION} `,
  'color: cyan; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray'
);
