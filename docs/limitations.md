# Limitations

## Satellite interpretation

Satellite-derived indices indicate signals and changes. They do not diagnose crop disease, pests, nutrient deficiency, or chemical treatment needs.

## Clouds and data quality

If valid pixels are insufficient, the correct result is `ข้อมูลไม่เพียงพอ`, not `ไม่พบปัญหา`.

## Resolution

Outputs must not claim higher spatial resolution than source bands support. NDRE uses red-edge and narrow NIR bands and must be presented at source-compatible resolution.

## Sentinel-1

Radar can support cloudy-season analysis but does not independently confirm soil moisture, disease, or flooding without calibration and field checks.

## DEM

DEM provides terrain context but cannot confirm drainage behavior without hydrology or field data.
