import { expect, test } from 'bun:test';
import { RendererEventReadiness } from '../src/electron/lib/renderer-event-readiness';

test('renderer readiness cancels its timeout after the renderer responds', async () => {
  const readiness = new RendererEventReadiness();
  let timeoutCalls = 0;
  const waiting = readiness.wait(10, () => timeoutCalls++);

  readiness.markReady();
  await waiting;
  await Bun.sleep(20);

  expect(timeoutCalls).toBe(0);
  expect(readiness.isReady()).toBe(true);
});

test('renderer readiness reports a genuine timeout', async () => {
  const readiness = new RendererEventReadiness();
  let timeoutCalls = 0;

  await readiness.wait(5, () => timeoutCalls++);

  expect(timeoutCalls).toBe(1);
  expect(readiness.isReady()).toBe(false);
});

test('renderer readiness resets for a new document', () => {
  const readiness = new RendererEventReadiness();
  readiness.markReady();
  readiness.reset();

  expect(readiness.isReady()).toBe(false);
});

test('whenReady runs immediately when already ready', () => {
  const readiness = new RendererEventReadiness();
  readiness.markReady();

  let calls = 0;
  readiness.whenReady(() => calls++);

  expect(calls).toBe(1);
});

test('whenReady fires once markReady is called', () => {
  const readiness = new RendererEventReadiness();
  let calls = 0;
  readiness.whenReady(() => calls++);

  expect(calls).toBe(0);
  readiness.markReady();
  expect(calls).toBe(1);
});

test('whenReady fires exactly once even if markReady is called again', () => {
  const readiness = new RendererEventReadiness();
  let calls = 0;
  readiness.whenReady(() => calls++);

  readiness.markReady();
  readiness.reset();
  readiness.markReady();

  expect(calls).toBe(1);
});

test('reset does not drop a queued whenReady callback', () => {
  const readiness = new RendererEventReadiness();
  let calls = 0;
  readiness.whenReady(() => calls++);

  readiness.reset();
  expect(calls).toBe(0);

  readiness.markReady();
  expect(calls).toBe(1);
});
