export type ParsedEpub = {
  title: string | null;
  authors: string[];
  chapters: ParsedEpubChapter[];
};

export type ParsedEpubChapter = {
  position: number;
  title: string;
  sourceHref: string;
  text: string;
  wordCount: number;
};
