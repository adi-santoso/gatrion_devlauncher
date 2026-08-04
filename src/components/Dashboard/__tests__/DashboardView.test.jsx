import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DashboardView from '../DashboardView'

describe('DashboardView errors', () => {
  it('dismisses a project error banner', () => {
    render(<DashboardView projects={[{
      id: 'one',
      name: 'Project One',
      status: 'error',
      errorMessage: 'Port 3000 is already in use',
      startedAt: 123,
    }]} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Port 3000 is already in use')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
