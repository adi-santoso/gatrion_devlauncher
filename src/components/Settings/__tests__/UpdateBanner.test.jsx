import React from 'react'
import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UpdateBanner } from '../settingsPanels'
import { I18nProvider } from '../../../i18n/I18nContext'

vi.mock('../../../utils/ipcRenderer', async () => {
  const actual = await vi.importActual('../../../utils/ipcRenderer')
  return { ...actual, openExternalUrl: vi.fn(async () => ({ success: true })) }
})

const baseInfo = {
  success: true,
  updateAvailable: true,
  latest: '0.2.5',
  current: '0.2.4',
  url: 'https://github.com/adi-santoso/gatrion_devlauncher/releases',
}

const renderBanner = (updateState = null, downloading = false, onCheck = vi.fn(), onDownload = vi.fn(), onInstall = vi.fn()) =>
  render(
    <I18nProvider language="en">
      <UpdateBanner
        updateInfo={baseInfo}
        updateState={updateState}
        downloading={downloading}
        onCheck={onCheck}
        onDownload={onDownload}
        onInstall={onInstall}
      />
    </I18nProvider>
  )

describe('UpdateBanner', () => {
  test('before a successful check it offers Check update, not Download', () => {
    renderBanner(null)
    expect(screen.getByRole('button', { name: /check update/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /download & install/i })).toBeNull()
  })

  test('Download & install only appears once the real updater state is available', () => {
    renderBanner({ state: 'available' })
    expect(screen.queryByRole('button', { name: /check update/i })).toBeNull()
    expect(screen.getByRole('button', { name: /download & install/i })).toBeTruthy()
  })

  test('clicking Check update calls onCheck and shows a disabled Checking state', () => {
    const onCheck = vi.fn()
    renderBanner(null, false, onCheck)
    fireEvent.click(screen.getByRole('button', { name: /check update/i }))
    expect(onCheck).toHaveBeenCalledTimes(1)

    renderBanner({ state: 'checking' }, false, onCheck)
    expect(screen.getByRole('button', { name: /checking/i }).disabled).toBe(true)
  })

  test('while downloading it renders a progress bar, not a text percentage', () => {
    const { container } = renderBanner({ state: 'downloading', progress: { percent: 42.5 } }, true)
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar).toBeTruthy()
    expect(Number(bar.getAttribute('aria-valuenow'))).toBe(43)
    const fill = container.querySelector('[role="progressbar"] > div')
    expect(fill.style.width).toBe('42.5%')
    expect(screen.getByText(/downloading/i)).toBeTruthy()
    // No "42%" text anywhere
    expect(screen.queryByText(/42%/i)).toBeNull()
  })

  test('after download it offers Restart & install', () => {
    renderBanner({ state: 'downloaded' })
    expect(screen.getByRole('button', { name: /restart & install/i })).toBeTruthy()
  })

  test('on error it surfaces the failure and lets the user check again', () => {
    renderBanner({ state: 'error', error: 'Please check update first' })
    expect(screen.getByText(/please check update first/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /check update/i })).toBeTruthy()
  })
})
