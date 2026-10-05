// Layout and focus only: no terrain requests, renderer state changes or copied controls.
export function setupViewerUI() {
  const workspace=document.querySelector('#workspace');
  const panel=document.querySelector('#view-settings');
  const settings=document.querySelector('#toggle-settings');
  const expand=document.querySelector('#expand-view');
  const landscape=matchMedia('(orientation: landscape) and (max-height: 600px) and (max-width: 1100px)');
  const background=[document.querySelector('.header'), ...document.querySelector('main').children].filter(element=>element!==workspace);
  let focused=false, settingsOpen=!landscape.matches, normalSettings=settingsOpen;
  let previousFocus, previousScroll, backgroundState=[];
  function render() {
    workspace.classList.toggle('settings-closed',!settingsOpen);
    panel.hidden=!settingsOpen;
    settings.setAttribute('aria-expanded',String(settingsOpen));
    settings.textContent=settingsOpen ? '設定を閉じる' : '設定を開く';
    expand.setAttribute('aria-pressed',String(focused));
    expand.textContent=focused ? '元の表示に戻す' : '大きく表示';
  }
  function setFocused(next) {
    if(next===focused) return;
    focused=next;
    document.body.classList.toggle('view-focused',focused);
    if(focused) {
      previousFocus=document.activeElement;
      previousScroll=[window.scrollX,window.scrollY];
      normalSettings=settingsOpen;
      settingsOpen=false;
      backgroundState=background.map(element=>[element,element.inert]);
      for(const [element] of backgroundState) element.inert=true;
      workspace.setAttribute('role','dialog');
      workspace.setAttribute('aria-modal','true');
      render();
      expand.focus({preventScroll:true});
    } else {
      for(const [element,inert] of backgroundState) element.inert=inert;
      workspace.removeAttribute('role'); workspace.removeAttribute('aria-modal');
      settingsOpen=normalSettings;
      render();
      window.scrollTo(...previousScroll);
      previousFocus?.focus({preventScroll:true});
    }
  }
  settings.addEventListener('click',()=>{
    settingsOpen=!settingsOpen;
    if(!focused) normalSettings=settingsOpen;
    render();
  });
  expand.addEventListener('click',()=>setFocused(!focused));
  document.querySelector('#back-to-map').addEventListener('click',event=>{
    event.preventDefault();
    setFocused(false);
    const picker=document.querySelector('#place-picker');
    picker.scrollIntoView({block:'start',behavior:'auto'});
    picker.focus({preventScroll:true});
  });
  landscape.addEventListener('change',()=>{
    normalSettings=!landscape.matches;
    if(!focused) {
      // A rotation must not leave keyboard focus inside a newly hidden panel.
      if(!normalSettings && panel.contains(document.activeElement)) settings.focus({preventScroll:true});
      settingsOpen=normalSettings; render();
    }
  });
  workspace.addEventListener('keydown',event=>{
    if(event.key==='Escape') {
      if(settingsOpen) {settingsOpen=false; render(); settings.focus({preventScroll:true});}
      else if(focused) setFocused(false);
      else return;
      event.preventDefault();
    }
    if(!focused || event.key!=='Tab') return;
    const focusable=[...workspace.querySelectorAll('a[href],button,select,input,summary,canvas[tabindex]')].filter(element=>!element.disabled && element.getClientRects().length);
    const first=focusable[0], last=focusable.at(-1);
    if(event.shiftKey && document.activeElement===first) {event.preventDefault(); last.focus();}
    else if(!event.shiftKey && document.activeElement===last) {event.preventDefault(); first.focus();}
  });
  render();
}
