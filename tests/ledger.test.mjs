import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { filterEntries, csvText, sumEntries } from '../src/ledger.ts'
const rows = [{kind:'expense', amount:1200, category:'餐饮美食', note:'午餐', occurred_on:'2026-11-01'}, {kind:'income', amount:5000, category:'其他', note:'=HYPERLINK("bad")', occurred_on:'2026-11-02'}]
test('filters combine search, category and type', () => { assert.deepEqual(filterEntries(rows,'午餐','expense','餐饮美食'), [rows[0]]); assert.equal(filterEntries(rows,'午餐','income','all').length,0) })
test('CSV escapes dangerous formulas, quotes and commas', () => { const csv=csvText(rows); assert.ok(csv.includes(`"'=HYPERLINK(""bad"")"`)); assert.ok(csv.startsWith('\ufeff')); assert.ok(csv.includes('"1200"')) })
test('searches and exports a saved merchant while accepting older entries', () => {
 const entry = {...rows[0], merchant: 'AEON, Tokyo'}
 assert.deepEqual(filterEntries([entry, rows[1]], 'aeon', 'all', 'all'), [entry])
 const csv = csvText([entry, rows[1]])
 assert.ok(csv.split('\r\n')[0].endsWith('"店铺"'))
 assert.ok(csv.split('\r\n')[1].endsWith(',"AEON, Tokyo"'))
 assert.ok(csv.split('\r\n')[2].endsWith(',""'))
})

test('filtered totals count only matching records and keep income and expense separate', () => {
 const entries = [
  { ...rows[0], merchant: 'AEON' },
  { ...rows[1], merchant: 'AEON' },
  { ...rows[0], merchant: 'Life' },
 ]
 assert.deepEqual(sumEntries(filterEntries(entries, 'aeon', 'all', 'all')), { expense: 1200, income: 5000 })
 assert.deepEqual(sumEntries(filterEntries(entries, 'aeon', 'income', 'all')), { expense: 0, income: 5000 })
 assert.deepEqual(sumEntries([]), { expense: 0, income: 0 })
})
