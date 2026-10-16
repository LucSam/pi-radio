import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
const MAC=/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/i;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clean=text=>String(text).replace(/\x1b\[[0-9;]*[A-Za-z]/g,'').replace(/\r/g,'');
const fault=(message,status=503)=>Object.assign(new Error(message),{status});
export async function runCommand(command,args,timeout=8000){
 const {stdout}=await execute(command,args,{timeout,maxBuffer:1024*1024,env:{...process.env,LC_ALL:'C',LANG:'C'},windowsHide:true});
 return clean(stdout);
}
export function parseDevice(address,text){
 const field=name=>clean(text).match(new RegExp(`^\\s*${name}:\\s*(.+)$`,'m'))?.[1]?.trim();
 const audio=/0000110b-0000-1000-8000-00805f9b34fb/i.test(text);
 const candidate=audio||/^audio-/.test(field('Icon')??'')||((Number(field('Class'))&0x1f00)===0x0400);
 return {address,name:(field('Alias')??field('Name')??address).slice(0,100),paired:field('Paired')==='yes',trusted:field('Trusted')==='yes',connected:field('Connected')==='yes',audio,candidate};
}
const addresses=text=>[...new Set([...clean(text).matchAll(/^Device ((?:[0-9A-F]{2}:){5}[0-9A-F]{2}) /gim)].map(m=>m[1].toUpperCase()))].slice(0,40);
const matchesAddress=(item,address)=>{
 const props=item.properties??{};
 return [item.name,props['api.bluez5.address'],props['bluez5.address'],props['device.string'],props['bluez.path']].some(value=>String(value??'').toUpperCase().replace(/_/g,':').includes(address));
};
const jsonList=text=>{const data=JSON.parse(text);if(!Array.isArray(data))throw Error('Invalid audio list');return data;};
function errorMessage(error){
 const text=String(error.stderr??'')+' '+String(error.stdout??'')+' '+error.message;
 if(error.status)return error.message;
 if(error.code==='ENOENT')return 'Bluetooth-Werkzeuge fehlen. Pi-Einrichtung im README prüfen.';
 if(/Authentication|PIN|passkey|Rejected/i.test(text))return 'Kopplung abgelehnt. Kopplungsmodus prüfen. Falls eine PIN nötig ist, zuerst im Pi-Desktop koppeln.';
 if(/NotAuthorized|Permission|AccessDenied/i.test(text))return 'Bluetooth-Zugriff verweigert. Dienst als angemeldeter Desktopbenutzer starten.';
 if(/NotReady|rfkill|blocked/i.test(text))return 'Bluetooth ist ausgeschaltet oder gesperrt. Bluetooth am Pi einschalten.';
 if(/Connection refused|pa_context_connect/i.test(text))return 'Audio-Dienst nicht erreichbar. App in der Pi-Desktopsitzung starten.';
 if(error.killed||/Timeout|timed out/i.test(text))return 'Zeitüberschreitung. Box in Kopplungsmodus setzen und erneut versuchen.';
 return 'Verbindung nicht möglich. Box einschalten und eine bestehende Verbindung zum Handy oder Mac trennen.';
}

// No shell, sudo, arbitrary commands or background reconnect loop. Only explicit
// local user actions can scan, pair or change the system's audio destination.
export function createBluetooth({platform=process.platform,run=runCommand,wait=pause,scanSeconds=15}={}){
 let state={available:false,busy:false,action:null,devices:[],message:'Bluetooth wird geprüft.',error:null,output:null};
 let refreshed=0,refreshing,job;
 const required=async(command,args,timeout)=>{
  try{return await run(command,args,timeout);}catch(error){
   if(error.code==='ENOENT')throw fault(command==='pactl'?'pactl fehlt. Auf dem Pi das Paket pulseaudio-utils installieren.':'bluetoothctl fehlt. Auf dem Pi das Paket bluez installieren.');
   throw error;
  }
 };
 const bt=async(args,timeout=8000)=>{
  // In BlueZ 5.66 --timeout also delays successful one-shot commands until
  // the full timeout. Use it only to hold discovery open; Node bounds others.
  const cli=args[0]==='scan'?['--timeout',String(Math.ceil(timeout/1000)-1),...args]:args;
  const text=await required('bluetoothctl',cli,timeout);
  if(/Failed|No default controller|not available|org\.bluez\.Error/i.test(text))throw Object.assign(Error(text),{stdout:text});
  return text;
 };
 const pulse=(args)=>required('pactl',args);
 const list=async kind=>jsonList(await pulse(['--format=json','list',kind]));
 const hardBlock='Bluetooth ist durch eine Hardware-Sperre ausgeschaltet. Schalter oder Bluetooth-Einstellungen am Pi prüfen.';
 const softBlock='Bluetooth ist am Pi per Software gesperrt. Bluetooth in den Systemeinstellungen einschalten und erneut versuchen.';
 const rfkill=async(args)=>{
  try{return await run('rfkill',args);}catch(error){
   if(error.code!=='ENOENT')throw error;
   // Desktop user services may omit Debian's sbin directory from PATH.
   return run('/usr/sbin/rfkill',args);
  }
 };
 async function radioBlocks(){
  // Optional: a missing/older rfkill must not prevent normal BlueZ operation.
  // Explicit columns and C locale keep the util-linux JSON format predictable.
  try{
   const rows=JSON.parse(await rfkill(['--json','--output','ID,TYPE,SOFT,HARD','list','bluetooth'])).rfkilldevices;
   if(!Array.isArray(rows))return null;
   const bluetooth=rows.filter(row=>row?.type==='bluetooth');
   if(bluetooth.some(row=>!Number.isSafeInteger(row.id)||row.id<0||row.id>0xffffffff||!['blocked','unblocked'].includes(row.soft)||!['blocked','unblocked'].includes(row.hard)))return null;
   return bluetooth;
  }catch{return null;}
 }
 async function powerOn(){
  const blocks=await radioBlocks();
  if(blocks?.some(row=>row.hard==='blocked'))throw fault(hardBlock);
  const soft=blocks?.filter(row=>row.soft==='blocked')??[];
  for(const row of soft){
   // Only verified Bluetooth IDs, never "all", WLAN or a client-supplied ID.
   try{await rfkill(['unblock',String(row.id)]);}catch(error){
    const denied=error.code==='EACCES'||error.code==='EPERM'||/Permission|not permitted|AccessDenied/i.test(String(error.stderr??'')+' '+error.message);
    throw fault(denied?'Bluetooth ist per Software gesperrt; der App fehlen die Rechte zum Entsperren. Bluetooth in den Systemeinstellungen am Pi einschalten.':softBlock);
   }
  }
  if(soft.length){
   const after=await radioBlocks();
   if(after?.some(row=>row.hard==='blocked'))throw fault(hardBlock);
   if(!after||soft.some(row=>!after.some(next=>next.id===row.id&&next.soft==='unblocked')))throw fault(softBlock);
  }
  try{await bt(['power','on']);}catch(error){
   // A controller power failure is not evidence of a problem with the box.
   const after=await radioBlocks();
   if(after?.some(row=>row.hard==='blocked'))throw fault(hardBlock);
   if(after?.some(row=>row.soft==='blocked'))throw fault(softBlock);
   if(error.status||/NotAuthorized|Permission|AccessDenied/i.test(String(error.stderr??'')+' '+error.message))throw error;
   throw fault('Bluetooth am Pi lässt sich nicht einschalten. Bluetooth-Einstellungen und Bluetooth-Dienst am Pi prüfen.');
  }
 }
 async function inspect(){
  if(platform!=='linux')return {available:false,devices:[],output:null,message:'Bluetooth-Suche ist auf dem Raspberry Pi verfügbar. Am Mac die Box unter Systemeinstellungen → Bluetooth und Ton wählen.'};
  const controller=await bt(['show']);
  if(!/Controller (?:[0-9A-F]{2}:){5}[0-9A-F]{2}/i.test(controller))throw fault('Kein Bluetooth-Adapter gefunden.');
  const sinks=await list('sinks'),defaultSink=(await pulse(['get-default-sink'])).trim();
  const devices=[];
  for(const address of addresses(await bt(['devices']))){
   try{
    const device=parseDevice(address,await bt(['info',address]));
    if(!device.candidate)continue;
    device.output=device.connected&&sinks.some(s=>s.name===defaultSink&&matchesAddress(s,address));
    devices.push(device);
   }catch{/* A device can disappear between discovery and inspection. */}
  }
  devices.sort((a,b)=>Number(b.output)-Number(a.output)||Number(b.paired)-Number(a.paired)||a.name.localeCompare(b.name,'de'));
  const sink=sinks.find(s=>s.name===defaultSink);
  return {available:true,devices,output:sink?.description??sink?.name??null,message:devices.length?'Box auswählen.':'Box in Kopplungsmodus setzen, dann suchen.',powered:/Powered: yes/.test(controller)};
 }
 async function refresh(force=false){
  if(state.busy)return {...state};
  if(refreshing)return refreshing;
  if(!force&&Date.now()-refreshed<2000)return {...state};
  refreshing=(async()=>{
   try{state={...state,...await inspect()};}catch(error){state={...state,available:false,devices:[],output:null,message:errorMessage(error)};}
   refreshed=Date.now();return {...state};
  })();
  try{return await refreshing;}finally{refreshing=undefined;}
 }
 async function routeAudio(address){
  let sink;
  for(let attempt=0;attempt<12;attempt++){
   const card=(await list('cards')).find(c=>matchesAddress(c,address));let stereo=false;
   if(card){
    const profiles=Array.isArray(card.profiles)?card.profiles:Object.entries(card.profiles??{}).map(([name,value])=>({name,...value}));
    const profile=profiles.filter(p=>/^a2dp[-_]sink/.test(p.name)&&p.available!=='no').sort((a,b)=>b.priority-a.priority)[0];
    const active=typeof card.active_profile==='string'?card.active_profile:card.active_profile?.name;
    stereo=/^a2dp[-_]sink/.test(active??'');
    if(profile&&!stereo){await pulse(['set-card-profile',String(card.index),profile.name]);stereo=true;}
   }
   sink=(await list('sinks')).find(s=>matchesAddress(s,address)&&(stereo||/a2dp/i.test(`${s.name} ${s.properties?.['bluetooth.protocol']??''} ${s.properties?.['api.bluez5.profile']??''}`)));
   if(sink)break;
   await wait(350);
  }
  if(!sink)throw fault('Bluetooth verbunden, aber keine Stereo-Audioausgabe verfügbar. A2DP/PipeWire auf dem Pi prüfen.');
  await pulse(['set-default-sink',sink.name]);
  const streams=await list('sink-inputs');
  for(const stream of streams){
   const binary=stream.properties?.['application.process.binary']??'';
   if(!/^(chromium|chromium-browser|chrome|google-chrome|firefox)(-bin)?$/.test(binary))continue;
   try{await pulse(['move-sink-input',String(stream.index),sink.name]);}catch{
    if((await list('sink-inputs')).some(s=>s.index===stream.index))throw fault('Box als Ausgabe gewählt; laufenden Sender stoppen und erneut abspielen.');
   }
  }
  if((await pulse(['get-default-sink'])).trim()!==sink.name)throw fault('Die Box konnte nicht als Audioausgabe bestätigt werden.');
 }
 async function connect(address){
  let device=parseDevice(address,await bt(['info',address]));
  if(!device.candidate)throw fault('Das gewählte Gerät meldet keine Audiofunktion.',400);
  await powerOn();
  // Calling pair on an already paired device removes its existing pairing.
  if(!device.paired)await bt(['--agent','NoInputNoOutput','pair',address],50000);
  device=parseDevice(address,await bt(['info',address]));
  if(!device.paired)throw fault('Kopplung nicht bestätigt. Box erneut in Kopplungsmodus setzen.');
  if(!device.audio)throw fault('Das Gerät bietet kein A2DP-Stereo-Profil.');
  await bt(['trust',address]);
  // BlueZ 5.66 (Bookworm) has no optional profile argument for connect.
  // Enforce the stereo profile in the audio service immediately afterwards.
  if(!device.connected)await bt(['connect',address],25000);
  device=parseDevice(address,await bt(['info',address]));
  if(!device.connected)throw fault('Die Box ist gekoppelt, aber nicht verbunden.');
  await routeAudio(address);
 }
 async function act(action,address){
  if(state.busy)throw fault('Ein Bluetooth-Vorgang läuft bereits.',409);
  if(!['scan','connect','disconnect'].includes(action))throw fault('Unbekannte Bluetooth-Aktion.',400);
  // Reserve the operation before asynchronous inspection; concurrent POSTs
  // cannot start overlapping scans/pairings while the first one awaits I/O.
  if(job)throw fault('Ein Bluetooth-Vorgang läuft bereits.',409);
  job=Promise.resolve();
  try{
   await refresh(true);
   if(!state.available)throw fault(state.message);
   if(action!=='scan'&&(typeof address!=='string'||!MAC.test(address)||!state.devices.some(d=>d.address===address.toUpperCase())))throw fault('Gerät nicht in der aktuellen Liste. Erneut suchen.',400);
   address=address?.toUpperCase();
   state={...state,busy:true,action,error:null,message:action==='scan'?'Boxen werden gesucht …':action==='connect'?'Box wird verbunden …':'Verbindung wird getrennt …'};
   job=(async()=>{
    let error=null;
    try{
     if(action==='scan'){await powerOn();await bt(['scan','bredr'],(scanSeconds+1)*1000);}
     else if(action==='connect')await connect(address);
     else await bt(['disconnect',address],15000);
    }catch(e){error=errorMessage(e);}
    try{state={...state,...await inspect()};}catch(e){state={...state,available:false,devices:[],output:null,message:errorMessage(e)};error??=state.message;}
    if(!error&&action==='connect'&&!state.devices.some(d=>d.address===address&&d.output))error='Die Audioverbindung konnte nicht bestätigt werden. Erneut verbinden.';
    if(!error&&action==='disconnect'&&state.devices.some(d=>d.address===address&&d.connected))error='Die Box ist weiterhin verbunden. Erneut trennen.';
    state={...state,busy:false,action:null,error,message:error??(action==='scan'?(state.devices.length?'Suche beendet. Box auswählen.':'Keine Audiogeräte gefunden. Kopplungsmodus prüfen.'):action==='connect'?'Box verbunden · Audio bereit.':'Bluetooth-Verbindung getrennt.')};
    refreshed=Date.now();
   })().finally(()=>{job=undefined;});
   return {...state};
  }catch(error){job=undefined;throw error;}
 }
 return {state:refresh,act,settled:async()=>{await job;return {...state};}};
}

export function localRequest(req){
 const host=req.headers.host??'';
 return /^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)&&(!req.headers.origin||req.headers.origin===`http://${host}`)&&req.headers['sec-fetch-site']!=='cross-site';
}
export function bluetoothHandler(adapter=createBluetooth()){
 return async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
  const send=(status,value)=>{res.writeHead(status);res.end(JSON.stringify(value));};
  if(!localRequest(req)){send(403,{error:'Nur lokale Anfragen sind erlaubt.'});return;}
  try{
   if(req.method==='GET'){send(200,await adapter.state());return;}
   if(req.method!=='POST'){send(405,{error:'GET oder POST erforderlich.'});return;}
   if(req.headers.origin!==`http://${req.headers.host}`||req.headers['x-pi-radio']!=='1'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']??'')){send(403,{error:'Lokale App-Anfrage erforderlich.'});return;}
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>1024)throw fault('Anfrage zu groß.',413);}
   let input;try{input=JSON.parse(body);}catch{throw fault('Ungültiges JSON.',400);}
   if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['action','address'].includes(k)))throw fault('Ungültige Anfrage.',400);
   send(202,await adapter.act(input.action,input.address));
  }catch(error){send(error.status??503,{error:errorMessage(error)});}
 };
}
export const serveBluetooth=bluetoothHandler();
