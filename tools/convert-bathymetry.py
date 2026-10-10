"""Convert official GMRT GeoTIFFs to a small, versioned, same-origin grid.
Usage: python tools/convert-bathymetry.py topo.tif topo-mask.tif data/bathymetry
Development dependencies: Pillow, numpy. No runtime geospatial dependency.
"""
import sys,json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image
source,mask,destination=map(Path,sys.argv[1:4])
im=Image.open(source);values=np.array(im,dtype=np.float32);masked=np.array(Image.open(mask))
assert im.mode=='F' and values.shape==masked.shape and values.size<1_000_000
keys=im.tag_v2[34735];keyvalues={keys[i]:keys[i+3] for i in range(4,len(keys),4) if keys[i+1]==0}
assert keyvalues[2048]==4326 and keyvalues[1025]==1,'Require EPSG:4326, pixel-area registration'
dx,dy,_=im.tag_v2[33550];_,_,_,west,north,_=im.tag_v2[33922]
finite=np.isfinite(values);assert finite.any() and np.abs(values[finite]).max()<32000
encoded=np.full(values.shape,-32768,dtype='<i2');encoded[finite]=np.rint(values[finite]).astype('<i2')
coverage=np.packbits(np.isfinite(masked).ravel(),bitorder='little')
body=encoded.tobytes()+coverage.tobytes();destination.mkdir(parents=True,exist_ok=True)
(destination/'aogashima-gmrt-4.5.0.bin').write_bytes(body)
metadata=dict(format='gmrt-int16-mask-v1',id='aogashima',name='青ヶ島周辺',width=im.width,height=im.height,lon0=west+dx/2,lat0=north-dy/2,dx=dx,dy=-dy,nodata=-32768,file='aogashima-gmrt-4.5.0.bin',bytes=len(body),sha256=hashlib.sha256(body).hexdigest(),sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),sourceVersion='GMRT v4.5.0 (2026年6月)',baseSource='GEBCO 2026ほか。高解像度資料寄与の有無はGMRT topo-maskで確認。',retrievedAt='2026-10-10T08:23:02Z',sourceUrl='https://www.gmrt.org/services/GridServer?west=139.2&east=140.3&south=32.0&north=32.9&layer=topo&format=geotiff&mresolution=500',termsUrl='https://www.gmrt.org/about/terms_of_use.php',sourceInfoUrl='https://www.gmrt.org/about/',license='CC BY 4.0',citation='Ryan et al. (2009), Global Multi-Resolution Topography synthesis, doi:10.1029/2008GC002332; data doi:10.1594/IEDA.100001',requestedSpacingMeters=500,actualSpacingMeters=[dx*111320*np.cos(np.deg2rad(32.45)),dy*111320],quantizationMeters=1,changes='領域切り出し済みGeoTIFFを1m単位の整数に丸め、欠測と寄与マスクを保持。空間的な精細化なし。',min=float(values[finite].min()),max=float(values[finite].max()),missingCount=int((~finite).sum()),highResolutionContributionCount=int(np.isfinite(masked).sum()))
(destination/'aogashima-gmrt-4.5.0.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(metadata,ensure_ascii=False,indent=2))
