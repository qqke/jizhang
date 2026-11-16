import { createWorker } from 'tesseract.js'

// Own the whole OCR process so cancel also terminates workers still loading language data.
self.onmessage = async (event: MessageEvent<Blob>) => {
 let worker: Awaited<ReturnType<typeof createWorker>> | undefined
 try {
  worker = await createWorker(['jpn', 'eng'], 1, {
   langPath: 'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@4.1.0',
   gzip: false,
   cachePath: 'chaimi-tessdata-fast-4.1.0',
   logger: m => { if (m.status === 'recognizing text') self.postMessage({ progress: Math.round(m.progress * 100) }) },
   errorHandler: () => self.postMessage({ error: true }),
  })
  const { data } = await worker.recognize(event.data)
  self.postMessage({ text: data.text })

 } catch { self.postMessage({ error: true }) }
 finally { await worker?.terminate() }
}
