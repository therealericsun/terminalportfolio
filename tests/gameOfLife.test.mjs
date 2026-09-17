import assert from 'node:assert/strict';
import test from 'node:test';
import { B52_BOMBER, GLIDER_GUN, LifeBoard, PULSAR, PENTADECATHLON, QUASAR, TOAD, seedLife } from '../src/utils/gameOfLife.ts';

function liveCells(board) {
    const cells = [];
    for (let y = 0; y < board.rows; y++) {
        for (let x = 0; x < board.columns; x++) {
            if (board.get(x, y)) cells.push([x, y]);
        }
    }
    return cells;
}

function occurrences(board, pattern, width, height) {
    const matches = [];
    for (let y = 0; y <= board.rows - height; y++) {
        for (let x = 0; x <= board.columns - width; x++) {
            if (pattern.every(([dx, dy]) => board.get(x + dx, y + dy))) matches.push([x, y]);
        }
    }
    return matches;
}

test('a block remains stable, while isolated and overcrowded cells die', () => {
    const board = new LifeBoard(12, 12);
    board.stamp([[0, 0], [1, 0], [0, 1], [1, 1]], 1, 1);
    board.toggle(10, 10);
    board.step();
    assert.deepEqual(liveCells(board), [[1, 1], [2, 1], [1, 2], [2, 2]]);
    board.stamp([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]], 5, 5);
    board.step();
    assert.equal(board.get(6, 6), 0);
});

test('a blinker updates simultaneously and returns after two generations', () => {
    const board = new LifeBoard(5, 5);
    board.stamp([[0, 0], [1, 0], [2, 0]], 1, 2);
    board.step();
    assert.deepEqual(liveCells(board), [[2, 1], [2, 2], [2, 3]]);
    board.step();
    assert.deepEqual(liveCells(board), [[1, 2], [2, 2], [3, 2]]);
});

test('edges do not wrap around or leak between rows', () => {
    const board = new LifeBoard(5, 5);
    board.stamp([[0, 0], [0, 1], [0, 2]], 0, 1);
    board.step();
    assert.deepEqual(liveCells(board), [[0, 2], [1, 2]]);
    assert.equal(board.get(-1, 2), 0);
    assert.equal(board.get(5, 1), 0);
});

test('a glider translates diagonally every four generations', () => {
    const board = new LifeBoard(10, 10);
    board.stamp([[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]], 1, 1);
    const expected = liveCells(board).map(([x, y]) => [x + 1, y + 1]);
    for (let i = 0; i < 4; i++) board.step();
    assert.deepEqual(liveCells(board), expected);
});

test('the Gosper gun repeats every 30 generations and emits gliders', () => {
    const board = new LifeBoard(80, 80);
    board.stamp(GLIDER_GUN, 5, 5);
    const initial = liveCells(board);
    assert.equal(initial.length, 36);
    for (let i = 0; i < 30; i++) board.step();
    assert.deepEqual(liveCells(board).filter(([, y]) => y < 14), initial);
    assert.equal(liveCells(board).length, 41);
});

test('the B-52 bomber repeats every 104 generations and emits two gliders', () => {
    const board = new LifeBoard(160, 160);
    board.stamp(B52_BOMBER, 60, 60);
    const core = () => liveCells(board).filter(([x, y]) => x >= 60 && x < 99 && y >= 60 && y < 81);
    const initial = core();
    assert.equal(initial.length, 85);
    for (let i = 0; i < 104; i++) board.step();
    assert.deepEqual(core(), initial);
    assert.equal(liveCells(board).length, 95);
});

test('the pulsar repeats every three generations', () => {
    const board = new LifeBoard(20, 20);
    board.stamp(PULSAR, 3, 3);
    const initial = liveCells(board);
    assert.equal(initial.length, 48);
    board.step();
    assert.notDeepEqual(liveCells(board), initial);
    board.step();
    board.step();
    assert.deepEqual(liveCells(board), initial);
});

test('a toad returns to its starting shape after two generations', () => {
    const board = new LifeBoard(10, 10);
    board.stamp(TOAD, 3, 4);
    const initial = liveCells(board);
    board.step();
    assert.notDeepEqual(liveCells(board), initial);
    board.step();
    assert.deepEqual(liveCells(board), initial);
});

test('the pentadecathlon repeats every fifteen generations within its tile', () => {
    const board = new LifeBoard(18, 18);
    board.stamp(PENTADECATHLON, 4, 8);
    const initial = liveCells(board);
    for (let i = 0; i < 15; i++) {
        board.step();
        assert.ok(liveCells(board).every(([x, y]) => x > 0 && x < 17 && y > 0 && y < 17));
    }
    assert.deepEqual(liveCells(board), initial);
});

test('the 144-cell Quasar repeats every three generations', () => {
    const board = new LifeBoard(35, 35);
    board.stamp(QUASAR, 3, 3);
    const initial = liveCells(board);
    assert.equal(initial.length, 144);
    board.step();
    assert.notDeepEqual(liveCells(board), initial);
    board.step();
    board.step();
    assert.deepEqual(liveCells(board), initial);
});

test('seeded formations keep one Quasar, one pulsar, and two toads isolated', () => {
    for (const [columns, rows] of [[120, 75], [160, 90], [85, 45], [40, 85], [49, 105]]) {
        const board = new LifeBoard(columns, rows);
        seedLife(board);
        const quasars = occurrences(board, QUASAR, 29, 29);
        const pulsars = occurrences(board, PULSAR, 13, 13);
        const toads = occurrences(board, TOAD, 4, 2);
        assert.equal(quasars.length, 1, `one Quasar on a ${columns} × ${rows} board`);
        assert.equal(pulsars.length, 1, `one pulsar on a ${columns} × ${rows} board`);
        assert.equal(toads.length, 2, `two toads on a ${columns} × ${rows} board`);
        if (columns >= 105 && rows >= 60) {
            assert.deepEqual(quasars, [[columns - 47, 21]], 'Quasar uses the upper-right slot');
            assert.deepEqual(pulsars, [[columns - 18, rows - 18]], 'pulsar uses the lower-right slot');
        }
        for (let i = 0; i < 600; i++) board.step();
        assert.deepEqual(occurrences(board, QUASAR, 29, 29), quasars);
        assert.deepEqual(occurrences(board, PULSAR, 13, 13), pulsars);
        assert.deepEqual(occurrences(board, TOAD, 4, 2), toads);
    }
});

test('cell toggles are reversible and resize preserves coordinates', () => {
    const board = new LifeBoard(10, 10);
    board.toggle(3, 4);
    board.toggle(3, 4);
    assert.equal(board.get(3, 4), 0);
    board.toggle(3, 4);
    board.toggle(9, 9);
    board.toggle(-1, 0);
    board.toggle(10, 0);
    board.resize(15, 12);
    assert.deepEqual(liveCells(board), [[3, 4], [9, 9]]);
    board.resize(6, 6);
    assert.deepEqual(liveCells(board), [[3, 4]]);
    board.step();
    assert.deepEqual(liveCells(board), []);
});

test('desktop and mobile seeds keep their guns running over time', () => {
    for (const [columns, rows] of [[120, 75], [85, 45], [160, 90], [40, 85], [49, 105]]) {
        const board = new LifeBoard(columns, rows);
        seedLife(board);
        const narrowPortrait = columns < 70;
        const compactLandscape = columns >= 80 && columns < 105 && rows >= 40 && rows < 60;
        const gunX = narrowPortrait
            ? Math.max(1, Math.floor((columns - 36) / 2))
            : compactLandscape ? columns - 41 : Math.max(1, Math.floor(columns * 0.1));
        const gunY = narrowPortrait || compactLandscape ? 3 : Math.max(2, rows - 24);
        const isB52 = !narrowPortrait && !compactLandscape;
        const gunWidth = isB52 ? 39 : 36;
        const gunHeight = isB52 ? 21 : 9;
        const gun = () => liveCells(board).filter(([x, y]) =>
            x >= gunX && x < gunX + gunWidth && y >= gunY && y < gunY + gunHeight
        );
        const initial = gun();
        for (let i = 0; i < (isB52 ? 624 : 600); i++) board.step();
        assert.deepEqual(gun(), initial);
    }
});
