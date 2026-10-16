import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createBluetooth,bluetoothHandler,parseDevice} from './bluetooth.mjs';
const address='AA:BB:CC:DD:EE:FF',sinkName='bluez_output.AA_BB_CC_DD_EE_FF.1';
function fixture(options={}){
 const calls=[];let paired=!!options.paired,connected=false,trusted=false,output='alsa_output.hdmi',activeProfile='headset-head-unit';
 const radios=[{id:2,type:'bluetooth',soft:options.softBlocked?'blocked':'unblocked',hard:options.hardBlocked?'blocked':'unblocked'},...(options.otherRadios??[])];
 const info=()=>`Device ${address}\n Name: Mpow BH044D\n Alias: Mpow BH044D\n Class: 0x00240404\n Icon: audio-card\n Paired: ${paired?'yes':'no'}\n Trusted: ${trusted?'yes':'no'}\n Connected: ${connected?'yes':'no'}\n UUID: Audio Sink (0000110b-0000-1000-8000-00805f9b34fb)`;
 const run=async(command,args)=>{
  calls.push([command,...args]);
  if([options.missing].flat().includes(command))throw Object.assign(Error('spawn failed'),{code:'ENOENT'});
  if(command==='rfkill'||command==='/usr/sbin/rfkill'){
   if(args[0]==='--json')return options.rfkillOutput??JSON.stringify({rfkilldevices:radios});
   if(args[0]==='unblock'){
    if(options.unblockDenied)throw Object.assign(Error('Permission denied'),{code:'EACCES'});
    const radio=radios.find(row=>String(row.id)===args[1]);assert(radio&&radio.type==='bluetooth'&&radio.hard==='unblocked');
    if(!options.stillBlocked)radio.soft='unblocked';return '';
   }
  }
  if(command==='bluetoothctl'){
   const a=args[0]==='--timeout'?args.slice(2):[...args];if(a[0]==='--agent')a.splice(0,2);
   if(a[0]==='show')return 'Controller 11:22:33:44:55:66 Pi\n Powered: yes';
   if(a[0]==='devices')return `Device ${address} Mpow BH044D\nDevice 11:11:11:11:11:11 Keyboard`;
   if(a[0]==='info')return a[1]===address?info():'Device 11:11:11:11:11:11\n Icon: input-keyboard\n Class: 0x00000540';
   if(a[0]==='scan'){await options.scanWait?.();return options.scanFailure?'Failed to start discovery: org.bluez.Error.NotReady':'Discovery started';}
   if(a[0]==='pair'){if(options.pairFailure)throw Object.assign(Error('Failed to pair: AuthenticationFailed'),{stdout:'AuthenticationFailed'});paired=true;connected=options.pairConnects!==false;return 'Pairing successful';}
   if(a[0]==='trust'){trusted=true;return 'trust succeeded';}
   if(a[0]==='connect'){connected=true;return 'Connection successful';}
   if(a[0]==='disconnect'){connected=false;output='alsa_output.hdmi';return 'Successful disconnected';}
   if(a[0]==='power')return options.powerFailure||radios.some(r=>r.type==='bluetooth'&&(r.soft==='blocked'||r.hard==='blocked'))?'Failed to set power on: org.bluez.Error.Failed':'Changing power on succeeded';
  }
  if(command==='pactl'){
   if(options.noAudio)throw Object.assign(Error('Connection refused'),{stderr:'pa_context_connect() failed: Connection refused'});
   if(args[0]==='get-default-sink')return output;
   if(args[0]==='set-default-sink'){output=args[1];return '';}
   if(args[0]==='set-card-profile'){activeProfile=args[2];return '';}
   if(args[0]==='move-sink-input')return '';
   if(args[2]==='cards')return JSON.stringify(connected?[{index:10,name:'bluez_card.AA_BB_CC_DD_EE_FF',active_profile:activeProfile,profiles:{'a2dp-sink':{available:'yes',priority:20}}}]:[]);
   if(args[2]==='sinks')return JSON.stringify([{name:'alsa_output.hdmi',description:'HDMI'},...(connected&&!options.noSink?[{name:sinkName,description:'Mpow BH044D',properties:{'api.bluez5.address':address}}]:[])]);
   if(args[2]==='sink-inputs')return JSON.stringify([{index:4,properties:{'application.process.binary':'chromium'}},{index:5,properties:{'application.process.binary':'vlc'}}]);
  }
  throw Error(`Unexpected command ${command} ${args}`);
 };
 return {adapter:createBluetooth({platform:'linux',run,wait:async()=>{}}),calls};
}
test('Mac never executes Bluetooth or audio commands',async()=>{
 const adapter=createBluetooth({platform:'darwin',run:()=>{throw Error('Must not execute');}});
 assert.equal((await adapter.state()).available,false);await assert.rejects(adapter.act('scan'),/Mac/);
});
test('Audio devices are parsed, filtered and kept separate from keyboard/microphone input',async()=>{
 const {adapter}=fixture();const s=await adapter.state();assert.equal(s.devices.length,1);assert.equal(s.devices[0].name,'Mpow BH044D');assert.equal(s.devices[0].paired,false);
 assert.equal(parseDevice(address,'Alias: <img src=x>\n Icon: input-keyboard').candidate,false);
});
test('No-PIN pairing, trust, A2DP and actual system output are all confirmed',async()=>{
 const {adapter,calls}=fixture();assert.equal((await adapter.act('connect',address)).busy,true);const s=await adapter.settled();
 assert.equal(s.error,null);assert(s.devices[0].paired&&s.devices[0].output);assert.equal(s.output,'Mpow BH044D');
 assert(calls.some(c=>c.includes('--agent')&&c.includes('NoInputNoOutput')&&c.includes('pair')));
 assert(calls.some(c=>c.includes('set-card-profile')&&c.includes('a2dp-sink')));
 assert.deepEqual(calls.filter(c=>c[1]==='move-sink-input'),[['pactl','move-sink-input','4',sinkName]]);
 await adapter.act('disconnect',address);assert.equal((await adapter.settled()).devices[0].connected,false);
});
test('Reconnection never re-pairs or deletes existing pairing',async()=>{
 const {adapter,calls}=fixture({paired:true});await adapter.act('connect',address);await adapter.settled();assert(!calls.some(c=>c.includes('pair')||c.includes('remove')));assert(calls.some(c=>c.includes('connect')&&c.at(-1)===address));
});
test('Older BlueZ pair-only completion is followed by connect without a profile argument',async()=>{
 const {adapter,calls}=fixture({pairConnects:false});await adapter.act('connect',address);const s=await adapter.settled();assert.equal(s.error,null);assert(s.devices[0].output);assert.deepEqual(calls.find(c=>c.includes('connect')).slice(-2),['connect',address]);
 assert(!calls.some(c=>c.includes('--timeout')),'Ordinary queries must exit immediately on success, including BlueZ 5.66');
});
test('Bluetooth without audio sink does not report audio ready',async()=>{
 const {adapter}=fixture({noSink:true});await adapter.act('connect',address);const s=await adapter.settled();assert.match(s.error,/keine Stereo/);assert(!s.devices[0].output);
});
test('Pairing rejection and missing audio service are explicit',async()=>{
 const {adapter}=fixture({pairFailure:true});await adapter.act('connect',address);assert.match((await adapter.settled()).error,/abgelehnt/);
 const absent=fixture({noAudio:true});assert.equal((await absent.adapter.state()).available,false);await assert.rejects(absent.adapter.act('scan'),/Audio-Dienst/);
});
test('Missing required tools name the command and its installation package',async()=>{
 for(const [missing,packageName] of [['pactl','pulseaudio-utils'],['bluetoothctl','bluez']]){
  const {adapter,calls}=fixture({missing});const state=await adapter.state();
  assert.equal(state.available,false);assert(state.message.includes(missing)&&state.message.includes(packageName));
  await assert.rejects(adapter.act('scan'),error=>error.message.includes(packageName));
  assert(!calls.some(call=>['power','unblock','scan'].includes(call[1])));
 }
});
test('Software blocks are removed only for explicit scan/connect and only on Bluetooth IDs',async()=>{
 for(const action of ['scan','connect']){
  const {adapter,calls}=fixture({paired:true,softBlocked:true,otherRadios:[{id:0,type:'wlan',soft:'blocked',hard:'blocked'}]});
  await adapter.state();assert(!calls.some(call=>['unblock','power','scan','connect'].includes(call[1])),'Status reads must not enable a radio');
  await adapter.act(action,action==='connect'?address:undefined);const state=await adapter.settled();assert.equal(state.error,null);
  assert.deepEqual(calls.filter(call=>call[1]==='unblock'),[['rfkill','unblock','2']]);
  assert(calls.findIndex(call=>call[1]==='unblock')<calls.findIndex(call=>call[1]==='power'));
  assert(!calls.some(call=>call[0]==='sudo'||call.includes('all')));
  if(action==='connect')assert(state.devices[0].output);
 }
 const {adapter,calls}=fixture({softBlocked:true,paired:true});await adapter.act('disconnect',address);await adapter.settled();
 assert(!calls.some(call=>['unblock','power'].includes(call[1])),'Disconnect must not enable a blocked radio');
});
test('A hardware block prevents power, unblock, scan and pairing commands',async()=>{
 for(const action of ['scan','connect']){
  const {adapter,calls}=fixture({softBlocked:true,hardBlocked:true});await adapter.act(action,action==='connect'?address:undefined);
  assert.match((await adapter.settled()).error,/Hardware-Sperre/);
  assert(!calls.some(call=>['unblock','power','scan','connect','--agent'].includes(call[1])));
 }
});
test('Unblock denial or an unchanged block cannot be reported as successful discovery',async()=>{
 for(const options of [{unblockDenied:true},{stillBlocked:true}]){
  const {adapter,calls}=fixture({softBlocked:true,...options});await adapter.act('scan');const state=await adapter.settled();
  assert.equal(state.busy,false);assert.match(state.error,options.unblockDenied?/Rechte zum Entsperren/:/per Software gesperrt/);
  assert(!calls.some(call=>['power','scan'].includes(call[1])));
  assert(!calls.some(call=>call[0]==='/usr/sbin/rfkill'),'Permission errors must not trigger a path fallback');
 }
});
test('A restricted user-service PATH still allows the fixed Debian rfkill path',async()=>{
 for(const action of ['scan','connect']){
  const {adapter,calls}=fixture({missing:'rfkill',softBlocked:true});
  await adapter.act(action,action==='connect'?address:undefined);const state=await adapter.settled();assert.equal(state.error,null);
  assert(calls.some(call=>call[0]==='/usr/sbin/rfkill'&&call[1]==='--json'));
  assert.deepEqual(calls.filter(call=>call[0]==='/usr/sbin/rfkill'&&call[1]==='unblock'),[['/usr/sbin/rfkill','unblock','2']]);
  if(action==='connect')assert(state.devices[0].output);
 }
});
test('Optional rfkill absence or unsupported output does not break an otherwise working adapter',async()=>{
 for(const options of [{missing:['rfkill','/usr/sbin/rfkill']},{rfkillOutput:'old output'},{rfkillOutput:'{"rfkilldevices":[{"id":"2; reboot","type":"bluetooth","soft":"blocked","hard":"unblocked"}]}'}]){
  const {adapter,calls}=fixture(options);await adapter.act('scan');assert.equal((await adapter.settled()).error,null);
  assert(calls.some(call=>call.includes('scan')));assert(!calls.some(call=>call[1]==='unblock'));
 }
});
test('A generic BlueZ power failure points to the local adapter, not the receiver',async()=>{
 const {adapter}=fixture({powerFailure:true,missing:'rfkill'});await adapter.act('scan');const state=await adapter.settled();
 assert.match(state.error,/Bluetooth am Pi lässt sich nicht einschalten/);assert.doesNotMatch(state.error,/Box/);
});
test('Invalid addresses and concurrent requests cannot issue device commands',async()=>{
 let endScan;const {adapter,calls}=fixture({scanWait:()=>new Promise(resolve=>endScan=resolve)});
 for(const value of ['; reboot',address+'\npower off',['AA:BB:CC:DD:EE:FF'],'00:00:00:00:00:00'])await assert.rejects(adapter.act('connect',value));
 const first=adapter.act('scan');await assert.rejects(adapter.act('scan'),e=>e.status===409);await first;
 while(!endScan)await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(adapter.act('connect',address),e=>e.status===409);endScan();await adapter.settled();
 assert.equal(calls.filter(c=>c.includes('scan')).length,1);assert(!calls.some(c=>c.includes('pair')));
});
test('Discovery errors remain visible and clear busy state',async()=>{
 const {adapter}=fixture({scanFailure:true});await adapter.act('scan');const s=await adapter.settled();assert.equal(s.busy,false);assert.match(s.error,/ausgeschaltet|gesperrt/);
});
test('HTTP only accepts bounded local JSON actions; GET does not mutate hardware',async()=>{
 const actions=[],handler=bluetoothHandler({state:async()=>({available:true}),act:async(...args)=>{actions.push(args);return {busy:true};}});
 const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const get=await fetch(base);assert.equal(get.status,200);assert.equal(get.headers.get('cache-control'),'no-store');assert.equal(actions.length,0);
  const headers={'Content-Type':'application/json','X-Pi-Radio':'1',Origin:base};
  assert.equal((await fetch(base,{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{"action":"scan"}'})).status,403);
  assert.equal((await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"scan"}'})).status,403);
  assert.equal((await fetch(base,{method:'POST',headers,body:'x'.repeat(1025)})).status,413);
  assert.equal((await fetch(base,{method:'POST',headers,body:'{"action":"scan","command":"reboot"}'})).status,400);
  assert.equal((await fetch(base,{method:'POST',headers,body:'{"action":"scan"}'})).status,202);assert.deepEqual(actions,[['scan',undefined]]);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
