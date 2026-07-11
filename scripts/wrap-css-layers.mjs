import fs from "fs";
import path from "path";

const app = new URL("../app", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

function wrapLayer(file, skipComment = false) {
  const p = path.join(app, file);
  let content = fs.readFileSync(p, "utf8");
  if (content.includes("@layer components")) {
    console.log("skip (already layered)", file);
    return;
  }
  if (skipComment) {
    const lines = content.split(/\r?\n/);
    const commentEnd = lines.findIndex((l, i) => i > 0 && l.trim() && !l.trim().startsWith("/*") && !l.trim().startsWith("*"));
    const head = lines.slice(0, commentEnd).join("\n");
    const body = lines.slice(commentEnd).join("\n");
    content = `${head}\n\n@layer components {\n${body}\n}\n`;
  } else {
    content = `@layer components {\n${content}\n}\n`;
  }
  fs.writeFileSync(p, content);
  console.log("wrapped", file);
}

wrapLayer("detail.css", true);
wrapLayer("ui-extra.css");

const globalsPath = path.join(app, "globals.css");
let globals = fs.readFileSync(globalsPath, "utf8");
if (!globals.includes("@layer components")) {
  const marker = "\n.header {";
  const idx = globals.indexOf(marker);
  if (idx === -1) throw new Error("globals.css marker not found");
  globals =
    globals.slice(0, idx) +
    "\n@layer components {" +
    globals.slice(idx) +
    "\n}\n";
  fs.writeFileSync(globalsPath, globals);
  console.log("wrapped globals.css");
}
