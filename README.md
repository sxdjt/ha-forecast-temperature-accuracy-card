# Forecast Validation Card

![GitHub Release](https://img.shields.io/github/v/release/sxdjt/ha-forecast-temperature-accuracy-card?style=for-the-badge)
[![AI Assisted](https://img.shields.io/badge/AI-Claude%20Code-AAAAAA.svg?style=for-the-badge)](https://claude.ai/code)
![GitHub License](https://img.shields.io/github/license/sxdjt/ha-forecast-temperature-accuracy-card?style=for-the-badge)

A custom Lovelace card for Home Assistant that compares forecast temperatures with actual sensor readings and tracks forecast accuracy over time.

## Features

- Compare what the forecast says the temperature is vs what it actually is
- Track forecast accuracy over configurable time periods
- Calculate and display:
  - Current delta (forecast vs actual)
  - Mean Absolute Error (MAE)
  - Forecast bias direction
  - Accuracy trends (improving/stable/degrading)
- Interactive [ApexCharts](https://github.com/RomRider/apexcharts-card) graph comparing forecast vs actual temperatures
- Historical data stored in browser localStorage

## Installation

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=sxdjt&repository=ha-forecast-temperature-accuracy-card)

## Configuration

### Basic Configuration (Open-Meteo)

```yaml
type: custom:forecast-validation-card
title: Forecast Accuracy
temperature_sensor: sensor.outdoor_temperature
latitude: 48.60
longitude: -93.40
```

### Using A Home Assistant Weather Entity

```yaml
type: custom:forecast-validation-card
title: Forecast Accuracy
temperature_sensor: sensor.outdoor_temperature
weather_entity: weather.home
```

### Full Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | string | **Required** | Must be `custom:forecast-validation-card` |
| `title` | string | `Forecast Validation` | Card title |
| `chart_height` | number | `200` | Height of the chart in pixels |
| `history_days` | number | `7` | Days of history to retain for statistics |
| `latitude` | number | - | Latitude for Open-Meteo API (required if no weather_entity) |
| `longitude` | number | - | Longitude for Open-Meteo API (required if no weather_entity) |
| `refresh_interval` | number | `60` | Minutes between data refreshes (hourly recommended) |
| `show_chart` | boolean | `true` | Show the ApexCharts history graph |
| `temperature_sensor` | string | **Required** | Entity ID of your actual temperature sensor |
| `unit` | string | auto | Temperature unit: `C` (Celsius) or `F` (Fahrenheit). Auto-detects from HA settings if not specified. |
| `weather_entity` | string | - | HA weather entity to get forecast from |

## How It Works

Every hour (by default), the card:

1. Gets what the forecast source says the current temperature is
2. Gets the actual temperature from your sensor
3. Records the comparison (forecast, actual, delta)
4. Updates statistics based on all recorded comparisons

This answers the question: "When the forecast says it's X degrees, is it actually X degrees?"

## User Interface

### Current Values

- **Forecast**: What the forecast source claims the temperature is right now
- **Actual**: The actual reading from your temperature sensor
- **Delta**: The difference (forecast - actual)
  - Positive (red): Forecast is higher than actual
  - Negative (blue): Forecast is lower than actual
  - Near zero (green): Forecast is accurate

### History Chart

The chart shows:
- **Orange line**: What the forecast claimed the temperature was
- **Blue line**: What the temperature actually was

The gap between lines shows forecast error at each point in time.

## Statistics Explained

### Mean Absolute Error (MAE)

The average of the absolute differences between forecasts and actuals. Lower is better. This tells you how far off forecasts typically are, regardless of direction.

### Bias

The average signed difference:
- **Positive**: Forecasts tend to run high (predicting warmer than reality)
- **Negative**: Forecasts tend to run low (predicting cooler than reality)
- **Near zero**: No systematic bias

### Accuracy

Percentage of forecasts that were within +/-2 degrees of actual temperature.

### Trend

Compares recent 24h accuracy vs previous 24h:
- **Improving**: Recent forecasts are more accurate
- **Degrading**: Recent forecasts are less accurate
- **Stable**: No significant change

## Data Storage

Historical data is stored in browser localStorage with the key format:
```
forecast-validation-{sensor_entity_id}
```

Data is automatically pruned to keep only records within the configured `history_days` period.

NOTE: Since data is stored in browser localStorage, statistics are per-browser. If you access Home Assistant from multiple devices, each will maintain its own history.

## Troubleshooting

### No data showing

The card records comparisons hourly. Wait at least one hour for the first data point to appear.

### "No current temperature available from weather entity"

Your weather entity may not provide current temperature data. Try using Open-Meteo instead by specifying latitude/longitude.

### Statistics not calculating

Statistics require at least one recorded comparison. Check back after data has been collected.

## Requirements

- Home Assistant 2023.1 or later
- A temperature sensor entity (for actual readings)
- Either a weather entity OR latitude/longitude for Open-Meteo

## License

MIT License - see LICENSE file for details.
