"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadCore } = require("./load-core");

const { parseTsv, classifyCell, formatAverage, tally, barChartData, SCALE_MAX } = loadCore();

// vm 컨텍스트에서 만든 배열은 다른 realm 객체라 deepStrictEqual이 프로토타입 차이로 실패한다.
// JSON으로 한 번 옮겨 비교한다.
const plain = (v) => JSON.parse(JSON.stringify(v));

function row(result, index) {
  return plain(result.questions[index]);
}

test("classifyCell: 1~5는 앞뒤 공백을 지우고 유효", () => {
  for (const v of ["1", "2", "3", "4", "5", " 3", "4 ", "\t5\t", " 2　"]) {
    assert.equal(classifyCell(v), "valid", JSON.stringify(v));
  }
});

test("classifyCell: 비었거나 공백만 있으면 빈 응답", () => {
  for (const v of ["", " ", "   ", "　", " ", undefined]) {
    assert.equal(classifyCell(v), "blank", JSON.stringify(v));
  }
});

test("classifyCell: 그 밖의 값은 제외", () => {
  for (const v of ["0", "6", "10", "3.5", "4.0", "+3", "-1", "03", "1 2", "１", "네", "N/A", "3점"]) {
    assert.equal(classifyCell(v), "excluded", JSON.stringify(v));
  }
});

test("formatAverage: 소수 셋째 자리에서 반올림해 둘째 자리까지", () => {
  assert.equal(formatAverage(12, 4), "3.00");
  assert.equal(formatAverage(10, 3), "3.33"); // 3.333…
  assert.equal(formatAverage(11, 3), "3.67"); // 3.666…
  assert.equal(formatAverage(7, 2), "3.50");
  assert.equal(formatAverage(5, 1), "5.00");
  assert.equal(formatAverage(1, 1), "1.00");
});

test("formatAverage: 셋째 자리가 정확히 5이면 올린다(부동소수점 오차 없이)", () => {
  assert.equal(formatAverage(107, 40), "2.68"); // 2.675
  assert.equal(formatAverage(21, 8), "2.63"); // 2.625
  assert.equal(formatAverage(1001, 400), "2.50"); // 2.5025 → 2.50
  assert.equal(formatAverage(1003, 400), "2.51"); // 2.5075 → 2.51
});

test("formatAverage: 유효가 0이면 -", () => {
  assert.equal(formatAverage(0, 0), "-");
});

test("parseTsv: 탭과 줄바꿈으로 나누고 \\r\\n도 읽는다", () => {
  assert.deepEqual(plain(parseTsv("a\tb\r\n1\t2\r\n")), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(plain(parseTsv("a\tb\n1\t2")), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(plain(parseTsv("a\tb\r1\t2\r")), [["a", "b"], ["1", "2"]]);
});

test("parseTsv: 빈 칸과 맨 끝 빈 줄", () => {
  assert.deepEqual(plain(parseTsv("a\t\tc\n\t\t\n\n\n")), [["a", "", "c"], ["", "", ""]]);
  assert.deepEqual(plain(parseTsv("")), []);
  assert.deepEqual(plain(parseTsv("\n\r\n")), []);
});

test("parseTsv: 엑셀이 따옴표로 감싼 칸(줄바꿈·탭·따옴표 포함)", () => {
  const text = 'id\t"만족도\n(1~5)"\t"그는 ""좋다""고"\t"a\tb"\n1\t3\t4\t5\n';
  assert.deepEqual(plain(parseTsv(text)), [
    ["id", "만족도\n(1~5)", '그는 "좋다"고', "a\tb"],
    ["1", "3", "4", "5"],
  ]);
});

test("parseTsv: 닫히지 않은 따옴표는 글자 그대로 읽는다", () => {
  assert.deepEqual(plain(parseTsv('a\tb\n1\t"3\n2\t4\n')), [["a", "b"], ["1", '"3'], ["2", "4"]]);
  assert.deepEqual(plain(parseTsv('a\tb\n1\t"3"x\n')), [["a", "b"], ["1", '"3"x']]);
});

test("tally: 첫 열(응답번호)은 집계하지 않는다", () => {
  const result = tally("번호\tQ1\n1\t5\n2\t3\n");
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].label, "Q1");
  assert.equal(result.respondents, 2);
});

test("tally: 문항별 유효·평균·빈 응답·제외", () => {
  const text = [
    "응답번호\tQ1\tQ2\tQ3",
    "1\t5\t\t3",
    "2\t4\t 2 \t모름",
    "3\t \t6\t1",
    "4\t3\t3.5\t",
    "",
  ].join("\r\n");
  const result = tally(text);
  assert.equal(result.respondents, 4);
  assert.deepEqual(row(result, 0), { label: "Q1", valid: 3, average: "4.00", blank: 1, excluded: 0 });
  assert.deepEqual(row(result, 1), { label: "Q2", valid: 1, average: "2.00", blank: 1, excluded: 2 });
  assert.deepEqual(row(result, 2), { label: "Q3", valid: 2, average: "2.00", blank: 1, excluded: 1 });
});

test("tally: 유효 응답이 없으면 평균은 -", () => {
  const result = tally("id\tQ1\tQ2\n1\t\t9\n2\tx\t\n");
  assert.deepEqual(row(result, 0), { label: "Q1", valid: 0, average: "-", blank: 1, excluded: 1 });
  assert.deepEqual(row(result, 1), { label: "Q2", valid: 0, average: "-", blank: 1, excluded: 1 });
});

test("tally: 칸이 모자란 줄은 모자란 칸을 빈 응답으로 센다", () => {
  const result = tally("id\tQ1\tQ2\tQ3\n1\t4\n2\n3\t1\t2\t3\n");
  assert.deepEqual(row(result, 0), { label: "Q1", valid: 2, average: "2.50", blank: 1, excluded: 0 });
  assert.deepEqual(row(result, 1), { label: "Q2", valid: 1, average: "2.00", blank: 2, excluded: 0 });
  assert.deepEqual(row(result, 2), { label: "Q3", valid: 1, average: "3.00", blank: 2, excluded: 0 });
});

test("tally: 중간의 빈 줄은 모든 문항이 빈 응답인 줄로 센다", () => {
  const result = tally("id\tQ1\n1\t5\n\n2\t3\n");
  assert.equal(result.respondents, 3);
  assert.deepEqual(row(result, 0), { label: "Q1", valid: 2, average: "4.00", blank: 1, excluded: 0 });
});

test("tally: 머리글보다 칸이 많은 줄은 넘치는 칸을 무시하고 개수를 알린다", () => {
  const result = tally("id\tQ1\n1\t5\t9\t9\n2\t3\n");
  assert.equal(result.overlongRows, 1);
  assert.equal(result.questions.length, 1);
  assert.deepEqual(row(result, 0), { label: "Q1", valid: 2, average: "4.00", blank: 0, excluded: 0 });
});

test("tally: 머리글 이름은 앞뒤 공백을 지우고, 비어 있으면 (N열)", () => {
  const result = tally("id\t  만족도  \t\tQ3\n1\t1\t2\t3\n");
  assert.deepEqual(plain(result.questions.map((q) => q.label)), ["만족도", "(3열)", "Q3"]);
});

test("tally: 응답 줄이 없으면 모두 0, 평균 -", () => {
  const result = tally("id\tQ1\tQ2\n");
  assert.equal(result.respondents, 0);
  assert.deepEqual(row(result, 0), { label: "Q1", valid: 0, average: "-", blank: 0, excluded: 0 });
});

test("tally: 빈 입력이나 머리글 한 열뿐이면 문항이 없다", () => {
  assert.equal(tally("").questions.length, 0);
  assert.equal(tally("   \n").questions.length, 0);
  assert.equal(tally("응답번호\n1\n2\n").questions.length, 0);
});

test("tally: 셋째 자리 반올림이 표에 그대로 반영된다", () => {
  // 유효 3개: 1+2+2 = 5 → 1.666… → 1.67
  const result = tally("id\tQ\n1\t1\n2\t2\n3\t2\n");
  assert.equal(result.questions[0].average, "1.67");
});

test("barChartData: 막대 길이는 반올림된 평균 ÷ 5", () => {
  assert.equal(SCALE_MAX, 5);
  // Q1 평균 3.25(유효 4), Q2 평균 5.00, Q3 평균 1.00, Q4 유효 없음
  const result = tally("id\tQ1\tQ2\tQ3\tQ4\n1\t5\t5\t1\tx\n2\t4\t5\t1\t\n3\t3\t\t\t\n4\t1\t\t\t\n");
  assert.deepEqual(plain(barChartData(result.questions)), [
    { label: "Q1", average: "3.25", valid: 4, ratio: 0.65 },
    { label: "Q2", average: "5.00", valid: 2, ratio: 1 },
    { label: "Q3", average: "1.00", valid: 2, ratio: 0.2 },
    { label: "Q4", average: "-", valid: 0, ratio: null },
  ]);
});

test("barChartData: 표에 보이는 값과 같은 길이(반올림 후 값 사용)", () => {
  // 1+2+2 = 5 / 3 = 1.666… → 표 1.67 → 막대 1.67 / 5
  const [bar] = barChartData(tally("id\tQ\n1\t1\n2\t2\n3\t2\n").questions);
  assert.equal(bar.average, "1.67");
  assert.equal(bar.ratio, 1.67 / 5);
});

test("barChartData: 문항이 없으면 빈 목록", () => {
  assert.equal(barChartData(tally("").questions).length, 0);
});
