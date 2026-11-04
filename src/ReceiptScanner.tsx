import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, ScanLine } from 'lucide-react'
import { parseReceipt, type ReceiptDraft } from './receipt-parser'

type Props = { onResult: (draft: ReceiptDraft) => void; onBusy: (busy: boolean) => void; disabled?: boolean }

export function ReceiptScanner({ onResult, onBusy, disabled = false }: Props) {
 const [preview, setPreview] = useState('')
 const [text, setText] = useState('')
 const [message, setMessage] = useState('')
 const [busy, setBusy] = useState(false)
 const [progress, setProgress] = useState(0)
 const cancelRef = useRef<(() => void) | null>(null)
 const camera = useRef<HTMLInputElement>(null)
 const gallery = useRef<HTMLInputElement>(null)
 useEffect(() => () => { cancelRef.current?.() }, [])
 useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

 async function scan(file?: File) {
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
   setMessage('请选择 JPG、PNG 或 WebP 照片；HEIC 请先转换为 JPG。'); return
  }
  if (file.size > 16 * 1024 * 1024 || file.size === 0) {
   setMessage('请选择不超过 16 MB 的有效照片。'); return
  }
  cancelRef.current?.()
  let worker: Worker | undefined
  let stopped = false
  let rejectJob: (reason: Error) => void = () => {}
  const interruption = new Promise<never>((_, reject) => { rejectJob = reject })
  const cancel = () => { stopped = true; rejectJob(new Error('cancelled')); void worker?.terminate() }
  cancelRef.current = cancel
  setPreview(URL.createObjectURL(file)); setText(''); setMessage('正在准备识别，首次使用需要下载识别模型…')
  setBusy(true); onBusy(true); setProgress(0)
  const timeout = window.setTimeout(() => rejectJob(new Error('timeout')), 120000)
  try {
   const work = async () => {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    try {
     if (stopped) throw new Error('cancelled')
     if (bitmap.width * bitmap.height > 50000000) throw new Error('oversize')
     const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
     canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale)
     const ctx = canvas.getContext('2d')
     if (!ctx) throw new Error('canvas')
     ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
     ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    } finally { bitmap.close() }
    const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('image')), 'image/png'))
    if (stopped) throw new Error('cancelled')
    worker = new Worker(new URL('./receipt-worker.ts', import.meta.url), { type: 'module' })
    const result = new Promise<string>((resolve, reject) => {
     worker!.onmessage = (event: MessageEvent<{ progress?: number; text?: string; error?: boolean }>) => {
      if (stopped) return
      if (event.data.error) reject(new Error('ocr'))
      else if (event.data.text !== undefined) resolve(event.data.text)
      else if (event.data.progress !== undefined) { setMessage('正在识别小票…'); setProgress(event.data.progress) }
     }
     worker!.onerror = () => reject(new Error('ocr'))
    })
    worker.postMessage(image)
    return result
   }
   const result = await Promise.race([work(), interruption])
   if (stopped) return
   const raw = result.trim()
   if (!raw) { setMessage('没有识别到文字，请正面拍摄、保持清晰后重试，或手动记账。'); return }
   const draft = parseReceipt(raw)
   setText(raw); onResult(draft)
   const missing = [!draft.amount && '金额', !draft.date && '日期'].filter(Boolean)
   setMessage(missing.length ? `未能确定${missing.join('和')}，请手动补充，并核对下方信息。` : '已填入识别结果，请核对金额、日期和分类后保存。')
  } catch (error) {
   if (stopped) return
   setMessage(error instanceof Error && error.message === 'timeout'
    ? '识别超时，原表单未修改。请检查网络或拍摄更清晰的小票后重试。'
    : '识别失败，原表单未修改。请检查网络和照片格式后重试，或手动录入。')
  } finally {
   const wasCancelled = stopped
   stopped = true; clearTimeout(timeout); void worker?.terminate()
   if (!wasCancelled) { setBusy(false); onBusy(false); cancelRef.current = null }
  }
 }
 function cancelScan() { cancelRef.current?.(); cancelRef.current = null; setBusy(false); onBusy(false); setMessage('已取消识别，原表单未修改。可以重新选择照片。') }
 return <section className="receipt-scanner" aria-label="扫描小票">
  <div className="receipt-heading"><ScanLine size={20}/><div><strong>扫描小票，少打几个字</strong><p>日文 / 英文小票 · 日元 · 照片仅在本机识别</p></div></div>
  <div className="receipt-actions">
   <button className="outline" type="button" disabled={busy || disabled} onClick={() => camera.current?.click()}><Camera size={17}/> 拍摄小票</button>
   <button className="outline" type="button" disabled={busy || disabled} onClick={() => gallery.current?.click()}><ImagePlus size={17}/> 选择照片</button>
  </div>
  <input hidden ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="拍摄小票" onChange={e => { void scan(e.target.files?.[0]); e.target.value = '' }}/>
  <input hidden ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" aria-label="选择小票照片" onChange={e => { void scan(e.target.files?.[0]); e.target.value = '' }}/>
  {preview && <img className="receipt-preview" src={preview} alt="待核对的小票照片"/>}
  {message && <p className="receipt-status" role="status">{message}</p>}
  {busy && <><progress max={100} value={progress || undefined} aria-label="小票识别进度"/><button className="text-button" type="button" onClick={cancelScan}>取消识别</button></>}
  {text && <details><summary>查看识别原文</summary><pre>{text}</pre></details>}
 </section>
}
