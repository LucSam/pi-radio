import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {serveMetadata} from '../server/metadata.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),path=url.pathname;if(path==='/api/now-playing'){await serveMetadata(req,res,url);return;}if(path!=='/'&&!/^\/src\/[\w.-]+\.(js|css)$/.test(path))throw Error();const file=resolve(root,path==='/'?'index.html':'.'+path);res.setHeader('Content-Type',types[extname(file)]);res.end(await readFile(file));}catch{res.writeHead(404).end();}}).listen(5176,'127.0.0.1',()=>console.log('Radio · http://127.0.0.1:5176/'));
