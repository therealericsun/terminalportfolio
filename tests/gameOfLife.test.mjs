import assert from 'node:assert/strict';
import test from 'node:test';
import { GLIDER_GUN, LifeBoard, PULSAR, seedLife } from '../src/utils/gameOfLife.ts';

function liveCells(board) {
    const cells = [];
    for (let y = 0; y < board.rows; y++) {
        for (let x = 0; x < board.columns; x++) {
            if (board.get(x, y)) cells.push([x, y]);
        }
    }
    return cells;
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
        const gunX = Math.max(1, Math.floor(columns * 0.1));
        const gunY = Math.max(2, rows - 24);
        const gun = () => liveCells(board).filter(([x, y]) => x >= gunX && x < gunX + 36 && y >= gunY && y < gunY + 9);
        const initial = gun();
        assert.equal(initial.length, 36);
        for (let i = 0; i < 600; i++) board.step();
        assert.deepEqual(gun(), initial);
    }
});
