"""Bounded investigation only; does not create or replace app bathymetry assets."""
import argparse
import datetime
import hashlib
import json
import math
from pathlib import Path
import sys
import time
import urllib.parse
import urllib.request

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BOUNDS = dict(west=129.78, east=130.14, south=28.18, north=28.46)
RESOLUTIONS = (500, 250, 100)
MAX_BYTES = 12 * 1024 * 1024
MAX_CELLS = 900000


def digest(body):
    return hashlib.sha256(body).hexdigest()


def sample(grid, lon, lat):
    """Bilinear at pixel centres; four valid corners required, no gap filling."""
    a = grid['values']
    x = (lon - grid['lon0']) / grid['dx']
    y = (lat - grid['lat0']) / grid['dy']
    valid = (x >= 0) & (y >= 0) & (x < a.shape[1] - 1) & (y < a.shape[0] - 1)
    ix = np.clip(np.floor(x).astype(int), 0, a.shape[1] - 2)
    iy = np.clip(np.floor(y).astype(int), 0, a.shape[0] - 2)
    fx, fy = x - ix, y - iy
    corners = [a[iy, ix], a[iy, ix+1], a[iy+1, ix], a[iy+1, ix+1]]
    valid &= np.logical_and.reduce([np.isfinite(c) for c in corners])
    result = ((corners[0]*(1-fx)+corners[1]*fx)*(1-fy)
              +(corners[2]*(1-fx)+corners[3]*fx)*fy)
    return np.where(valid, result, np.nan)


def coordinates(grid):
    h, w = grid['values'].shape
    return np.meshgrid(grid['lon0'] + np.arange(w)*grid['dx'],
                       grid['lat0'] + np.arange(h)*grid['dy'])


def difference(actual, predicted, selection):
    use = selection & np.isfinite(actual) & np.isfinite(predicted)
    delta = actual[use].astype(float) - predicted[use]
    if not delta.size:
        return {'count': 0}
    return dict(count=int(delta.size), biasMeters=float(delta.mean()),
                rmseMeters=float(np.sqrt(np.mean(delta**2))),
                absoluteP50Meters=float(np.percentile(np.abs(delta), 50)),
                absoluteP95Meters=float(np.percentile(np.abs(delta), 95)),
                absoluteMaxMeters=float(np.abs(delta).max()))


def baseline():
    path = ROOT / 'data/bathymetry/okinawa-islands.json'
    meta = json.loads(path.read_text())
    body = (path.parent / meta['file']).read_bytes()
    assert len(body) == meta['bytes'] and digest(body) == meta['sha256']
    n = meta['width'] * meta['height']
    values = np.frombuffer(body[:n*2], dtype='<i2').astype(float)
    values[values == meta['nodata']] = np.nan
    grid = {k: meta[k] for k in ('lon0', 'lat0', 'dx', 'dy')}
    grid['values'] = values.reshape(meta['height'], meta['width'])
    return grid, {k: meta[k] for k in ('id', 'sha256', 'sourceVersion',
                  'actualSpacingMeters', 'quantizationMeters', 'retrievedAt')}


def fetch(url, destination, limit=MAX_BYTES):
    start = time.monotonic()
    req = urllib.request.Request(url, headers={'User-Agent': 'terrain-stereo-kikai-investigation/1.0'})
    with urllib.request.urlopen(req, timeout=90) as response:
        body = response.read(limit + 1)
        if response.status != 200 or len(body) > limit:
            raise ValueError('Response failed or exceeded bounded byte limit')
        info = dict(url=url, status=response.status, bytes=len(body), sha256=digest(body),
                    seconds=round(time.monotonic()-start, 3),
                    contentType=response.headers.get('Content-Type'),
                    contentDisposition=response.headers.get('Content-Disposition'))
    destination.write_bytes(body)
    return body, info


def read_raster(body):
    from rasterio.io import MemoryFile
    with MemoryFile(body) as mem, mem.open() as src:
        if src.count != 1 or src.crs.to_epsg() != 4326:
            raise ValueError('Require single-band EPSG:4326 GeoTIFF')
        if not 4 <= src.width*src.height <= MAX_CELLS:
            raise ValueError(f'Unsafe returned grid: {src.width}x{src.height}')
        t = src.transform
        if t.b != 0 or t.d != 0 or t.a <= 0 or t.e >= 0:
            raise ValueError('Require north-up grid')
        a = src.read(1, masked=True).astype('float64').filled(np.nan)
        if np.isfinite(a).any() and np.nanmax(np.abs(a)) >= 32000:
            raise ValueError('Unrealistic elevation values / unrecognised nodata')
        grid = dict(values=a, lon0=t.c+t.a/2, lat0=t.f+t.e/2, dx=t.a, dy=t.e)
        center = (src.bounds.top+src.bounds.bottom)/2
        info = dict(width=src.width, height=src.height, cells=a.size,
                    crs=str(src.crs), transform=list(t)[:6], bounds=list(src.bounds),
                    nodata=str(src.nodata), dtype=src.dtypes[0], tags=src.tags(),
                    missingCount=int((~np.isfinite(a)).sum()),
                    actualSpacingMetersApprox=[t.a*111320*math.cos(math.radians(center)), -t.e*111320])
        return grid, info


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    out = parser.parse_args().output
    out.mkdir(parents=True, exist_ok=True)
    old, old_meta = baseline()
    report = dict(purpose='Kikai source investigation; app unchanged',
                  requestedBounds=BOUNDS, requestedResolutionsMeters=list(RESOLUTIONS),
                  retrievedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  baseline=old_meta, documents=[], resolutions=[], crossResolution=[],
                  interpretation=[
                      'Finer returned cells or residuals alone do not establish new measured detail.',
                      'topo-mask finite cells identify GMRT high-resolution contribution; preserve raw mask for review against official specification.',
                      'Contribution does not specify sounding accuracy or survey date.',
                      'Baseline is rounded to 1m; residuals include rounding, resampling and possible source-version changes.',
                      'No smoothing, invented detail or app-data replacement in this investigation.'])
    # Preserve official specification and terms with date/hash, including failed requests.
    for name, url in [('gridserverinfo', 'https://www.gmrt.org/services/gridserverinfo.php'),
                      ('terms_of_use', 'https://www.gmrt.org/about/terms_of_use.php')]:
        try:
            _, info = fetch(url, out / (name+'.html'), limit=2*1024*1024)
            report['documents'].append(info)
        except Exception as exc:
            report['documents'].append(dict(url=url, error=str(exc)))
        time.sleep(1)
    grids = {}
    for resolution in RESOLUTIONS:
        row = dict(requestedSpacingMeters=resolution, requests=[])
        try:
            rasters = {}
            for layer in ('topo', 'topo-mask'):
                params = {**BOUNDS, 'layer': layer, 'format': 'geotiff', 'mresolution': resolution}
                url = 'https://www.gmrt.org/services/GridServer?' + urllib.parse.urlencode(params)
                body, request = fetch(url, out / f'{resolution}m-{layer}.tif')
                row['requests'].append(request)
                grid, metadata = read_raster(body)
                rasters[layer] = grid
                row[layer] = metadata
                time.sleep(1.2)
            grid, mask = rasters['topo'], rasters['topo-mask']
            if any(grid[k] != mask[k] for k in ('lon0', 'lat0', 'dx', 'dy')) or grid['values'].shape != mask['values'].shape:
                raise ValueError('topo and topo-mask grid mismatch')
            lon, lat = coordinates(grid)
            # Restrict statistics to requested box, excluding response padding.
            inside = ((lon >= BOUNDS['west']) & (lon <= BOUNDS['east']) &
                      (lat >= BOUNDS['south']) & (lat <= BOUNDS['north']))
            sea = inside & np.isfinite(grid['values']) & (grid['values'] < 0)
            if sea.sum() < 100:
                raise ValueError('Insufficient valid marine data')
            hr = np.isfinite(mask['values'])
            predicted = sample(old, lon, lat)
            row.update(status='ok', marineCells=int(sea.sum()),
                       marineDepthRangeMeters=[float(-grid['values'][sea].max()), float(-grid['values'][sea].min())],
                       finiteMaskCells=int((inside & hr).sum()),
                       marineContributionCells=int((sea & hr).sum()),
                       marineContributionPercent=float(100*(sea & hr).sum()/sea.sum()),
                       maskMinusTopo=difference(mask['values'], grid['values'], inside & hr),
                       versus877m=dict(allMarine=difference(grid['values'], predicted, sea),
                                      contributed=difference(grid['values'], predicted, sea & hr),
                                      background=difference(grid['values'], predicted, sea & ~hr)))
            grids[resolution] = (grid, sea, hr)
        except Exception as exc:
            row.update(status='failed', error=f'{type(exc).__name__}: {exc}')
        report['resolutions'].append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)
    for fine, coarse in ((100, 250), (100, 500), (250, 500)):
        if fine not in grids or coarse not in grids:
            continue
        grid, sea, hr = grids[fine]
        lon, lat = coordinates(grid)
        pred = sample(grids[coarse][0], lon, lat)
        report['crossResolution'].append(dict(fineRequestedMeters=fine, coarseRequestedMeters=coarse,
            allMarine=difference(grid['values'], pred, sea),
            contributed=difference(grid['values'], pred, sea & hr),
            background=difference(grid['values'], pred, sea & ~hr)))
    report['allThreeSucceeded'] = len(grids) == 3
    report['totalDownloadedBytes'] = sum(r['bytes'] for row in report['resolutions'] for r in row['requests'])
    report['highResolutionMarineContributionFound'] = any(row.get('marineContributionCells', 0) for row in report['resolutions']) > 0
    (out/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'allThreeSucceeded': report['allThreeSucceeded'],
                      'highResolutionMarineContributionFound': report['highResolutionMarineContributionFound'],
                      'totalDownloadedBytes': report['totalDownloadedBytes']}), flush=True)
    if not report['allThreeSucceeded']:
        sys.exit(1)


if __name__ == '__main__':
    main()
