import { Fragment } from "react";
import { speak } from "../lib/speech";

// Runs of Arabic letters, marks and the punctuation that sits between Arabic words.
const ARABIC_RUN = /([؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿][؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿ً-ْ\s،؛؟/]*[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿ً-ْ]|[؀-ۿ])/g;

/** Inline text: **bold**, *italic*, and tappable Arabic (click to hear it). */
function Inline({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g);
  return parts.map((part, index) => {
    const bold = /^\*\*[^*]+\*\*$/.test(part);
    const italic = !bold && /^\*[^*]+\*$/.test(part);
    const content = bold ? part.slice(2, -2) : italic ? part.slice(1, -1) : part;
    const pieces = content.split(ARABIC_RUN).map((piece, pieceIndex) => (
      pieceIndex % 2 === 1
        ? <button key={pieceIndex} type="button" className="daal-ar" lang="ar" dir="rtl" title="Tap to hear" onClick={() => speak(piece)}>{piece}</button>
        : <Fragment key={pieceIndex}>{piece}</Fragment>
    ));
    if (bold) return <strong key={index}>{pieces}</strong>;
    if (italic) return <em key={index}>{pieces}</em>;
    return <Fragment key={index}>{pieces}</Fragment>;
  });
}

/** Renders Daal's replies: paragraphs, "- " bullet lists, **bold**, tappable Arabic. Never injects HTML. */
export default function DaalText({ text }) {
  const blocks = [];
  let list = null;
  String(text).split("\n").forEach(line => {
    const bullet = line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      if (!list) { list = []; blocks.push({ type: "list", items: list }); }
      list.push(bullet[1]);
    } else {
      list = null;
      if (line.trim()) blocks.push({ type: "p", text: line });
    }
  });
  return (
    <div className="daal-text">
      {blocks.map((block, index) => (block.type === "list"
        ? <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}><Inline text={item} /></li>)}</ul>
        : <p key={index}><Inline text={block.text} /></p>))}
    </div>
  );
}
