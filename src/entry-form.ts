import type { Entry } from './local-ledger'
import type { ReceiptDraft } from './receipt-parser'

export const entryCategories = {
 expense: ['餐饮美食', '日常购物', '交通出行', '居家生活', '休闲娱乐', '医疗健康', '其他'],
 income: ['工资收入', '其他收入'],
}

export function categoriesFor(kind: Entry['kind'], existing?: Pick<Entry, 'kind' | 'category'> | null) {
 const available = entryCategories[kind]
 return existing?.kind === kind && !available.includes(existing.category)
  ? [...available, existing.category] : available
}

export function switchKind(form: EntryForm, kind: Entry['kind']) {
 return kind === form.kind ? form : { ...form, kind, category: entryCategories[kind][0] }
}

export function entryForm(today: string, lastMerchant: string, firstCategory: string, entry?: Entry) {
 return {
  kind: entry?.kind ?? 'expense', amount: entry ? String(entry.amount) : '',
  category: entry?.category ?? firstCategory, note: entry?.note ?? '',
  date: entry?.occurred_on ?? today, merchant: entry?.merchant ?? lastMerchant,
  customMerchant: false, manual: { amount: false, date: false, merchant: false },
 }
}
export type EntryForm = ReturnType<typeof entryForm>

export function fillReceipt(form: EntryForm, receipt: ReceiptDraft): EntryForm {
 const useMerchant = !form.manual.merchant && Boolean(receipt.merchant)
 return {
  ...form,
  amount: !form.manual.amount && receipt.amount !== undefined ? String(receipt.amount) : form.amount,
  date: !form.manual.date && receipt.date ? receipt.date : form.date,
  merchant: useMerchant ? receipt.merchant! : form.merchant,
  customMerchant: useMerchant ? false : form.customMerchant,
 }
}
