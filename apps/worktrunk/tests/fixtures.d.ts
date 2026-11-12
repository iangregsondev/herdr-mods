// Vite's `?raw` imports: a file's text, as recorded. Tests read fixtures this way
// because they type-check without Node's types.
declare module "*?raw" {
  const text: string;
  export default text;
}
