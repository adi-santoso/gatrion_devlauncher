import base from '../../../vitest.config.js'

// Shortcut for the promoted, desired-behavior regressions in the normal suite.
export default {
  ...base,
  test: { ...base.test, include: ['src/components/Modals/__tests__/addProject.regressions.test.jsx', 'electron/managers/__tests__/addProject.regressions.test.js'] },
}
