import { useEffect, useLayoutEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { readPreference, writePreference } from './local-ledger'

const themes = [
 { id: 'sage', name: '鼠尾草绿', accent: '#245e46', hero: '#214d3c', paper: '#f6f7f2' },
 { id: 'rose', name: '樱花粉', accent: '#a44770', hero: '#843653', paper: '#fcf6f8' },
 { id: 'blue', name: '海盐蓝', accent: '#35668b', hero: '#2c506f', paper: '#f4f7fb' },
 { id: 'lilac', name: '雾紫', accent: '#765494', hero: '#5e4474', paper: '#f8f5fb' },
 { id: 'apricot', name: '杏茶橙', accent: '#99552e', hero: '#77442b', paper: '#fcf7f1' },
] as const

type Theme = typeof themes[number]
const preference = 'jz:appearance'
function readTheme() {
 const id = readPreference<unknown>(preference, null)
 return themes.find(theme => theme.id === id) ?? themes[0]
}

export function useDeviceTheme() {
 const [theme, setTheme] = useState(readTheme)
 useLayoutEffect(() => {
  const root = document.documentElement
  root.style.setProperty('--leaf', theme.accent)
  root.style.setProperty('--hero', theme.hero)
  root.style.setProperty('--paper', theme.paper)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.paper)
 }, [theme])
 useEffect(() => {
  const sync = (event: StorageEvent) => {
   if (event.key === preference || event.key === null) setTheme(readTheme())
  }
  window.addEventListener('storage', sync)
  return () => window.removeEventListener('storage', sync)
 }, [])
 function select(next: Theme) {
  setTheme(next)
  writePreference(preference, next.id)
 }
 return { theme, select }
}

export function ThemePicker({ theme, select }: ReturnType<typeof useDeviceTheme>) {
 return <section className="panel settings-panel">
  <h2 id="appearance-title">主题颜色</h2>
  <div className="theme-options" role="radiogroup" aria-labelledby="appearance-title">
   {themes.map(option => <label className="theme-option" key={option.id}>
    <input type="radio" name="ledger-theme" value={option.id} checked={theme.id === option.id}
     onChange={() => select(option)}/>
    <span className="theme-swatch" style={{ backgroundColor: option.accent }} aria-hidden="true">
     {theme.id === option.id && <Check size={16} strokeWidth={3}/>}
    </span>
    {option.name}
   </label>)}
  </div>
 </section>
}
