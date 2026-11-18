export const url = import.meta.env.VITE_SUPABASE_URL
export const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
// Keep the Supabase default key so existing installations retain their session.
export const storageKey = url ? 'sb-' + new URL(url).hostname.split('.')[0] + '-auth-token' : ''
export type Identity = { user: { id: string; email?: string } }
export function savedIdentity(): Identity | null {
 try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
  return typeof saved?.user?.id === 'string' ? { user: { id: saved.user.id, email: saved.user.email } } : null
 } catch { return null }
}
