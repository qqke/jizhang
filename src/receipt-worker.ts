import { createWorker } from 'tesseract.js'

// Own the whole OCR process so cancel also terminates workers still loading language data.
self.onmessage = async (event: MessageEvent<Blob>) => {
 try {
  const worker = await createWorker(['jpn', 'eng'], 1, {
   logger: m => { if (m.status === 'recognizing text') self.postMessage({ progress: Math.round(m.progress * 100) }) },
   errorHandler: () => self.postMessage({ error: true }),
  })
  const { data } = await worker.recognize(event.data, { rotateAuto: true })
  self.postMessage({ text: data.text })
  await worker.terminate()
 } catch { self.postMessage({ error: true }) }
}
