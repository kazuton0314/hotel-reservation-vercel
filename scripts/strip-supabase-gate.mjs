import fs from "fs";
import path from "path";

const root = new URL("../app", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

function walk(dir, files = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, files);
    else if (f === "page.tsx") files.push(p);
  }
  return files;
}

for (const file of walk(root)) {
  if (file.includes(`${path.sep}login${path.sep}`)) continue;
  let s = fs.readFileSync(file, "utf8");
  const orig = s;
  s = s.replace(/import \{ SupabaseGate \} from "@\/components\/SupabaseGate";\r?\n/g, "");
  s = s.replace(/<SupabaseGate>\s*/g, "");
  s = s.replace(/\s*<\/SupabaseGate>/g, "");
  if (s !== orig) {
    fs.writeFileSync(file, s);
    console.log("updated", path.relative(root, file));
  }
}
