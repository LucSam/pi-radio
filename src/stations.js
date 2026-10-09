// Sources and date of verification are documented in README.md.
export const stations=[
 {id:'cosmo',name:'COSMO',region:'WDR / rbb / Radio Bremen',url:'https://wdr-cosmo-live.icecastssl.wdr.de/wdr/cosmo/live/mp3/128/stream.mp3'},
 {id:'beats',name:'Beats Radio',region:'House / Lounge',url:'https://live.streams.klassikradio.de/beats-radio/stream/mp3'},
 {id:'purefm',name:'Berlin Klubradio',region:'pure fm · Berlin',url:'https://s4.radionetz.de/purefm-bln.mp3'},
 {id:'radioeins',name:'radioeins',region:'Berlin / Brandenburg',url:'https://dispatcher.rndfnk.com/rbb/radioeins/live/mp3/mid'},
 {id:'swissjazz',name:'Radio Swiss Jazz',region:'Jazz / Soul / Blues',url:'https://stream.srg-ssr.ch/srgssr/rsj/mp3/128'},
 {id:'fritz',name:'Fritz',region:'Berlin / Brandenburg',url:'https://dispatcher.rndfnk.com/rbb/fritz/live/mp3/mid'},
 {id:'dlf',name:'Deutschlandfunk',region:'Nachrichten und Kultur',url:'https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3'},
 {id:'kultur',name:'Dlf Kultur',region:'Kultur und Musik',url:'https://st02.sslstream.dlf.de/dlf/02/128/mp3/stream.mp3'},
 {id:'nova',name:'Dlf Nova',region:'Wissen und Musik',url:'https://st03.sslstream.dlf.de/dlf/03/128/mp3/stream.mp3'},
];
export function streamUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}}
