import { loadElevation } from './elevation.js';
import { createMesh } from './mesh.js';
import { TerrainRenderer } from './renderer.js';
const message=document.querySelector('#message'), status=document.querySelector('#status');
const retry=document.querySelector('#retry'), state=document.querySelector('#data-state');
const slider=document.querySelector('#exaggeration'), factor=document.querySelector('#factor');
let renderer, data, loading=false;
function showError(error, canRetry=true) {
  message.hidden=false; message.classList.add('error');
  status.textContent=`${error.message} ${canRetry ? '通信環境を確認して、もう一度お試しください。' : 'WebGL 対応ブラウザでページを再読み込みしてください。'}`;
  retry.hidden=!canRetry; state.textContent='表示できません';
}
async function load() {
  if (loading) return;
  loading=true; retry.hidden=true; message.hidden=false; message.classList.remove('error');
  state.textContent='読み込み中'; status.textContent='標高データを取得しています…'; slider.disabled=true;
  try {
    if (!renderer) renderer=new TerrainRenderer(document.querySelector('#terrain'),showError);
    data=await loadElevation((done,total)=>status.textContent=`標高データを取得しています… ${done} / ${total}`);
    renderer.setMesh(createMesh(data,Number(slider.value)));
    document.querySelector('#extent').textContent=`${((data.size-1)*data.spacing).toFixed(1)} km四方`;
    state.textContent=`${data.tileCount}タイル取得済み`;
    message.hidden=true; slider.disabled=false;
  } catch (error) { showError(error, Boolean(renderer) && !renderer.lost); }
  finally { loading=false; }
}
slider.addEventListener('input',()=>{
  const value=Number(slider.value);
  factor.textContent=`${value.toFixed(1)}×`;
  if (data && renderer && !renderer.lost) renderer.setMesh(createMesh(data,value));
});
document.querySelector('#reset').addEventListener('click',()=>renderer?.reset());
retry.addEventListener('click',load);
load();
