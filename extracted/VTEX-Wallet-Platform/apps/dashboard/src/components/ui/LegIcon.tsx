import type { SVGProps } from "react"

/**
 * Icônes Leg Day du Dashboard — SVG inline dessinés à la main, remplissage plein (Solar Bold), viewBox 24×24.
 * RULE 002 : jamais d'icône de police. Les tracés sont composés pour vivre dans un socle (28 / 32 / 44 / 56 px).
 * Le trou d'un glyphe (œil, cadenas…) vient de `fill-rule: evenodd`, pas d'un trait : l'icône reste nette à toutes les tailles.
 */
export type LegIconName =
  | "card"
  | "eye"
  | "eye-off"
  | "copy"
  | "lock"
  | "key"
  | "shield"
  | "clock"
  | "alert"
  | "check"
  | "pencil"
  | "trash"
  | "user"
  | "building"
  | "hash"
  | "history"
  | "chevron"
  | "close"
  | "plus"
  | "search"
  | "refresh"
  | "wallet"
  | "bank"
  | "link"
  | "unlock"
  | "download"
  | "grid"
  | "list"
  | "search"
  | "external"
  | "undo"
  | "file"
  | "upload"
  | "archive"

function Glyph({ name }: { name: LegIconName }) {
  switch (name) {
    case "card":
      return <path d="M4.5 4.5h15A2.5 2.5 0 0 1 22 7v1.6H2V7a2.5 2.5 0 0 1 2.5-2.5ZM2 10.6h20V17a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17Zm3.2 3.3v1.7H10v-1.7Z" />
    case "eye":
      return <path d="M12 4.5c5 0 8.9 3.3 10.5 7.5-1.6 4.2-5.5 7.5-10.5 7.5S3.1 16.2 1.5 12C3.1 7.8 7 4.5 12 4.5Zm0 3a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 2.2a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6Z" />
    case "eye-off":
      return (
        <>
          <path d="M12 4.5c1.1 0 2.1.2 3.1.5L13.4 6.7A5 5 0 0 0 12 6.5c-3.2 0-5.9 2-7.2 5.5.5 1.3 1.2 2.4 2.1 3.3l-1.4 1.4A12.6 12.6 0 0 1 1.5 12C3.1 7.8 7 4.5 12 4.5Zm7.9 3.3A12.6 12.6 0 0 1 22.5 12c-1.6 4.2-5.5 7.5-10.5 7.5-1.3 0-2.5-.2-3.6-.6l1.6-1.6c.6.1 1.3.2 2 .2 3.2 0 5.9-2 7.2-5.5a9.6 9.6 0 0 0-2.1-3.3ZM12 8.2a3.8 3.8 0 0 1 3.8 3.8c0 .3 0 .6-.1.9l-4.6-4.6c.3-.1.6-.1.9-.1Zm-3.7 2.9 4.6 4.6a3.8 3.8 0 0 1-4.6-4.6Z" />
          <path d="m3.4 3.4 17.2 17.2-1.4 1.4L2 4.8Z" />
        </>
      )
    case "copy":
      return <path d="M8 2.5h9A1.5 1.5 0 0 1 18.5 4v11h-2V4.5H8Zm-3.5 4h9A1.5 1.5 0 0 1 15 8v12a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 20V8a1.5 1.5 0 0 1 1.5-1.5Z" />
    case "lock":
      return <path d="M7 10V8a5 5 0 1 1 10 0v2h1.5A1.5 1.5 0 0 1 20 11.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20.5v-9A1.5 1.5 0 0 1 5.5 10Zm2 0h6V8a3 3 0 0 0-6 0Zm3 3.5a1.4 1.4 0 0 0-.7 2.6V18h1.4v-1.9a1.4 1.4 0 0 0-.7-2.6Z" />
    case "key":
      return <path d="M15.5 3.5a5 5 0 0 0-4.8 6.4L4 16.6V21h4.3l1.5-1.5v-2h2v-2h2l1.4-1.4a5 5 0 0 0 .3-10.6Zm-.5 3.7a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Z" />
    case "shield":
      return <path d="M12 2.5 4 6v6c0 5 3.4 7.7 8 9 4.6-1.3 8-4 8-9V6Zm3.6 6.6 1.3 1.3-5.6 5.6-3.2-3.2 1.3-1.3 1.9 1.9Z" />
    case "clock":
      return <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 5h2v5.2l3.4 2-1 1.7L11 13.3Z" />
    case "alert":
      return <path d="M12 2.8 22 20.2a1 1 0 0 1-.9 1.5H2.9a1 1 0 0 1-.9-1.5Zm-1 7v5h2v-5Zm0 6.8v2h2v-2Z" />
    case "check":
      return <path d="M5 12.5 10 17.5 20 7.5 18.5 6 10 14.5 6.5 11Z" />
    case "pencil":
      return <path d="M16.6 3.4a1.8 1.8 0 0 1 2.5 0l1.5 1.5a1.8 1.8 0 0 1 0 2.5L9 19l-5.5 1.5L5 15Z" />
    case "trash":
      return <path d="M9 3h6l1 2h4v2H4V5h4Zm-3 6h12l-.9 11.2a1 1 0 0 1-1 .8H7.9a1 1 0 0 1-1-.8ZM9.5 11.5v7h1.7v-7Zm3.3 0v7h1.7v-7Z" />
    case "user":
      return <path d="M12 3.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 9.5c4.2 0 7.5 2 7.5 4.5V20h-15v-2.5C4.5 15 7.8 13 12 13Z" />
    case "building":
      return <path d="M5 21V4a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 16 4v3h3a1 1 0 0 1 1 1v13ZM8 7h2V5H8Zm3.5 0h2V5h-2ZM8 11h2V9H8Zm3.5 0h2V9h-2ZM8 15h2v-2H8Zm3.5 0h2v-2h-2Zm-3.5 4h2v-2H8Zm3.5 0h2v-2h-2Zm4.5 0h2v-8h-2Z" />
    case "hash":
      return <path d="M9.4 3h2l-.6 4h3.6l.6-4h2l-.6 4H20v2h-3.1l-.5 3.6H20v2h-3.9l-.6 4.4h-2l.6-4.4H10.5l-.6 4.4h-2l.6-4.4H4v-2h4.8l.5-3.6H4V7h5.6Zm1.1 6-.5 3.6h3.6l.5-3.6Z" />
    case "history":
      return <path d="M12 3a9 9 0 1 1-8.6 11.6l1.9-.6A7 7 0 1 0 6.6 8H9v2H3V4h2v2.2A9 9 0 0 1 12 3Zm-1 5h2v3.6l2.6 1.6-1 1.7-3.6-2.2Z" />
    case "chevron":
      return <path d="m9.2 5.4 6.6 6.6-6.6 6.6-1.4-1.4 5.2-5.2-5.2-5.2Z" />
    case "close":
      return <path d="M5.4 4 12 10.6 18.6 4 20 5.4 13.4 12 20 18.6 18.6 20 12 13.4 5.4 20 4 18.6 10.6 12 4 5.4Z" />
    case "plus":
      return <path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7Z" />
    case "bank":
      return <path d="M12 2.5 22 8v1.8H2V8Zm-8 9h2.6V18H4Zm6.7 0h2.6V18h-2.6Zm6.7 0H20V18h-2.6ZM2.5 19.5h19v2h-19Z" />
    case "link":
      return <path d="M10.6 14.4a3.5 3.5 0 0 1 0-4.95l3-3a3.5 3.5 0 1 1 4.95 4.95l-1.5 1.5-1.42-1.42 1.5-1.5a1.5 1.5 0 1 0-2.12-2.12l-3 3a1.5 1.5 0 0 0 0 2.12Zm2.8-4.8a3.5 3.5 0 0 1 0 4.95l-3 3a3.5 3.5 0 1 1-4.95-4.95l1.5-1.5 1.42 1.42-1.5 1.5a1.5 1.5 0 1 0 2.12 2.12l3-3a1.5 1.5 0 0 0 0-2.12Z" />
    case "wallet":
      return <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v2.5H6.5a.5.5 0 0 0 0 1H18a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Zm12 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
    case "unlock":
      return <path d="M7 10V8a5 5 0 0 1 9.6-2l-1.9.7A3 3 0 0 0 9 8v2h9.5a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20.5v-9A1.5 1.5 0 0 1 5.5 10Zm5 3.5a1.4 1.4 0 0 0-.7 2.6V18h1.4v-1.9a1.4 1.4 0 0 0-.7-2.6Z" />
    case "download":
      return <path d="M11 3h2v10.2l3.6-3.6 1.4 1.4-6 6-6-6 1.4-1.4 3.6 3.6ZM4 18h16v2H4Z" />
    case "refresh":
      return <path d="M12 4a8 8 0 0 1 7.5 5.2H22l-3.2 4.3-3.3-4.3h2A6 6 0 1 0 12 18v2A8 8 0 0 1 12 4Z" />
    case "grid":
      return <path d="M4 4h7v7H4Zm9 0h7v7h-7ZM4 13h7v7H4Zm9 0h7v7h-7Z" />
    case "list":
      return <path d="M4 5h16v3H4Zm0 5.5h16v3H4ZM4 16h16v3H4Z" />
    case "search":
      return <path d="M11 3.5a7.5 7.5 0 0 1 5.9 12.1l4 4-1.4 1.4-4-4A7.5 7.5 0 1 1 11 3.5Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" />
    case "external":
      return <path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14ZM5 6h5v2H6v10h10v-4h2v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
    case "undo":
      return <path d="M9 4 3 9.5 9 15v-3.4c4.3 0 6.9 1.2 8.6 4.4.2-5.1-2.6-8.6-8.6-9.1Z" />
    case "file":
      return <path d="M7 2.5h7l5.5 5.5v12a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V4A1.5 1.5 0 0 1 7 2.5Zm6.5 1.7V8.5H18ZM8.5 12.5h7v1.8h-7ZM8.5 16h7v1.8h-7Z" />
    case "upload":
      return <path d="M11 16V5.8L7.4 9.4 6 8l6-6 6 6-1.4 1.4L13 5.8V16ZM4 18h16v2H4Z" />
    case "archive":
      return <path d="M3.5 4h17A1.5 1.5 0 0 1 22 5.5V8a1 1 0 0 1-1 1v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V9a1 1 0 0 1-1-1V5.5A1.5 1.5 0 0 1 3.5 4ZM8.5 11v1.8h7V11Z" />
  }
}

export function LegIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: LegIconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" clipRule="evenodd" aria-hidden="true" focusable="false" {...props}>
      <Glyph name={name} />
    </svg>
  )
}
