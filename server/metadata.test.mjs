import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readIcy,icyTitle,beatsTitle,metadata,mergeCosmo} from './metadata.mjs';
import {cosmoPlaylist,playlistTime} from './cosmo.mjs';
import {stations} from '../src/stations.js';
test('ICY parser handles fragmented chunks, umlauts and cancels the stream',async()=>{
 const title=Buffer.from("StreamTitle='Björk - Jóga';"),length=Math.ceil(title.length/16),bytes=Buffer.alloc(5+length*16);bytes[4]=length;title.copy(bytes,5);let at=0,cancelled=false;
 const stream=new ReadableStream({pull(c){if(at<bytes.length)c.enqueue(new Uint8Array(bytes.subarray(at,at+=3)));},cancel(){cancelled=true;}});
 const result=await readIcy(new Response(stream,{headers:{'icy-metaint':'4','icy-br':'128','ice-audio-info':'samplerate=48000;channels=2','content-type':'audio/mpeg'}}));
 assert.equal(result.title,'Björk - Jóga');assert.equal(result.bitrate,128);assert.equal(result.sampleRate,48000);assert(cancelled);
});
test('Missing ICY metadata closes the response; a website is not a song title',async()=>{
 let cancelled=false;const result=await readIcy(new Response(new ReadableStream({cancel(){cancelled=true;}})));assert.equal(result.title,null);assert(cancelled);
 assert.equal(icyTitle(new TextEncoder().encode("StreamTitle='www.cosmoradio.de';")),null);
 assert.equal(icyTitle(new Uint8Array()),null);
});
test('Beats accepts Unix seconds and rejects expired or future titles',()=>{
 const now=Date.now(),data={start_timestamp:Math.floor(now/1000)-30,duration:200,song:'Testtitel',artist:'Interpret'};
 assert.equal(beatsTitle(data,now).title,'Testtitel');assert.equal(beatsTitle({...data,start_timestamp:data.start_timestamp-3600},now).title,null);
 assert.equal(beatsTitle({...data,start_timestamp:data.start_timestamp+3600},now).title,null);
});
test('Metadata adapter refuses arbitrary URLs and unknown stations',async()=>{
 assert.equal(await metadata('https://127.0.0.1/private'),null);assert.equal(await metadata('unknown'),null);
});
const row=(date,title,artist)=>`<tr><th class="entry datetime">${date}</th><td class="entry title">${title}</td><td class="entry performer">${artist}</td></tr>`;
const table=rows=>`<div id="searchPlaylistResult"><table>${rows}</table></div>`;
test('COSMO picks the latest past Berlin entry and decodes title and artist',()=>{
 const at=Date.parse('2026-10-09T09:42:00Z');
 const data=cosmoPlaylist(table(row('09.10.2026,<br>11.35 Uhr','Te Olvido (La La)','Selena Gomez')+row('09.10.2026,<br>11.45 Uhr','Future','Artist')+row('09.10.2026,<br>11.40 Uhr','TWIST &amp; TURN','Popcaan feat. Drake &amp; PARTYNEXTDOOR')),at);
 assert.equal(data.title,'TWIST & TURN');assert.equal(data.artist,'Popcaan feat. Drake & PARTYNEXTDOOR');assert.equal(data.playedAt,Date.parse('2026-10-09T09:40:00Z'));assert.equal(data.kind,'playlist');assert.equal(data.stale,false);
 assert.equal(cosmoPlaylist(table(row('09.10.2026,<br>11.40 Uhr','Caf&#233; &quot;Live&quot;','Bj&ouml;rk')),at).title,'Café "Live"');
});
test('COSMO preserves age, rejects yesterday-plus, broken formats and empty entries',()=>{
 const at=Date.parse('2026-10-09T10:20:00Z');
 assert.equal(cosmoPlaylist(table(row('09.10.2026, 11.40 Uhr','Old title','Artist')),at).stale,true);
 assert.equal(cosmoPlaylist(table(row('08.10.2026, 11.40 Uhr','Yesterday','Artist')),at),null);
 assert.equal(cosmoPlaylist(table(row('09.10.2026, 11.40 Uhr','','Artist')),at),null);
 assert.throws(()=>cosmoPlaylist('<html>No playlist table</html>',at));
});
test('Berlin wall time handles winter, summer, midnight, invalid dates and DST gap/fold',()=>{
 assert.equal(playlistTime('09.01.2026, 11.40 Uhr',Date.parse('2026-01-09T11:00Z')),Date.parse('2026-01-09T10:40Z'));
 assert.equal(playlistTime('10.10.2026, 00.01 Uhr',Date.parse('2026-10-09T22:02Z')),Date.parse('2026-10-09T22:01Z'));
 assert.equal(playlistTime('31.02.2026, 11.40 Uhr'),null);
 assert.equal(playlistTime('29.03.2026, 02.30 Uhr'),null);
 assert.equal(playlistTime('25.10.2026, 02.30 Uhr',Date.parse('2026-10-25T00:45Z')),Date.parse('2026-10-25T00:30Z'));
 assert.equal(playlistTime('25.10.2026, 02.30 Uhr',Date.parse('2026-10-25T01:45Z')),Date.parse('2026-10-25T01:30Z'));
});
test('COSMO playlist and stream fail independently; never relabel a programme as a playlist song',()=>{
 const good=value=>({status:'fulfilled',value}),bad={status:'rejected',reason:Error('Fixture offline')},playlist={title:'Song',artist:'Artist',playedAt:123,kind:'playlist'},stream={title:'COSMO mit …',codec:'MP3',bitrate:128};
 assert.deepEqual(mergeCosmo(good(playlist),good(stream)),{...stream,...playlist});
 assert.deepEqual(mergeCosmo(good(playlist),bad),playlist);
 assert.equal(mergeCosmo(bad,good(stream)).playlistUnavailable,true);assert.equal(mergeCosmo(good(null),good(stream)).kind,undefined);
 assert.throws(()=>mergeCosmo(bad,bad));
});
test('Radio Swiss Jazz is fifth; the requested first four presets keep their order',()=>{
 assert.deepEqual(stations.slice(0,5).map(s=>s.id),['cosmo','beats','purefm','radioeins','swissjazz']);
 assert.equal(new Set(stations.map(s=>s.id)).size,stations.length);
});
