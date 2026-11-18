import { createClient } from '@supabase/supabase-js'
import { storageKey, url, key } from './connection'
export const cloud = url && key ? createClient(url, key, { auth: { storageKey } }) : null
