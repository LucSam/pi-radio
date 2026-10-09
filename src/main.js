import {stations as presets,streamUrl} from './stations.js';
const $=s=>document.querySelector(s),audio=$('#audio'),embedded=parent!==window;
const bridge=(type,extra={})=>{if(embedded)parent.postMessage({protocol:'pi-display-v1',type,...extra},location.origin);};
let stored;try{stored=JSON.parse(localStorage.getItem('pi-radio')??'{}');}catch{stored={};}
const stations=[...presets,...(Array.isArray(stored.custom)?stored.custom:[]).filter(s=>typeof s.name==='string'&&s.name.length<=50&&streamUrl(s.url)).slice(0,30)];
let selected=stations.find(s=>s.id===stored.selected)??stations[0],page=0,pending=false,request=0,timeout;
let metadataRequest=0,metadataController,metadataTimer;
audio.volume=1; // Loudness is controlled by the Mac/Pi or the speaker.
const persist=()=>{try{localStorage.setItem('pi-radio',JSON.stringify({selected:selected.id,custom:stations.filter(s=>s.custom)}));}catch{status('Einstellungen können nicht gespeichert werden.',true);}};
function status(text,error=false){$('#state').textContent=text;$('#state').classList.toggle('error',error);bridge('rendered');}
function publish(){bridge('radio-state',{playing:!audio.paused&&!pending,station:selected.name});}
function stationMenu(open){$('#station-menu').hidden=!open;$('#station-picker').setAttribute('aria-expanded',String(open));if(open)$('#station-menu button').focus();bridge('rendered');}
function resetMetadata(){
 metadataRequest++;metadataController?.abort();clearTimeout(metadataTimer);
 $('#track-title').textContent='Titelinformationen werden geladen …';$('#track-artist').textContent='';$('#track-label').textContent='Aktuelles Programm';
 $('#stream-info').textContent='Internetradio · '+selected.region;
 void loadMetadata();
}
async function loadMetadata(){
 const version=++metadataRequest,id=selected.id;metadataController?.abort();metadataController=new AbortController();
 try{
  if(selected.custom){$('#track-title').textContent='Keine Titelquelle für diesen Sender';return;}
  const response=await fetch(`./api/now-playing?station=${encodeURIComponent(id)}`,{signal:metadataController.signal,cache:'no-store'});
  if(!response.ok)throw Error();const data=await response.json();if(version!==metadataRequest||id!==selected.id)return;
  $('#track-title').textContent=data.title||'Der Sender liefert keinen Titel';$('#track-artist').textContent=data.artist||'';
  const stamp=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'}).format(data.fetchedAt);
  const played=data.kind==='playlist'&&Number.isFinite(data.playedAt)?new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(data.playedAt):null;
  $('#track-label').textContent=played?`Zuletzt gespielt · ${played}${data.stale?' · älter':''}`:data.playlistUnavailable?'Streamangabe · Playlist fehlt':data.title?`Titelangabe · ${stamp}`:'Aktuelles Programm';
  $('#stream-info').textContent=['Internetradio',data.codec,data.bitrate?`${data.bitrate} kbit/s`:null,data.sampleRate?`${(data.sampleRate/1000).toLocaleString('de-DE')} kHz Abtastrate`:null].filter(Boolean).join(' · ');
 }catch(error){if(version!==metadataRequest||error.name==='AbortError')return;$('#track-title').textContent='Titelinformationen nicht verfügbar';$('#track-artist').textContent='';$('#track-label').textContent='Aktuelles Programm';}
 finally{if(version===metadataRequest){bridge('rendered');metadataTimer=setTimeout(loadMetadata,45000);}}
}
function render(){
 $('#station-name').textContent=selected.name;$('#play').textContent=(!audio.paused||pending)?'Stoppen':'Abspielen';$('#play').setAttribute('aria-label',(!audio.paused||pending)?'Radio stoppen':'Radio starten');
 $('#mute').textContent=audio.muted?'Ton an':'Ton aus';$('#mute').setAttribute('aria-pressed',String(audio.muted));
 $('#stations').replaceChildren();for(const station of stations.slice(page*4,page*4+4)){const button=document.createElement('button');button.className='station';button.dataset.station=station.id;button.setAttribute('aria-pressed',String(station.id===selected.id));const name=document.createElement('strong'),region=document.createElement('span');name.textContent=station.name;region.textContent=station.region;button.append(name,region);$('#stations').append(button);}
 $('#page-number').textContent=`Seite ${page+1} von ${Math.ceil(stations.length/4)}`;$('#previous').disabled=page===0;$('#next').disabled=(page+1)*4>=stations.length;bridge('rendered');
}
function stop(){request++;clearTimeout(timeout);pending=false;audio.pause();audio.removeAttribute('src');audio.load();status('Gestoppt');render();publish();}
async function play(){
 stop();const current=++request;pending=true;status('Verbindung wird aufgebaut …');audio.src=selected.url;render();
 timeout=setTimeout(()=>{if(current!==request)return;stop();status('Sender antwortet nicht. Erneut starten oder anderen Sender wählen.',true);},20000);
 try{await audio.play();if(current!==request)return;}
 catch(error){if(current!==request)return;stop();status(error.name==='NotAllowedError'?'Zum Starten auf Abspielen tippen.':'Stream nicht erreichbar oder nicht abspielbar.',true);}
}
audio.addEventListener('playing',()=>{clearTimeout(timeout);pending=false;status('Live');render();publish();});
audio.addEventListener('waiting',()=>{if(audio.src)status('Verbindung wird gepuffert …');});
audio.addEventListener('stalled',()=>{if(audio.src)status('Stream lädt nach …');});
audio.addEventListener('error',()=>{if(!audio.getAttribute('src'))return;stop();status(navigator.onLine?'Stream nicht erreichbar. Erneut starten oder anderen Sender wählen.':'Offline · Radio benötigt Internet.',true);});
audio.addEventListener('ended',()=>{stop();status('Stream beendet. Erneut starten.',true);});
$('#play').addEventListener('click',()=>{if(!audio.paused||pending)stop();else void play();});
$('#mute').addEventListener('click',()=>{audio.muted=!audio.muted;render();});
$('#station-picker').addEventListener('click',()=>stationMenu($('#station-menu').hidden));$('#close-stations').addEventListener('click',()=>stationMenu(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){stationMenu(false);$('#station-picker').focus();}});
$('#stations').addEventListener('click',e=>{const button=e.target.closest('[data-station]');if(!button)return;stationMenu(false);const station=stations.find(s=>s.id===button.dataset.station);if(station.id===selected.id&&!audio.paused)return;selected=station;resetMetadata();persist();render();void play();});
$('#previous').addEventListener('click',()=>{page=Math.max(0,page-1);render();});$('#next').addEventListener('click',()=>{page=Math.min(Math.ceil(stations.length/4)-1,page+1);render();});
function show(id){stationMenu(false);for(const page of ['player','output','custom'])$('#'+page).hidden=page!==id;bridge('rendered');}
document.addEventListener('click',e=>{const id=e.target.closest('[data-page]')?.dataset.page;if(id)show(id);});
$('#home').addEventListener('click',()=>{if(embedded)bridge('home');else location.href='http://127.0.0.1:5173/';});
$('#station-form').addEventListener('submit',e=>{e.preventDefault();const name=$('#custom-name').value.trim(),url=streamUrl($('#custom-url').value.trim());if(!name||!url){$('#form-error').textContent='Name und direkte HTTPS-Audioadresse eingeben.';return;}if(stations.filter(s=>s.custom).length>=30){$('#form-error').textContent='Maximal 30 eigene Sender.';return;}const station={id:crypto.randomUUID(),name,url,region:'Eigener Sender',custom:true};stations.push(station);selected=station;page=Math.floor((stations.length-1)/4);stop();resetMetadata();persist();render();show('player');$('#station-form').reset();});
if(navigator.mediaDevices?.selectAudioOutput&&audio.setSinkId){$('#choose-output').hidden=false;$('#choose-output').addEventListener('click',async()=>{try{const output=await navigator.mediaDevices.selectAudioOutput();await audio.setSinkId(output.deviceId);$('#output-status').textContent=output.label||'Audioausgabe ausgewählt';}catch{$('#output-status').textContent='Keine Ausgabe gewählt. Systemausgabe bleibt aktiv.';}});}
window.addEventListener('message',e=>{if(!embedded||e.origin!==location.origin||e.source!==parent||e.data?.protocol!=='pi-display-v1')return;if(e.data.type==='configure'&&['light','dark'].includes(e.data.settings?.theme))document.documentElement.dataset.theme=e.data.settings.theme;if(e.data.type==='appearance'&&['light','dark'].includes(e.data.theme))document.documentElement.dataset.theme=e.data.theme;bridge('rendered');});
for(const event of ['pointerdown','keydown','input'])document.addEventListener(event,()=>bridge('activity'),{passive:true});
window.addEventListener('offline',()=>{stop();status('Offline · Radio benötigt Internet.',true);});
function tick(){const time=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'}).format(new Date());if($('#clock').textContent!==time){$('#clock').textContent=time;bridge('rendered');}}
render();resetMetadata();tick();setInterval(tick,1000);bridge('ready');
