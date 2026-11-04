export type ReceiptDraft = { amount?: number; date?: string; merchant?: string }

const totalLabel = /^(?:税込(?:み)?合計|総合計|合計|お会計|お買上(?:げ)?合計|GRAND\s+TOTAL\b|TOTAL\b)\s*/i
const foreignCurrency = /(?:\b(?:USD|EUR|GBP|CNY|RMB|KRW|CAD|AUD|HKD|TWD)\b|[$€£₩]|人民币|人民幣|\d\s*元)/i

function yenAmount(value: string): number | undefined {
 const match = value.match(/^(?:[:=]\s*)?(?:[（(]税込(?:み)?[）)]\s*)?(?:(?:¥|JPY)\s*)?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*(?:円|JPY)?\s*(?:[（(]税込(?:み)?[）)])?$/i)
 if (!match) return
 const amount = Number(match[1].replaceAll(',', ''))
 if (Number.isSafeInteger(amount) && amount > 0 && amount <= 2147483647) return amount
}

export function parseReceipt(text: string): ReceiptDraft {
 const normalized = text.normalize('NFKC')
 const lines = normalized.split(/\r?\n/).map(line => line.replace(/[\t ]+/g, ' ').trim()).filter(Boolean)
 const draft: ReceiptDraft = {}
 const totals = new Set<number>()
 let unresolvedTotal = false
 for (let i = 0; i < lines.length; i++) {
  const line = lines[i].replace(/([\u3040-\u30ff\u3400-\u9fff])\s+(?=[\u3040-\u30ff\u3400-\u9fff])/g, '$1').replace(/^[*＊]+\s*/, '')
  const label = line.match(totalLabel)
  if (!label) continue
  const remainder = line.slice(label[0].length).trim()
  const value = remainder || lines[i + 1] || ''
  const englishWithoutYen = /TOTAL/i.test(label[0]) && !/(?:¥|\bJPY\b|円)/i.test(value)
  const amount = englishWithoutYen ? undefined : yenAmount(value)
  if (amount === undefined) unresolvedTotal = true
  else totals.add(amount)
 }
 // shortcut: only explicit, unambiguous totals are inferred; add layouts when real receipts establish them.
 if (!foreignCurrency.test(normalized) && !unresolvedTotal && totals.size === 1) draft.amount = [...totals][0]

 const dates = new Set<string>()
 for (const match of normalized.matchAll(/(?<!\d)(20\d{2})\s*(?:年|[\/.\-])\s*(\d{1,2})\s*(?:月|[\/.\-])\s*(\d{1,2})(?:日)?(?!\d)/g)) {
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day)) {
   dates.add(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
  }
 }
 if (dates.size === 1) draft.date = [...dates][0]

 const headerOrDetail = /レシート|領収|領収書|お客様|お客さま|ありがとう|毎度|ご利用|合計|会計|税込|税抜|消費税|小計|預[かり]?|釣|電話|住所|登録|担当|レジ|受付|番号|伝票|明細|単価|数量|ポイント|クレジット|現金|支払|〒|都[道府県]?|道|府|県|市|区|町|番地|\b(?:receipt|invoice|thank|welcome|total|subtotal|tax|cash|change|date|time|tel|phone|register|cashier|transaction|address|qty|item|visa|mastercard)\b|https?:|www\.|@|\d{3,}|\d\s*[:/]|[¥$€£]/i
 draft.merchant = lines.slice(0, 8).find(line => line.length >= 2 && line.length <= 60 && /[A-Za-z\u3040-\u30ff\u3400-\u9fff]/.test(line) && !/\s\d+\s*$/.test(line) && !headerOrDetail.test(line) && !headerOrDetail.test(line.replaceAll(' ', '')))
 if (draft.merchant === undefined) delete draft.merchant
 return draft
}
