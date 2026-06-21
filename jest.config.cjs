/** @type {import('jest').Config} */
module.exports = {
  // Use jsdom so that document.createElement, HTMLElement, etc. work.
  testEnvironment: "jest-environment-jsdom",

  // Run the global polyfill file before each test suite.
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],

  // Redirect any `import ... from "obsidian"` to the local stub.
  moduleNameMapper: {
    "^obsidian$": "<rootDir>/__mocks__/obsidian.ts",
  },

  // Only pick up files inside tests/.
  testMatch: ["<rootDir>/tests/**/*.test.ts"],

  // Compile TypeScript using the test-specific tsconfig.
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }],
  },
};