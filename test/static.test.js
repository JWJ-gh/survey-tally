"use strict";
// 배포 파일이 조건(외부 자원 없음, 데이터 전송·저장 없음)을 지키는지 정적으로 검사한다.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { INDEX } = require("./load-core");

const html = fs.readFileSync(INDEX, "utf8");

test("외부 주소가 없다", () => {
  assert.doesNotMatch(html, /\b(?:https?|wss?|ftp):\/\//i);
  assert.doesNotMatch(html, /(?:src|href|action)\s*=\s*["']?\s*\/\//i, "프로토콜 생략 주소(//host)");
});

test("외부 스크립트·스타일·글꼴·이미지를 불러오지 않는다", () => {
  assert.doesNotMatch(html, /<script[^>]*\ssrc\s*=/i);
  assert.doesNotMatch(html, /<link\b/i);
  assert.doesNotMatch(html, /@import|@font-face|url\s*\(/i);
  assert.doesNotMatch(html, /<(?:img|iframe|object|embed|video|audio|source|form)\b/i);
});

test("네트워크로 보내거나 브라우저에 저장하는 API를 쓰지 않는다", () => {
  const forbidden = [
    "fetch", "XMLHttpRequest", "sendBeacon", "WebSocket", "EventSource",
    "localStorage", "sessionStorage", "indexedDB", "document.cookie",
    "caches", "serviceWorker", "postMessage", "window.open", "importScripts",
  ];
  for (const word of forbidden) {
    assert.ok(!html.includes(word), `index.html에 ${word}가 있습니다`);
  }
});

test("CSP가 네트워크 요청을 막는다", () => {
  const match = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(match, "CSP meta 태그가 없습니다");
  const csp = match[1];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.doesNotMatch(csp, /connect-src|img-src|font-src|frame-src|\*|https?:/);
});

test("입력칸의 맞춤법 검사와 자동완성을 끈다", () => {
  const textarea = html.match(/<textarea[^>]*>/);
  assert.ok(textarea, "textarea가 없습니다");
  assert.match(textarea[0], /spellcheck="false"/);
  assert.match(textarea[0], /autocomplete="off"/);
});

test("결과는 innerHTML 없이 textContent로 그린다", () => {
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test("저장소 맨 위에 빈 .nojekyll 파일이 있다", () => {
  const nojekyll = path.join(__dirname, "..", ".nojekyll");
  assert.ok(fs.existsSync(nojekyll), ".nojekyll이 없습니다");
  assert.equal(fs.statSync(nojekyll).size, 0);
});
