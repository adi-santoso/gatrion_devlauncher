import React, { useRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import VirtualList from '../VirtualList'

const makeItems = (count) => Array.from({ length: count }, (_, i) => `row-${i}`)

// Minimal harness: owns the scroll container + scrollTop, like the real callers.
const Harness = ({ items, threshold = 500, estimatedHeight = 20 }) => {
  const containerRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)
  return (
    <div
      data-testid="scroller"
      ref={containerRef}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <VirtualList
        items={items}
        scrollRef={containerRef}
        scrollTop={scrollTop}
        estimatedHeight={estimatedHeight}
        threshold={threshold}
        renderItem={(item) => <p>{item}</p>}
        getKey={(item) => item}
      />
    </div>
  )
}

describe('VirtualList', () => {
  it('renders every row when the list is below the threshold', () => {
    render(<Harness items={makeItems(10)} />)
    expect(screen.getAllByText(/^row-/)).toHaveLength(10)
    expect(screen.getByText('row-0')).toBeInTheDocument()
    expect(screen.getByText('row-9')).toBeInTheDocument()
  })

  it('renders only a window of rows for large lists', () => {
    render(<Harness items={makeItems(2000)} />)
    const scroller = screen.getByTestId('scroller')
    // jsdom has no layout: give the scroller a viewport and scroll position.
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 })
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 500 })
    fireEvent.scroll(scroller)

    // Window around row 25 (500 / 20px) with overscan — a small slice, not 2000.
    const rendered = screen.getAllByText(/^row-/)
    expect(rendered.length).toBeLessThan(60)
    expect(screen.getByText('row-25')).toBeInTheDocument()
    expect(screen.queryByText('row-0')).not.toBeInTheDocument()
    expect(screen.queryByText('row-1999')).not.toBeInTheDocument()
  })

  it('moves the window as the user scrolls', () => {
    render(<Harness items={makeItems(2000)} />)
    const scroller = screen.getByTestId('scroller')
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 })
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 500 })
    fireEvent.scroll(scroller)
    expect(screen.getByText('row-25')).toBeInTheDocument()

    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 1500 })
    fireEvent.scroll(scroller)
    expect(screen.getByText('row-75')).toBeInTheDocument()
    expect(screen.queryByText('row-25')).not.toBeInTheDocument()
  })

  it('renders nothing for an empty list', () => {
    render(<Harness items={[]} />)
    expect(screen.queryAllByText(/^row-/)).toHaveLength(0)
  })
})
