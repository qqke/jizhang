import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { parseReceipt } from '../src/receipt-parser.ts'

test('Japanese receipt uses total, not subtotal, tax, tender or change', () => {
 const result = parseReceipt('日和カフェ\n2026年11月5日 12:30\n小計 ¥1,000\n消費税 ¥100\n合計 ¥1,100\nお預り ¥5,000\nお釣り ¥3,900')
 assert.deepEqual(result, { amount: 1100, date: '2026-11-05', merchant: '日和カフェ' })
})

test('normalizes full-width digits and spaced Japanese total', () => {
 assert.equal(parseReceipt('合 計　￥１２，３４５\n２０２６／１／２').amount, 12345)
 assert.equal(parseReceipt('合 計　￥１２，３４５\n２０２６／１／２').date, '2026-01-02')
 assert.equal(parseReceipt('税込合計\n1,234円').amount, 1234)
 assert.equal(parseReceipt('合 計\n1,234円').merchant, undefined)
})

test('English total is exact and permits a price on the next line', () => {
 assert.equal(parseReceipt('Cafe Hiyori\nSUBTOTAL 900\nTAX 90\nGRAND TOTAL\nJPY 990\nCASH 1000\nCHANGE 10').amount, 990)
 assert.equal(parseReceipt('SUBTOTAL 900\nCASH 1000\nCHANGE 100').amount, undefined)
 assert.equal(parseReceipt('TOTAL JPY 900\nTOTAL JPY 900').amount, 900)
 assert.equal(parseReceipt('TOTAL 900円').amount, 900)
 assert.equal(parseReceipt('TOTAL ¥900').amount, 900)
})

test('ambiguous, negative, decimal and malformed amounts remain blank', () => {
 for (const text of ['TOTAL JPY 100\nTOTAL JPY 200', 'TOTAL JPY 100\nTOTAL ???', '合計 -100', 'TOTAL JPY 1.50', '合計 1,20', '合計 0', 'TOTAL JPY 2147483648', 'TOTAL JPY 100 200', '税抜合計 900', '合計 TEL 03-1234-5678']) {
  assert.equal(parseReceipt(text).amount, undefined, text)
 }
})

test('foreign currencies are not silently treated as JPY', () => {
 for (const text of ['TOTAL $120', 'TOTAL 120 USD', 'USD\nTOTAL 120', '合計 120元', 'TOTAL €120', 'TOTAL HKD 120']) {
  assert.equal(parseReceipt(text).amount, undefined, text)
 }
 assert.equal(parseReceipt('元気スーパー\n合計 ¥120').amount, 120)
})

test('English totals require explicit JPY currency on the amount line', () => {
 for (const text of ['CHF\nTOTAL 100', 'INR\nTOTAL 100', 'SGD\nTOTAL 100', 'TOTAL 100', 'TOTAL100', 'TOTAL\n100']) {
  assert.equal(parseReceipt(text).amount, undefined, text)
 }
})

test('only valid, unambiguous calendar dates are filled', () => {
 assert.equal(parseReceipt('2024-02-29').date, '2024-02-29')
 assert.equal(parseReceipt('2026/2/29').date, undefined)
 assert.equal(parseReceipt('2026年13月1日').date, undefined)
 assert.equal(parseReceipt('2026/0/1').date, undefined)
 assert.equal(parseReceipt('2026/1/0').date, undefined)
 assert.equal(parseReceipt('2026-11-050').date, undefined)
 assert.equal(parseReceipt('1999/1/1').date, undefined)
 assert.equal(parseReceipt('2026/11/5\n2026/11/6').date, undefined)
})

test('merchant ignores headers, phone numbers and addresses', () => {
 assert.equal(parseReceipt('領収書\n〒123-4567\n東京都新宿区\nTEL 03-1234-5678\nHiyori Cafe\n2026/11/5').merchant, 'Hiyori Cafe')
 assert.equal(parseReceipt('RECEIPT\nTOTAL 100\nTHANK YOU').merchant, undefined)
 assert.deepEqual(parseReceipt(''), {})
})
