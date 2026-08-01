/**
 * Unit tests only, deliberately.
 *
 * What is worth testing here is the logic that fails *silently* against a real
 * server: the wire-shape coercions in src/api/normalize.ts, and the download
 * state machine. Rendering tests would mostly assert that React renders, which
 * the typechecker and a real build already cover.
 */

module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: ['src/api/**/*.ts', 'src/store/**/*.ts'],
};
