import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^obsidian$':      '<rootDir>/__mocks__/obsidian.ts',
    '^anki-connect$':  '<rootDir>/__mocks__/anki-connect.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};

export default config;