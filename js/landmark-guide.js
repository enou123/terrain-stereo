import { LANDMARKS, CATEGORIES, REGIONS, findLandmark, filterLandmarks } from './landmarks.js?v=0.27.0';
import { terrainExtent } from './elevation.js?v=0.27.0';

// UI owns no renderer state. Explicit visit/switch actions are supplied by app.js.
export function setupLandmarkGuide(actions){
  const select=document.querySelector('#map-place'),category=document.querySelector('#landmark-category'),region=document.querySelector('#landmark-region');
  const preview=document.querySelector('#landmark-preview'),guide=document.querySelector('#landmark-guide'),visit=document.querySelector('#visit-landmark');
  let selected=null,active=null,mode='terrain',busy=false;
  const addOption=(parent,value,label)=>{const option=document.createElement('option');option.value=value;option.textContent=label;parent.append(option);};
  Object.entries(CATEGORIES).forEach(([value,label])=>addOption(category,value,label));
  REGIONS.forEach(value=>addOption(region,value,value));
  function options(){
    const value=select.value;select.replaceChildren();addOption(select,'','地図で自由に選択');
    const places=filterLandmarks(category.value,region.value);
    for(const area of REGIONS){const found=places.filter(p=>p.region===area);if(!found.length)continue;const group=document.createElement('optgroup');group.label=area;for(const p of found)addOption(group,p.id,p.name);select.append(group);}
    if(places.some(p=>p.id===value))select.value=value;
    document.querySelector('#landmark-count').textContent=`${places.length} / ${LANDMARKS.length}か所`;
    return select.value;
  }
  function previewPlace(id){
    selected=findLandmark(id);preview.hidden=!selected;if(!selected)return;
    document.querySelector('#landmark-preview-title').textContent=selected.name;
    document.querySelector('#landmark-preview-meta').textContent=`${selected.prefecture} · ${selected.categories.map(k=>CATEGORIES[k]).join(' / ')}`;
    document.querySelector('#landmark-preview-copy').textContent=selected.summary;
    const mode=document.querySelector('#landmark-visit-mode').value,p=selected.settings[mode];
    document.querySelector('#landmark-preview-setting').textContent=`おすすめ：約${terrainExtent(selected.center.latitude,p.zoom).toFixed(1)} km四方 · 高さ${p.exaggeration.toFixed(1)}倍 · ${{geology:'地質図',shading:'陰影',elevation:'標高の色'}[p.surface]}（変更できます）`;
  }
  for(const filter of [category,region])filter.addEventListener('change',()=>{
    const value=options();previewPlace(value);actions.select?.(findLandmark(value));
  });
  select.addEventListener('change',()=>{previewPlace(select.value);actions.select?.(selected);});
  document.querySelector('#landmark-visit-mode').addEventListener('change',()=>previewPlace(select.value));
  visit.addEventListener('click',()=>selected&&!busy&&actions.visit(selected,document.querySelector('#landmark-visit-mode').value));
  function render(){
    guide.hidden=!active;if(!active)return;
    const content=active[mode];document.querySelector('#landmark-guide-title').textContent=active.name;
    document.querySelector('#landmark-guide-meta').textContent=`${active.prefecture} · ${mode==='geology'?'地質を学ぶ':'地形を楽しむ'}`;
    document.querySelector('#landmark-guide-summary').textContent=mode==='geology'?active.geology.rocks:active.summary;
    document.querySelector('#landmark-detail-copy').textContent=content.detail;
    const points=document.querySelector('#landmark-points');points.replaceChildren();for(const text of content.points){const li=document.createElement('li');li.textContent=text;points.append(li);}
    const geology=document.querySelector('#landmark-geology-facts');geology.hidden=mode!=='geology';
    document.querySelector('#landmark-age').textContent=active.geology.age;
    const caveats=document.querySelector('#landmark-limitations');caveats.replaceChildren();
    for(const text of [...active.limitations,'地質図は地表の概略区分です。地下の構造や成り立ちの説明は参考資料に基づきます。']){const li=document.createElement('li');li.textContent=text;caveats.append(li);}
    const references=document.querySelector('#landmark-references');references.replaceChildren();
    for(const reference of active.references){const li=document.createElement('li'),a=document.createElement('a');a.href=reference.url;a.textContent=reference.title;a.target='_blank';a.rel='noopener noreferrer';li.append(a);references.append(li);}
    document.querySelectorAll('[data-landmark-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.landmarkMode===mode)));
  }
  document.querySelectorAll('[data-landmark-mode]').forEach(button=>button.addEventListener('click',()=>active&&!busy&&actions.switchMode(active,button.dataset.landmarkMode)));
  document.querySelector('#landmark-recommend').addEventListener('click',()=>active&&!busy&&actions.visit(active,mode));
  document.querySelector('#landmark-show-geology-key').addEventListener('click',()=>actions.legend?.());
  options();
  return {
    preview:previewPlace,
    ensureOption(id){if(id&&!select.querySelector(`option[value="${id}"]`)){category.value='';region.value='';options();}select.value=id||'';previewPlace(id);},
    show(place,nextMode='terrain'){active=place;mode=nextMode;render();},
    clear(){active=null;render();},
    status(text){document.querySelector('#landmark-guide-status').textContent=text;},
    setBusy(value){busy=value;visit.disabled=value;document.querySelectorAll('[data-landmark-mode],#landmark-recommend').forEach(button=>button.disabled=value);},
    snapshot(){return {id:active?.id||null,mode,status:document.querySelector('#landmark-guide-status').textContent,selected:select.value,category:category.value,region:region.value};},
    restore(saved){category.value=saved.category;region.value=saved.region;options();this.ensureOption(saved.selected);this.show(findLandmark(saved.id),saved.mode);this.status(saved.status);},
    get active(){return active;},get mode(){return mode;},
  };
}
