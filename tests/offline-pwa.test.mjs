import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { build } from 'vite'

async function until(read, message) {
 for (let i = 0; i < 160; i++) {
  const value = await read()
  if (value) return value
  await delay(100)
 }
 throw new Error(message)
}

// The Linux Pages runner includes Chrome. All data, auth, HTTP and cache state are isolated.
test('installed PWA survives offline relaunch and replays ambiguous writes exactly once', {
 skip: process.platform !== 'linux' && !process.env.CHAIMI_TEST_CHROME,
 timeout: 120000,
}, async t => {
 const cleanup = []
 t.after(async()=>{for(const close of cleanup.reverse())await close()})
 const dir = await mkdtemp(join(tmpdir(), 'chaimi-pwa-'))
 cleanup.push(() => rm(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 }))
 const dist = join(dir, 'dist')
 const owner = '00000000-0000-4000-8000-000000000001'
 const book = '00000000-0000-4000-8000-000000000002'
 const rows = new Map()
 let disconnected = false, loseReply = true, insertAttempts = 0
 const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname
  const json = (data, status = 200) => { res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify(data)) }
  if (disconnected) return json({}, 503)
  if (path === '/rest/v1/jz_books') return json([{ id:book, name:'离线测试账本', owner_id:owner }])
  if (path === '/rest/v1/jz_budgets') return json([])
  if (path === '/rest/v1/rpc/jz_list_merchants') return json([])
  if (path === '/rest/v1/jz_transactions') {
   if (req.method === 'GET') return json([...rows.values()])
   let raw = ''
   for await (const part of req) raw += part
   if (req.method === 'POST') {
    const row = JSON.parse(raw)
    insertAttempts++
    if (!rows.has(row.id)) rows.set(row.id, row)
    if (loseReply) { loseReply = false; return json({}, 503) }
    return json(null, 201)
   }
   const id = new URL(req.url, 'http://localhost').searchParams.get('id')?.slice(3)
   if (req.method === 'PATCH') { Object.assign(rows.get(id), JSON.parse(raw)); return json({id}) }
   if (req.method === 'DELETE') { rows.delete(id); return json(null) }
  }
  if (!path.startsWith('/jizhang/')) return json({}, 404)
  const name = path.slice('/jizhang/'.length) || 'index.html'
  try {
   const bytes = await readFile(join(dist,name))
   const type = name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : name.endsWith('.png') ? 'image/png' : 'application/json'
   res.writeHead(200, {'Content-Type': type}); res.end(bytes)
  } catch { json({},404) }
 })
 server.listen(0,'127.0.0.1')
 await once(server,'listening')
 cleanup.push(()=>{server.closeAllConnections();server.close()})
 const origin = 'http://127.0.0.1:' + server.address().port
 await build({ base:'/jizhang/', logLevel:'error', define:{
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(origin),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('test-public-key'),
 }, build:{outDir:dist} })
 execFileSync(process.execPath,['scripts/build-offline.mjs',dist])
 const chrome = spawn(process.env.CHAIMI_TEST_CHROME || 'google-chrome', [
  '--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--remote-debugging-port=0',
  '--user-data-dir='+join(dir,'profile'),'about:blank',
 ], {stdio:['ignore','ignore','ignore']})
 let launchError
 chrome.on('error', e => { launchError = e })
 cleanup.push(async()=>{if(chrome.exitCode===null && !launchError){const closed=once(chrome,'exit');chrome.kill();await closed}})
 const port = await until(async()=>{
  if(launchError) throw launchError
  try {return (await readFile(join(dir,'profile','DevToolsActivePort'),'utf8')).split('\n')[0]} catch {return false}
 },'Chrome failed to start')
 const [target] = await (await fetch('http://127.0.0.1:'+port+'/json/list')).json()
 const socket = new WebSocket(target.webSocketDebuggerUrl)
 await once(socket,'open')
 cleanup.push(()=>socket.close())
 let nextId=0
 const requests=new Map()
 socket.onmessage=e=>{const m=JSON.parse(e.data);const waiter=requests.get(m.id);if(!waiter)return;requests.delete(m.id);m.error?waiter.reject(Error(m.error.message)):waiter.resolve(m.result)}
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;requests.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})
 const evaluate=async expression=>{
  const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text)
  return r.result.value
 }
 const visible = text => evaluate('document.body?.innerText.includes('+JSON.stringify(text)+')')
 const click = selector => evaluate('document.querySelector('+JSON.stringify(selector)+').click()')
 const exp=Math.floor(Date.now()/1000)+3600
 const jwt=['{"alg":"HS256","typ":"JWT"}',JSON.stringify({sub:owner,exp,role:'authenticated'}),'test'].map(s=>Buffer.from(s).toString('base64url')).join('.')
 const session={access_token:jwt,refresh_token:'test-refresh',expires_in:3600,expires_at:exp,token_type:'bearer',user:{id:owner,email:'fixture@example.test'}}
 await call('Page.enable')
 await call('Network.enable')
 await call('Page.addScriptToEvaluateOnNewDocument',{source:
  "if(location.origin==="+JSON.stringify(origin)+"&&!localStorage.getItem('fixture')){localStorage.setItem('sb-127-auth-token',"+JSON.stringify(JSON.stringify(session))+");localStorage.setItem('fixture','1')}"})
 await call('Page.navigate',{url:origin+'/jizhang/'})
 await until(()=>visible('离线测试账本'),'Book failed to load')
 await until(()=>evaluate('Boolean(navigator.serviceWorker?.controller)'), 'Offline shell did not install')
 async function network(offline) {
  disconnected=offline
  await call('Network.emulateNetworkConditions',{offline,latency:0,downloadThroughput:-1,uploadThroughput:-1})
 }
 async function typeAmount(value) {
  await evaluate("(()=>{const e=document.querySelector('.amount-field input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}))})()")
 }
 async function amount(value) {
  await typeAmount(value)
  await click('.entry-save button')
  await until(()=>evaluate('!document.querySelector("dialog")'),'Local save did not finish')
 }
 async function reopen() {
  const previous=await evaluate('performance.timeOrigin')
  await call('Page.reload')
  await until(async()=>{try{return await evaluate('performance.timeOrigin !== '+previous+' && document.readyState === \'complete\'')}catch{return false}},'Offline navigation failed')
 }
 await network(true)
 await until(()=>visible('离线模式'),'Offline status missing')
 await click('button[aria-label="上个月"]')
 await until(()=>visible('本机尚无这个月的完整记录'),'Unknown offline month was presented as empty')
 assert.equal(await visible('¥0'), false)
 await click('button[aria-label="下个月"]')
 await click('.top-add')
 await typeAmount('1234')
 await click('.dialog-head button')
 await until(()=>evaluate('!document.querySelector("dialog")'),'Entry did not close')
 await click('.top-add')
 assert.equal(await evaluate("document.querySelector('.amount-field input').value"), '1234')
 assert.ok(await visible('已恢复上次填写的内容'))
 await amount('1234')
 assert.ok(await visible('已记支出 ¥1,234 · 已存本机'))
 await until(()=>evaluate('Boolean(document.querySelector(".record[data-saved]"))'),'Saved record was not marked')
 await click('.top-add')
 assert.equal(await evaluate("document.querySelector('.amount-field input').value"), '')
 await amount('567')
 await reopen()
 await until(()=>visible('待同步 2 项更改'),'Lost queue on offline reload')
 assert.ok(await visible('¥1,234'))
 assert.ok(await visible('¥567'))
 // Edit and delete while offline, then restart once more before replay.
 const clickRecord=async match=>evaluate("[...document.querySelectorAll('.record')].find(b=>b.textContent.includes("+JSON.stringify(match)+")).click()")
 await clickRecord('1,234')
 await amount('999')
 await clickRecord('567')
 await evaluate("window.confirm=()=>true;document.querySelector('button.delete').click()")
 await until(()=>visible('待同步 4 项更改'),'Offline mutations missing')
 await reopen()
 await until(()=>visible('待同步 4 项更改'),'Lost edits on restart')
 assert.ok(await visible('¥999'))
 assert.equal(await visible('¥567'),false)
 await network(false)
 await until(()=>insertAttempts>=2,'Automatic upload did not start')
 // Reconnect again in case the first insert response was lost.
 await network(true); await network(false)
 await until(async()=>rows.size===1&&[...rows.values()][0].amount===999&&!(await visible('待同步')),'Cloud replay failed or duplicated a row')
 assert.ok(insertAttempts>=3)
})
