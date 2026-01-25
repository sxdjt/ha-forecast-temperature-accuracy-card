# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-01-24

### Added

- Tempest API support as third forecast source option
- Three-way source toggle in visual editor (Open-Meteo / HA Weather / Tempest)
- Configuration options: `tempest_api_key` and `tempest_station_id`

### Fixed

- Editor source toggle now properly updates UI when switching between sources

## [1.0.0] - 2025-01-21

- Initial release
- ApexCharts integration for dual-line history graph (forecast vs actual)
- Automatic data migration from v1.x format
- Basic forecast vs actual temperature comparison
- Configurable history days and refresh interval
- Default refresh interval set to 60 minutes (hourly)
- localStorage data structure updated for new comparison model
- localStorage for historical data persistence
- Open-Meteo API integration for forecast data
- Simplified to instant comparison model (forecast vs actual at same moment)
- Single-file LitElement card with CDN imports
- Statistics display: MAE, Bias, Accuracy percentage, Trend analysis
- Support for Home Assistant weather entities as forecast source
- Temperature unit selection (Celsius/Fahrenheit/Auto)
- Tooltips on all UI elements
- Visual editor for all configuration options

