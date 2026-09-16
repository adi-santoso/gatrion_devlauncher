import React from 'react'
import { test, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, renderHook } from '@testing-library/react'
import ProjectModal from '../ProjectModal'
import { useAppDrop } from '../../../useAppDrop'
import { EMPTY_PROJECT, validateProjectForm } from '../projectFormData'

vi.mock('../../../data/projects', () => ({ browseFolder, detectProjectType }))
const { browseFolder, detectProjectType } = vi.hoisted(() => ({ browseFolder: vi.fn(), detectProjectType: vi.fn() }))
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const node = { success: true, type: 'NODEJS', name: 'Node.js', projectName: 'nodeapp', packageManager: 'npm', defaultPort: 3000, defaultCommand: 'npm start', commands: [{ id: 'main', name: 'Node', command: 'npm start', port: 3000, primary: true }], warnings: [] }
const go = { ...node, type: 'GOLANG', name: 'Go', projectName: 'goapp', defaultPort: null, defaultCommand: 'go run .', packageManager: null, commands: [{ id: 'main', name: 'Go', command: 'go run .', port: null, primary: true }] }
beforeEach(() => { browseFolder.mockResolvedValue({ success: true, path: 'D:/fixture' }); detectProjectType.mockResolvedValue(node); window.Element.prototype.scrollIntoView = vi.fn() })
async function open(props = {}) {
  const onSave = vi.fn(async () => ({ success: true })), onClose = vi.fn()
  const options = { isOpen: true, onSave, onClose, ...props }
  const view = render(<ProjectModal {...options} />)
  fireEvent.click(screen.getByRole('button', { name: 'Browse Project Folder' }))
  await screen.findByText('Detected as Node.js')
  fireEvent.click(screen.getByRole('button', { name: /Advanced Settings/ }))
  return { ...view, onSave, onClose, options }
}

test('AP01 in-flight detection preserves latest edits, including new environment rows', async () => {
  await open()
  const pending = deferred(); detectProjectType.mockReturnValueOnce(pending.promise)
  fireEvent.click(screen.getByRole('button', { name: 'Change folder' }))
  await waitFor(() => expect(detectProjectType).toHaveBeenCalledTimes(2))
  fireEvent.change(screen.getByLabelText(/Project name/), { target: { value: 'my manual edit' } })
  fireEvent.click(screen.getByRole('button', { name: '+ Add variable' }))
  await act(async () => pending.resolve(go))
  expect(screen.getByLabelText(/Project name/)).toHaveValue('my manual edit')
  expect(screen.getByLabelText('Variable 1 name')).toBeTruthy()
})

test('AP01 manual fields survive repeated detection and automatic port/command can clear', async () => {
  const { onSave } = await open()
  fireEvent.change(screen.getByLabelText(/Project name/), { target: { value: 'manual-name' } })
  for (const result of [go, node, go]) {
    detectProjectType.mockResolvedValue(result)
    fireEvent.click(screen.getByRole('button', { name: 'Change folder' }))
    await screen.findByText(`Detected as ${result.name}`)
    expect(screen.getByLabelText(/Project name/)).toHaveValue('manual-name')
  }
  fireEvent.click(screen.getByRole('button', { name: 'Add Project', exact: true }))
  await waitFor(() => expect(onSave).toHaveBeenCalled())
  expect(onSave.mock.calls[0][0]).toMatchObject({ type: 'GOLANG', port: null, startCommand: 'go run .' })
  detectProjectType.mockResolvedValue({ ...go, type: 'CUSTOM', name: 'Custom', defaultCommand: '', commands: [] })
  fireEvent.click(screen.getByRole('button', { name: 'Change folder' }))
  await screen.findByText('Detected as Custom')
  expect(screen.getByLabelText(/Start command/)).toHaveValue('')
})

test('AP03 failed first detection retains path, permits manual config and retry', async () => {
  detectProjectType.mockResolvedValue({ success: false, error: 'Fixture read failed' })
  const onSave = vi.fn(async () => ({ success: true }))
  render(<ProjectModal isOpen onSave={onSave} onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Browse Project Folder' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText(/Project path/)).toHaveValue('D:/fixture')
  fireEvent.change(screen.getByLabelText(/Project name/), { target: { value: 'Manual' } })
  fireEvent.change(screen.getByLabelText(/Start command/), { target: { value: 'node worker.js' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add Project', exact: true }))
  await waitFor(() => expect(onSave).toHaveBeenCalled())
})

test('AP04 drop A/B resolved out of order preserves B and its metadata', async () => {
  const a = deferred(), b = deferred()
  detectProjectType.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
  const props = { isOpen: true, onSave: vi.fn(), onClose: vi.fn() }
  const view = render(<ProjectModal {...props} droppedProject={{ path: 'A', analyze: true }} />)
  view.rerender(<ProjectModal {...props} droppedProject={{ path: 'B', analyze: true }} />)
  await act(async () => b.resolve({ ...go, packageManager: 'pnpm', warnings: ['fixture warning'] }))
  await act(async () => a.resolve(node))
  expect(screen.getByLabelText(/Project path/)).toHaveValue('B')
  expect(screen.getByText(/Package manager: pnpm/)).toBeTruthy()
  expect(screen.getByText('fixture warning')).toBeTruthy()
})

test('AP04 delayed native picker and drop completion cannot contaminate a reopened form', async () => {
  const pending = deferred(); browseFolder.mockReturnValueOnce(pending.promise)
  const props = { onSave: vi.fn(), onClose: vi.fn() }
  const view = render(<ProjectModal isOpen {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Browse Project Folder' }))
  view.rerender(<ProjectModal isOpen={false} {...props} />)
  view.rerender(<ProjectModal isOpen {...props} />)
  await act(async () => pending.resolve({ success: true, path: 'OLD' }))
  expect(screen.getByLabelText(/Project path/)).toHaveValue('')
  expect(detectProjectType).not.toHaveBeenCalled()
})

test('AP05 duplicate requests a new folder and explicit replacement of stored secrets', () => {
  const { result } = renderHook(() => useAppDrop({ openModal: vi.fn(), setEditingProject: vi.fn() }))
  act(() => result.current.handleDuplicateProject({ id: 'source', name: 'Source', path: 'A', envVars: [{ key: 'API_TOKEN', value: '', secret: true, unchanged: true }] }))
  expect(result.current.droppedProject.envVars).toEqual([{ key: 'API_TOKEN', value: '', secret: true, needsValue: true }])
  expect(result.current.droppedProject.path).toBe('')
})

test('AP06 invalid env and custom rows receive inline errors before IPC', async () => {
  const { onSave } = await open()
  fireEvent.click(screen.getByRole('button', { name: '+ Add variable' }))
  fireEvent.change(screen.getByLabelText('Variable 1 name'), { target: { value: 'BAD KEY' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add Project', exact: true }))
  expect(onSave).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Variable 1 name')).toHaveAttribute('aria-invalid', 'true')
  fireEvent.change(screen.getByLabelText('Variable 1 name'), { target: { value: 'GOOD_KEY' } })
  expect(screen.queryByRole('alert')).toBeNull()
  const errors = validateProjectForm({ ...EMPTY_PROJECT, name: 'App', path: 'A', startCommand: 'npm start', envVars: [{ key: 'DUP', value: '1' }, { key: 'DUP', value: '2' }], customCommands: [{ id: 'c', label: '', command: '' }] })
  expect(errors).toHaveProperty('env.1'); expect(errors).toHaveProperty('custom.0')
})

test('AP13 editing path invalidates the detected summary', async () => {
  await open()
  fireEvent.change(screen.getByLabelText(/Project path/), { target: { value: 'D:/different-project' } })
  expect(screen.queryByText('Detected as Node.js')).toBeNull()
  expect(screen.getByText(/Manual configuration/)).toBeTruthy()
})

test('AP14 pending save cannot close or reset a newer session, and fields are locked for its snapshot', async () => {
  const pending = deferred(), onSave = vi.fn(() => pending.promise), onClose = vi.fn()
  const view = await open({ onSave, onClose })
  fireEvent.click(screen.getByRole('button', { name: 'Add Project', exact: true }))
  expect(screen.getByLabelText(/Project name/)).toBeDisabled()
  view.rerender(<ProjectModal {...view.options} isOpen={false} />)
  view.rerender(<ProjectModal {...view.options} isOpen />)
  fireEvent.change(screen.getByLabelText(/Project name/), { target: { value: 'new draft' } })
  await act(async () => pending.resolve({ success: true }))
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByLabelText(/Project name/)).toHaveValue('new draft')
})

test('AP01 primary edits keep automatic additional processes eligible for replacement', async () => {
  await open()
  fireEvent.change(screen.getByLabelText(/Start command/), { target: { value: 'node manual.js' } })
  detectProjectType.mockResolvedValue({ ...node, commands: [...node.commands, { id: 'assets', name: 'Assets', command: 'npm run assets', port: 5173, primary: false }] })
  fireEvent.click(screen.getByRole('button', { name: 'Analyze folder' }))
  await screen.findByLabelText('Start command Assets')
  expect(screen.getByLabelText('Start command *')).toHaveValue('node manual.js')
  detectProjectType.mockResolvedValue(go)
  fireEvent.click(screen.getByRole('button', { name: 'Analyze folder' }))
  await screen.findByText('Detected as Go')
  expect(screen.queryByLabelText('Start command Assets')).toBeNull()
  expect(screen.getByLabelText('Start command *')).toHaveValue('node manual.js')
})

test('AP14 a refreshed project object cannot reset an edit draft or its pending save', async () => {
  const project = { ...EMPTY_PROJECT, id: 'edit', name: 'Original', path: 'A', startCommand: 'node app.js' }
  const pending = deferred(), props = { isOpen: true, onClose: vi.fn(), onSave: vi.fn(() => pending.promise) }
  const view = render(<ProjectModal {...props} project={project} />)
  fireEvent.change(screen.getByLabelText(/Project name/), { target: { value: 'Edited' } })
  view.rerender(<ProjectModal {...props} project={{ ...project, status: 'running' }} />)
  expect(screen.getByLabelText(/Project name/)).toHaveValue('Edited')
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
  view.rerender(<ProjectModal {...props} project={{ ...project, status: 'stopped' }} />)
  expect(screen.getByLabelText(/Project name/)).toBeDisabled()
  await act(async () => pending.resolve({ success: true }))
  expect(props.onClose).toHaveBeenCalledOnce()
})

test('AP06 additional port errors focus the affected row and duplicate ports are rejected', async () => {
  const { onSave } = await open()
  fireEvent.click(screen.getByRole('button', { name: 'Add process' }))
  const command = screen.getByLabelText(/^Start command Additional process/), port = screen.getByLabelText(/^Port Additional process/)
  fireEvent.change(command, { target: { value: 'node assets.js' } })
  fireEvent.change(port, { target: { value: '70000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add Project', exact: true }))
  expect(onSave).not.toHaveBeenCalled()
  await waitFor(() => expect(port).toHaveFocus())
  expect(port).toHaveAttribute('aria-invalid', 'true')
  fireEvent.change(port, { target: { value: '3000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add Project', exact: true }))
  expect(screen.getAllByText('Each command must use a different port')).toHaveLength(2)
  fireEvent.change(port, { target: { value: '5173' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add Project', exact: true }))
  await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
})
