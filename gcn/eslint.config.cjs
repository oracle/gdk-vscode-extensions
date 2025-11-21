// eslint.config.cjs
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const stylistic = require('@stylistic/eslint-plugin');
const globals = require('globals');

module.exports = [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: 'tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
        sourceType: 'module',
        ecmaVersion: 2018,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      '@stylistic': stylistic,
    },
    rules: {
      // moved from @typescript-eslint/member-delimiter-style
      '@stylistic/member-delimiter-style': [
        'warn',
        {
          multiline: {
            delimiter: 'semi',
            requireLast: true,
          },
          singleline: {
            delimiter: 'semi',
            requireLast: false,
          },
        },
      ],

      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-unused-expressions': 'warn',

      // moved from @typescript-eslint/semi
      '@stylistic/semi': ['warn', 'always'],

      curly: 'off',
      eqeqeq: ['warn', 'always'],
      'no-redeclare': 'warn',
      'no-throw-literal': 'warn',
      'no-unused-expressions': 'off',
      semi: 'off',
    },
  },
];
