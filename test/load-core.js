"use strict";
// HTML 파일에서 <script id="..."> 블록 하나를 꺼내 격리된 vm에서 실행한다.
// 배포 파일 그대로를 시험하기 위해서다.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const INDEX = path.join(ROOT, "index.html");
const GAME = path.join(ROOT, "game", "index.html");

function loadScript(file, id, globalName) {
  const html = fs.readFileSync(file, "utf8");
  const match = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
  if (!match) throw new Error(`${path.relative(ROOT, file)}에 <script id="${id}"> 블록이 없습니다`);
  const context = vm.createContext({});
  vm.runInContext(match[1], context, { filename: `${path.relative(ROOT, file)}#${id}` });
  return context[globalName];
}

function loadCore() {
  return loadScript(INDEX, "tally-core", "SurveyTally");
}

function loadGame() {
  return loadScript(GAME, "game-core", "StalactiteGame");
}

module.exports = { loadCore, loadGame, loadScript, INDEX, GAME };
