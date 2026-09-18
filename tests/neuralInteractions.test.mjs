import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, runInContext } from 'node:vm';
import test from 'node:test';

const neuralScript = stripTypeScriptTypes(readFileSync(new URL('../src/scripts/neural.ts', import.meta.url), 'utf8'));

// Exercise the production event handlers without loading the model or a browser.
function setup(docked = false) {
    const button = new EventTarget();
    const classes = new Set(docked ? ['is-docked'] : []);
    button.classList = {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        contains: (name) => classes.has(name),
    };
    const styles = new Map();
    button.style = { setProperty: (name, value) => styles.set(name, value) };
    let capture = null;
    button.setPointerCapture = (id) => { capture = id; };
    button.hasPointerCapture = (id) => capture === id;
    button.releasePointerCapture = () => {
        capture = null;
        button.dispatchEvent(new Event('lostpointercapture'));
    };
    const target = {
        classList: { remove() {}, toggle() {} },
        getBoundingClientRect: () => ({ left: 100, top: 100, right: 148, bottom: 148 }),
    };
    const timers = [];
    const context = createContext({
        document: { querySelector: (selector) => selector === '#neural-input' ? target : null },
        window: {
            matchMedia: () => ({ matches: false, addEventListener() {} }),
            setTimeout: (callback) => timers.push(callback),
        },
    });
    runInContext(neuralScript, context);
    const actions = [];
    context.selectCard = () => { actions.push('select'); };
    context.unselectCard = () => { actions.push('unselect'); };
    context.addSampleInteractions(button, {});
    const send = (type, x = 124, y = 124, buttons = 1) => {
        button.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), {
            pointerId: 1, button: 0, buttons, clientX: x, clientY: y,
        }));
    };
    const assertReleased = () => {
        assert.equal(capture, null, 'pointer capture is released');
        assert.equal(classes.has('is-dragging'), false, 'dragging cannot suppress the next hover');
        assert.equal(styles.get('--drag-x'), '0px');
        assert.equal(styles.get('--drag-y'), '0px');
        timers.splice(0).forEach((callback) => callback());
        assert.equal(classes.has('is-returning'), false);
    };
    return { button, send, actions, assertReleased };
}

test('dropping a docked digit onto its target clears dragging and keeps it selected', () => {
    const { send, actions, assertReleased } = setup(true);
    send('pointerdown');
    send('pointermove', 134, 134);
    send('pointerup', 134, 134, 0);
    assertReleased();
    send('click');
    assert.deepEqual(actions, [], 'the synthetic click after a drag must not deselect');
});

test('clicking a docked digit clears dragging and unselects exactly once', () => {
    const { send, actions, assertReleased } = setup(true);
    send('pointerdown');
    send('pointerup', 124, 124, 0);
    assertReleased();
    send('click');
    assert.deepEqual(actions, ['unselect']);
});

for (const ending of ['pointercancel', 'lostpointercapture', 'released-outside']) {
    test(`${ending} clears a digit drag and allows the next click`, () => {
        const { button, send, actions, assertReleased } = setup();
        send('pointerdown', 20, 20);
        send('pointermove', 30, 30);
        if (ending === 'lostpointercapture') button.releasePointerCapture(1);
        else if (ending === 'released-outside') send('pointermove', 40, 40, 0);
        else send(ending);
        assertReleased();
        send('pointerdown', 20, 20);
        send('pointerup', 20, 20, 0);
        send('click', 20, 20);
        assert.deepEqual(actions, ['select']);
    });
}

test('dragging a selected digit out unselects it once', () => {
    const { send, actions } = setup(true);
    send('pointerdown');
    send('pointermove', 20, 20);
    send('pointerup', 20, 20, 0);
    send('click', 20, 20);
    assert.deepEqual(actions, ['unselect']);
});

test('dragging a shelf digit into the target selects it once', () => {
    const { send, actions } = setup();
    send('pointerdown', 20, 20);
    send('pointermove');
    send('pointerup', 124, 124, 0);
    send('click');
    assert.deepEqual(actions, ['select']);
});
