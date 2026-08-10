module.exports = {
  extends: ['next/core-web-vitals'],
  parserOptions: {
    project: './tsconfig.json',
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  ignorePatterns: ['.next/', 'node_modules/'],
  rules: {
    '@next/next/no-img-element': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
  },
}
