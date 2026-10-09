export const COSMO_PLAYLIST='https://www1.wdr.de/radio/cosmo/musik/playlist/index.html';
const berlin=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const entities={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',auml:'ä',ouml:'ö',uuml:'ü',Auml:'Ä',Ouml:'Ö',Uuml:'Ü',szlig:'ß',eacute:'é',Eacute:'É',egrave:'è',agrave:'à',ntilde:'ñ',ndash:'–',mdash:'—',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',hellip:'…'};
function text(html){return html.replace(/<[^>]*>/g,' ').replace(/&(#x[\da-f]+|#\d+|\w+);/gi,(entity,key)=>{
 if(key[0]!=='#')return entities[key]??entity;
 const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
}).replace(/\s+/g,' ').trim();}
function cell(row,name){
 for(const [,attributes,body] of row.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)){
  const classes=/\bclass\s*=\s*["']([^"']*)["']/i.exec(attributes)?.[1]?.split(/\s+/)??[];
  if(classes.includes(name))return text(body);
 }
 return '';
}
// Convert the publisher's Berlin wall time independently of the host's timezone.
// Spring DST gaps and invalid calendar dates have no matching candidate.
export function playlistTime(value,at=Date.now()){
 const m=/^(\d{2})\.(\d{2})\.(\d{4}),?\s+(\d{1,2})[.:](\d{2})\s+Uhr$/.exec(value);if(!m)return null;
 const [,day,month,year,hour,minute]=m,target={year,month,day,hour:hour.padStart(2,'0'),minute},utc=Date.UTC(+year,+month-1,+day,+hour,+minute);
 const candidates=[0,1,2,3].map(h=>utc-h*3600000).filter(t=>{
  if(t>at)return false;const parts=Object.fromEntries(berlin.formatToParts(t).map(p=>[p.type,p.value]));return Object.entries(target).every(([key,value])=>parts[key]===value);
 });
 return candidates.length?Math.max(...candidates):null;
}
export function cosmoPlaylist(html,at=Date.now()){
 // Restrict parsing to the result table. Ignore menus, adverts and scripts.
 const result=html.match(/\bid=["']searchPlaylistResult["'][\s\S]*?<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1];
 if(!result)throw Error('COSMO-Playlistformat nicht erkannt.');
 const rows=[];
 for(const [row] of result.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)){
  const title=cell(row,'title'),artist=cell(row,'performer'),playedAt=playlistTime(cell(row,'datetime'),at);
  if(title&&title.length<=500&&artist&&artist.length<=500&&playedAt!==null&&at-playedAt<=86400000)rows.push({title,artist,playedAt});
 }
 const latest=rows.sort((a,b)=>b.playedAt-a.playedAt)[0];
 return latest?{...latest,kind:'playlist',stale:at-latest.playedAt>20*60000,source:'COSMO · WDR-Playlist'}:null;
}
export async function fetchCosmoPlaylist(signal){
 const response=await fetch(COSMO_PLAYLIST,{signal,headers:{Accept:'text/html'}});if(!response.ok)throw Error('COSMO-Playlist nicht erreichbar.');
 const reader=response.body.getReader();let size=0,chunks=[];
 try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>1024*1024)throw Error('COSMO-Playlist unerwartet groß.');chunks.push(chunk.value);}}
 finally{await reader.cancel().catch(()=>{});}
 return cosmoPlaylist(Buffer.concat(chunks).toString('utf8'));
}
