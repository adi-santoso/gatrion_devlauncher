import React, { useState } from 'react'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../../i18n/I18nContext'
import DetailPanels from '../DetailPanels'
import AnalyticsTab from '../AnalyticsTab'
import DependenciesTab from '../DependenciesTab'
import EnvironmentFields from '../../Modals/EnvironmentFields'
import TabNavigation from '../TabNavigation'
import { useProjectTasks } from '../useProjectTasks'

vi.mock('../../../utils/ipcRenderer', () => ({
  listEnvFiles: vi.fn(), readEnvFile: vi.fn(), writeEnvFile: vi.fn(),
  getHealth: vi.fn(), clearHealth: vi.fn(), npmOutdated: vi.fn(),
  getCustomCommandStatus: vi.fn(), stopCustomCommand: vi.fn(),
}))
vi.mock('../../../data/dependencies', () => ({
  composerOutdated: vi.fn(), goOutdated: vi.fn(), pipOutdated: vi.fn(), cargoOutdated: vi.fn(),
  composerUpdate: vi.fn(), goUpdate: vi.fn(), pipUpdate: vi.fn(), cargoUpdate: vi.fn(),
}))
const ipc = await import('../../../utils/ipcRenderer')
const deps = await import('../../../data/dependencies')
const a = { id: 'draft-a', path: 'A', name: 'Alpha' }
const b = { id: 'draft-b', path: 'B', name: 'Beta' }
const stats = { totalRuns: 1, totalUptimeMs: 1000, avgUptimeMs: 1000, lastRun: null, crashes: [], runs: [], daily: [] }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

beforeEach(() => {
  vi.resetAllMocks()
  ipc.listEnvFiles.mockResolvedValue({ success: true, files: ['.env'] })
  ipc.readEnvFile.mockImplementation(async path => ({ success: true, content: `PROJECT=${path}`, modifiedAt: 7 }))
  ipc.writeEnvFile.mockResolvedValue({ success: true })
  ipc.getCustomCommandStatus.mockResolvedValue({ status: 'running' })
  ipc.stopCustomCommand.mockResolvedValue({ success: true })
  ipc.getHealth.mockResolvedValue({ success: true, stats })
  for (const fn of [ipc.npmOutdated, deps.composerOutdated, deps.goOutdated, deps.pipOutdated, deps.cargoOutdated]) fn.mockResolvedValue({ success: true, outdated: [] })
})
afterEach(() => vi.useRealTimers())

function Panels({ active = 'draft-a', tab = 'environment', language = 'en', fullscreen = false }) {
  return <I18nProvider language={language}>{[a, b].map(project => <DetailPanels key={project.id} project={project} tab={tab} visible={!fullscreen && active === project.id} onOutput={() => {}} />)}</I18nProvider>
}

it('lazily opens panels, retains each env draft through project/fullscreen/language changes', async () => {
  const { rerender } = render(<Panels tab="app" />)
  expect(ipc.listEnvFiles).not.toHaveBeenCalled()
  expect(ipc.npmOutdated).not.toHaveBeenCalled()
  rerender(<Panels />)
  await screen.findByText('PROJECT')
  fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
  const editor = screen.getByRole('textbox', { name: 'Edit .env' })
  fireEvent.change(editor, { target: { value: 'DRAFT=A' } })
  rerender(<Panels active="draft-b" />)
  await waitFor(() => expect(ipc.readEnvFile).toHaveBeenCalledWith('B', '.env'))
  rerender(<Panels fullscreen />)
  rerender(<Panels language="id" />)
  expect(screen.getByRole('textbox', { name: 'Edit .env' })).toBe(editor)
  expect(editor).toHaveValue('DRAFT=A')
  expect(ipc.readEnvFile).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Simpan', exact: true }))
  await waitFor(() => expect(ipc.writeEnvFile).toHaveBeenCalledWith('A', '.env', 'DRAFT=A', 7))
})

it('keeps failed dependency scans visible with retry, without a false healthy result', async () => {
  ipc.npmOutdated.mockResolvedValue({ success: false, error: 'ENETUNREACH' })
  deps.cargoOutdated.mockResolvedValue({ success: true, hasCargo: true, pluginMissing: true, outdated: [] })
  render(<DependenciesTab project={a} />)
  expect(await screen.findByText('ENETUNREACH')).toBeVisible()
  expect(screen.getByText(/plugin is not installed/)).toBeVisible()
  expect(screen.queryByText('Up to date')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Re-check all' })).toBeEnabled()
})

it('analytics recovers across projects and reports a failed clear', async () => {
  ipc.getHealth.mockResolvedValueOnce({ success: false, error: 'A failed' })
  const { rerender } = render(<AnalyticsTab project={a} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('A failed')
  rerender(<AnalyticsTab project={b} />)
  expect(await screen.findByText('Total runs')).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  ipc.clearHealth.mockResolvedValue({ success: false, error: 'Read only' })
  fireEvent.click(screen.getByRole('button', { name: 'Clear history' }))
  fireEvent.click(screen.getByRole('button', { name: 'Clear', exact: true }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Read only')
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
})

it('environment row identity survives typing, backspace, and removing an earlier row', async () => {
  function Form() { const [values, setValues] = useState([{ key: 'FIRST', value: '' }, { key: '', value: '' }]); return <EnvironmentFields values={values} onChange={setValues} /> }
  const user = userEvent.setup()
  render(<Form />)
  const input = screen.getByLabelText('Variable 2 name')
  await user.type(input, 'FOO_LONG_KEY{Backspace}')
  expect(input).toHaveValue('FOO_LONG_KE')
  expect(input).toHaveFocus()
  await user.click(screen.getByLabelText('Remove variable 1'))
  expect(screen.getByLabelText('Variable 1 name')).toBe(input)
})

it('tabs support Arrow/Home/End and localize their accessible labels', () => {
  function Tabs() { const [tab, setTab] = useState('app'); return <I18nProvider language="id"><TabNavigation activeTab={tab} onTabChange={setTab} projectId="a" /></I18nProvider> }
  render(<Tabs />)
  const app = screen.getByRole('tab', { name: 'Aplikasi' })
  app.focus()
  fireEvent.keyDown(app, { key: 'End' })
  expect(screen.getByRole('tab', { name: 'Pengaturan' })).toHaveFocus()
  fireEvent.keyDown(document.activeElement, { key: 'Home' })
  expect(app).toHaveFocus()
  fireEvent.keyDown(app, { key: 'ArrowRight' })
  expect(screen.getByRole('tab', { name: 'Terminal' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tab', { name: 'Terminal' })).toHaveAttribute('aria-controls', 'project-panel-a-terminal')
})

it('shares task state immediately, blocks duplicate runs, and reconciles completion per project', async () => {
  vi.useFakeTimers()
  const one = renderHook(() => useProjectTasks('shared-task-test'))
  const two = renderHook(() => useProjectTasks('shared-task-test'))
  const other = renderHook(() => useProjectTasks('other-task-test'))
  const pending = deferred()
  const action = vi.fn(() => pending.promise)
  let started
  act(() => { started = one.result.current.run('build', action) })
  await act(async () => { expect(await two.result.current.run('build', action)).toBe(false) })
  expect(action).toHaveBeenCalledTimes(1)
  await act(async () => { pending.resolve({ success: true, runId: 42 }); await started })
  expect(two.result.current.tasks.build).toMatchObject({ runId: 42, status: 'running' })
  expect(other.result.current.tasks.build).toBeUndefined()
  ipc.getCustomCommandStatus.mockResolvedValue({ status: 'failed', code: 1 })
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(two.result.current.tasks.build).toMatchObject({ status: 'failed', code: 1 })
  expect(ipc.getCustomCommandStatus).toHaveBeenCalledWith(42)
})
