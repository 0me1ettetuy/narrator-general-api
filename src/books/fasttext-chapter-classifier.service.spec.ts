import { toFastTextInput } from './fasttext-chapter-classifier.service.js';

describe('toFastTextInput', () => {
  it('matches the trained model feature shape', () => {
    expect(
      toFastTextInput(
        {
          position: 0,
          title: 'Contents',
          sourceHref: 'contents.xhtml',
          text: 'Contents\nChapter one',
          wordCount: 10,
          semanticTypes: [],
          isLinear: true,
        },
        0,
        10,
        'en-US',
      ),
    ).toBe(
      'Contents Contents Chapter one meta_lang_en meta_position_start meta_size_short meta_links_sparse meta_contents_hint',
    );
  });
});
