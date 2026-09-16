/**
 * Address-bar + navigation state for the embedded preview (native
 * WebContentsView). Owns the editable address, the live URL mirrored from the
 * view, back/forward capability, and every mini-browser action.
 */
import { useEffect, useRef, useState } from 'react'
import * as ipc from '../../utils/ipcRenderer'
import { useDetailI18n } from './useDetailI18n'

/**
 * Resolve a user-typed address into an absolute URL for the preview, tolerant
 * of the shorthand commonly typed in browsers: a bare relative path is joined
 * onto the app's origin, a bare host (or host:port) is given an http scheme.
 */
export function resolvePreviewAddress(raw: string, base: string): string {
  const s = (raw || '').trim()
  if (!s) return base || ''
  if (/^https?:\/\//i.test(s)) return s
  let baseUrl: URL | null = null
  try { baseUrl = new URL(base) } catch { baseUrl = null }
  const origin = baseUrl?.origin || ''
  // A string that looks like a host (has a port, or starts with a known local
  // hostname) is treated as a full URL; otherwise it's a path on the app origin.
  const looksHost = /:\d{1,5}(\/|$)/.test(s) || s.startsWith('localhost') || s.startsWith('127.0.0.1') || s.startsWith('0.0.0.0')
  if (!looksHost && origin) {
    return `${origin}${s.startsWith('/') ? s : `/${s}`}`
  }
  return `http://${s}`
}

export interface PreviewNavigation {
  loading: boolean
  error: string | null
  notice: string | null
  /** Current text shown in the address input. */
  address: string
  /** Live URL of the embedded page (native view only). */
  navUrl: string
  canGoBack: boolean
  canGoForward: boolean
  /** True while the user is editing the address (pauses live mirroring). */
  editingRef: { current: boolean }
  /** Bumped to force an iframe remount when no native view is available. */
  iframeKey: number
  onAddressChange: (value: string) => void
  onAddressSubmit: () => void
  onAddressBlur: () => void
  back: () => void
  forward: () => void
  reload: () => void
  openExternal: () => void
  clearData: () => void
}

export function usePreviewNavigation(
  projectId: string | undefined,
  appUrl: string | null,
  useNative: boolean,
): PreviewNavigation {
  const t = useDetailI18n()
  const [iframeKey, setIframeKey] = useState(0)
  const [address, setAddress] = useState<string>(appUrl || '')
  const [navUrl, setNavUrl] = useState<string>(appUrl || '')
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const editingRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    setAddress(appUrl || '')
    setNavUrl(appUrl || '')
    setError(null)
    setNotice(null)
    setLoading(false)
    setCanGoBack(false)
    setCanGoForward(false)
  }, [appUrl, projectId])

  // Mirror the live URL/back-forward state of the embedded preview into the
  // address bar, and read the initial state once a native view exists.
  useEffect(() => {
    if (!useNative || !projectId) return undefined
    let disposed = false
    const unsub = ipc.onPreviewUrlUpdated(({ projectId: pid, url, canGoBack: b, canGoForward: f, loading: pending, error: failure }) => {
      if (disposed || pid !== projectId) return
      setNavUrl(url)
      setCanGoBack(b)
      setCanGoForward(f)
      setLoading(Boolean(pending))
      setError(failure || null)
      if (!editingRef.current) setAddress(url)
    })
    void ipc.previewGetState(projectId).then((res) => {
      if (disposed || !res?.success || !res.data) return
      const url = res.data.url || appUrl || ''
      setNavUrl(url)
      setCanGoBack(res.data.canGoBack)
      setCanGoForward(res.data.canGoForward)
      setLoading(Boolean(res.data.loading))
      setError(res.data.error || null)
      if (!editingRef.current) setAddress(url)
    }).catch(cause => { if (!disposed) setError(String(cause)) })
    return () => {
      disposed = true
      unsub()
    }
  }, [useNative, projectId, appUrl])

  const onAddressChange = (value: string): void => {
    editingRef.current = true
    setAddress(value)
  }

  const onAddressSubmit = (): void => {
    editingRef.current = false
    const current = navUrl || appUrl || ''
    const target = resolvePreviewAddress(address, current)
    if (!target) { setAddress(current); return }
    if (useNative) {
      setNavUrl(target)
       void ipc.previewNavigate(projectId as string, target).then(result => { if (!result.success) setError(result.error || t('Navigation failed')) }).catch(cause => setError(String(cause)))
    }
    setAddress(target)
  }

  const onAddressBlur = (): void => {
    editingRef.current = false
    setAddress(navUrl || appUrl || '')
  }

  const back = (): void => {
    if (useNative) void ipc.previewBack(projectId as string).then(result => { if (!result.success) setError(result.error || t('Navigation failed')) }).catch(cause => setError(String(cause)))
  }

  const forward = (): void => {
    if (useNative) void ipc.previewForward(projectId as string).then(result => { if (!result.success) setError(result.error || t('Navigation failed')) }).catch(cause => setError(String(cause)))
  }

  const reload = (): void => {
    setError(null)
    setNotice(null)
    if (useNative) {
      void ipc.previewReload(projectId as string).then(result => { if (!result.success) setError(result.error || t('Reload failed')) }).catch(cause => setError(String(cause)))
    } else {
      setIframeKey((prev) => prev + 1)
    }
  }

  const openExternal = (): void => {
    const url = navUrl || appUrl
    if (url) void ipc.openExternalUrl(url)
  }

  const clearData = async (): Promise<void> => {
    if (!projectId) return
    setNotice(null)
    try {
    const result = await ipc.previewClearData(projectId)
    if (result?.success) {
      // After clearing storage, reload so the app picks up a fresh session
      const reloaded = await ipc.previewReload(projectId)
      if (!reloaded.success) throw new Error(reloaded.error || t('Reload failed'))
      setError(null)
      setNotice('Site data cleared')
    } else setError(result?.error || t('Unable to clear site data'))
    } catch (cause) { setError(String(cause)) }
  }

  return {
    loading, error, notice,
    address,
    navUrl,
    canGoBack,
    canGoForward,
    editingRef,
    iframeKey,
    onAddressChange,
    onAddressSubmit,
    onAddressBlur,
    back,
    forward,
    reload,
    openExternal,
    clearData,
  }
}
