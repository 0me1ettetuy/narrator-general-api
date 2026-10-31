export type ParsedEpub = {
  title: string | null;
  language: string | null;
  authors: string[];
  cover: ParsedEpubCover | null;
  chapters: ParsedEpubChapter[];
};

export type ParsedEpubCover = {
  bytes: Uint8Array;
  mimeType: string;
};

export type ParsedEpubChapter = {
  position: number;
  title: string;
  sourceHref: string;
  text: string;
  wordCount: number;
  semanticTypes: string[];
  isLinear: boolean;
};
