const js = require('@eslint/js');
const prettier = require('eslint-config-prettier');

module.exports = [
    js.configs.recommended,
    prettier,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2018,
            sourceType: 'script',
            globals: {
                BigInt: true,
                Buffer: 'readonly',
                console: 'readonly',
                global: 'readonly',
                process: 'readonly',
                require: 'readonly',
                module: 'readonly',
                exports: 'writable',
                __dirname: 'readonly',
                __filename: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                setImmediate: 'readonly',
                clearImmediate: 'readonly'
            }
        },
        rules: {
            indent: 0,
            'no-await-in-loop': 0,
            'require-atomic-updates': 0,
            'no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ],
            'no-console': 'off',
            'no-constant-condition': ['error', { checkLoops: false }],
            'no-empty': ['error', { allowEmptyCatch: true }],
            'no-useless-escape': 'warn',
            'no-prototype-builtins': 'off'
        }
    },
    {
        ignores: ['node_modules/**', 'coverage/**', '.git/**', '*.log', 'test-*.js', 'dist/**', 'build/**']
    }
];
