import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * VirtualList — windowed rendering for very long lists with variable-height
 * rows (logs, chat messages).
 *
 * The parent owns the scroll container: it passes the container ref and feeds
 * the current `scrollTop`. Only rows inside the visible window (+ overscan)
 * are rendered, so a 50k-line log stays cheap to scroll.
 *
 * Rendered rows are measured with ResizeObserver and cached by item key, so
 * filtering and appends never corrupt heights; unmeasured rows fall back to
 * `estimatedHeight` until they scroll into view (the estimate converges as
 * rows get measured). Row heights feed cumulative offsets, and the list is
 * laid out with two spacer divs so the window sits at the correct scroll
 * position without absolute positioning.
 *
 * Below `threshold` items the list renders fully — small lists are cheap and
 * perfectly accurate, so existing callers/tests are unaffected.
 */
export default function VirtualList({
  items,
  renderItem,
  getKey,
  scrollRef,
  scrollTop = 0,
  estimatedHeight = 24,
  rowGap = 0,
  overscan = 8,
  threshold = 500,
  className = '',
}) {
  const listRef = useRef(null);
  const heightsRef = useRef(new Map()); // item key -> measured px
  const observersRef = useRef(new Map()); // item key -> ResizeObserver
  const [measuredVersion, setMeasuredVersion] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const [offsetTop, setOffsetTop] = useState(0);

  // Measure the viewport and the list's offset inside the scroll container
  // (the list may be nested below other content, e.g. notices in the chat).
  useEffect(() => {
    const scroller = scrollRef?.current;
    const el = listRef.current;
    if (scroller) setViewportH(scroller.clientHeight);
    if (scroller && el) {
      const scrollerRect = scroller.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      // jsdom (and any layout-less environment) reports all-zero rects — treat
      // that as "the list starts at the top of the scroll container".
      const degenerate = scrollerRect.top === 0 && scrollerRect.height === 0 && elRect.top === 0 && elRect.height === 0;
      // `relative` shrinks by scrollTop as the user scrolls; adding it back
      // yields the layout-constant offset of the list inside the container.
      // With no layout info, assume the list starts at the top (offset 0).
      setOffsetTop(degenerate ? 0 : (elRect.top - scrollerRect.top) + (scroller.scrollTop || 0));
    }
  }, [scrollRef, scrollTop, measuredVersion, items.length]);

  // Cumulative offsets over all items. Every row occupies height + rowGap.
  // `measuredVersion` is the recompute trigger — the memo body reads the
  // heights ref directly, which the linter cannot see.
  const layout = useMemo(() => {
    const offsets = new Array(items.length);
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      offsets[i] = total;
      total += (heightsRef.current.get(getKey(items[i], i)) ?? estimatedHeight) + rowGap;
    }
    return { offsets, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measuredVersion is the recompute trigger
  }, [items, getKey, estimatedHeight, rowGap, measuredVersion]);

  let startIndex = 0;
  let endIndex = items.length;
  let startTop = 0;
  let bottomPad = 0;

  const windowed = items.length > threshold && viewportH > 0;
  if (windowed) {
    const scrollPos = Math.max(0, scrollTop - offsetTop);
    // Binary search: first row whose bottom is below the scroll position.
    let lo = 0;
    let hi = items.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const occupied = (heightsRef.current.get(getKey(items[mid], mid)) ?? estimatedHeight) + rowGap;
      if (layout.offsets[mid] + occupied <= scrollPos) lo = mid + 1;
      else hi = mid;
    }
    startIndex = Math.max(0, lo - overscan);
    const windowBottom = scrollPos + viewportH;
    let end = lo;
    while (end < items.length && layout.offsets[end] < windowBottom) end++;
    endIndex = Math.min(items.length, end + overscan);
    startTop = layout.offsets[startIndex];
    bottomPad = endIndex < items.length ? Math.max(0, layout.total - layout.offsets[endIndex]) : 0;
  }

  // Observe rendered rows and cache their measured heights.
  const observeRow = (key) => (el) => {
    if (!el) return;
    const update = () => {
      const height = el.offsetHeight;
      if (height > 0 && heightsRef.current.get(key) !== height) {
        heightsRef.current.set(key, height);
        setMeasuredVersion((version) => version + 1);
      }
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      observersRef.current.set(key, ro);
    }
  };

  // Disconnect observers for rows that left the window; clean up on unmount.
  useEffect(() => {
    const observers = observersRef.current;
    const visible = new Set();
    for (let i = startIndex; i < endIndex; i++) visible.add(getKey(items[i], i));
    for (const [key, observer] of observers) {
      if (!visible.has(key)) {
        observer.disconnect();
        observers.delete(key);
      }
    }
    return () => {
      for (const observer of observers.values()) observer.disconnect();
      observers.clear();
    };
  }, [startIndex, endIndex, items, getKey]);

  if (items.length === 0) return null;

  const rows = [];
  for (let i = startIndex; i < endIndex; i++) {
    const item = items[i];
    const key = getKey(item, i);
    rows.push(
      <div
        key={key}
        ref={observeRow(key)}
        style={rowGap ? { marginBottom: rowGap } : undefined}
      >
        {renderItem(item, i)}
      </div>
    );
  }

  return (
    <div ref={listRef} className={className}>
      {startTop > 0 && <div aria-hidden="true" style={{ height: startTop }} />}
      {rows}
      {bottomPad > 0 && <div aria-hidden="true" style={{ height: bottomPad }} />}
    </div>
  );
}
