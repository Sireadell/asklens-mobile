module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      '@swc/jest',
      { jsc: { parser: { syntax: 'typescript' }, target: 'es2020' }, module: { type: 'commonjs' } },
    ],
  },
};
