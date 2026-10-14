// The demo never calls a Bluetooth mutation endpoint or changes audio routing.
export function bluetoothView(changed,audio){
 const $=s=>document.querySelector(s);
 let visible=false,timer,version=0,page=0,demo=false,posting=false,listSignature='';
 let state={available:false,busy:false,devices:[],message:'Bluetooth wird geprüft …',error:null};
 const sample=()=>({available:true,busy:false,devices:[],message:'Boxen suchen, um die Bedienung zu testen.',error:null,output:null});
 function render(){
  const busy=state.busy||posting,devices=state.devices??[];page=Math.min(page,Math.max(0,Math.ceil(devices.length/2)-1));
  $('#bt-scan').disabled=!state.available||busy;$('#bt-scan').textContent=state.action==='scan'?'Suche läuft …':'Boxen suchen';
  const status=state.error??(busy?state.message:state.output?`Systemausgabe: ${state.output}`:state.message);
  $('#bt-status').textContent=(demo?'DEMO · keine echte Verbindung. ':'')+status;$('#bt-status').classList.toggle('error',!!state.error);$('#bt-status').title=$('#bt-status').textContent;
  const fragment=document.createDocumentFragment();
  for(const device of devices.slice(page*2,page*2+2)){
   const button=document.createElement('button');button.className='bt-device';button.dataset.btAddress=device.address;button.disabled=busy;
   const text=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small'),action=document.createElement('span');
   name.textContent=device.name;detail.textContent=device.output?'Verbunden · Audio bereit':device.connected?'Verbunden · Ausgabe wählen':device.paired?'Gekoppelt':'Nicht gekoppelt';
   action.className='bt-device-action';action.textContent=device.output?'Trennen':device.connected?'Auswählen':device.paired?'Verbinden':'Koppeln';
   text.append(name,detail);button.append(text,action);button.setAttribute('aria-label',`${device.name}: ${action.textContent}`);button.setAttribute('aria-pressed',String(!!device.output));fragment.append(button);
  }
  const signature=JSON.stringify([page,busy,devices]);if(signature!==listSignature){$('#bt-devices').replaceChildren(fragment);listSignature=signature;}$('#bt-devices').hidden=!devices.length;
  $('#bt-paging').hidden=devices.length<=2;$('#bt-page').textContent=`${page+1} / ${Math.ceil(devices.length/2)}`;
  $('#bt-previous').disabled=busy||page===0;$('#bt-next').disabled=busy||(page+1)*2>=devices.length;
  $('#bt-fallback').hidden=state.available&&!demo;$('#bt-demo').textContent=demo?'Demo beenden':'Demo ansehen';
  $('#output-status').hidden=!$('#output-status').textContent;
  changed();
 }
 function schedule(){clearTimeout(timer);if(visible&&!demo)timer=setTimeout(refresh,state.busy?1200:5000);}
 async function refresh(){
  if(demo||posting||!visible)return;
  if(window.frameElement?.hidden){schedule();return;}
  const own=++version,before=JSON.stringify(state);
  try{const response=await fetch('./api/bluetooth',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('Bluetooth-Dienst nicht erreichbar. Lokalen Server neu starten.');const data=await response.json();if(own!==version)return;state=data;}
  catch(error){if(own!==version)return;state={available:false,busy:false,devices:[],error:null,message:error.message==='Bluetooth-Dienst nicht erreichbar. Lokalen Server neu starten.'?error.message:'Bluetooth-Dienst nicht erreichbar. Lokalen Server prüfen.'};}
  if(JSON.stringify(state)!==before)render();schedule();
 }
 async function act(action,address){
  if(state.busy||posting)return;
  const own=++version;clearTimeout(timer);posting=true;state={...state,error:null,action,message:action==='scan'?'Boxen werden gesucht …':'Verbindung wird geändert …'};render();
  if(demo){
   state.busy=true;render();await new Promise(resolve=>setTimeout(resolve,600));
   if(own!==version)return;
   if(action==='scan')state.devices=[{address:'DEMO-1',name:'Mpow BH044D (Beispiel)',paired:false},{address:'DEMO-2',name:'Wohnzimmer-Box',paired:true},{address:'DEMO-3',name:'Küchenradio',paired:true}];
   else{for(const d of state.devices){d.output=d.address===address&&action==='connect';d.connected=!!d.output;if(d.output)d.paired=true;}state.output=state.devices.find(d=>d.output)?.name??null;}
   state.busy=false;state.action=null;state.message=action==='scan'?'Beispielgeräte auswählen.':'Bedienung getestet.';
  }else{
   try{
    const response=await fetch('./api/bluetooth',{method:'POST',headers:{'Content-Type':'application/json','X-Pi-Radio':'1'},body:JSON.stringify({action,...(address?{address}:{})}),signal:AbortSignal.timeout(12000)});
    const data=await response.json();if(own!==version)return;if(!response.ok)throw Error(data.error??'Bluetooth-Aktion fehlgeschlagen.');state=data;
    if(action==='connect'&&audio.setSinkId)try{await audio.setSinkId('');}catch{/* Most kiosk browsers already use the system default. */}
   }catch(error){if(own!==version)return;state={...state,error:error.name==='TimeoutError'?'Antwort fehlt. Verbindungsstatus wird erneut geprüft.':error.message};}
  }
  posting=false;render();schedule();
 }
 $('#bt-scan').addEventListener('click',()=>{page=0;void act('scan');});
 $('#bt-devices').addEventListener('click',event=>{const address=event.target.closest('[data-bt-address]')?.dataset.btAddress;if(!address)return;const device=state.devices.find(d=>d.address===address);if(device)void act(device.output?'disconnect':'connect',address);});
 $('#bt-previous').addEventListener('click',()=>{page=Math.max(0,page-1);render();});$('#bt-next').addEventListener('click',()=>{page++;render();});
 $('#bt-demo').addEventListener('click',()=>{version++;clearTimeout(timer);demo=!demo;posting=false;page=0;state=demo?sample():{available:false,busy:false,devices:[],message:'Bluetooth wird geprüft …',error:null};render();if(!demo)void refresh();});
 return {setVisible(value){visible=value;clearTimeout(timer);if(value){render();if(!demo)void refresh();}}};
}
