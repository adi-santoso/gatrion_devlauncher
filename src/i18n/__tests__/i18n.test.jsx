import React from 'react'
import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { translations, LANGUAGES } from '../translations'
import { translate, I18nProvider, useI18n } from '../I18nContext'

function Probe({ pick }) {
  const i18n = useI18n();
  return <span data-testid="probe">{pick(i18n)}</span>;
}

describe('translations dictionary', () => {
  test('en and id have the exact same key set', () => {
    const enKeys = Object.keys(translations.en).sort();
    const idKeys = Object.keys(translations.id).sort();
    expect(idKeys).toEqual(enKeys);
  });

  test('every supported language has a dictionary', () => {
    for (const lang of LANGUAGES) {
      expect(translations[lang]).toBeDefined();
    }
  });

  test('no placeholder is left dangling in id (all {vars} exist in en)', () => {
    const varsIn = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(translations.en)) {
      expect(varsIn(translations.id[key])).toEqual(varsIn(translations.en[key]));
    }
  });
});

describe('translate()', () => {
  test('resolves keys and substitutes variables', () => {
    expect(translate('en', 'settings.backup.exported', { count: 3, encrypted: '!' })).toBe(
      'Backup saved with 3 project(s)!.'
    );
    expect(translate('id', 'settings.backup.imported', { added: 2, skipped: '', config: '', presets: '' })).toBe(
      'Diimpor 2 proyek.'
    );
  });

  test('falls back to English, then to the raw key', () => {
    expect(translate('id', 'settings.language.en')).toBe('English');
    expect(translate('xx', 'nav.settings')).toBe('Settings');
    expect(translate('en', 'no.such.key')).toBe('no.such.key');
  });
});

describe('I18nProvider', () => {
  test('honors the requested language', () => {
    render(
      <I18nProvider language="id">
        <Probe pick={(i) => i.t('nav.projects')} />
      </I18nProvider>
    );
    expect(screen.getByTestId('probe').textContent).toBe('Proyek');
  });

  test('unknown language values default to en', () => {
    render(
      <I18nProvider language="xx">
        <Probe pick={(i) => i.lang} />
      </I18nProvider>
    );
    expect(screen.getByTestId('probe').textContent).toBe('en');
  });
});
