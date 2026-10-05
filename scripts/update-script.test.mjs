import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const bash = process.env.BASH_TEST_BIN || (process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "/bin/bash");
const posix = path => process.platform === "win32" ? path.replaceAll("\\","/").replace(/^([A-Z]):/i,(_,drive)=>`/${drive.toLowerCase()}`) : path;
const available = existsSync(bash);

function fixture({ installed = false, badLock = false, lowDisk = false, brokenModules = false } = {}) {
  mkdirSync("work",{recursive:true});
  const directory = mkdtempSync(resolve("work/update-script-test-"));
  const root = join(directory,"repo"), bin = join(directory,"bin");
  mkdirSync(join(root,"deploy"),{recursive:true}); mkdirSync(bin); mkdirSync(join(root,"node_modules")); mkdirSync(join(root,".next/cache"),{recursive:true});
  if(installed)writeFileSync(join(root,"node_modules/.cs2-dependencies"),"known\n");
  const environment=join(directory,"server.env");writeFileSync(environment,`DATABASE_PATH='${posix(join(directory,"data.sqlite"))}'\nBACKUP_DIR='${posix(join(directory,"backups"))}'\nAPP_ORIGIN=https://boost.example\n`);
  const source=readFileSync("deploy/update-ubuntu.sh","utf8").replaceAll("\r\n","\n").replace("if [[ $EUID -ne 0 ]]; then","if false; then").replaceAll("/opt/cs2-boost",posix(root)).replaceAll("/etc/cs2-boost.env",posix(environment)).replaceAll("/opt/node24/bin",posix(bin)).replace("export PATH=",`export PATH=${posix(bin)}:`);
  const script=join(root,"deploy/update-ubuntu.sh");writeFileSync(script,source);
  const mocks={
    node:`case "$1" in *dependency-fingerprint.mjs) echo known;; *dependencies-ready.mjs) exit "$BROKEN_MODULES";; *) echo "node:$1" >> "$TRACE";; esac`,
    runuser:'shift 3\nexec "$@"',
    df:'echo "Filesystem Blocks Used Available Use% Mounted"\necho "disk 9999999 1000 $FREE_BLOCKS 1% /"',
    systemctl:'echo "systemctl:$*" >> "$TRACE"',
    curl:'echo "health" >> "$TRACE"',
    install:'exit 0',
    npm:'if [[ "$*" == *--dry-run* ]]; then echo preflight >> "$TRACE"; exit "$BAD_LOCK"; elif [[ "$1" == ci ]]; then echo dependencies >> "$TRACE"; elif [[ "$1" == run ]]; then echo build >> "$TRACE"; elif [[ "$1" == cache ]]; then echo clean-cache >> "$TRACE"; fi',
  };
  for(const [name,body] of Object.entries(mocks))writeFileSync(join(bin,name),`#!/usr/bin/env bash\n${body}\n`,{mode:0o755});
  const trace=join(directory,"trace");
  return {run:(args=[])=>{
    const result=spawnSync(bash,[posix(script),...args],{encoding:"utf8",env:{...process.env,HOME:posix(directory),TRACE:posix(trace),BAD_LOCK:badLock?"65":"0",BROKEN_MODULES:brokenModules?"1":"0",FREE_BLOCKS:lowDisk?"10":"9999999"}});
    return {...result,trace:existsSync(trace)?readFileSync(trace,"utf8"):""};
  }};
}

test("ordinary update reuses working dependencies; forced reinstall runs a preflight",{skip:!available},()=>{
  const ready=fixture({installed:true}).run();assert.equal(ready.status,0,ready.stderr);assert(!ready.trace.includes("preflight"));assert(!ready.trace.includes("dependencies"));assert(ready.trace.includes("build"));assert(ready.trace.includes("systemctl:start cs2-boost"));
  const forced=fixture({installed:true}).run(["--reinstall"]);assert.equal(forced.status,0,forced.stderr);assert(forced.trace.includes("preflight"));assert(forced.trace.includes("dependencies"));
  const broken=fixture({installed:true,brokenModules:true}).run();assert.notEqual(broken.status,0);assert(broken.trace.includes("preflight"));assert(broken.trace.includes("dependencies"));
});

test("invalid lock and insufficient disk space never stop the running site",{skip:!available},()=>{
  const bad=fixture({badLock:true}).run();assert.notEqual(bad.status,0);assert(bad.trace.includes("preflight"));assert(!bad.trace.includes("systemctl:stop"));assert(!bad.trace.includes("dependencies"));
  const full=fixture({lowDisk:true}).run();assert.notEqual(full.status,0);assert(!full.trace.includes("systemctl:stop"));assert(!full.trace.includes("preflight"));assert(!full.trace.includes("dependencies"));
});

test("first update saves an installation marker; cache cleanup runs after health check",{skip:!available},()=>{
  const first=fixture().run(["--clean-cache"]);assert.equal(first.status,0,first.stderr);assert(first.trace.indexOf("preflight")<first.trace.indexOf("systemctl:stop"));assert(first.trace.indexOf("health")<first.trace.indexOf("clean-cache"));
  const repeated=fixture();assert.equal(repeated.run().status,0);const result=repeated.run();assert.equal(result.status,0,result.stderr);assert.equal(result.trace.split("dependencies\n").length-1,1);
});
