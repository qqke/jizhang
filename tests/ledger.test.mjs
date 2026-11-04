import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { filterEntries, csvText } from '../src/ledger.ts'
const rows = [{kind:'expense', amount:1200, category:'餐饮美食', note:'午餐', occurred_on:'2026-11-01'}, {kind:'income', amount:5000, category:'其他', note:'=HYPERLINK("bad")', occurred_on:'2026-11-02'}]
test('filters combine search, category and type', () => { assert.deepEqual(filterEntries(rows,'午餐','expense','餐饮美食'), [rows[0]]); assert.equal(filterEntries(rows,'午餐','income','all').length,0) })
test('CSV escapes dangerous formulas, quotes and commas', () => { const csv=csvText(rows); assert.ok(csv.includes(`"'=HYPERLINK(""bad"")"`)); assert.ok(csv.startsWith('\ufeff')); assert.ok(csv.includes('"1200"')) })
