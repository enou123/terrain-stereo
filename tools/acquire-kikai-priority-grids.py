"""Acquire bounded GMRT comparisons for Kikai plus eight island observation spots.
Creates reports and converted candidates as workflow artifacts. It never edits application grids.
"""
import datetime, hashlib, json, math, os, pathlib, time, traceback, urllib.parse, urllib.request
import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.transform import array_bounds

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path('output');OUT.mkdir(exist_ok=True)
# 30-50 km boxes around the existing catalog camera centers; Daito is focused
# on Minami-Daito while existing broad files continue to serve wide overviews.
SITES=[
 dict(id='kikai-narrow',name='喜界島・狭域',center=[28.323,129.971],bounds=[129.78,130.14,28.18,28.46],depthScaleMax=1000,baseline='okinawa-islands'),
 dict(id='aogashima-narrow',name='青ヶ島・狭域',center=[32.46,139.76],bounds=[139.56,139.96,32.26,32.66],depthScaleMax=2000,baseline='aogashima'),
 dict(id='hachijo-narrow',name='八丈島・狭域',center=[32.99,139.86],bounds=[139.66,140.06,32.79,33.19],depthScaleMax=3000,baseline='hachijo-aogashima'),
 dict(id='satsuma-iwojima-narrow',name='薩摩硫黄島・狭域',center=[30.78,130.28],bounds=[130.08,130.48,30.58,30.98],depthScaleMax=3000,baseline='tokara-amami'),
 dict(id='suwanose-narrow',name='諏訪之瀬島・狭域',center=[29.64,129.72],bounds=[129.52,129.92,29.44,29.84],depthScaleMax=3000,baseline='tokara-amami'),
 dict(id='kuchinoerabu-narrow',name='口永良部島・狭域',center=[30.46,130.20],bounds=[130.00,130.40,30.26,30.66],depthScaleMax=3000,baseline='tokara-amami'),
 dict(id='nishinoshima-narrow',name='西之島・狭域',center=[27.25,140.88],bounds=[140.68,141.08,27.05,27.45],depthScaleMax=5000,baseline='izu-south'),
 dict(id='yonaguni-narrow',name='与那国島・狭域',center=[24.46,123.00],bounds=[122.80,123.20,24.26,24.66],depthScaleMax=5000,baseline='yaeyama'),
 dict(id='minamidaito-narrow',name='南大東島・狭域',center=[25.80,131.20],bounds=[131.00,131.40,25.60,26.00],depthScaleMax=3000,baseline='daito'),
]
RESOLUTION=100
MAX_CELLS=900_000
MAX_BYTES=12*1024*1024

def sha(data):return hashlib.sha256(data).hexdigest()
def gmrt_url(bounds,layer):
 w,e,s,n=bounds
 return 'https://www.gmrt.org/services/GridServer?'+urllib.parse.urlencode(dict(west=w,east=e,south=s,north=n,layer=layer,format='geotiff',mresolution=RESOLUTION))
def fetch(url):
 start=time.monotonic();req=urllib.request.Request(url,headers={'User-Agent':'terrain-stereo-bathymetry/1.0'})
 with urllib.request.urlopen(req,timeout=90) as res:
  data=res.read(MAX_BYTES+1)
  if res.status!=200 or len(data)>MAX_BYTES:raise ValueError('request exceeded bounded size or failed')
 return data,dict(url=url,status=200,bytes=len(data),seconds=round(time.monotonic()-start,3),sha256=sha(data),filename=res.headers.get('Content-Disposition'))
def read(data):
 with MemoryFile(data) as f, f.open() as src:
  if src.count!=1 or src.crs.to_epsg()!=4326 or src.width*src.height>MAX_CELLS:raise ValueError(f'unsafe raster {src.width}x{src.height} {src.crs}')
  a=src.read(1,masked=True).filled(np.nan).astype('float32');t=src.transform
  if t.a<=0 or t.e>=0:raise ValueError('not north-up')
  return a,t,src.bounds,dict(width=src.width,height=src.height,cells=int(a.size),bounds=list(src.bounds),transform=list(t)[:6],dtype=src.dtypes[0],nodata=src.nodata,missing=int((~np.isfinite(a)).sum()),spacingApprox=[t.a*111320*math.cos(math.radians((src.bounds.top+src.bounds.bottom)/2)),-t.e*111320])
def load_existing(region_id):
 meta=json.loads((ROOT/'data/bathymetry'/f'{region_id}.json').read_text());raw=(ROOT/'data/bathymetry'/meta['file']).read_bytes();n=meta['width']*meta['height']
 if sha(raw)!=meta['sha256']:raise ValueError(f'baseline hash mismatch: {region_id}')
 vals=np.frombuffer(raw[:n*2],'<i2').astype('float32').reshape(meta['height'],meta['width']);vals[vals==meta['nodata']]=np.nan
 return meta,vals

def interpolate(meta,a,lon,lat):
 x=(lon-meta['lon0'])/meta['dx'];y=(lat-meta['lat0'])/meta['dy'];inside=(x>=0)&(y>=0)&(x<meta['width']-1)&(y<meta['height']-1)
 ix=np.clip(np.floor(x).astype(int),0,meta['width']-2);iy=np.clip(np.floor(y).astype(int),0,meta['height']-2);fx=x-ix;fy=y-iy
 v0=a[iy,ix];v1=a[iy,ix+1];v2=a[iy+1,ix];v3=a[iy+1,ix+1];good=inside&np.isfinite(v0)&np.isfinite(v1)&np.isfinite(v2)&np.isfinite(v3)
 out=((v0*(1-fx)+v1*fx)*(1-fy)+(v2*(1-fx)+v3*fx)*fy);return np.where(good,out,np.nan)
def stats(delta):
 d=delta[np.isfinite(delta)]
 if not len(d):return {'n':0}
 ad=np.abs(d);return {'n':int(len(d)),'biasM':float(d.mean()),'rmseM':float(np.sqrt(np.mean(d*d))),'absP50M':float(np.percentile(ad,50)),'absP95M':float(np.percentile(ad,95)),'absMaxM':float(ad.max())}
def pack(site,data,mask_data,requests,report_date):
 a,t,bounds,info=read(data);ma,mt,mb,mi=read(mask_data)
 if a.shape!=ma.shape or t!=mt:raise ValueError('topo/topo-mask raster mismatch')
 valid=np.isfinite(a);water=valid&(a<0);high=np.isfinite(ma);water_hr=water&high
 if water.sum()<100:raise ValueError('too few valid water cells')
 w,s,e,n=bounds.left,bounds.bottom,bounds.right,bounds.top
 lon0=w+t.a/2;lat0=n+t.e/2;dx=t.a;dy=t.e
 enc=np.full(a.shape,-32768,'<i2');enc[valid]=np.rint(a[valid]).astype('<i2')
 raw=enc.tobytes()+np.packbits(high.ravel(),bitorder='little').tobytes();identifier=site['id'];filename=identifier+'-gmrt-4.5.0.bin'
 (OUT/filename).write_bytes(raw)
 meta=dict(format='gmrt-int16-mask-v1',id=identifier,name=site['name'],width=int(a.shape[1]),height=int(a.shape[0]),lon0=lon0,lat0=lat0,dx=dx,dy=dy,nodata=-32768,file=filename,bytes=len(raw),sha256=sha(raw),sourceSha256=requests[0]['sha256'],maskSourceSha256=requests[1]['sha256'],sourceVersion='GMRT v4.5.0 (response filename, 2026-10)',baseSource='GMRT GridServer topo product; background edition is not stated by this GridServer page. topo-mask records higher-resolution marine contributions.',retrievedAt=report_date,requestedBounds=dict(west=site['bounds'][0],east=site['bounds'][1],south=site['bounds'][2],north=site['bounds'][3]),actualRasterBounds=list(array_bounds(a.shape[0],a.shape[1],t)),requestedSpacingMeters=RESOLUTION,actualSpacingMeters=info['spacingApprox'],depthScaleMax=site['depthScaleMax'],quantizationMeters=1,license='CC BY 4.0',citation='Ryan et al. (2009), doi:10.1029/2008GC002332; GMRT data doi:10.1594/IEDA.100001',termsUrl='https://www.gmrt.org/about/terms_of_use.php',sourceUrl=requests[0]['url'],maskSourceUrl=requests[1]['url'],minimum=float(np.nanmin(a)),maximum=float(np.nanmax(a)),seaMinimum=float(np.nanmin(a[water])),seaMaximum=float(np.nanmax(a[water])),missingCount=int((~valid).sum()),highResolutionContributionCount=int(high.sum()),marineHighResolutionContributionCount=int(water_hr.sum()),requests=requests)
 (OUT/(identifier+'.json')).write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
 yy,xx=np.indices(a.shape);lon=lon0+xx*dx;lat=lat0+yy*dy;inside=(lon>=site['bounds'][0])&(lon<=site['bounds'][1])&(lat>=site['bounds'][2])&(lat<=site['bounds'][3]);water_in=inside&water;coarse_meta,coarse=load_existing(site['baseline']);coarse_on_fine=interpolate(coarse_meta,coarse,lon,lat);delta=a-coarse_on_fine
 report=dict(status='ok',id=identifier,name=site['name'],center=site['center'],bounds=meta['requestedBounds'],topo=info,mask=mi,requestedSpacingMeters=RESOLUTION,actualSpacingMeters=info['spacingApprox'],waterCells=int(water_in.sum()),waterDepthRangeM=[float(-np.nanmax(a[water_in])),float(-np.nanmin(a[water_in]))],highResolutionMaskFinite=int((inside&high).sum()),highResolutionMarineCells=int((water_in&high).sum()),highResolutionMarinePercent=float(100*(water_in&high).sum()/water_in.sum()),baseline=dict(id=site['baseline'],gridMeters=coarse_meta['actualSpacingMeters'],sha256=coarse_meta['sha256']),differenceFromExisting=dict(allMarine=stats(delta[water_in]),contributed=stats(delta[water_in&high]),background=stats(delta[water_in&~high])),packedBytes=len(raw),packedSha256=meta['sha256'],sourceSha256=meta['sourceSha256'],topoMaskSha256=meta['maskSourceSha256'],requests=requests)
 (OUT/(identifier+'-comparison.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');return report

def main():
 report={'source':'GMRT official GridServer','regionGroup':'kikai-and-priority-eight','retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'requestedSpacingMeters':RESOLUTION,'boundsRationale':'tight footprints around the catalog observation centers; existing regional data serves broad views','sites':[]}
 for site in SITES:
  row=dict(id=site['id'],name=site['name'],baseline=site['baseline'])
  try:
   reqs=[];items=[]
   for layer in ['topo','topo-mask']:
    data,meta=fetch(gmrt_url(site['bounds'],layer));(OUT/f"{site['id']}-{layer}.tif").write_bytes(data);reqs.append(meta);items.append(data);time.sleep(1.1)
   row.update(pack(site,items[0],items[1],reqs,report['retrievedAt']))
  except Exception as ex:row.update(status='failed',error=f'{type(ex).__name__}: {ex}',trace=traceback.format_exc(limit=3))
  report['sites'].append(row);print(json.dumps({k:row.get(k) for k in ['id','status','actualSpacingMeters','packedBytes','highResolutionMarineCells','differenceFromExisting','error']},ensure_ascii=False),flush=True)
 report['successful']=sum(s.get('status')=='ok' for s in report['sites']);report['failed']=len(SITES)-report['successful'];report['packedBytes']=sum(s.get('packedBytes',0) for s in report['sites']);report['totalTiffBytes']=sum(sum(r['bytes'] for r in s.get('requests',[])) for s in report['sites'])
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['successful','failed','packedBytes','totalTiffBytes']}),flush=True)
 if not report['successful']:raise SystemExit(1)
if __name__=='__main__':main()
