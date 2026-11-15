export interface NdviCalculationInput {
  bandB8Nir: number;
  bandB4Red: number;
  previousNdvi?: number;
  cloudCoverPercent?: number;
}

export interface NdviCalculationResult {
  ndvi: number;
  formula: string;
  vegetationClass: string;
  cloudQualityWarning: string | null;
  deltaFromPrevious: number | null;
  changePercent: number | null;
  isReliable: boolean;
}

/**
 * Computes Sentinel-2 Normalized Difference Vegetation Index:
 * NDVI = (NIR - RED) / (NIR + RED)
 * Where NIR = Band B8 (842nm) and RED = Band B4 (665nm)
 */
export function computeSentinel2Ndvi(input: NdviCalculationInput): NdviCalculationResult {
  const b8 = Number(input.bandB8Nir);
  const b4 = Number(input.bandB4Red);
  const cloudCover = Number(input.cloudCoverPercent ?? 0);

  if (!Number.isFinite(b8) || !Number.isFinite(b4) || b8 < 0 || b4 < 0 || b8 > 1 || b4 > 1) {
    throw new Error('Sentinel-2 reflectance values for Band B8 (NIR) and Band B4 (Red) must be between 0.0 and 1.0.');
  }

  const denominator = b8 + b4;
  const rawNdvi = denominator === 0 ? 0 : (b8 - b4) / denominator;
  const ndvi = Math.round(rawNdvi * 1000) / 1000;

  let vegetationClass = 'Dense Tropical Canopy';
  if (ndvi < 0.1) vegetationClass = 'Bare Soil / Exposed Rock / Water';
  else if (ndvi < 0.25) vegetationClass = 'Sparse Scrub / Cleared Soil';
  else if (ndvi < 0.45) vegetationClass = 'Degraded / Open Woodland';
  else if (ndvi < 0.65) vegetationClass = 'Moderate Forest Canopy';

  let cloudQualityWarning: string | null = null;
  let isReliable = true;
  if (cloudCover >= 40) {
    cloudQualityWarning = `High cloud cover (${cloudCover.toFixed(1)}%) — spectral reflectance likely attenuated; do not interpret drop as canopy loss without cloud-free pass.`;
    isReliable = false;
  } else if (cloudCover >= 20) {
    cloudQualityWarning = `Moderate cloud haze (${cloudCover.toFixed(1)}%) — apply atmospheric QA60 mask before comparing against baseline.`;
  }

  let deltaFromPrevious: number | null = null;
  let changePercent: number | null = null;

  if (input.previousNdvi !== undefined && Number.isFinite(input.previousNdvi)) {
    deltaFromPrevious = Math.round((ndvi - input.previousNdvi) * 1000) / 1000;
    changePercent =
      input.previousNdvi !== 0
        ? Math.round(((ndvi - input.previousNdvi) / Math.abs(input.previousNdvi)) * 1000) / 10
        : 0;
  }

  return {
    ndvi,
    formula: `(${b8.toFixed(3)} - ${b4.toFixed(3)}) / (${b8.toFixed(3)} + ${b4.toFixed(3)}) = ${ndvi.toFixed(3)}`,
    vegetationClass,
    cloudQualityWarning,
    deltaFromPrevious,
    changePercent,
    isReliable,
  };
}
