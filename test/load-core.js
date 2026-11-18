"use strict";
// index.html에서 <script id="tally-core"> 블록만 꺼내 격리된 vm에서 실행한다.
// 배포 파일 그대로를 시험하기 위해서다.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const INDEX = path.join(__dirname, "..", "index.html");

function loadCore() {
  const html = fs.readFileSync(INDEX, "utf8");
  const match = html.match(/<script id="tally-core">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('index.html에 <script id="tally-core"> 블록이 없습니다');
  const context = vm.createContext({});
  vm.runInContext(match[1], context, { filename: "index.html#tally-core" });
  return context.SurveyTally;
}

module.exports = { loadCore, INDEX };
