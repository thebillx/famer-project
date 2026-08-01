# Remote Sensing Methodology

## Sentinel-2 L2A

Supported bands include B02, B03, B04, B05, B06, B07, B08, B8A, B11, B12, SCL, CLD, AOT, and dataMask.

## Sentinel-1 GRD

Supported radar metrics include VV, VH, VV/VH ratio, difference and percentage change, temporal median and deviation, and water/flood candidate mask. Sentinel-1 does not confirm soil moisture, crop disease, or flooding without calibration and field validation.

## Copernicus DEM

DEM supports elevation summary, slope, aspect, low-area context, and terrain-based water accumulation context. DEM must not be used to confirm drainage without hydrology or field data.

## Landsat 8/9

Optional provider for backup optical history, basic NDVI, and thermal brightness temperature at appropriate area scale. Small-field warnings are required due to coarser resolution.

## Index formulas

All formulas use float arithmetic and epsilon-protected division.

- `NDVI = (B08 - B04) / (B08 + B04)`
- `EVI = 2.5 * (B08 - B04) / (B08 + 6 * B04 - 7.5 * B02 + 1)`
- `SAVI = 1.5 * (B08 - B04) / (B08 + B04 + 0.5)`
- `NDMI = (B08 - B11) / (B08 + B11)`
- `NDWI = (B03 - B08) / (B03 + B08)`
- `NDRE = (B8A - B05) / (B8A + B05)`
- `NBR = (B08 - B12) / (B08 + B12)`
- `BSI = ((B11 + B04) - (B08 + B02)) / ((B11 + B04) + (B08 + B02))`

## Quality policy

Default excluded pixels:

- No data
- Saturated/defective
- Cloud shadow
- Unclassified or low-confidence cloud
- Medium probability cloud
- High probability cloud
- Cirrus
- Snow/ice

Default rules:

- Valid pixel ratio below 40%: do not display analysis.
- Valid pixel ratio 40-70%: display low confidence.
- Valid pixel ratio above 70%: analysis can be displayed.

Scene-level cloud coverage is not sufficient because a field polygon may be clear even when the scene is cloudy.
