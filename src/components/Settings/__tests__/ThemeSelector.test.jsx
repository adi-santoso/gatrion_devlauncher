import React from 'react'
import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ThemeSelector from '../ThemeSelector'

describe('ThemeSelector', () => {
  test('renders all three theme options and marks the current one', () => {
    render(<ThemeSelector currentTheme="dark" onThemeChange={() => {}} />)
    expect(screen.getByText('Dark')).toBeTruthy()
    expect(screen.getByText('Light')).toBeTruthy()
    expect(screen.getByText('System')).toBeTruthy()
  })

  test('clicking each card reports the right theme', () => {
    const onChange = vi.fn()
    render(<ThemeSelector currentTheme="dark" onThemeChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /dark/i }))
    fireEvent.click(screen.getByRole('button', { name: /light/i }))
    fireEvent.click(screen.getByRole('button', { name: /system/i }))
    expect(onChange).toHaveBeenNthCalledWith(1, 'dark')
    expect(onChange).toHaveBeenNthCalledWith(2, 'light')
    expect(onChange).toHaveBeenNthCalledWith(3, 'system')
  })
})
