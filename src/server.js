import {observe,exposition} from './metrics.js';import http from 'node:http';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {session,signedCookie} from './session.js';
const secret=process.env.SESSION_SECRET;if(!secret||secret.length<32)throw Error('SESSION_SECRET must be at least 32 characters');
const origin=process.env.PUBLIC_ORIGIN||'http://localhost:8080',secure=process.env.COOKIE_SECURE==='true';
const urls={catalogue:process.env.CATALOGUE_URL||'http://localhost:8081',cart:process.env.CART_URL||'http://localhost:8082',orders:process.env.ORDERS_URL||'http://localhost:8083'};
const assets=new Map(await Promise.all(['index.html','app.js','style.css'].map(async p=>['/'+(p==='index.html'?'':p),await readFile(new URL('../public/'+p,import.meta.url))])));
let count=0,errors=0;
function reply(res,status,body){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));}
async function call(url,method='GET',headers={},body){const r=await fetch(url,{method,headers,body,signal:AbortSignal.timeout(5000)});return {status:r.status,body:await r.json()};}
const server=http.createServer(async(req,res)=>{
const start=Date.now(),rid=randomUUID();count++;res.setHeader('X-Request-ID',rid);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
res.once('finish',()=>{observe(req.method,new URL(req.url,'http://internal').pathname,res.statusCode,(Date.now()-start)/1000);if(res.statusCode>=500)errors++;console.log(JSON.stringify({method:req.method,path:req.url?.split('?')[0],status:res.statusCode,duration_ms:Date.now()-start,request_id:rid}));});
try{const path=new URL(req.url,'http://internal').pathname;
if(path==='/health/live')return reply(res,200,{status:'ok'});
if(path==='/health/ready'){const results=await Promise.all(Object.values(urls).map(u=>call(u+'/health/ready')));const ok=results.every(r=>r.status===200);return reply(res,ok?200:503,{status:ok?'ok':'unavailable'});}
if(path==='/metrics'){res.writeHead(200,{'Content-Type':'text/plain; version=0.0.4'});return res.end(exposition());}
if(req.method==='GET'&&assets.has(path)){res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html'});return res.end(assets.get(path));}
if(!path.startsWith('/api/'))return reply(res,404,{error:'not_found'});
res.setHeader('Cache-Control','no-store');if(!['GET','PUT','DELETE','POST'].includes(req.method))return reply(res,405,{error:'method_not_allowed'});
if(req.method!=='GET'&&req.headers.origin!==origin)return reply(res,403,{error:'invalid_origin'});
const s=session(req.headers.cookie,secret);if(s.fresh)res.setHeader('Set-Cookie',signedCookie(s.id,secret,secure));
const headers={'Content-Type':'application/json','X-Session-ID':s.id,'X-Request-ID':rid};let result;
if(path==='/api/products'&&req.method==='GET')result=await call(urls.catalogue+'/products','GET',headers);
else if(path==='/api/cart'&&req.method==='GET')result=await call(urls.cart+'/carts/'+s.id,'GET',headers);
else if(/^\/api\/cart\/items\/[a-z0-9-]{1,64}$/.test(path)&&['PUT','DELETE'].includes(req.method)){const product=path.split('/').at(-1);let body;if(req.method==='PUT'){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)return reply(res,413,{error:'body_too_large'});}let input;try{input=JSON.parse(raw);}catch{return reply(res,400,{error:'invalid_json'});}if(!Number.isInteger(input.quantity)||input.quantity<1||input.quantity>20)return reply(res,400,{error:'invalid_quantity'});body=JSON.stringify({quantity:input.quantity});}result=await call(urls.cart+'/carts/'+s.id+'/items/'+product,req.method,headers,body);}
else if(path==='/api/orders'&&req.method==='POST'){const key=req.headers['idempotency-key'];if(typeof key!=='string'||! /^[A-Za-z0-9_-]{8,64}$/.test(key))return reply(res,400,{error:'invalid_idempotency_key'});result=await call(urls.orders+'/orders','POST',{...headers,'Idempotency-Key':key});}
else if(/^\/api\/orders\/[a-f0-9-]{36}$/.test(path)&&req.method==='GET')result=await call(urls.orders+'/orders/'+path.split('/').at(-1),'GET',headers);
else return reply(res,404,{error:'not_found'});return reply(res,result.status,result.body);
}catch(e){console.error(JSON.stringify({event:'dependency_error',request_id:rid,message:e.message}));if(!res.headersSent)reply(res,503,{error:'service_unavailable'});else res.end();}});
server.requestTimeout=10000;server.headersTimeout=10000;server.listen(Number(process.env.PORT||8080),'0.0.0.0');process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),20000).unref();});
