import fs from 'node:fs';
import path from 'node:path';
import type {
  Alert,
  AuditLog,
  DataSourceStatus,
  EnvironmentalSignal,
  EvidenceRecord,
  Investigation,
  MonitoringRegion,
  RiskAssessment,
  RiskWeights,
  SatelliteObservation,
  SystemSnapshot,
  User,
  VegetationIndexSummary,
} from '../src/types/sylvasense.ts';
import { computeSentinel2Ndvi } from './services/ndvi.ts';
import { DEFAULT_RISK_WEIGHTS, evaluateRegionRisk } from './services/riskEngine.ts';
import { dataSourceManager } from './services/dataSourceManager.ts';
import { fetchRegionSentinel2Scene } from './services/copernicus.ts';
import { syncRegionWeatherSignals } from './services/openweather.ts';
import { runFallbackGeospatialPipeline } from './services/geeAdapter.ts';

interface PersistedState {
  users: User[];
  regions: MonitoringRegion[];
  observations: SatelliteObservation[];
  vegetationIndices: VegetationIndexSummary[];
  signals: EnvironmentalSignal[];
  riskWeights: RiskWeights;
  assessments: RiskAssessment[];
  alerts: Alert[];
  investigations: Investigation[];
  evidence: EvidenceRecord[];
  auditLogs: AuditLog[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'sylvasense-store.json');

function buildSeedState(): PersistedState {
  const users: User[] = [
    {
      id: 'usr-1',
      name: 'Dr. Kavitha Subramanian',
      role: 'Chief Forest Conservator',
      division: 'Western Ghats Biosphere Circle',
      email: 'k.subramanian@sylvasense.demo',
    },
    {
      id: 'usr-2',
      name: 'Arjun Menon',
      role: 'Range Officer',
      division: 'Nilgiris South & Mukurthi Beat',
      email: 'a.menon@sylvasense.demo',
    },
    {
      id: 'usr-3',
      name: 'Meera Nair',
      role: 'GIS Analyst',
      division: 'Palakkad & Wayanad Remote Sensing Cell',
      email: 'm.nair@sylvasense.demo',
    },
    {
      id: 'usr-4',
      name: 'Raghavan Iyer',
      role: 'Ecological Researcher',
      division: 'Anamalai Canopy Dynamics Lab',
      email: 'r.iyer@sylvasense.demo',
    },
  ];

  const regions: MonitoringRegion[] = [
    {
      id: 'reg-nilgiri',
      code: 'WG-TN-01',
      name: 'Nilgiri Shola-Grassland Mosaic',
      state: 'Tamil Nadu',
      district: 'The Nilgiris',
      biome: 'Montane Shola & Wet Evergreen',
      areaHectares: 42800,
      centerLat: 11.4102,
      centerLng: 76.695,
      boundary: [
        [11.465, 76.635],
        [11.472, 76.752],
        [11.368, 76.768],
        [11.352, 76.642],
      ],
      isSampleCoordinate: true,
      assignedOfficer: 'Arjun Menon',
      lastPassDate: '2026-11-12T05:18:00Z',
      coveragePercent: 94.2,
    },
    {
      id: 'reg-anamalai',
      code: 'WG-TN-02',
      name: 'Anamalai Valparai Corridor',
      state: 'Tamil Nadu',
      district: 'Coimbatore',
      biome: 'Tropical Wet Evergreen',
      areaHectares: 38400,
      centerLat: 10.3269,
      centerLng: 76.951,
      boundary: [
        [10.382, 76.892],
        [10.391, 77.015],
        [10.275, 77.022],
        [10.268, 76.898],
      ],
      isSampleCoordinate: true,
      assignedOfficer: 'Raghavan Iyer',
      lastPassDate: '2026-11-11T05:22:00Z',
      coveragePercent: 89.6,
    },
    {
      id: 'reg-silentvalley',
      code: 'WG-KL-01',
      name: 'Silent Valley Core Buffer',
      state: 'Kerala',
      district: 'Palakkad',
      biome: 'Unbroken Dipterocarp Evergreen',
      areaHectares: 23750,
      centerLat: 11.063,
      centerLng: 76.447,
      boundary: [
        [11.115, 76.395],
        [11.118, 76.498],
        [11.012, 76.505],
        [11.009, 76.402],
      ],
      isSampleCoordinate: true,
      assignedOfficer: 'Meera Nair',
      lastPassDate: '2026-11-12T05:19:00Z',
      coveragePercent: 97.4,
    },
    {
      id: 'reg-wayanad',
      code: 'WG-KL-02',
      name: 'Wayanad Kabini Boundary',
      state: 'Kerala',
      district: 'Wayanad',
      biome: 'Moist Deciduous & Bamboo',
      areaHectares: 34400,
      centerLat: 11.7215,
      centerLng: 76.214,
      boundary: [
        [11.775, 76.158],
        [11.782, 76.272],
        [11.668, 76.278],
        [11.662, 76.165],
      ],
      isSampleCoordinate: true,
      assignedOfficer: 'Meera Nair',
      lastPassDate: '2026-11-10T05:24:00Z',
      coveragePercent: 91.8,
    },
    {
      id: 'reg-periyar',
      code: 'WG-KL-03',
      name: 'Periyar-Cardamom Ridge',
      state: 'Kerala',
      district: 'Idukki',
      biome: 'Semi-Evergreen Montane',
      areaHectares: 49200,
      centerLat: 9.4622,
      centerLng: 77.2368,
      boundary: [
        [9.524, 77.172],
        [9.528, 77.298],
        [9.401, 77.304],
        [9.398, 77.178],
      ],
      isSampleCoordinate: true,
      assignedOfficer: 'Dr. Kavitha Subramanian',
      lastPassDate: '2026-11-12T05:15:00Z',
      coveragePercent: 78.5,
    },
    {
      id: 'reg-kmtr',
      code: 'WG-TN-03',
      name: 'Kalakad-Mundanthurai Core',
      state: 'Tamil Nadu',
      district: 'Tirunelveli',
      biome: 'Southern Wet Evergreen',
      areaHectares: 51600,
      centerLat: 8.647,
      centerLng: 77.319,
      boundary: [
        [8.712, 77.252],
        [8.716, 77.386],
        [8.582, 77.392],
        [8.579, 77.258],
      ],
      isSampleCoordinate: true,
      assignedOfficer: 'Arjun Menon',
      lastPassDate: '2026-11-12T05:14:00Z',
      coveragePercent: 96.1,
    },
  ];

  const rawObs: Array<{
    id: string;
    regionId: string;
    tileId: string;
    acquiredAt: string;
    cloudCoverPercent: number;
    bandB4Red: number;
    bandB8Nir: number;
    qualityFlag: SatelliteObservation['qualityFlag'];
    notes: string;
  }> = [
    {
      id: 'obs-nil-1',
      regionId: 'reg-nilgiri',
      tileId: 'T43PFR-20261018',
      acquiredAt: '2026-10-18T05:18:00Z',
      cloudCoverPercent: 6.4,
      bandB4Red: 0.052,
      bandB8Nir: 0.445,
      qualityFlag: 'nominal',
      notes: 'Baseline dense shola canopy reflectance (simulated Sentinel-2 L2A sample).',
    },
    {
      id: 'obs-nil-2',
      regionId: 'reg-nilgiri',
      tileId: 'T43PFR-20261112',
      acquiredAt: '2026-11-12T05:18:00Z',
      cloudCoverPercent: 8.2,
      bandB4Red: 0.128,
      bandB8Nir: 0.312,
      qualityFlag: 'nominal',
      notes: 'Significant red reflectance increase along ridge sector; requires field verification.',
    },
    {
      id: 'obs-ana-1',
      regionId: 'reg-anamalai',
      tileId: 'T43PFQ-20261016',
      acquiredAt: '2026-10-16T05:22:00Z',
      cloudCoverPercent: 11.0,
      bandB4Red: 0.058,
      bandB8Nir: 0.422,
      qualityFlag: 'nominal',
      notes: 'Post-monsoon canopy baseline along Valparai buffer.',
    },
    {
      id: 'obs-ana-2',
      regionId: 'reg-anamalai',
      tileId: 'T43PFQ-20261111',
      acquiredAt: '2026-11-11T05:22:00Z',
      cloudCoverPercent: 14.5,
      bandB4Red: 0.104,
      bandB8Nir: 0.335,
      qualityFlag: 'haze_corrected',
      notes: 'Moderate-high canopy reflectance shift over eastern compartment.',
    },
    {
      id: 'obs-sil-1',
      regionId: 'reg-silentvalley',
      tileId: 'T43PFR-20261112',
      acquiredAt: '2026-11-12T05:19:00Z',
      cloudCoverPercent: 4.1,
      bandB4Red: 0.044,
      bandB8Nir: 0.468,
      qualityFlag: 'nominal',
      notes: 'High canopy density; zero disturbance signature.',
    },
    {
      id: 'obs-way-1',
      regionId: 'reg-wayanad',
      tileId: 'T43PFR-20261110',
      acquiredAt: '2026-11-10T05:24:00Z',
      cloudCoverPercent: 9.8,
      bandB4Red: 0.098,
      bandB8Nir: 0.338,
      qualityFlag: 'nominal',
      notes: 'Localized canopy thinning along Kabini northern fringe.',
    },
    {
      id: 'obs-per-1',
      regionId: 'reg-periyar',
      tileId: 'T43PFP-20261112',
      acquiredAt: '2026-11-12T05:15:00Z',
      cloudCoverPercent: 34.6,
      bandB4Red: 0.088,
      bandB8Nir: 0.368,
      qualityFlag: 'partial_cloud',
      notes: 'Partial orographic cloud deck over western ridge; QA60 mask applied.',
    },
    {
      id: 'obs-kmtr-1',
      regionId: 'reg-kmtr',
      tileId: 'T43PGP-20261112',
      acquiredAt: '2026-11-12T05:14:00Z',
      cloudCoverPercent: 5.5,
      bandB4Red: 0.049,
      bandB8Nir: 0.452,
      qualityFlag: 'nominal',
      notes: 'Stable evergreen canopy reflectance across core reserve.',
    },
  ];

  const observations: SatelliteObservation[] = rawObs.map((o) => ({
    id: o.id,
    regionId: o.regionId,
    sensor: 'Sentinel-2B MSI (Sample L2A)',
    tileId: o.tileId,
    acquiredAt: o.acquiredAt,
    cloudCoverPercent: o.cloudCoverPercent,
    bandB4Red: o.bandB4Red,
    bandB8Nir: o.bandB8Nir,
    calculatedNdvi: computeSentinel2Ndvi({
      bandB4Red: o.bandB4Red,
      bandB8Nir: o.bandB8Nir,
      cloudCoverPercent: o.cloudCoverPercent,
    }).ndvi,
    qualityFlag: o.qualityFlag,
    dataMode: 'simulated',
    notes: o.notes,
  }));

  const vegetationIndices: VegetationIndexSummary[] = [
    {
      id: 'vi-nilgiri',
      regionId: 'reg-nilgiri',
      previousDate: '2026-10-18',
      currentDate: '2026-11-12',
      previousNdvi: 0.791,
      currentNdvi: 0.418,
      deltaNdvi: -0.373,
      changePercent: -47.2,
      persistencePasses: 4,
      affectedAreaHectares: 18.4,
      hotspotLat: 11.4188,
      hotspotLng: 76.7062,
      timeSeries: [
        { date: '2026-09-28', ndvi: 0.802, baselineNdvi: 0.795, cloudCoverPercent: 9, b4Red: 0.049, b8Nir: 0.446, status: 'nominal' },
        { date: '2026-10-08', ndvi: 0.796, baselineNdvi: 0.795, cloudCoverPercent: 7, b4Red: 0.051, b8Nir: 0.447, status: 'nominal' },
        { date: '2026-10-18', ndvi: 0.791, baselineNdvi: 0.794, cloudCoverPercent: 6, b4Red: 0.052, b8Nir: 0.445, status: 'nominal' },
        { date: '2026-10-28', ndvi: 0.614, baselineNdvi: 0.790, cloudCoverPercent: 11, b4Red: 0.088, b8Nir: 0.368, status: 'suspicious_drop' },
        { date: '2026-11-02', ndvi: 0.522, baselineNdvi: 0.788, cloudCoverPercent: 10, b4Red: 0.106, b8Nir: 0.338, status: 'suspicious_drop' },
        { date: '2026-11-07', ndvi: 0.451, baselineNdvi: 0.786, cloudCoverPercent: 9, b4Red: 0.121, b8Nir: 0.320, status: 'suspicious_drop' },
        { date: '2026-11-12', ndvi: 0.418, baselineNdvi: 0.785, cloudCoverPercent: 8, b4Red: 0.128, b8Nir: 0.312, status: 'suspicious_drop' },
      ],
    },
    {
      id: 'vi-anamalai',
      regionId: 'reg-anamalai',
      previousDate: '2026-10-16',
      currentDate: '2026-11-11',
      previousNdvi: 0.758,
      currentNdvi: 0.526,
      deltaNdvi: -0.232,
      changePercent: -30.6,
      persistencePasses: 3,
      affectedAreaHectares: 11.2,
      hotspotLat: 10.3382,
      hotspotLng: 76.9684,
      timeSeries: [
        { date: '2026-09-26', ndvi: 0.764, baselineNdvi: 0.760, cloudCoverPercent: 12, b4Red: 0.056, b8Nir: 0.419, status: 'nominal' },
        { date: '2026-10-06', ndvi: 0.760, baselineNdvi: 0.759, cloudCoverPercent: 14, b4Red: 0.057, b8Nir: 0.418, status: 'nominal' },
        { date: '2026-10-16', ndvi: 0.758, baselineNdvi: 0.758, cloudCoverPercent: 11, b4Red: 0.058, b8Nir: 0.422, status: 'nominal' },
        { date: '2026-10-26', ndvi: 0.642, baselineNdvi: 0.755, cloudCoverPercent: 16, b4Red: 0.081, b8Nir: 0.371, status: 'suspicious_drop' },
        { date: '2026-11-05', ndvi: 0.568, baselineNdvi: 0.752, cloudCoverPercent: 15, b4Red: 0.096, b8Nir: 0.349, status: 'suspicious_drop' },
        { date: '2026-11-11', ndvi: 0.526, baselineNdvi: 0.750, cloudCoverPercent: 14, b4Red: 0.104, b8Nir: 0.335, status: 'suspicious_drop' },
      ],
    },
    {
      id: 'vi-silentvalley',
      regionId: 'reg-silentvalley',
      previousDate: '2026-10-18',
      currentDate: '2026-11-12',
      previousNdvi: 0.824,
      currentNdvi: 0.828,
      deltaNdvi: 0.004,
      changePercent: 0.5,
      persistencePasses: 0,
      affectedAreaHectares: 0,
      hotspotLat: 11.063,
      hotspotLng: 76.447,
      timeSeries: [
        { date: '2026-09-28', ndvi: 0.819, baselineNdvi: 0.815, cloudCoverPercent: 8, b4Red: 0.046, b8Nir: 0.462, status: 'nominal' },
        { date: '2026-10-18', ndvi: 0.824, baselineNdvi: 0.818, cloudCoverPercent: 6, b4Red: 0.045, b8Nir: 0.466, status: 'nominal' },
        { date: '2026-11-02', ndvi: 0.826, baselineNdvi: 0.819, cloudCoverPercent: 5, b4Red: 0.044, b8Nir: 0.465, status: 'nominal' },
        { date: '2026-11-12', ndvi: 0.828, baselineNdvi: 0.820, cloudCoverPercent: 4, b4Red: 0.044, b8Nir: 0.468, status: 'nominal' },
      ],
    },
    {
      id: 'vi-wayanad',
      regionId: 'reg-wayanad',
      previousDate: '2026-10-15',
      currentDate: '2026-11-10',
      previousNdvi: 0.731,
      currentNdvi: 0.550,
      deltaNdvi: -0.181,
      changePercent: -24.8,
      persistencePasses: 2,
      affectedAreaHectares: 7.6,
      hotspotLat: 11.7341,
      hotspotLng: 76.2285,
      timeSeries: [
        { date: '2026-09-25', ndvi: 0.740, baselineNdvi: 0.738, cloudCoverPercent: 11, b4Red: 0.062, b8Nir: 0.415, status: 'nominal' },
        { date: '2026-10-15', ndvi: 0.731, baselineNdvi: 0.732, cloudCoverPercent: 9, b4Red: 0.064, b8Nir: 0.412, status: 'nominal' },
        { date: '2026-10-31', ndvi: 0.594, baselineNdvi: 0.725, cloudCoverPercent: 12, b4Red: 0.090, b8Nir: 0.354, status: 'suspicious_drop' },
        { date: '2026-11-10', ndvi: 0.550, baselineNdvi: 0.721, cloudCoverPercent: 10, b4Red: 0.098, b8Nir: 0.338, status: 'suspicious_drop' },
      ],
    },
    {
      id: 'vi-periyar',
      regionId: 'reg-periyar',
      previousDate: '2026-10-18',
      currentDate: '2026-11-12',
      previousNdvi: 0.742,
      currentNdvi: 0.614,
      deltaNdvi: -0.128,
      changePercent: -17.3,
      persistencePasses: 1,
      affectedAreaHectares: 4.1,
      hotspotLat: 9.471,
      hotspotLng: 77.248,
      timeSeries: [
        { date: '2026-09-28', ndvi: 0.748, baselineNdvi: 0.745, cloudCoverPercent: 18, b4Red: 0.060, b8Nir: 0.416, status: 'nominal' },
        { date: '2026-10-18', ndvi: 0.742, baselineNdvi: 0.744, cloudCoverPercent: 21, b4Red: 0.061, b8Nir: 0.412, status: 'nominal' },
        { date: '2026-11-02', ndvi: 0.698, baselineNdvi: 0.740, cloudCoverPercent: 48, b4Red: 0.072, b8Nir: 0.405, status: 'cloud_masked' },
        { date: '2026-11-12', ndvi: 0.614, baselineNdvi: 0.738, cloudCoverPercent: 35, b4Red: 0.088, b8Nir: 0.368, status: 'cloud_masked' },
      ],
    },
    {
      id: 'vi-kmtr',
      regionId: 'reg-kmtr',
      previousDate: '2026-10-18',
      currentDate: '2026-11-12',
      previousNdvi: 0.808,
      currentNdvi: 0.804,
      deltaNdvi: -0.004,
      changePercent: -0.5,
      persistencePasses: 0,
      affectedAreaHectares: 0,
      hotspotLat: 8.647,
      hotspotLng: 77.319,
      timeSeries: [
        { date: '2026-09-28', ndvi: 0.810, baselineNdvi: 0.806, cloudCoverPercent: 7, b4Red: 0.047, b8Nir: 0.448, status: 'nominal' },
        { date: '2026-10-18', ndvi: 0.808, baselineNdvi: 0.805, cloudCoverPercent: 6, b4Red: 0.048, b8Nir: 0.451, status: 'nominal' },
        { date: '2026-11-12', ndvi: 0.804, baselineNdvi: 0.803, cloudCoverPercent: 6, b4Red: 0.049, b8Nir: 0.452, status: 'nominal' },
      ],
    },
  ];

  const signals: EnvironmentalSignal[] = [
    // Nilgiri (all 6 categories, high corroboration)
    {
      id: 'sig-nil-sat',
      regionId: 'reg-nilgiri',
      category: 'satellite_vegetation',
      label: 'Sentinel-2 Canopy NDVI Δ',
      source: 'Sentinel-2 Sample L2A (T43PFR)',
      timestamp: '2026-11-12T05:18:00Z',
      lat: 11.4188,
      lng: 76.7062,
      measuredValue: -0.373,
      unit: 'ΔNDVI',
      baselineComparison: '-47.2% vs Oct baseline',
      anomalyScore: 0.92,
      dataQuality: 'high',
      confidence: 0.91,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },
    {
      id: 'sig-nil-rain',
      regionId: 'reg-nilgiri',
      category: 'rainfall_variation',
      label: '14-Day Rainfall Anomaly',
      source: 'IMD Nilgiris Station (Sample)',
      timestamp: '2026-11-12T04:00:00Z',
      lat: 11.412,
      lng: 76.699,
      measuredValue: -38,
      unit: '% vs 30-yr mean',
      baselineComparison: 'Dry window consistent with ground access',
      anomalyScore: 0.62,
      dataQuality: 'high',
      confidence: 0.84,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },
    {
      id: 'sig-nil-temp',
      regionId: 'reg-nilgiri',
      category: 'temperature',
      label: 'Land Surface Temp Anomaly',
      source: 'Landsat-9 Thermal Proxy (Sample)',
      timestamp: '2026-11-11T09:30:00Z',
      lat: 11.4188,
      lng: 76.7062,
      measuredValue: '+3.1',
      unit: '°C above canopy mean',
      baselineComparison: 'Exposed soil heating signature',
      anomalyScore: 0.78,
      dataQuality: 'moderate',
      confidence: 0.79,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },
    {
      id: 'sig-nil-soil',
      regionId: 'reg-nilgiri',
      category: 'soil_moisture',
      label: 'Topsoil Volumetric Moisture',
      source: 'LoRaWAN Soil Probe #NS-04 (Sample)',
      timestamp: '2026-11-12T03:45:00Z',
      lat: 11.4165,
      lng: 76.703,
      measuredValue: 18.4,
      unit: '% VWC',
      baselineComparison: '-11.6% below seasonal norm',
      anomalyScore: 0.65,
      dataQuality: 'high',
      confidence: 0.86,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },
    {
      id: 'sig-nil-acoust',
      regionId: 'reg-nilgiri',
      category: 'acoustic_observation',
      label: 'Acoustic Spectral Spike (1.2–3.4 kHz)',
      source: 'Bioacoustic Node #AC-11 (Sample)',
      timestamp: '2026-11-11T14:22:00Z',
      lat: 11.419,
      lng: 76.7058,
      measuredValue: 3,
      unit: 'mechanical events/48h',
      baselineComparison: 'Unusual daytime engine-band harmonics',
      anomalyScore: 0.84,
      dataQuality: 'moderate',
      confidence: 0.76,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },
    {
      id: 'sig-nil-field',
      regionId: 'reg-nilgiri',
      category: 'field_report',
      label: 'Beat Patrol Access Note',
      source: 'Mukurthi South Range Patrol Log',
      timestamp: '2026-11-12T06:10:00Z',
      lat: 11.4175,
      lng: 76.7042,
      measuredValue: 'Fresh vehicle track',
      unit: 'sector note',
      baselineComparison: 'Reported near compartment boundary; visual inspection queued',
      anomalyScore: 0.64,
      dataQuality: 'moderate',
      confidence: 0.8,
      availabilityStatus: 'available',
      dataMode: 'cached',
    },

    // Anamalai (missing soil probe + missing acoustic node, demonstrating missing data neutrality)
    {
      id: 'sig-ana-sat',
      regionId: 'reg-anamalai',
      category: 'satellite_vegetation',
      label: 'Sentinel-2 Canopy NDVI Δ',
      source: 'Sentinel-2 Sample L2A (T43PFQ)',
      timestamp: '2026-11-11T05:22:00Z',
      lat: 10.3382,
      lng: 76.9684,
      measuredValue: -0.232,
      unit: 'ΔNDVI',
      baselineComparison: '-30.6% vs Oct baseline',
      anomalyScore: 0.74,
      dataQuality: 'high',
      confidence: 0.85,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },
    {
      id: 'sig-ana-rain',
      regionId: 'reg-anamalai',
      category: 'rainfall_variation',
      label: '14-Day Rainfall Anomaly',
      source: 'Valparai AWS (Sample)',
      timestamp: '2026-11-11T04:00:00Z',
      lat: 10.3269,
      lng: 76.951,
      measuredValue: -24,
      unit: '% vs 30-yr mean',
      baselineComparison: 'Moderate dry spell',
      anomalyScore: 0.48,
      dataQuality: 'high',
      confidence: 0.82,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },
    {
      id: 'sig-ana-temp',
      regionId: 'reg-anamalai',
      category: 'temperature',
      label: 'Land Surface Temp Anomaly',
      source: 'Thermal Proxy (Sample)',
      timestamp: '2026-11-11T08:15:00Z',
      lat: 10.3382,
      lng: 76.9684,
      measuredValue: '+2.3',
      unit: '°C above canopy mean',
      baselineComparison: 'Elevated localized canopy gap warmth',
      anomalyScore: 0.66,
      dataQuality: 'moderate',
      confidence: 0.77,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },
    {
      id: 'sig-ana-soil',
      regionId: 'reg-anamalai',
      category: 'soil_moisture',
      label: 'Topsoil Volumetric Moisture',
      source: 'Soil Probe #AN-02 (Offline)',
      timestamp: '2026-11-01T12:00:00Z',
      lat: 10.335,
      lng: 76.962,
      measuredValue: null,
      unit: '% VWC',
      baselineComparison: 'Gateway battery depleted; excluded from risk inflation',
      anomalyScore: 0,
      dataQuality: 'unavailable',
      confidence: 0,
      availabilityStatus: 'missing',
      dataMode: 'simulated',
    },
    {
      id: 'sig-ana-acoust',
      regionId: 'reg-anamalai',
      category: 'acoustic_observation',
      label: 'Bioacoustic Node',
      source: 'No acoustic sensor deployed in sector',
      timestamp: '2026-11-11T00:00:00Z',
      lat: 10.3382,
      lng: 76.9684,
      measuredValue: null,
      unit: 'events/48h',
      baselineComparison: 'Sensor absent — flagged under missing evidence',
      anomalyScore: 0,
      dataQuality: 'unavailable',
      confidence: 0,
      availabilityStatus: 'missing',
      dataMode: 'simulated',
    },
    {
      id: 'sig-ana-field',
      regionId: 'reg-anamalai',
      category: 'field_report',
      label: 'Estate Edge Buffer Note',
      source: 'Valparai Range Desk',
      timestamp: '2026-11-11T11:30:00Z',
      lat: 10.337,
      lng: 76.967,
      measuredValue: 'Shade-tree pruning adjacent',
      unit: 'preliminary note',
      baselineComparison: 'Possible private boundary pruning vs reserve encroachment',
      anomalyScore: 0.55,
      dataQuality: 'moderate',
      confidence: 0.72,
      availabilityStatus: 'available',
      dataMode: 'cached',
    },

    // Wayanad
    {
      id: 'sig-way-sat',
      regionId: 'reg-wayanad',
      category: 'satellite_vegetation',
      label: 'Sentinel-2 Canopy NDVI Δ',
      source: 'Sentinel-2 Sample L2A',
      timestamp: '2026-11-10T05:24:00Z',
      lat: 11.7341,
      lng: 76.2285,
      measuredValue: -0.181,
      unit: 'ΔNDVI',
      baselineComparison: '-24.8% vs Oct baseline',
      anomalyScore: 0.62,
      dataQuality: 'high',
      confidence: 0.84,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },
    {
      id: 'sig-way-rain',
      regionId: 'reg-wayanad',
      category: 'rainfall_variation',
      label: '14-Day Rainfall Anomaly',
      source: 'Wayanad Agri-Met (Sample)',
      timestamp: '2026-11-10T04:00:00Z',
      lat: 11.7215,
      lng: 76.214,
      measuredValue: -19,
      unit: '% vs 30-yr mean',
      baselineComparison: 'Mild seasonal deficit',
      anomalyScore: 0.42,
      dataQuality: 'high',
      confidence: 0.85,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },
    {
      id: 'sig-way-temp',
      regionId: 'reg-wayanad',
      category: 'temperature',
      label: 'Land Surface Temp Anomaly',
      source: 'Thermal Proxy (Sample)',
      timestamp: '2026-11-10T09:10:00Z',
      lat: 11.7341,
      lng: 76.2285,
      measuredValue: '+1.9',
      unit: '°C above canopy mean',
      baselineComparison: 'Elevated boundary warmth',
      anomalyScore: 0.54,
      dataQuality: 'moderate',
      confidence: 0.76,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },
    {
      id: 'sig-way-acoust',
      regionId: 'reg-wayanad',
      category: 'acoustic_observation',
      label: 'Acoustic Telemetry',
      source: 'Node #WY-07 (Link Degraded)',
      timestamp: '2026-11-08T18:00:00Z',
      lat: 11.732,
      lng: 76.225,
      measuredValue: null,
      unit: 'events/48h',
      baselineComparison: 'Packet loss >60%; excluded from scoring',
      anomalyScore: 0,
      dataQuality: 'unavailable',
      confidence: 0,
      availabilityStatus: 'degraded',
      dataMode: 'simulated',
    },
    {
      id: 'sig-way-field',
      regionId: 'reg-wayanad',
      category: 'field_report',
      label: 'Bamboo Die-off vs Clearing Check',
      source: 'Kabini Watchtower Log',
      timestamp: '2026-11-10T15:20:00Z',
      lat: 11.733,
      lng: 76.227,
      measuredValue: 'Unverified smoke plume',
      unit: 'visual sighting',
      baselineComparison: 'Observed 1.8 km NE of watchtower',
      anomalyScore: 0.68,
      dataQuality: 'moderate',
      confidence: 0.74,
      availabilityStatus: 'available',
      dataMode: 'cached',
    },

    // Periyar (Cloud-occluded demonstration)
    {
      id: 'sig-per-sat',
      regionId: 'reg-periyar',
      category: 'satellite_vegetation',
      label: 'Sentinel-2 Canopy NDVI Δ',
      source: 'Sentinel-2 Sample L2A (Cloud-Masked)',
      timestamp: '2026-11-12T05:15:00Z',
      lat: 9.471,
      lng: 77.248,
      measuredValue: -0.128,
      unit: 'ΔNDVI',
      baselineComparison: '34.6% cloud cover — optical dip may reflect cloud shadow',
      anomalyScore: 0.38,
      dataQuality: 'low',
      confidence: 0.45,
      availabilityStatus: 'cloud_occluded',
      dataMode: 'simulated',
    },
    {
      id: 'sig-per-rain',
      regionId: 'reg-periyar',
      category: 'rainfall_variation',
      label: '14-Day Rainfall Anomaly',
      source: 'Idukki Met Station (Sample)',
      timestamp: '2026-11-12T04:00:00Z',
      lat: 9.4622,
      lng: 77.2368,
      measuredValue: '+14',
      unit: '% vs 30-yr mean',
      baselineComparison: 'Normal northeast monsoon moisture',
      anomalyScore: 0.12,
      dataQuality: 'high',
      confidence: 0.89,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },
    {
      id: 'sig-per-temp',
      regionId: 'reg-periyar',
      category: 'temperature',
      label: 'Land Surface Temp Anomaly',
      source: 'Thermal Proxy (Sample)',
      timestamp: '2026-11-12T08:00:00Z',
      lat: 9.471,
      lng: 77.248,
      measuredValue: '-0.4',
      unit: '°C vs mean',
      baselineComparison: 'Cool cloud-shaded canopy',
      anomalyScore: 0.08,
      dataQuality: 'moderate',
      confidence: 0.7,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },

    // Silent Valley (Nominal)
    {
      id: 'sig-sil-sat',
      regionId: 'reg-silentvalley',
      category: 'satellite_vegetation',
      label: 'Sentinel-2 Canopy NDVI Δ',
      source: 'Sentinel-2 Sample L2A',
      timestamp: '2026-11-12T05:19:00Z',
      lat: 11.063,
      lng: 76.447,
      measuredValue: 0.004,
      unit: 'ΔNDVI',
      baselineComparison: '+0.5% nominal canopy vigor',
      anomalyScore: 0.04,
      dataQuality: 'high',
      confidence: 0.94,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },
    {
      id: 'sig-sil-rain',
      regionId: 'reg-silentvalley',
      category: 'rainfall_variation',
      label: '14-Day Rainfall Anomaly',
      source: 'Mannarkkad Gauge (Sample)',
      timestamp: '2026-11-12T04:00:00Z',
      lat: 11.063,
      lng: 76.447,
      measuredValue: '+6',
      unit: '% vs 30-yr mean',
      baselineComparison: 'Healthy post-monsoon moisture',
      anomalyScore: 0.05,
      dataQuality: 'high',
      confidence: 0.91,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },
    {
      id: 'sig-sil-acoust',
      regionId: 'reg-silentvalley',
      category: 'acoustic_observation',
      label: 'Acoustic Ambient Index',
      source: 'Bioacoustic Node #SV-02 (Sample)',
      timestamp: '2026-11-12T02:00:00Z',
      lat: 11.065,
      lng: 76.449,
      measuredValue: 0,
      unit: 'mechanical events/48h',
      baselineComparison: 'Biophony only (cicada/avian baseline)',
      anomalyScore: 0.02,
      dataQuality: 'high',
      confidence: 0.92,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },

    // KMTR (Nominal)
    {
      id: 'sig-kmtr-sat',
      regionId: 'reg-kmtr',
      category: 'satellite_vegetation',
      label: 'Sentinel-2 Canopy NDVI Δ',
      source: 'Sentinel-2 Sample L2A',
      timestamp: '2026-11-12T05:14:00Z',
      lat: 8.647,
      lng: 77.319,
      measuredValue: -0.004,
      unit: 'ΔNDVI',
      baselineComparison: '-0.5% within natural variance',
      anomalyScore: 0.05,
      dataQuality: 'high',
      confidence: 0.93,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },
    {
      id: 'sig-kmtr-soil',
      regionId: 'reg-kmtr',
      category: 'soil_moisture',
      label: 'Topsoil Volumetric Moisture',
      source: 'Probe #KM-01 (Sample)',
      timestamp: '2026-11-12T03:30:00Z',
      lat: 8.647,
      lng: 77.319,
      measuredValue: 34.2,
      unit: '% VWC',
      baselineComparison: 'Optimal evergreen root-zone moisture',
      anomalyScore: 0.06,
      dataQuality: 'high',
      confidence: 0.9,
      availabilityStatus: 'available',
      dataMode: 'simulated',
    },
  ];

  const riskWeights: RiskWeights = { ...DEFAULT_RISK_WEIGHTS };

  const assessments: RiskAssessment[] = regions.map((region) => {
    const vegetation = vegetationIndices.find((v) => v.regionId === region.id)!;
    return evaluateRegionRisk({
      region,
      vegetation,
      observations,
      signals,
      weights: riskWeights,
    });
  });

  const alerts: Alert[] = [
    {
      id: 'alt-nil-01',
      regionId: 'reg-nilgiri',
      assessmentId: 'risk-reg-nilgiri',
      title: 'Persistent linear canopy NDVI drop in Nilgiri Shola ridge',
      severity: assessments.find((a) => a.regionId === 'reg-nilgiri')!.classification,
      status: 'Field Verification Required',
      assignedOfficer: 'Arjun Menon',
      riskScore: assessments.find((a) => a.regionId === 'reg-nilgiri')!.riskScore,
      confidence: assessments.find((a) => a.regionId === 'reg-nilgiri')!.confidence,
      lat: 11.4188,
      lng: 76.7062,
      createdAt: '2026-11-10T07:15:00Z',
      updatedAt: '2026-11-12T06:25:00Z',
      summary:
        '4 consecutive Sentinel-2 passes show a -47.2% NDVI decline across 18.4 ha, corroborated by +3.1°C thermal anomaly and acoustic engine-band spikes.',
    },
    {
      id: 'alt-ana-02',
      regionId: 'reg-anamalai',
      assessmentId: 'risk-reg-anamalai',
      title: 'Multi-pass vegetation decline along Valparai buffer edge',
      severity: assessments.find((a) => a.regionId === 'reg-anamalai')!.classification,
      status: 'Under Review',
      assignedOfficer: 'Raghavan Iyer',
      riskScore: assessments.find((a) => a.regionId === 'reg-anamalai')!.riskScore,
      confidence: assessments.find((a) => a.regionId === 'reg-anamalai')!.confidence,
      lat: 10.3382,
      lng: 76.9684,
      createdAt: '2026-11-08T09:40:00Z',
      updatedAt: '2026-11-11T11:45:00Z',
      summary:
        '3-pass NDVI reduction (-30.6%) near private estate boundary. Soil moisture and acoustic sensors offline; requires boundary survey to rule out agricultural shade pruning.',
    },
    {
      id: 'alt-way-03',
      regionId: 'reg-wayanad',
      assessmentId: 'risk-reg-wayanad',
      title: 'Kabini northern fringe canopy thinning & smoke sighting',
      severity: assessments.find((a) => a.regionId === 'reg-wayanad')!.classification,
      status: 'New',
      assignedOfficer: 'Meera Nair',
      riskScore: assessments.find((a) => a.regionId === 'reg-wayanad')!.riskScore,
      confidence: assessments.find((a) => a.regionId === 'reg-wayanad')!.confidence,
      lat: 11.7341,
      lng: 76.2285,
      createdAt: '2026-11-10T15:35:00Z',
      updatedAt: '2026-11-10T15:35:00Z',
      summary:
        '24.8% NDVI decrease across 7.6 ha adjacent to bamboo belt, paired with watchtower smoke sighting. Acoustic node degraded.',
    },
    {
      id: 'alt-per-04',
      regionId: 'reg-periyar',
      assessmentId: 'risk-reg-periyar',
      title: 'Partial cloud-masked reflectance shift in Cardamom Ridge',
      severity: assessments.find((a) => a.regionId === 'reg-periyar')!.classification,
      status: 'Under Review',
      assignedOfficer: 'Dr. Kavitha Subramanian',
      riskScore: assessments.find((a) => a.regionId === 'reg-periyar')!.riskScore,
      confidence: assessments.find((a) => a.regionId === 'reg-periyar')!.confidence,
      lat: 9.471,
      lng: 77.248,
      createdAt: '2026-11-12T05:50:00Z',
      updatedAt: '2026-11-12T06:00:00Z',
      summary:
        'Apparent -17.3% NDVI change occurred under 34.6% cloud cover. Low confidence; holding pending cloud-free Sentinel-2 pass or SAR verification.',
    },
  ];

  const investigations: Investigation[] = alerts.map((a) => ({
    id: `inv-${a.id}`,
    alertId: a.id,
    regionId: a.regionId,
    assignedOfficer: a.assignedOfficer,
    status: a.status,
    verificationAction:
      a.status === 'Field Verification Required'
        ? 'Beat patrol dispatched to GPS waypoint 11.4188°N, 76.7062°E'
        : 'Pending GIS analyst cross-check',
    notes: [
      {
        id: `note-${a.id}-1`,
        author: a.assignedOfficer,
        role: 'Assigned Officer',
        timestamp: a.updatedAt,
        text:
          a.id === 'alt-nil-01'
            ? 'Reviewed T43PFR spectral stack. Canopy edge exhibits linear geometry unlike windfall. Queued Mukurthi beat team for ground photography.'
            : 'Initial triage logged from automated risk assessment.',
        actionTaken: a.status,
      },
    ],
    updatedAt: a.updatedAt,
  }));

  const evidence: EvidenceRecord[] = [
    {
      id: 'ev-nil-1',
      alertId: 'alt-nil-01',
      regionId: 'reg-nilgiri',
      kind: 'satellite_spectral',
      title: 'Sentinel-2 Band B4/B8 Spectral Divergence',
      summary: 'Band B4 (Red) rose from 0.052 to 0.128 while Band B8 (NIR) fell from 0.445 to 0.312 over 25 days.',
      source: 'Sentinel-2 Sample L2A (T43PFR)',
      recordedAt: '2026-11-12T05:18:00Z',
      recordedBy: 'Automated NDVI Pipeline',
      lat: 11.4188,
      lng: 76.7062,
      dataMode: 'simulated',
    },
    {
      id: 'ev-nil-2',
      alertId: 'alt-nil-01',
      regionId: 'reg-nilgiri',
      kind: 'acoustic_clip',
      title: 'Unidentified Mechanical Harmonics (Node #AC-11)',
      summary: '3 daytime acoustic events peaking at 1.8 kHz; awaiting human audio verification to distinguish machinery vs vehicle.',
      source: 'Bioacoustic Node #AC-11 (Sample)',
      recordedAt: '2026-11-11T14:22:00Z',
      recordedBy: 'Edge Acoustic Classifier',
      lat: 11.419,
      lng: 76.7058,
      dataMode: 'simulated',
    },
    {
      id: 'ev-ana-1',
      alertId: 'alt-ana-02',
      regionId: 'reg-anamalai',
      kind: 'ranger_note',
      title: 'Boundary Demarcation Verification Needed',
      summary: 'Valparai range desk noted estate shade-tree lopping nearby; GPS boundary overlay required to confirm inside/outside reserve.',
      source: 'Valparai Range Desk',
      recordedAt: '2026-11-11T11:30:00Z',
      recordedBy: 'Raghavan Iyer',
      lat: 10.337,
      lng: 76.967,
      dataMode: 'cached',
    },
    {
      id: 'ev-way-1',
      alertId: 'alt-way-03',
      regionId: 'reg-wayanad',
      kind: 'ranger_note',
      title: 'Kabini Watchtower Smoke Observation',
      summary: 'Watchtower guard logged localized smoke column at bearing 042° NE, ~1.8 km distance.',
      source: 'Kabini Watchtower Log',
      recordedAt: '2026-11-10T15:20:00Z',
      recordedBy: 'Meera Nair',
      lat: 11.733,
      lng: 76.227,
      dataMode: 'cached',
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      id: 'log-1',
      actor: 'System Pipeline',
      action: 'Initialized Western Ghats demonstration dataset (6 zones, 8 Sentinel-2 sample scenes)',
      targetType: 'risk_engine',
      targetId: 'system',
      detail: 'All satellite and sensor telemetry explicitly labeled as simulated demo data.',
      timestamp: '2026-11-12T06:00:00Z',
    },
    {
      id: 'log-2',
      actor: 'Arjun Menon',
      action: 'Escalated Nilgiri Shola alert to Field Verification Required',
      targetType: 'investigation',
      targetId: 'alt-nil-01',
      detail: 'Beat patrol tasked to verify linear ridge clearing.',
      timestamp: '2026-11-12T06:25:00Z',
    },
  ];

  return {
    users,
    regions,
    observations,
    vegetationIndices,
    signals,
    riskWeights,
    assessments,
    alerts,
    investigations,
    evidence,
    auditLogs,
  };
}

class Store {
  private state: PersistedState;

  constructor() {
    this.state = this.loadOrSeed();
  }

  private loadOrSeed(): PersistedState {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as PersistedState;
        if (parsed && Array.isArray(parsed.regions) && Array.isArray(parsed.alerts)) {
          return parsed;
        }
      }
    } catch {
      // Fallback to fresh seed if corrupted
    }
    const seeded = buildSeedState();
    this.persist(seeded);
    return seeded;
  }

  private persist(nextState: PersistedState = this.state) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(STORE_PATH, JSON.stringify(nextState, null, 2), 'utf-8');
    } catch {
      // Safe no-op if filesystem is read-only
    }
  }

  public resetToSeed(): PersistedState {
    this.state = buildSeedState();
    this.persist();
    return this.state;
  }

  public getDataSources(): DataSourceStatus[] {
    return dataSourceManager.getStatuses(this.state.investigations[0]?.updatedAt);
  }

  public getSnapshot(): SystemSnapshot {
    const totalMonitoredAreaHa = this.state.regions.reduce((acc, r) => acc + r.areaHectares, 0);
    const suspiciousObservationsCount = this.state.vegetationIndices.filter(
      (v) => v.deltaNdvi <= -0.1
    ).length;
    const highPriorityLocationsCount = this.state.assessments.filter(
      (a) => a.classification === 'High priority' || a.classification === 'Critical priority'
    ).length;
    const overallCoveragePercent =
      Math.round(
        (this.state.regions.reduce((acc, r) => acc + r.coveragePercent, 0) /
          Math.max(1, this.state.regions.length)) *
          10
      ) / 10;

    const dataSources = this.getDataSources();
    const provenance = dataSourceManager.getProvenanceSummary(dataSources);
    const satSource = dataSources.find((d) => d.id === 'ds-sentinel2');

    return {
      isDemoMode: provenance.isDemoMode,
      provenanceMode: provenance.provenanceMode,
      demoNotice: provenance.demoNotice,
      summary: {
        totalMonitoredAreaHa,
        monitoredZonesCount: this.state.regions.length,
        suspiciousObservationsCount,
        highPriorityLocationsCount,
        overallCoveragePercent,
        lastSyncTimestamp: satSource?.lastSuccessfulUpdate ?? '2026-11-12T06:25:00Z',
        activeSatelliteConstellation:
          satSource?.state === 'Live'
            ? 'Sentinel-2A/2B (Copernicus Live STAC)'
            : 'Sentinel-2A/2B (Demo Sample Archive)',
      },
      users: this.state.users,
      regions: this.state.regions,
      observations: this.state.observations,
      vegetationIndices: this.state.vegetationIndices,
      signals: this.state.signals,
      riskWeights: this.state.riskWeights,
      assessments: this.state.assessments,
      alerts: this.state.alerts,
      investigations: this.state.investigations,
      evidence: this.state.evidence,
      dataSources,
      auditLogs: this.state.auditLogs,
    };
  }

  public async syncRegionSatellite(regionId: string) {
    const region = this.state.regions.find((r) => r.id === regionId);
    if (!region) {
      throw new Error(`Monitoring region ${regionId} not found.`);
    }

    const regionObs = this.state.observations.filter((o) => o.regionId === region.id);
    const latestDemoObs = regionObs[regionObs.length - 1];
    const result = await fetchRegionSentinel2Scene(region, latestDemoObs);

    if (result.mode === 'Live' && result.observation) {
      dataSourceManager.markLiveSync('ds-sentinel2');
      // Avoid duplicating identical tile IDs
      const exists = this.state.observations.some(
        (o) => o.regionId === region.id && o.tileId === result.observation!.tileId
      );
      if (!exists) {
        this.state.observations.push(result.observation);
      }
      region.lastPassDate = result.observation.acquiredAt;
      this.recalculateRisk(this.state.riskWeights);
    }

    const fallbackGeo = runFallbackGeospatialPipeline({
      region,
      bandB8Nir: result.observation?.bandB8Nir ?? latestDemoObs?.bandB8Nir ?? 0.4,
      bandB4Red: result.observation?.bandB4Red ?? latestDemoObs?.bandB4Red ?? 0.07,
      cloudCoverPercent: result.observation?.cloudCoverPercent ?? latestDemoObs?.cloudCoverPercent ?? 10,
    });

    this.addAuditLog({
      actor: 'Copernicus Adapter',
      action: `Sentinel-2 sync (${result.mode}) for ${region.code}`,
      targetType: 'datasource',
      targetId: region.id,
      detail: result.message,
    });

    this.persist();
    return {
      ...result,
      geospatialFallback: fallbackGeo,
      snapshot: this.getSnapshot(),
    };
  }

  public async syncRegionWeather(regionId: string) {
    const region = this.state.regions.find((r) => r.id === regionId);
    if (!region) {
      throw new Error(`Monitoring region ${regionId} not found.`);
    }

    const result = await syncRegionWeatherSignals(region, this.state.signals);

    if (result.mode === 'Live' && result.updatedSignals.length > 0) {
      dataSourceManager.markLiveSync('ds-weather');
      // Replace previous live OpenWeather entries for this region
      this.state.signals = [
        ...this.state.signals.filter(
          (s) => !(s.regionId === region.id && s.id.startsWith('sig-ow-'))
        ),
        ...result.updatedSignals,
      ];
      this.recalculateRisk(this.state.riskWeights);
    }

    this.addAuditLog({
      actor: 'OpenWeather Adapter',
      action: `Weather sync (${result.mode}) for ${region.code}`,
      targetType: 'datasource',
      targetId: region.id,
      detail: result.message,
    });

    this.persist();
    return {
      ...result,
      snapshot: this.getSnapshot(),
    };
  }

  public recalculateRisk(weights: RiskWeights): RiskAssessment[] {
    this.state.riskWeights = weights;
    this.state.assessments = this.state.regions.map((region) => {
      const vegetation = this.state.vegetationIndices.find((v) => v.regionId === region.id)!;
      const existing = this.state.assessments.find((a) => a.regionId === region.id);
      return evaluateRegionRisk({
        region,
        vegetation,
        observations: this.state.observations,
        signals: this.state.signals,
        weights,
        existingAssessmentId: existing?.id,
      });
    });

    // Sync alert riskScore, confidence, and severity with updated assessments
    this.state.alerts = this.state.alerts.map((alert) => {
      const ass = this.state.assessments.find((a) => a.regionId === alert.regionId);
      if (!ass) return alert;
      return {
        ...alert,
        riskScore: ass.riskScore,
        confidence: ass.confidence,
        severity: ass.classification,
      };
    });

    this.addAuditLog({
      actor: 'Risk Configuration User',
      action: 'Recalculated disturbance risk scores across all 6 monitoring regions',
      targetType: 'risk_engine',
      targetId: 'weights',
      detail: `Weights updated — ΔNDVI: ${weights.magnitude}, Persistence: ${weights.persistence}, Env: ${weights.environmentalContext}, Corroboration: ${weights.supportingObservations}`,
    });

    this.persist();
    return this.state.assessments;
  }

  public updateAlertAndInvestigation(params: {
    alertId: string;
    status?: Alert['status'];
    assignedOfficer?: string;
    verificationAction?: string;
    noteText?: string;
    author?: string;
  }) {
    const alertIdx = this.state.alerts.findIndex((a) => a.id === params.alertId);
    if (alertIdx === -1) {
      throw new Error(`Alert ${params.alertId} not found.`);
    }

    const now = new Date().toISOString();
    const currentAlert = this.state.alerts[alertIdx];

    this.state.alerts[alertIdx] = {
      ...currentAlert,
      status: params.status ?? currentAlert.status,
      assignedOfficer: params.assignedOfficer ?? currentAlert.assignedOfficer,
      updatedAt: now,
    };

    const invIdx = this.state.investigations.findIndex((i) => i.alertId === params.alertId);
    if (invIdx !== -1) {
      const inv = this.state.investigations[invIdx];
      const nextNotes = [...inv.notes];
      if (params.noteText && params.noteText.trim()) {
        nextNotes.unshift({
          id: `note-${Date.now()}`,
          author: params.author || params.assignedOfficer || inv.assignedOfficer,
          role: 'Investigating Officer',
          timestamp: now,
          text: params.noteText.trim(),
          actionTaken: params.status ?? inv.status,
        });
      }
      this.state.investigations[invIdx] = {
        ...inv,
        status: params.status ?? inv.status,
        assignedOfficer: params.assignedOfficer ?? inv.assignedOfficer,
        verificationAction: params.verificationAction ?? inv.verificationAction,
        notes: nextNotes,
        updatedAt: now,
      };
    }

    this.addAuditLog({
      actor: params.author || params.assignedOfficer || currentAlert.assignedOfficer,
      action: `Updated alert ${params.alertId} (${params.status ?? currentAlert.status})`,
      targetType: 'alert',
      targetId: params.alertId,
      detail: params.noteText?.trim() || params.verificationAction || 'Status or officer assignment updated.',
    });

    this.persist();
    return {
      alert: this.state.alerts[alertIdx],
      investigation: this.state.investigations.find((i) => i.alertId === params.alertId) ?? null,
    };
  }

  public addEvidenceRecord(params: {
    alertId: string;
    kind: EvidenceRecord['kind'];
    title: string;
    summary: string;
    source: string;
    recordedBy: string;
  }): EvidenceRecord {
    const alert = this.state.alerts.find((a) => a.id === params.alertId);
    if (!alert) {
      throw new Error(`Alert ${params.alertId} not found.`);
    }

    const record: EvidenceRecord = {
      id: `ev-${Date.now()}`,
      alertId: alert.id,
      regionId: alert.regionId,
      kind: params.kind,
      title: params.title.trim(),
      summary: params.summary.trim(),
      source: params.source.trim() || 'Field Officer Upload',
      recordedAt: new Date().toISOString(),
      recordedBy: params.recordedBy.trim() || alert.assignedOfficer,
      lat: alert.lat,
      lng: alert.lng,
      dataMode: 'cached',
    };

    this.state.evidence.unshift(record);
    this.addAuditLog({
      actor: record.recordedBy,
      action: `Attached ${record.kind} evidence to ${alert.id}`,
      targetType: 'evidence',
      targetId: record.id,
      detail: record.title,
    });
    this.persist();
    return record;
  }

  public addAuditLog(entry: Omit<AuditLog, 'id' | 'timestamp'>) {
    this.state.auditLogs.unshift({
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    });
    if (this.state.auditLogs.length > 60) {
      this.state.auditLogs = this.state.auditLogs.slice(0, 60);
    }
    this.persist();
  }
}

export const db = new Store();
