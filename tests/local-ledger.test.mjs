import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { applyChange } from '../src/local-ledger.ts'

const entry = { id: 'a', book_id: 'b', user_id: 'u', kind: 'expense', amount: 320, occurred_on: '2026-11-18' }
test('replayed entry changes preserve one row, including cross-month edits and deletion', () => {
 const insert = { entry, action: 'insert', owner: 'u' }
 const rows = applyChange(applyChange([], insert), insert)
 assert.deepEqual(rows, [entry])
 const moved = { ...insert, action:'update', entry:{...entry, occurred_on:'2026-12-01', amount:420} }
 assert.deepEqual(applyChange(rows,moved,'2026-11'),[])
 assert.deepEqual(applyChange([],moved,'2026-12'),[moved.entry])
 assert.deepEqual(applyChange([moved.entry],{...moved,action:'delete'}),[])
})

test('offline shell handles installed navigation and assets, and leaves API and unrelated paths alone', async () => {
 const root = 'https://example.test/jizhang/'
 const listeners = {}
 const cache = {match: async key => 'cached ' + key}
 const worker = readFileSync(new URL('../scripts/service-worker.js',import.meta.url),'utf8').replace('/* ASSETS */ []','["index.html","assets/app.js"]')
 vm.runInNewContext(worker, { URL, Set, Request, self:{registration:{scope:root},addEventListener:(type,fn)=>listeners[type]=fn},caches:{open:async()=>cache} })
 function fetchEvent(url, mode='cors', method='GET') {
  let value
  listeners.fetch({request:{url,mode,method},respondWith:r=>{value=r}})
  return value
 }
 assert.equal(await fetchEvent(root+'?invite=test','navigate'),'cached '+root+'index.html')
 assert.equal(await fetchEvent(root+'assets/app.js'),'cached '+root+'assets/app.js')
 assert.equal(fetchEvent('https://example.test/other/','navigate'),undefined)
 assert.equal(fetchEvent('https://db.example/rest/v1/jz_transactions'),undefined)
 assert.equal(fetchEvent(root+'index.html','cors','POST'),undefined)
})
