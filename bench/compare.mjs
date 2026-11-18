import http from 'node:http'
import { once } from 'node:events'
import { readFile, readdir } from 'node:fs/promises'
import { join, dirname, extname, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { chromium } from 'playwright-core'

async function serve(label) {
 const base = resolve('bench/out-' + label)
 const files = await readdir(base,{recursive:true})
 const index = files.filter(f => f.endsWith('index.html')).sort((a,b)=>a.length-b.length)[0]
 if (!index) throw Error('Missing page ' + base)
 const root = dirname(join(base,index))
 const packed = new Map()
 const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'}
 for (const name of await readdir(root,{recursive:true})) {
  if (!types[extname(name)]) continue
  packed.set('/'+name, gzipSync(await readFile(join(root,name)),{level:9}))
 }
 const server = http.createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname
  const file=path==='/'?'/index.html':path
  const bytes=packed.get(file)
  if(!bytes){res.writeHead(404);res.end();return}
  res.writeHead(200,{'Content-Type':types[extname(file)],'Content-Encoding':'gzip','Content-Length':bytes.length,'Cache-Control':file==='/index.html'?'no-cache':'public,max-age=31536000,immutable'})
  res.end(bytes)
 })
 server.listen(0,'127.0.0.1')
 await once(server,'listening')
 return {server,url:'http://127.0.0.1:'+server.address().port}
}
const endpoints={react:await serve('react'),nsh:await serve('nsh')}
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-background-networking']})
const samples={react:[],nsh:[]}
try{
 for(let i=0;i<5;i++)for(const label of i%2?['nsh','react']:['react','nsh']){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})
  const page=await context.newPage()
  page.on('pageerror',e=>console.error(label,e.message))
  const dev=await context.newCDPSession(page)
  await dev.send('Network.enable')
  await dev.send('Network.emulateNetworkConditions',{offline:false,latency:60,downloadThroughput:1250000,uploadThroughput:1250000})
  await dev.send('Emulation.setCPUThrottlingRate',{rate:4})
  await page.addInitScript(()=>{
   const check=()=>{
    const s=document.body?.innerText.replace(/\s/g,'') || ''
    if(s.includes('家庭用品')&&s.includes('记一笔')){
     requestAnimationFrame(()=>{window.readyMs=performance.now()})
    }else requestAnimationFrame(check)
   }
   requestAnimationFrame(check)
  })
  const pair=[]
  for(let j=0;j<2;j++){
   await page.goto(endpoints[label].url,{waitUntil:'commit'})
   try{await page.waitForFunction(()=>window.readyMs>0,{},{timeout:25000})}
   catch(e){console.log('rendered text',JSON.stringify((await page.locator('body').innerText()).slice(0,500)));throw e}
   const time=await page.evaluate(()=>Math.round(window.readyMs))
   pair.push(time)
   await page.goto('about:blank')
  }
  samples[label].push(pair)
  console.log('sample',label,i,pair)
  await context.close()
 }
 console.log('BENCH_RESULT',JSON.stringify(samples))
}finally{await browser.close();for(const x of Object.values(endpoints))x.server.close()}
