# SYLVASENSE — Predictive Forest Intelligence Network

**By ZENVORA | Google Startup Buildathon India 2026**  
*"Detect the signals. Protect the forests."*

SylvaSense is an environmental intelligence prototype combining Sentinel-2 NDVI spectral analysis, multi-signal environmental fusion, configurable disturbance risk scoring, interactive geospatial monitoring (Western Ghats, Tamil Nadu & Kerala), investigation case management, and server-side Google Gemini synthesis.

> **Demo & Ground-Truth Notice:** External satellite, weather, and LoRaWAN sensor feeds operate in clearly labeled **DEMO DATA** mode with sample Western Ghats coordinates unless live credentials are configured. Calculated disturbance risk scores represent statistical environmental anomalies requiring field verification—never unverified claims of illegal logging.

## Architecture Overview

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Leaflet (OpenStreetMap / CartoDB / Esri Satellite layers), Recharts, Lucide icons.
- **Backend**: Node.js + Express (`server.ts`) exposing typed REST endpoints under `/api/*`, persisting state to `data/sylvasense-store.json`.
- **Geospatial & Integration Services**:
  - `server/services/dataSourceManager.ts`: Central Data-Source Status Manager tracking `Live`, `Demo`, `Disconnected`, and `Error` states with live connection tests (`/api/datasources/:id/test`, `/api/datasources/test-all`).
  - `server/services/copernicus.ts`: Backend Copernicus Data Space Ecosystem (CDSE) OAuth2 + Sentinel-2 L2A STAC catalog adapter (`/api/regions/:regionId/sync-satellite`) with graceful demo fallback.
  - `server/services/openweather.ts`: Backend OpenWeather REST integration (`/api/regions/:regionId/sync-weather`) with graceful demo fallback.
  - `backend/main.py` & `backend/services/gee_auth.py`: FastAPI Google Earth Engine authentication module reading `GEE_SERVICE_ACCOUNT_JSON` and `GEE_PROJECT_ID` to initialize `earthengine-api` securely (`GET /api/gee/health`).
  - `server/services/geeAdapter.ts`: Active server-side GEE OAuth2 + Earth Engine project verification (`/api/gee/health`) paired with a local spherical polygon + Sentinel-2 Band B8/B4 fallback geospatial pipeline.
  - `server/services/ndvi.ts`: Sentinel-2 `NDVI = (B8_NIR - B4_RED) / (B8_NIR + B4_RED)` calculation with atmospheric cloud-mask reliability checks.
  - `server/services/signalFusion.ts`: Multi-signal fusion across 6 modalities with explicit missing-sensor neutrality.
  - `server/services/riskEngine.ts`: Transparent, configurable weighted scoring model (`Low risk`, `Moderate risk`, `High priority`, `Critical priority`).
  - `server/services/geminiAnalyst.ts`: Server-side `@google/genai` integration (`gemini-4-hydrogen`) enforcing structured JSON output grounded strictly in live application telemetry.

## Environment Variables & Live Connectors

All existing dashboard features (command centre, interactive map, NDVI calculator, risk engine, environmental signals, alert investigations) work out of the box in **DEMO DATA** mode without external credentials.

- `GEMINI_API_KEY`: Enables **Sylva Intelligence Analyst** server-side synthesis (`gemini-4-hydrogen`).
- `COPERNICUS_CLIENT_ID` & `COPERNICUS_CLIENT_SECRET`: Enables live Copernicus Sentinel-2 L2A STAC catalog queries.
- `OPENWEATHER_API_KEY`: Enables live OpenWeather temperature and precipitation syncing per region.
- `GEE_SERVICE_ACCOUNT_JSON` & `GEE_PROJECT_ID` *(Optional)*: Enables Google Earth Engine service-account authentication (`earthengine-api` in FastAPI / Earth Engine REST probe in Express); when unset, the local fallback geospatial pipeline handles all NDVI and polygon analytics.
3. Start development server (port 3000):
   ```bash
   npm run dev
   ```
4. Type-check and build for production:
   ```bash
   npm run lint
   npm run build
   npm start
   ```
