import {stations} from '../src/stations.js';
import {fetchCosmoPlaylist} from './cosmo.mjs';

// Only preset streams are queried. User-entered URLs are never fetched by the server.
const ttl=45_000, cache=new Map(), pending=new Map();
export function icyTitle(bytes){
 let text;
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('windows-1252').decode(bytes);}
 const title=/StreamTitle='(.*?)';/s.exec(text)?.[1]?.replaceAll('\0','').trim();
 return title&&!/^(https?:\/\/|www\.)/i.test(title)?title:null;
}
export async function readIcy(response){
 const result={title:null,codec:response.headers.get('content-type')?.includes('mpeg')?'MP3':null};
 const info=response.headers.get('ice-audio-info')??'';
 const bitrate=Number(response.headers.get('icy-br')||/bitrate=(\d+)/.exec(info)?.[1]);
 const sampleRate=Number(response.headers.get('icy-samplerate')||/samplerate=(\d+)/.exec(info)?.[1]);
 if(bitrate>0&&bitrate<2000)result.bitrate=bitrate;
 if(sampleRate>0&&sampleRate<400000)result.sampleRate=sampleRate;
 const interval=Number(response.headers.get('icy-metaint'));
 const reader=response.body?.getReader();if(!reader)return result;
 try{
  if(!Number.isInteger(interval)||interval<1||interval>262144)return result;
  let buffer=new Uint8Array(),read=0;
  while(read<300000){
   const chunk=await reader.read();if(chunk.done)break;read+=chunk.value.length;
   const next=new Uint8Array(buffer.length+chunk.value.length);next.set(buffer);next.set(chunk.value,buffer.length);buffer=next;
   if(buffer.length<=interval)continue;
   const length=buffer[interval]*16;
   if(buffer.length>=interval+1+length){result.title=icyTitle(buffer.subarray(interval+1,interval+1+length));break;}
  }
 }finally{await reader.cancel().catch(()=>{});}
 return result;
}
export function beatsTitle(data,now=Date.now()){
 const start=typeof data.start_timestamp==='number'?data.start_timestamp*1000:Date.parse(data.timestamp),duration=Number(data.duration);
 const fresh=Number.isFinite(start)&&now-start<(duration>0?duration*1000+120000:600000)&&start<now+60000;
 return {title:fresh&&typeof data.song==='string'?data.song:null,artist:fresh&&typeof data.artist==='string'?data.artist:null,source:'Beats Radio · Titelservice'};
}
async function streamMetadata(station,signal){
 const response=await fetch(station.url,{headers:{'Icy-MetaData':'1'},signal});
 if(!response.ok){await response.body?.cancel();throw Error('Streamdaten nicht erreichbar');}
 return {...await readIcy(response),source:'ICY · Stream-Metadaten'};
}
export function mergeCosmo(playlist,stream){
 if(playlist.status==='fulfilled'&&playlist.value)return {...(stream.status==='fulfilled'?stream.value:{}),...playlist.value};
 if(stream.status==='fulfilled')return {...stream.value,playlistUnavailable:true};
 throw Error('Titelinformationen derzeit nicht erreichbar.');
}
async function load(station){
 const signal=AbortSignal.timeout(9000);
 if(station.id==='cosmo'){
  const [playlist,stream]=await Promise.allSettled([fetchCosmoPlaylist(signal),streamMetadata(station,signal)]);
  return mergeCosmo(playlist,stream);
 }
 if(station.id==='beats'){
  const response=await fetch('https://api.streamabc.net/metadata/channel/klr_3xcmcf19meu_83wq.json',{signal});
  if(!response.ok)throw Error('Titelquelle nicht erreichbar');
  const data=await response.json();
  // An old playlist item must not be presented as playing now.
  return beatsTitle(data);
 }
 return streamMetadata(station,signal);
}
export async function metadata(id){
 const station=stations.find(s=>s.id===id);if(!station)return null;
 const saved=cache.get(id);if(saved&&Date.now()-saved.fetchedAt<ttl)return saved;
 if(pending.has(id))return pending.get(id);
 const task=load(station).then(data=>{const value={station:id,...data,fetchedAt:Date.now()};cache.set(id,value);return value;}).finally(()=>pending.delete(id));
 pending.set(id,task);return task;
}
export async function serveMetadata(req,res,url){
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
 try{const data=await metadata(url.searchParams.get('station'));res.statusCode=data?200:404;res.end(JSON.stringify(data??{error:'Keine Titelquelle für diesen Sender.'}));}
 catch{res.statusCode=503;res.end(JSON.stringify({error:'Titelinformationen derzeit nicht erreichbar.'}));}
}
