(function () {
  "use strict";
  window.__BRAND__ = {
    name: "Pulidoc",
    tagline: "Format your Word document in seconds",
    faqs: [
      {
        q: "Is my document uploaded to a server?",
        a: "No. The entire process — reading, cleaning, previewing, and downloading — takes place in your own browser. Your file never leaves your computer."
      },
      {
        q: "What types of errors does it automatically fix?",
        a: "Double spaces, spaces before commas or periods, missing spaces after punctuation marks, repeated manual line breaks, and consecutive empty paragraphs."
      },
      {
        q: "Does it detect headings even if I don't use Word's styles?",
        a: "Yes. If a short paragraph is bold or uses a larger font size than the rest of the text, Pulidoc recognizes it as a potential heading and applies the heading style from the selected preset. You can disable this detection if you prefer to keep your own structure."
      },
      {
        q: "Can I choose the font, color, and margins?",
        a: "Yes. Each preset comes with a starting configuration, but you can change the body and heading fonts, accent color, line spacing, paragraph spacing, margins, and whether the text is justified."
      },
      {
        q: "Can I still edit the downloaded file in Word?",
        a: "Yes. It's a standard .docx file. Pulidoc doesn't generate an image or a PDF; it rewrites the document's internal styles so that Word (or Google Docs or LibreOffice) opens it already formatted."
      },
      {
        q: "What happens to my images and tables?",
        a: "They remain untouched. Pulidoc only rewrites paragraph and text styles; images, tables, and numbering from the original document are not modified."
      },
      {
        q: "Is there a file size limit?",
        a: "No, but it works better with documents of up to around 20,000 words or ~20 MB. Larger documents may take a little longer to generate the preview, depending on your device's available memory."
      },
      {
        q: "Does it work with old .doc files?",
        a: "Not directly. Pulidoc works with the modern .docx format. If you have an old .doc file, open it in Word and use \"Save As\" to save it in .docx format before uploading it."
      }
    ]
  };
})();