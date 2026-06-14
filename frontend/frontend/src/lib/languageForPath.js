const extensionLanguages = {
  css: "css",
  html: "html",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  md: "markdown",
  py: "python",
  ts: "typescript",
  tsx: "typescript",
  txt: "plaintext",
  yml: "yaml",
  yaml: "yaml",
};

export function languageForPath(filePath) {
  const extension = filePath.split(".").pop()?.toLowerCase();
  return extensionLanguages[extension] || "plaintext";
}
