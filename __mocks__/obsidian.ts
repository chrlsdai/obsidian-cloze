export class App {}

export class Component {
  load()   {}
  unload() {}
}

export class Notice {
  constructor(public message: string) {}
}

export const MarkdownRenderer = {
  render: jest.fn().mockResolvedValue(undefined),
};

export class MarkdownView {
  file: unknown = null;
}

export class TFile {
  constructor(public path: string = "test.md") {}
}