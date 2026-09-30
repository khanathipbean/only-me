# Previewing more than PDFs and images — Plan

Goal: a CSV opens as a table, a text file as text, a video or sound file
plays — instead of "This file type can't be shown here."

Current vs desired (Diff):
- now: `INLINE_TYPES` holds five entries (PDF and four image types) and the
  dialog offers a download for everything else.
- want: the four kinds above rendered from the bytes the dialog already
  fetches.

Out of scope / do NOT touch (Fence):
- **`INLINE_TYPES` stays exactly as it is.** It decides what the server is
  willing to send with an inline Content-Disposition, which is a different
  question from what this dialog can draw. The new kinds are read from the
  blob and put in the DOM as text or as a media element, so the server keeps
  serving them as downloads and the list keeps its current security
  properties. SVG stays out for the reason written beside it.
- Word and Excel. Neither a third-party viewer (which means handing internal
  documents to someone else's server) nor an in-browser converter (a large
  dependency, and a rendering nobody will trust against the original) is
  worth it against a Download button that already works.
- Markdown is shown as its source text, never rendered. Turning it into HTML
  is the same hole as an inline SVG, reached a different way.

Risks & unknowns:
- **Size.** The cap is 20 MB, and putting 20 MB of text in the DOM locks the
  tab. Text is truncated, with a line saying so and the download beside it.
- **CSV quoting.** Splitting on commas is wrong the moment a cell contains
  one, and these files come out of Excel, which quotes freely. Use the real
  parser — `csv-parse/browser/esm/sync` — loaded on demand so it only reaches
  people who open a CSV.
- A CSV is still text: if parsing fails, fall back to showing the source
  rather than an error.

## Steps

1. `src/lib/project-files.ts` — `FileKind` gains `text`, `video`, `audio`;
   classify by content type, then by extension as the existing code does. Add
   `previewMode()` returning how the dialog should draw it, replacing the
   `previewable` + `isImage` pair the three call sites pass today.
   Verify: unit test over the classifier — extension and content type, and
   the ones that must stay unpreviewable.

2. `src/components/fileKindStyle.tsx` — icons for the three new kinds.

3. `src/components/FilePreview.tsx` — read `blob.text()` for text and table
   modes, `<video>`/`<audio>` for media, truncation notice, CSV parsed lazily
   with a fallback to plain text.

4. The three call sites pass `mode` instead of `previewable`/`isImage`.

5. `npx tsc --noEmit`, `npx eslint`, `npm test`.
