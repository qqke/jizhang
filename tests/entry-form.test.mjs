import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entryForm, fillReceipt } from '../src/entry-form.ts'

test('receipt fills recognized fields while keeping missing values and manual choices', () => {
 const form = entryForm('2026-11-19', '前次店铺', '餐饮美食')
 const scanned = fillReceipt(form, { amount: 1280, merchant: '日和' })
 assert.equal(scanned.amount, '1280')
 assert.equal(scanned.merchant, '日和')
 assert.equal(scanned.date, form.date)
 assert.deepEqual(fillReceipt(scanned, {}), scanned)
 const manual = {
  ...scanned, kind: 'income', category: '其他', note: '手动记录',
  manual: { amount: true, date: true, merchant: true },
 }
 assert.deepEqual(fillReceipt(manual, { amount: 2000, date: '2026-11-18', merchant: '其他店' }), manual)
})
