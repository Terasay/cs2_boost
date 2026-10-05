import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const hash = createHash("sha256");
for (const path of ["package.json","package-lock.json"]) hash.update(readFileSync(path));
hash.update(`${process.versions.modules}:${process.platform}:${process.arch}`);
console.log(hash.digest("hex"));
