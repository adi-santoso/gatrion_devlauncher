import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CrashBanner from '../CrashBanner'

describe('CrashBanner', () => {
  it('provides working restart and dismiss actions', () => {
    const onRestart = vi.fn()
    const onDismiss = vi.fn()
    render(
      <CrashBanner
        message="Project failed"
        timestamp="Port is already in use"
        onRestart={onRestart}
        onDismiss={onDismiss}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }))

    expect(onRestart).toHaveBeenCalledOnce()
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
