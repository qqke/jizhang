import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'

const dist = process.argv[2] || 'dist'
const files = ['index.html', 'manifest.webmanifest', 'icons/chaimi-192.png', 'icons/chaimi-512.png',
 ...(await readdir(dist + '/assets')).filter(name => /\.(js|css)$/.test(name)).sort().map(name => 'assets/' + name)]
const template = await readFile('scripts/service-worker.js', 'utf8')
const hash = createHash('sha256').update(template)
for (const file of files) hash.update(file).update(await readFile(dist + '/' + file))
await writeFile(dist + '/sw.js', template.replace('__BUILD__', hash.digest('hex').slice(0, 16)).replace('/* ASSETS */ []', JSON.stringify(files)))
