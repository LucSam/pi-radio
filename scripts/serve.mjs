import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {serveMetadata} from '../server/metadata.mjs';
import {serveBluetooth,localRequest} from '../server/bluetooth.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
createServer(async(req,res)=>{try{if(!localRequest(req)){res.writeHead(403).end();return;}const url=new URL(req.url,'http://localhost'),path=url.pathname;if(path==='/api/bluetooth'){await serveBluetooth(req,res);return;}if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}if(path==='/api/now-playing'){await serveMetadata(req,res,url);return;}if(path!=='/'&&!/^\/src\/[\w.-]+\.(js|css)$/.test(path))throw Error();const file=resolve(root,path==='/'?'index.html':'.'+path);res.setHeader('Content-Type',types[extname(file)]);res.setHeader('Cache-Control','no-cache');res.end(req.method==='HEAD'?undefined:await readFile(file));}catch{res.writeHead(404).end();}}).listen(5176,'127.0.0.1',()=>console.log('Radio · http://127.0.0.1:5176/'));
