import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFile, readdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { chromium } from 'playwright-core'
const owner='00000000-0000-4000-8000-000000000001', book='00000000-0000-4000-8000-000000000002'
const today=new Date().toISOString().slice(0,10), month=today.slice(0,7)
const rows=Array.from({length:300},(_,i)=>({id:'fixture-'+i,book_id:book,user_id:owner,kind:'expense',amount:100+i,category:'日常购物',merchant:'测速店铺',note:'fixture',occurred_on:today,created_at:today+'T10:00:00Z'}))
const books=[{id:book,name:'测试账本',owner_id:owner}]
const exp=Math.floor(Date.now()/1000)+3600
const token=['{"alg":"HS256","typ":"JWT"}',JSON.stringify({sub:owner,exp,role:'authenticated'}),'fixture'].map(s=>Buffer.from(s).toString('base64url')).join('.')
const session={access_token:token,refresh_token:'fixture',expires_in:3600,expires_at:exp,token_type:'bearer',user:{id:owner,email:'fixture@example.test'}}
async function serve(dir,port){
 const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.webmanifest':'application/manifest+json'}
 const files=new Map()
 for(const file of await readdir(dir,{recursive:true})){
  if(!mime[extname(file)])continue
  files.set(file,gzipSync(await readFile(join(dir,file))))
 }
 const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname
  if(path==='/seed'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Fixture</title>');return}
  if(path.startsWith('/rest/')){
   res.setHeader('Content-Type','application/json')
   res.end(JSON.stringify(path.endsWith('jz_books')?books:path.endsWith('jz_transactions')?rows:[]));return
  }
  const file=path.replace(/^\/jizhang\//,'')||'index.html'
  const data=files.get(file)
  if(!data){res.writeHead(404);res.end();return}
  res.writeHead(200,{'Content-Type':mime[extname(file)],'Content-Length':data.length,'Content-Encoding':'gzip','Cache-Control':file.endsWith('.html')||file==='sw.js'?'no-cache':'public,max-age=31536000,immutable'})
  res.end(data)
 })
 server.listen(port,'127.0.0.1');await once(server,'listening');return server
}
const servers=[await serve(process.argv[2],4181),await serve(process.argv[3],4182)]
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-background-networking']})
const samples=[[],[]]
try{
 for(let n=0;n<7;n++)for(const k of n%2?[1,0]:[0,1]){
  const origin='http://127.0.0.1:'+(4181+k)
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
  const seed=await ctx.newPage();await seed.goto(origin+'/seed')
  await seed.evaluate(async({owner,book,month,rows,books,session})=>{
   localStorage.setItem('sb-127-auth-token',JSON.stringify(session))
   localStorage.setItem('jz:books:'+owner,JSON.stringify(books))
   localStorage.setItem('jz:book:'+owner,JSON.stringify(book))
   const open=indexedDB.open('chaimi-local-ledger',1)
   open.onupgradeneeded=()=>{open.result.createObjectStore('months');open.result.createObjectStore('changes',{keyPath:'seq',autoIncrement:true}).createIndex('owner','owner')}
   await new Promise((ok,no)=>{open.onsuccess=ok;open.onerror=no})
   const tx=open.result.transaction('months','readwrite')
   tx.objectStore('months').put({entries:rows,complete:true,budget:null},[owner,book,month])
   await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onabort=no});open.result.close()
  },{owner,book,month,rows,books,session})
  await ctx.addInitScript(()=>{function check(){
   if(document.querySelector('.record-name strong')?.textContent==='测速店铺')requestAnimationFrame(()=>{window.ledgerMs=performance.now()})
   else requestAnimationFrame(check)
  }requestAnimationFrame(check)})
  const pair=[]
  for(let j=0;j<2;j++){
   const page=await ctx.newPage()
   const cdp=await ctx.newCDPSession(page)
   await cdp.send('Network.enable')
   await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:60,downloadThroughput:1250000,uploadThroughput:1250000})
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:4})
   await page.goto(origin+'/jizhang/',{waitUntil:'commit'})
   await page.waitForFunction(()=>window.ledgerMs>0)
   const ms=await page.evaluate(()=>Math.round(window.ledgerMs));pair.push(ms)
   await page.waitForFunction(()=>!!navigator.serviceWorker.controller)
   if(j===1&&k===1&&n===0){
    await page.getByRole('button',{name:'记一笔',exact:true}).click()
    await page.getByRole('button',{name:'扫描小票',exact:true}).click()
    await page.getByRole('button',{name:/拍照/}).waitFor()
    await page.getByRole('button',{name:'关闭',exact:true}).click()
    for(const tab of ['账目','统计','设置','首页']) await page.getByRole('button',{name:tab,exact:true}).click()
   }
   await page.close()
  }
  samples[k].push(pair);console.log('sample',k,n,pair);await ctx.close()
 }
 console.log('STARTUP_RESULT',JSON.stringify(samples))
}finally{await browser.close();for(const s of servers)s.close()}
