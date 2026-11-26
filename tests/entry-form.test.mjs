import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categoriesFor, entryForm, fillReceipt, switchKind } from '../src/entry-form.ts'

test('switching income and expense resets the category and keeps the entered details', () => {
 const form = { ...entryForm('2026-11-19', '车站食堂', '餐饮美食'), amount: '1280' }
 const income = switchKind(form, 'income')
 assert.deepEqual(income, { ...form, kind: 'income', category: '工资收入' })
 assert.deepEqual(switchKind(income, 'expense'), form)
 assert.equal(categoriesFor('expense').includes('工资收入'), false)
 assert.equal(categoriesFor('income').includes('餐饮美食'), false)
 const legacy = { kind: 'income', category: '餐饮美食' }
 assert.equal(categoriesFor('income', legacy).includes(legacy.category), true)
 assert.equal(categoriesFor('expense', { kind: 'income', category: '工资收入' }).includes('工资收入'), false)
})

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
