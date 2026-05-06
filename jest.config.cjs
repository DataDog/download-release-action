const {createDefaultEsmPreset} = require('ts-jest')

module.exports = {
  ...createDefaultEsmPreset(),
  clearMocks: true,
  testMatch: ['**/*.test.ts'],
  // TS source imports use a `.js` suffix (NodeNext) but resolve to `.ts` at test time.
  moduleNameMapper: {'^(\\.{1,2}/.*)\\.js$': '$1'},
  verbose: true
}
