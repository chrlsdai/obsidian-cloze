import { jest } from "@jest/globals";

export const App = jest.fn();

export class Notice {
  constructor(public message: string) {}
}

export class MarkdownView {
  file: unknown = null;
}

export const Component = jest.fn().mockImplementation(() => ({
    load:   jest.fn(),
    unload: jest.fn(),
}));

export const MarkdownRenderer = {
    render: jest.fn().mockReturnValueOnce(undefined),
};

export const TFile = jest.fn();