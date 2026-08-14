import React from 'react'
import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ThemeSelector from '../ThemeSelector'
import { I18nProvider } from '../../../i18n/I18nContext'

const renderWithI18n = (ui, language = 'en') =>
  render(<I18nProvider language={language}>{ui}</I18nProvider>)

describe('ThemeSelector', () => {
  test('renders all three theme options and marks the current one', () => {
    renderWithI18n(<ThemeSelector currentTheme="dark" onThemeChange={() => {}} />)
    expect(screen.getByText('Dark')).toBeTruthy()
    expect(screen.getByText('Light')).toBeTruthy()
    expect(screen.getByText('System')).toBeTruthy()
  })

  test('translates theme labels into Indonesian', () => {
    renderWithI18n(<ThemeSelector currentTheme="dark" onThemeChange={() => {}} />, 'id')
    expect(screen.getByText('Gelap')).toBeTruthy()
    expect(screen.getByText('Terang')).toBeTruthy()
    expect(screen.getByText('Sistem')).toBeTruthy()
  })

  test('clicking each card reports the right theme', () => {
    const onChange = vi.fn()
    renderWithI18n(<ThemeSelector currentTheme="dark" onThemeChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /dark/i }))
    fireEvent.click(screen.getByRole('button', { name: /light/i }))
    fireEvent.click(screen.getByRole('button', { name: /system/i }))
    expect(onChange).toHaveBeenNthCalledWith(1, 'dark')
    expect(onChange).toHaveBeenNthCalledWith(2, 'light')
    expect(onChange).toHaveBeenNthCalledWith(3, 'system')
  })
})
