import React, { useEffect, useMemo, useState } from "react";
import { Undo2, RefreshCcw, Trophy, Cpu, Users, Gauge, Zap, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";

/**
 * React 오목 — 십자점 + 강화 CPU + 난이도(초/중/고/전문가) + 3x3 금수 팝업
 * 요청 반영:
 * 1) 난이도: 현재 Insane을 "초급" 기준으로 두고, 시간/깊이 상한을 늘려 중급/고급/전문가로 강화
 * 2) 3x3 금수(두 방향의 "열린3" 동시 생성): 금수면 착수 불가 + 팝업
 * 3) 차단 규칙 유지: 3연속 양끝/점프3(OO_O, O_OO) 차단 우선
 * 4) 중앙 교차점 정확히 배치(픽셀 오프셋)
 */

const SIZE = 15;            // 15x15 교차점
const GAP = 36;             // 교차점 간 간격(px)
const PAD = 24;             // 보드 외곽 여백(px)
const STONE = 32;           // 돌 지름(px)
const HOTSPOT = 28;         // 클릭 버튼 지름(px)

// 난이도 맵: (현재 Insane ≈ 초급)
const LEVELS = {
  beginner: { label: "초급", timeMs: 900, depthMax: 4 },      // 이전 Insane 수준
  intermediate: { label: "중급", timeMs: 1500, depthMax: 5 },
  advanced: { label: "고급", timeMs: 2500, depthMax: 6 },
  expert: { label: "전문가", timeMs: 4000, depthMax: 7 },
};

const makeBoard = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1]];

function inRange(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

function checkWin(board, r, c, player) {
  for (const [dr, dc] of DIRS) {
    let count = 1; const cells = [[r, c]];
    let nr = r + dr, nc = c + dc;
    while (inRange(nr, nc) && board[nr][nc] === player) { cells.push([nr, nc]); count++; nr += dr; nc += dc; }
    nr = r - dr; nc = c - dc;
    while (inRange(nr, nc) && board[nr][nc] === player) { cells.unshift([nr, nc]); count++; nr -= dr; nc -= dc; }
    if (count >= 5) return { winner: player, line: cells.slice(0, 5) };
  }
  return null;
}

function getEmptyCells(board) {
  const cells = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] === 0) cells.push([r, c]);
  return cells;
}

function neighborsExist(board, r, c, dist = 2) {
  for (let dr = -dist; dr <= dist; dr++) {
    for (let dc = -dist; dc <= dist; dc++) {
      if (dr === 0 && dc === 0) continue;
      const rr = r + dr, cc = c + dc;
      if (inRange(rr, cc) && board[rr][cc] !== 0) return true;
    }
  }
  return false;
}

function getCandidates(board) {
  const cand = []; let any = false;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] !== 0) any = true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== 0) continue;
      if (!any) return [[Math.floor(SIZE / 2), Math.floor(SIZE / 2)]]; // 첫 수 중앙
      if (neighborsExist(board, r, c, 2)) cand.push([r, c]);
    }
  }
  return cand.length ? cand : getEmptyCells(board);
}

function tryWinningMove(board, player) {
  const empties = getCandidates(board);
  for (const [r, c] of empties) { board[r][c] = player; const win = checkWin(board, r, c, player); board[r][c] = 0; if (win) return [r, c]; }
  return null;
}

// ---- 패턴/위협 판정 ----
function lineCount(board, r, c, dr, dc, player) {
  let count = 1; let open1 = false, open2 = false;
  let nr = r + dr, nc = c + dc;
  while (inRange(nr, nc) && board[nr][nc] === player) { count++; nr += dr; nc += dc; }
  if (inRange(nr, nc) && board[nr][nc] === 0) open1 = true;
  nr = r - dr; nc = c - dc;
  while (inRange(nr, nc) && board[nr][nc] === player) { count++; nr -= dr; nc -= dc; }
  if (inRange(nr, nc) && board[nr][nc] === 0) open2 = true;
  return { count, open: (open1 ? 1 : 0) + (open2 ? 1 : 0) };
}

function patternScore(count, open) {
  if (count >= 5) return 1000000;                // 5목
  if (count === 4 && open === 2) return 150000;  // 열린4
  if (count === 4 && open === 1) return 12000;   // 막힌4
  if (count === 3 && open === 2) return 7000;    // 열린3
  if (count === 3 && open === 1) return 600;     // 막힌3
  if (count === 2 && open === 2) return 250;     // 열린2
  if (count === 2 && open === 1) return 60;      // 막힌2
  return 5;
}

function evaluateAt(board, r, c, player) { let score = 0; for (const [dr, dc] of DIRS) { const { count, open } = lineCount(board, r, c, dr, dc, player); score += patternScore(count, open); } return score; }
function evaluateMove(board, r, c, me, opp) { board[r][c] = me; const my = evaluateAt(board, r, c, me); board[r][c] = 0; board[r][c] = opp; const his = evaluateAt(board, r, c, opp); board[r][c] = 0; const center = (SIZE - 1) / 2; const centerBonus = (SIZE - (Math.abs(r - center) + Math.abs(c - center))) * 0.25; return my - his * 0.9 + centerBonus; }

// 열린3 개수 세기 (새 수를 가정)
function countOpenThreeAfter(board, r, c, player) { board[r][c] = player; let cnt = 0; for (const [dr, dc] of DIRS) { const { count, open } = lineCount(board, r, c, dr, dc, player); if (count === 3 && open === 2) cnt++; } board[r][c] = 0; return cnt; }
function createsDoubleThree(board, r, c, player) { return countOpenThreeAfter(board, r, c, player) >= 2; }

// 점프3/3연속 차단 수(상대)에 해당하는 좌표 수집
function getThreatBlocks_ForOpponent(board, opp) {
  const blocks = new Set(); const add = (r, c) => { if (inRange(r, c) && board[r][c] === 0) blocks.add(`${r},${c}`); };
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      for (const [dr, dc] of DIRS) {
        const cells = []; for (let k = 0; k < 4; k++) { const rr = r + dr * k, cc = c + dc * k; if (!inRange(rr, cc)) { cells.length = 0; break; } cells.push([rr, cc]); }
        if (cells.length < 4) continue; const vals = cells.map(([rr, cc]) => board[rr][cc]);
        if (vals[0] === 0 && vals[1] === opp && vals[2] === opp && vals[3] === opp) add(...cells[0]);
        if (vals[0] === opp && vals[1] === opp && vals[2] === opp && vals[3] === 0) add(...cells[3]);
        if (vals[0] === opp && vals[1] === opp && vals[2] === 0 && vals[3] === opp) add(...cells[2]);
        if (vals[0] === opp && vals[1] === 0 && vals[2] === opp && vals[3] === opp) add(...cells[1]);
      }
    }
  }
  return Array.from(blocks).map(s => s.split(",").map(Number));
}

// ---- 즉승 차단 ----
function getBlockingMoves(board, player) { const opp = player === 1 ? 2 : 1; const blocks = []; const empties = getCandidates(board); for (const [r, c] of empties) { board[r][c] = opp; const win = checkWin(board, r, c, opp); board[r][c] = 0; if (win) blocks.push([r, c]); } return blocks; }

// ---- 전이표 & Zobrist ----
const ZOBRIST = (() => { const arr = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => [rand32(), rand32()])); return arr; })();
function rand32() { return Math.floor(Math.random() * 0xffffffff) >>> 0; }
function hashBoard(board, side) { let h = 0 >>> 0; for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) { const v = board[r][c]; if (v === 1) h ^= ZOBRIST[r][c][0]; else if (v === 2) h ^= ZOBRIST[r][c][1]; } return (h ^ (side === 2 ? 0xa5a5a5a5 : 0x5a5a5a5a)) >>> 0; }

// ---- 후보 정렬(위협 우선 + 금수 필터) ----
function getCandidatesAdvanced(board, me, maxWidth = 24) {
  const opp = me === 1 ? 2 : 1; const base = getCandidates(board); const res = [];
  const oppWinBlocks = new Set(getBlockingMoves(board, me).map(([r, c]) => `${r},${c}`));
  const midThreatBlocks = new Set(getThreatBlocks_ForOpponent(board, opp).map(([r, c]) => `${r},${c}`));
  for (const [r, c] of base) {
    if (createsDoubleThree(board, r, c, me)) continue; // 3x3 금수 필터
    let prio = 0; if (oppWinBlocks.has(`${r},${c}`)) prio += 1_000_000; if (midThreatBlocks.has(`${r},${c}`)) prio += 600_000; prio += evaluateMove(board, r, c, me, opp);
    res.push({ r, c, prio });
  }
  res.sort((a, b) => b.prio - a.prio); return res.slice(0, Math.min(maxWidth, res.length));
}

function evaluateBoardStatic(board) { let score = 0; for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) { if (board[r][c] === 0) continue; const p = board[r][c]; for (const [dr, dc] of DIRS) { const { count, open } = lineCount(board, r, c, dr, dc, p); const val = patternScore(count, open); score += (p === 2 ? val : -val); } } return score; }

function alphaBeta(board, depth, alpha, beta, maximizing, deadline, tt) {
  if (Date.now() > deadline) return { val: 0, move: null, timeout: true };
  const me = maximizing ? 2 : 1; const key = hashBoard(board, me); const hit = tt.get(key); if (hit && hit.depth >= depth) return { val: hit.val, move: hit.move };
  const winNow = tryWinningMove(board, me); if (winNow) { const val = maximizing ? 1_000_000 - (10 - depth) : -1_000_000 + (10 - depth); tt.set(key, { depth, val, move: winNow }); return { val, move: winNow }; }
  if (depth === 0) { const val = evaluateBoardStatic(board); tt.set(key, { depth, val, move: null }); return { val, move: null }; }
  const cand = getCandidatesAdvanced(board, me, 30); if (cand.length === 0) { const val = 0; tt.set(key, { depth, val, move: null }); return { val, move: null }; }
  let bestMove = null;
  if (maximizing) {
    let value = -Infinity; for (const { r, c } of cand) { board[r][c] = 2; const res = alphaBeta(board, depth - 1, alpha, beta, false, deadline, tt); board[r][c] = 0; if (res.timeout) return { val: value, move: bestMove, timeout: true }; if (res.val > value) { value = res.val; bestMove = [r, c]; } if ((alpha = Math.max(alpha, value)) >= beta) break; } tt.set(key, { depth, val: value, move: bestMove }); return { val: value, move: bestMove };
  } else {
    let value = Infinity; for (const { r, c } of cand) { board[r][c] = 1; const res = alphaBeta(board, depth - 1, alpha, beta, true, deadline, tt); board[r][c] = 0; if (res.timeout) return { val: value, move: bestMove, timeout: true }; if (res.val < value) { value = res.val; bestMove = [r, c]; } if ((beta = Math.min(beta, value)) <= alpha) break; } tt.set(key, { depth, val: value, move: bestMove }); return { val: value, move: bestMove };
  }
}

function pickSearch(board, timeMs, depthMax) {
  const deadline = Date.now() + timeMs; const tt = new Map(); let best = null; let bestVal = -Infinity;
  for (let depth = 2; depth <= depthMax; depth++) { const res = alphaBeta(board, depth, -Infinity, Infinity, true, deadline, tt); if (res.move) { best = res.move; bestVal = res.val; } if (res.timeout || bestVal > 900000) break; }
  return best;
}

function pickByLevel(board, levelKey) {
  // 0) 내 즉승
  let mv = tryWinningMove(board, 2); if (mv) return mv;
  // 1) 상대 즉승 차단
  const mustBlocks = getBlockingMoves(board, 2); if (mustBlocks.length) { // 금수 필터 후 반환
    const legal = mustBlocks.filter(([r, c]) => !createsDoubleThree(board, r, c, 2));
    if (legal.length) return legal[0];
  }
  // 2) 3연속/점프3 차단
  const threatBlocks = getThreatBlocks_ForOpponent(board, 1).filter(([r, c]) => !createsDoubleThree(board, r, c, 2));
  if (threatBlocks.length) {
    let best = null, bestS = -Infinity; for (const [r, c] of threatBlocks) { const s = evaluateMove(board, r, c, 2, 1); if (s > bestS) { bestS = s; best = [r, c]; } } return best;
  }
  // 3) 탐색
  const { timeMs, depthMax } = LEVELS[levelKey] || LEVELS.beginner;
  mv = pickSearch(board, timeMs, depthMax);
  if (mv && !createsDoubleThree(board, mv[0], mv[1], 2)) return mv;
  // 4) 후보 중 합법 최고
  const cand = getCandidatesAdvanced(board, 2, 1); if (cand.length) return [cand[0].r, cand[0].c];
  // 5) 마지막 안전장치
  const fallbacks = getCandidates(board).filter(([r, c]) => !createsDoubleThree(board, r, c, 2));
  return fallbacks[0] || getEmptyCells(board)[0];
}

export default function Omok() {
  const [board, setBoard] = useState(makeBoard);
  const [turn, setTurn] = useState(1); // 1=흑(사람), 2=백(상대)
  const [moves, setMoves] = useState([]); // {r,c,player}
  const [winner, setWinner] = useState(0);
  const [winLine, setWinLine] = useState([]);
  const [mode, setMode] = useState("cpu"); // "cpu" | "pvp"
  const [aiThinking, setAiThinking] = useState(false);
  const [levelKey, setLevelKey] = useState("beginner"); // beginner/intermediate/advanced/expert
  const [ruleMsg, setRuleMsg] = useState("");

  const placed = useMemo(() => moves.length, [moves]);

  const place = (r, c, who) => {
    setBoard(prev => {
      const next = prev.map(row => row.slice());
      next[r][c] = who;
      const res = checkWin(next, r, c, who);
      if (res) { setWinner(res.winner); setWinLine(res.line); }
      setMoves(m => [...m, { r, c, player: who }]);
      setTurn(who === 1 ? 2 : 1);
      return next;
    });
  };

  const handlePlace = (r, c) => {
    if (winner || board[r][c] !== 0) return;
    if (mode === "cpu" && turn !== 1) return; // CPU 차례엔 클릭 비활성
    // 3x3 금수 체크 (양쪽 열린3 두 개 이상)
    if (createsDoubleThree(board, r, c, turn)) { setRuleMsg("3×3 금수입니다. 해당 위치에는 둘 수 없어요."); return; }
    place(r, c, turn);
  };

  const undo = () => {
    if (moves.length === 0 || winner) return; const last = moves[moves.length - 1];
    setMoves(m => m.slice(0, -1)); setBoard(prev => { const next = prev.map(row => row.slice()); next[last.r][last.c] = 0; return next; }); setTurn(last.player);
  };

  const reset = () => { setBoard(makeBoard()); setTurn(1); setMoves([]); setWinner(0); setWinLine([]); setAiThinking(false); setRuleMsg(""); };

  useEffect(() => {
    if (mode !== "cpu" || winner || turn !== 2) return;
    setAiThinking(true);
    const id = setTimeout(() => {
      const b = board.map(row => row.slice());
      const mv = pickByLevel(b, levelKey);
      // CPU도 금수 금지
      if (mv && !createsDoubleThree(b, mv[0], mv[1], 2)) place(mv[0], mv[1], 2);
      else {
        // 대안 선택
        const alt = getCandidatesAdvanced(b, 2, 5).find(m => !createsDoubleThree(b, m.r, m.c, 2));
        if (alt) place(alt.r, alt.c, 2);
      }
      setAiThinking(false);
    }, 80);
    return () => clearTimeout(id);
  }, [turn, mode, winner, board, levelKey]);

  // 보드 크기/배경
  const boardSize = PAD * 2 + GAP * (SIZE - 1);
  const gridBg = {
    backgroundImage: `repeating-linear-gradient(to right, rgba(0,0,0,0.5) 0px, rgba(0,0,0,0.5) 1px, transparent 1px, transparent ${GAP}px), repeating-linear-gradient(to bottom, rgba(0,0,0,0.5) 0px, rgba(0,0,0,0.5) 1px, transparent 1px, transparent ${GAP}px)`,
    backgroundPosition: `${PAD}px ${PAD}px`, backgroundSize: `${GAP}px ${GAP}px`,
  };

  const isWinCell = (r, c) => winLine.some(([rr, cc]) => rr === r && cc === c);

  return (
    <div className="min-h-[100dvh] bg-neutral-900 text-neutral-100 p-6">
      <div className="max-w-5xl mx-auto grid gap-6">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">오목 written by GPT, prompted by sunujh6 </h1>
            <p className="text-sm text-neutral-400 mt-1">흑(사람) 선공 · 5목 선착</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <div className="inline-flex rounded-xl overflow-hidden ring-1 ring-neutral-700">
              <button className={`px-3 py-2 text-sm flex items-center gap-1 ${mode === "pvp" ? "bg-neutral-800" : "bg-neutral-900 hover:bg-neutral-800"}`} onClick={() => { setMode("pvp"); reset(); }} aria-pressed={mode === "pvp"}>
                <Users className="w-4 h-4"/> PvP
              </button>
              <button className={`px-3 py-2 text-sm flex items-center gap-1 ${mode === "cpu" ? "bg-neutral-800" : "bg-neutral-900 hover:bg-neutral-800"}`} onClick={() => { setMode("cpu"); reset(); }} aria-pressed={mode === "cpu"}>
                <Cpu className="w-4 h-4"/> Vs CPU
              </button>
            </div>
            {mode === "cpu" && (
              <div className="inline-flex items-center gap-2 ml-2">
                <Gauge className="w-4 h-4 text-neutral-400"/>
                <select value={levelKey} onChange={(e) => { setLevelKey(e.target.value); reset(); }} className="bg-neutral-900 ring-1 ring-neutral-700 rounded-lg px-2 py-1 text-sm">
                  {Object.entries(LEVELS).map(([key, v]) => (
                    <option key={key} value={key}>{v.label}</option>
                  ))}
                </select>
                <span className="text-xs text-amber-400 inline-flex items-center gap-1"><Zap className="w-3 h-3"/>깊이 {LEVELS[levelKey].depthMax} · {LEVELS[levelKey].timeMs}ms</span>
              </div>
            )}
            <button onClick={undo} disabled={moves.length === 0 || winner !== 0} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 shadow transition ${moves.length === 0 || winner !== 0 ? "bg-neutral-700 text-neutral-400 cursor-not-allowed" : "bg-neutral-800 hover:bg-neutral-700"}`}>
              <Undo2 className="w-4 h-4" /> 무르기
            </button>
            <button onClick={reset} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 shadow bg-neutral-800 hover:bg-neutral-700 transition">
              <RefreshCcw className="w-4 h-4" /> 새 게임
            </button>
          </div>
        </header>

        {/* 상태 패널 */}
        <div className="rounded-2xl bg-neutral-800/60 p-4 shadow flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-sm text-neutral-400">현재 차례</div>
            <div className="text-lg font-semibold flex items-center gap-2">
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${turn === 1 ? "bg-black border border-white/60" : "bg-white"}`}></span>
              {turn === 1 ? (mode === "cpu" ? "사람(흑)" : "흑") : (mode === "cpu" ? (aiThinking ? "CPU 생각중…" : "CPU(백)") : "백")}
            </div>
          </div>
          <div className="text-sm text-neutral-400">놓인 돌: <span className="text-neutral-200 font-semibold tabular-nums">{placed}</span></div>
        </div>

        {/* 보드: 절대 좌표 배치 (픽셀 오프셋) */}
        <div className="w-full overflow-auto">
          <div className="mx-auto rounded-2xl p-3 shadow-inner ring-1 ring-neutral-700" style={{ width: boardSize + PAD * 2, backgroundColor: "rgba(146, 64, 14, 0.25)" }}>
            <div className="relative rounded-xl" style={{ width: boardSize, height: boardSize, margin: "0 auto", ...gridBg, backgroundColor: "rgba(146, 64, 14, 0.35)" }} aria-label="오목판" role="application">
              {board.map((row, r) => row.map((cell, c) => {
                const y = PAD + r * GAP; const x = PAD + c * GAP; // 교차점 좌표
                const canPlace = !winner && cell === 0 && (mode === "pvp" || turn === 1);
                return (
                  <div key={`${r}-${c}`}>
                    <button type="button" onClick={() => canPlace && handlePlace(r, c)} disabled={!canPlace} className={`absolute rounded-full bg-transparent p-0 border-0 appearance-none outline-none focus:outline-none focus:ring-0 ${canPlace ? "hover:bg-amber-700/30" : ""}`} style={{ top: y - HOTSPOT / 2, left: x - HOTSPOT / 2, width: HOTSPOT, height: HOTSPOT }} aria-label={`행 ${r + 1}, 열 ${c + 1}`}/>
                    {cell !== 0 && (
                      <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute" style={{ top: y - STONE / 2, left: x - STONE / 2, width: STONE, height: STONE }}>
                        <div className={`w-full h-full rounded-full shadow ${cell === 1 ? "bg-black border border-white/70" : "bg-white"} ${isWinCell(r, c) ? "ring-2 ring-emerald-400" : ""}`} />
                      </motion.div>
                    )}
                  </div>
                );
              }))}
            </div>
          </div>
        </div>

        {winner !== 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-emerald-600 text-emerald-950 p-4 font-semibold flex items-center gap-2 justify-center">
            <Trophy className="w-5 h-5" /> {winner === 1 ? (mode === "cpu" ? "사람(흑)" : "흑") : (mode === "cpu" ? "CPU(백)" : "백")} 승리! — 새 게임을 눌러 재시작하세요.
          </motion.div>
        )}

        {/* 3x3 금수 팝업 */}
        {ruleMsg && (
          <div className="fixed inset-0 bg-black/60 grid place-items-center z-50">
            <div className="bg-neutral-900 text-neutral-100 rounded-2xl p-5 ring-1 ring-neutral-700 max-w-sm w-[92%] shadow-xl">
              <div className="flex items-center gap-2 text-amber-300 font-semibold mb-2"><AlertTriangle className="w-5 h-5"/> 금수 경고</div>
              <p className="text-sm leading-relaxed mb-4">{ruleMsg}</p>
              <div className="text-right">
                <button onClick={() => setRuleMsg("")} className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700">확인</button>
              </div>
            </div>
          </div>
        )}

        <footer className="text-xs text-neutral-400 text-center">
          3×3 금수 적용: 두 방향에서 <em>열린3</em>이 동시에 만들어지는 수는 둘 수 없습니다. (필요 시 흑만 금수로 제한도 가능)
        </footer>
      </div>
    </div>
  );
}

