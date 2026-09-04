/**
 * Device-simulator controls for the app preview: preset picker (grouped by
 * kind), rotate (portrait ⇄ landscape), and custom W×H inputs. Presentational
 * and controlled — all state lives in usePreviewDevice / AppPreviewTab.
 */
import { useEffect, useState } from 'react'
import Icon from '../Common/Icon'
import { useI18n } from '../../i18n/I18nContext'
import type { DeviceKind, DeviceSelection, Size } from './devicePresets'
import { CUSTOM_DEVICE_ID, DEVICE_PRESETS, MAX_CUSTOM_SIZE, MIN_CUSTOM_SIZE, clampCustom, effectiveSize } from './devicePresets'

const KIND_LABEL_KEY: Record<DeviceKind, string> = {
  phone: 'preview.groupPhones',
  tablet: 'preview.groupTablets',
  laptop: 'preview.groupLaptops',
}

interface PreviewDeviceBarProps {
  device: DeviceSelection
  landscape: boolean
  /** Disabled when the project is not running / preview unavailable. */
  disabled?: boolean
  onChange: (device: DeviceSelection) => void
  onRotate: () => void
}

export default function PreviewDeviceBar({ device, landscape, disabled = false, onChange, onRotate }: PreviewDeviceBarProps) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<Size>(() => ({ width: 393, height: 852 }))

  const selectValue = device.mode === 'preset' ? device.id : device.mode === 'custom' ? CUSTOM_DEVICE_ID : ''
  const showCustom = selectValue === CUSTOM_DEVICE_ID

  // Re-seed the custom inputs whenever a custom device is (re)selected so they
  // always reflect the applied dimensions.
  useEffect(() => {
    if (device.mode === 'custom') setDraft({ width: device.width, height: device.height })
  }, [device])

  const handleSelect = (value: string): void => {
    if (value === '') onChange({ mode: 'fill' })
    else if (value === CUSTOM_DEVICE_ID) onChange({ mode: 'custom', width: 393, height: 852 })
    else onChange({ mode: 'preset', id: value })
  }

  const applyCustom = (): void => {
    const { width, height } = clampCustom(draft.width, draft.height)
    setDraft({ width, height })
    onChange({ mode: 'custom', width, height })
  }

  const group = (kind: DeviceKind) => (
    <optgroup label={t(KIND_LABEL_KEY[kind])}>
      {DEVICE_PRESETS.filter((preset) => preset.kind === kind).map((preset) => (
        <option key={preset.id} value={preset.id}>{preset.name}</option>
      ))}
    </optgroup>
  )

  return (
    <div className="flex items-center gap-1 bg-surface-3 border border-border rounded-md px-1.5 py-0.5 text-xs text-ink-soft font-mono">
      <select
        value={selectValue}
        onChange={(e) => handleSelect(e.target.value)}
        disabled={disabled}
        aria-label={t('preview.device')}
        className="bg-transparent text-xs text-ink font-semibold focus:outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed max-w-[130px]"
      >
        <option value="">{t('preview.fitWindow')}</option>
        {group('phone')}
        {group('tablet')}
        {group('laptop')}
        <option value={CUSTOM_DEVICE_ID}>{t('preview.custom')}</option>
      </select>

      {showCustom && (
        <span className="flex items-center gap-1 pl-1 text-[10px]">
          <input
            type="number"
            min={MIN_CUSTOM_SIZE}
            max={MAX_CUSTOM_SIZE}
            value={Number.isFinite(draft.width) ? draft.width : ''}
            onChange={(e) => setDraft((prev) => ({ ...prev, width: Number(e.target.value) }))}
            onKeyDown={(e) => { if (e.key === 'Enter') applyCustom() }}
            onBlur={applyCustom}
            aria-label={t('preview.width')}
            className="w-14 bg-base border border-border rounded px-1 py-0.5 text-ink focus:outline-none"
          />
          <span aria-hidden="true">×</span>
          <input
            type="number"
            min={MIN_CUSTOM_SIZE}
            max={MAX_CUSTOM_SIZE}
            value={Number.isFinite(draft.height) ? draft.height : ''}
            onChange={(e) => setDraft((prev) => ({ ...prev, height: Number(e.target.value) }))}
            onKeyDown={(e) => { if (e.key === 'Enter') applyCustom() }}
            onBlur={applyCustom}
            aria-label={t('preview.height')}
            className="w-14 bg-base border border-border rounded px-1 py-0.5 text-ink focus:outline-none"
          />
          <button
            type="button"
            onClick={applyCustom}
            title={t('preview.apply')}
            className="px-1.5 py-0.5 rounded bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 font-semibold transition-colors"
          >
            {t('preview.apply')}
          </button>
        </span>
      )}

      <button
        type="button"
        onClick={onRotate}
        disabled={disabled || selectValue === ''}
        title={t('preview.rotate')}
        aria-label={t('preview.rotate')}
        className="w-6 h-6 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <Icon name="rotate" size={12} />
      </button>
      {selectValue !== '' && !showCustom && (
        <span className="text-[10px] text-ink-faint pl-0.5 pr-1" aria-hidden="true">
          {(() => {
            const size = effectiveSize(device, landscape)
            return size ? `${size.width} × ${size.height}` : ''
          })()}
        </span>
      )}
    </div>
  )
}