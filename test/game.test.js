"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { loadGame, GAME } = require("./load-core");

const G = loadGame();
const NONE = { left: false, right: false };
const LEFT = { left: true, right: false };
const RIGHT = { left: false, right: true };

// 같은 값만 내는 난수(0 이상 1 미만)
const fixed = (v) => () => v;

function playing() {
  return G.start(G.createGame());
}

// 종유석이 생기지 않게 생성 타이머를 멀리 미룬 상태
function quiet() {
  const s = playing();
  s.spawnTimer = 1e9;
  return s;
}

function spikeAt(x, y, w = 30, h = 60, vy = 0) {
  return { x, y, w, h, vy };
}

test("처음은 준비 상태이고 플레이어는 가운데", () => {
  const s = G.createGame();
  assert.equal(s.phase, "ready");
  assert.equal(s.score, 0);
  assert.equal(s.playerX, (G.WIDTH - G.PLAYER_W) / 2);
});

test("준비·일시정지·끝 상태에서는 아무것도 움직이지 않는다", () => {
  for (const phase of ["ready", "paused", "over"]) {
    const s = G.createGame();
    s.phase = phase;
    const x = s.playerX;
    G.step(s, RIGHT, 0.05, fixed(0.5));
    assert.equal(s.playerX, x, phase);
    assert.equal(s.time, 0, phase);
    assert.equal(s.spikes.length, 0, phase);
  }
});

test("왼쪽 입력이면 왼쪽으로, 오른쪽 입력이면 오른쪽으로 움직인다", () => {
  const s = quiet();
  const x = s.playerX;
  G.step(s, LEFT, 0.05, fixed(0.5));
  assert.equal(s.playerX, x - G.PLAYER_SPEED * 0.05);
  G.step(s, RIGHT, 0.05, fixed(0.5));
  G.step(s, RIGHT, 0.05, fixed(0.5));
  assert.equal(s.playerX, x + G.PLAYER_SPEED * 0.05);
});

test("둘 다 누르거나 아무것도 안 누르면 그대로", () => {
  const s = quiet();
  const x = s.playerX;
  G.step(s, { left: true, right: true }, 0.05, fixed(0.5));
  G.step(s, NONE, 0.05, fixed(0.5));
  assert.equal(s.playerX, x);
});

test("화면 양 끝을 넘어가지 않는다", () => {
  const s = quiet();
  for (let i = 0; i < 200; i++) G.step(s, LEFT, 0.05, fixed(0.5));
  assert.equal(s.playerX, 0);
  for (let i = 0; i < 200; i++) G.step(s, RIGHT, 0.05, fixed(0.5));
  assert.equal(s.playerX, G.WIDTH - G.PLAYER_W);
});

test("한 번에 흐르는 시간은 0.05초로 제한한다(탭 전환 뒤 순간이동 방지)", () => {
  const s = quiet();
  const x = s.playerX;
  G.step(s, RIGHT, 5, fixed(0.5));
  assert.equal(s.playerX, x + G.PLAYER_SPEED * 0.05);
  assert.equal(s.time, 0.05);
});

test("생성 타이머가 다 되면 화면 위에서 종유석이 생긴다", () => {
  const s = playing();
  s.spawnTimer = 0.01;
  G.step(s, NONE, 0.02, fixed(0.5));
  assert.equal(s.spikes.length, 1);
  const spike = s.spikes[0];
  assert.ok(spike.y < 0, "화면 위쪽(보이지 않는 곳)에서 시작");
  assert.ok(spike.x >= 0 && spike.x + spike.w <= G.WIDTH, "가로로 화면 안");
  assert.ok(spike.vy > 0, "아래로 떨어짐");
  assert.ok(s.spawnTimer > 0, "다음 생성까지 타이머가 다시 찬다");
});

test("시간이 지날수록 빨라지고 자주 떨어지며, 한계가 있다", () => {
  assert.ok(G.fallSpeed(30) > G.fallSpeed(0));
  assert.ok(G.spawnInterval(30) < G.spawnInterval(0));
  assert.equal(G.fallSpeed(1000), 520);
  assert.equal(G.spawnInterval(1000), 0.28);
});

test("종유석이 바닥까지 떨어지면 1점을 얻고 사라진다", () => {
  const s = quiet();
  s.playerX = 0; // 종유석과 멀리
  s.spikes.push(spikeAt(400, G.FLOOR_Y - 5, 30, 60, 200));
  G.step(s, NONE, 0.05, fixed(0.5));
  assert.equal(s.score, 1);
  assert.equal(s.spikes.length, 0);
  assert.equal(s.phase, "playing");
});

test("종유석 끝이 플레이어에 닿으면 끝난다", () => {
  const s = quiet();
  const px = s.playerX;
  // 끝(가운데 아래 꼭짓점)이 플레이어 머리 바로 아래까지 내려온 종유석
  const top = G.FLOOR_Y - G.PLAYER_H - 60 + 12;
  s.spikes.push(spikeAt(px + G.PLAYER_W / 2 - 15, top));
  G.step(s, NONE, 0.01, fixed(0.5));
  assert.equal(s.phase, "over");
});

test("옆을 스치기만 하면 끝나지 않는다", () => {
  const s = quiet();
  s.playerX = 200;
  // 플레이어 오른쪽 바깥에서 바닥 근처까지 떨어진 종유석
  s.spikes.push(spikeAt(200 + G.PLAYER_W + 2, G.FLOOR_Y - 60));
  G.step(s, NONE, 0.01, fixed(0.5));
  assert.equal(s.phase, "playing");
});

test("triangleHitsRect: 겹침과 떨어짐", () => {
  const tri = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 40 }];
  assert.equal(G.triangleHitsRect(tri, { x: 5, y: 30, w: 10, h: 10 }), true, "끝이 사각형 안");
  assert.equal(G.triangleHitsRect(tri, { x: -5, y: -5, w: 30, h: 50 }), true, "사각형이 삼각형을 감쌈");
  assert.equal(G.triangleHitsRect(tri, { x: 8, y: 5, w: 4, h: 4 }), true, "사각형이 삼각형 안");
  assert.equal(G.triangleHitsRect(tri, { x: 30, y: 0, w: 10, h: 10 }), false, "오른쪽 바깥");
  assert.equal(G.triangleHitsRect(tri, { x: 0, y: 41, w: 20, h: 10 }), false, "끝보다 아래");
  // 삼각형 빗변 바깥(오른쪽 위 구석은 비어 있음)
  assert.equal(G.triangleHitsRect(tri, { x: 17, y: 25, w: 5, h: 5 }), false, "빗변 바깥 빈 곳");
});

test("일시정지는 진행 중과 일시정지 사이만 오간다", () => {
  const s = playing();
  G.togglePause(s);
  assert.equal(s.phase, "paused");
  G.togglePause(s);
  assert.equal(s.phase, "playing");
  s.phase = "over";
  G.togglePause(s);
  assert.equal(s.phase, "over");
});

test("다시 시작하면 점수·시간·종유석이 초기화된다", () => {
  const s = playing();
  s.score = 12;
  s.time = 30;
  s.spikes.push(spikeAt(0, 0));
  s.phase = "over";
  const again = G.start(s);
  assert.equal(again.phase, "playing");
  assert.equal(again.score, 0);
  assert.equal(again.time, 0);
  assert.equal(again.spikes.length, 0);
});

test("키 판정은 e.code로 하고 A·← 는 왼쪽, D·→ 는 오른쪽 (W는 쓰지 않음)", () => {
  const html = fs.readFileSync(GAME, "utf8");
  assert.match(html, /LEFT_CODES = \{ KeyA: true, ArrowLeft: true \}/);
  assert.doesNotMatch(html, /KeyW/);
  assert.match(html, /RIGHT_CODES = \{ KeyD: true, ArrowRight: true \}/);
  assert.doesNotMatch(html, /e\.key\b/, "한글 입력 상태에서 깨지는 e.key를 쓰지 않는다");
});

test("게임 페이지도 외부 자원과 네트워크 API를 쓰지 않는다", () => {
  const html = fs.readFileSync(GAME, "utf8");
  assert.doesNotMatch(html, /\b(?:https?|wss?):\/\//i);
  assert.doesNotMatch(html, /<script[^>]*\ssrc\s*=|<link\b|@import|url\s*\(/i);
  for (const word of ["fetch", "XMLHttpRequest", "sendBeacon", "WebSocket", "EventSource", "innerHTML"]) {
    assert.ok(!html.includes(word), word);
  }
  assert.match(html, /Content-Security-Policy" content="default-src 'none'/);
});
