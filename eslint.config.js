import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals'
import stylistic from '@stylistic/eslint-plugin'

let result = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
  files: ['**/*.{ts,tsx}'],
  plugins: {
    "@stylistic": stylistic
  },
  languageOptions: {
    parserOptions: {
      project: "./tsconfig.json",
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    },
  ignores: [
    "**/js/**",
    "node_modules",
    "**/node_modules/**",
    "**/generated/**",
    "build",
    "eslint.config.js"
  ],
  rules: {
    "prefer-const": "warn",

    // rule for newbies; namespaces has their uses
    "@typescript-eslint/no-namespace": "off",

    // that's also for namespaces
    "no-inner-declarations": "off",

    // you shouldn't use it too much, but there are situations where you are 100% sure that it's not null
    // for example, array iteration by index
    "@typescript-eslint/no-non-null-assertion": "off",

    // that's for while(true)
    "no-constant-condition": ["error", {checkLoops: false}],

    // I'm not stupid. If something is typed as any - it should be any
    "@typescript-eslint/no-explicit-any": "off",

    // if something is async - we should await it, or at least explicitly void
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": ["error", { "checksVoidReturn": false }],


    /* codestyle rules; disabled rules may be overriden by typescript rules */
    indent: "off",
    eqeqeq: ["warn", "always"],
    curly: ["warn", "all"],
    semi: "off",
    "no-floating-decimal": ["warn"],
    // it's irritating and doesn't really add anything
    "no-lonely-if": ["off"],
    "no-useless-rename": ["warn"],
    // it's useful, I'm just furious when it's getting autocorrected mid-thought process, hence it's off
    "no-useless-return": ["off"],
    "quote-props": ["warn", "as-needed", {numbers: true}],
    "spaced-comment": ["warn", "always", { "markers": ["/"]}],
    yoda: ["warn", "never"],
    "array-bracket-newline": ["warn", "consistent"],
    "array-bracket-spacing": ["warn", "never"],
    "array-element-newline": ["warn", "consistent"],
    "arrow-parens": ["warn", "as-needed"],
    "arrow-spacing": ["warn", {before: true, after: true}],
    "brace-style": "off",
    "comma-dangle": "off",
    "comma-spacing": "off",
    "comma-style": ["warn", "last"],
    "computed-property-spacing": ["warn", "never"],
    "dot-location": ["warn", "property"],
    "func-call-spacing": "off",
    "generator-star-spacing": ["warn", {before: false, after: true}],
    "key-spacing": ["warn", {
      beforeColon: false,
      afterColon: true,
      mode: "strict"
    }],
    "keyword-spacing": "off",
    "linebreak-style": ["warn", "unix"],
    "new-parens": ["warn", "always"],
    "no-multi-spaces": ["warn"],
    "no-trailing-spaces": ["warn"],
    "no-whitespace-before-property": ["warn"],
    "object-curly-newline": ["warn", {
      ImportDeclaration: "never",
      ExportDeclaration: "never",
      ObjectPattern: {multiline: true, consistent: true, minProperties: 4},
      ObjectExpression: {multiline: true, consistent: true, minProperties: 4},
  }],
    "object-curly-spacing": "off",
    "operator-linebreak": ["warn", "before"],
    quotes: "off",
    "rest-spread-spacing": ["warn", "never"],
    "space-before-blocks": ["warn", {
      functions: "always",
      keywords: "never",
      classes: "always"
    }],
    "space-before-function-paren": "off",
    "space-in-parens": ["warn", "never"],
    "space-infix-ops": "off",
    "space-unary-ops": ["warn", {words: false, nonwords: false}],
    // conflicts with space-before-blocks
    // for example, `case 5: {}` - space should and should not be there at the same time
    "switch-colon-spacing": "off",
    "template-curly-spacing": ["warn", "never"],
    "template-tag-spacing": ["warn", "never"],
    "unicode-bom": ["warn", "never"],
    "yield-star-spacing": ["warn", "after"],

    "@stylistic/func-call-spacing": ["warn", "never"],
    "@stylistic/member-delimiter-style": ["warn", {
      multiline: {delimiter: "none"},
      singleline: {delimiter: "comma", requireLast: false}
    }],
    "@typescript-eslint/method-signature-style": "off",
    "@typescript-eslint/no-confusing-non-null-assertion": ["warn"],
    "@stylistic/type-annotation-spacing": ["warn"],
    "@stylistic/brace-style": ["warn", "1tbs"],
    "@stylistic/comma-dangle": ["warn", "never"],
    "@stylistic/comma-spacing": ["warn", {before: false, after: true}],
    "@stylistic/indent": ["warn", "tab"],
    "@stylistic/keyword-spacing": ["warn", {
      overrides: {
        if: {after: false},
        for: {after: false},
        while: {after: false},
        catch: {after: false},
        switch: {after: false},
        yield: {after: false}
        // ...more here?
      }
    }],
    "@stylistic/object-curly-spacing": ["warn", "never"],
    "@stylistic/quotes": ["warn", "double"],
    "@stylistic/semi": ["warn", "never"],
    "@stylistic/space-before-function-paren": ["warn", "never"],
    "@stylistic/space-infix-ops": ["warn"],
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        // if arg name consists entirely of `_` - it means "YES I KNOW THAT IT'S UNUSED STOP BOTHERING ME"
        "argsIgnorePattern": "^_+$",
      }
    ],
  }
}
);

export default result