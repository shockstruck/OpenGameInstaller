import { describe, expect, test } from 'bun:test';
import { Duration, Effect, Stream, TestClock, TestContext } from 'effect';
import {
  createClientMessageHandlers,
  GAME_DETAILS_PROVIDER_TIMEOUT,
} from '../lib/handlers/client-message-handlers';
import type { HandlerContext } from '../lib/handlers/types';

type Provider = (args: {
  appID: number;
  storefront: string;
}) => Effect.Effect<{ args: unknown }, unknown>;

const makeProvider = (id: string, gameDetails: Provider) => ({
  addonInfo: { id, storefronts: ['*'] },
  eventsAvailable: ['game-details'],
  events: { gameDetails },
});

const makeContext = (providers: ReturnType<typeof makeProvider>[]) => {
  const responses: { id: string; data: unknown }[] = [];
  const context = {
    connection: {
      addonInfo: { id: 'requester' },
      events: {
        response: (id: string, data: unknown) =>
          Effect.sync(() => {
            responses.push({ id, data });
          }),
      },
    },
    server: {
      getConnections: () => new Map(providers.map((p) => [p.addonInfo.id, p])),
    },
  } as unknown as HandlerContext;
  return { context, responses };
};

const message = (id: string) =>
  ({
    event: 'get-app-details',
    id,
    args: { appID: 1, storefront: 'steamrip' },
  }) as never;

const handler = createClientMessageHandlers()['get-app-details']!;

const run = <A, E>(effect: Effect.Effect<A, E, never>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestContext.TestContext)));

// Mirrors how the connection feeds handlers: one at a time, in order, with a
// failure ending the stream.
const runSequentially = (
  context: HandlerContext,
  messages: ReturnType<typeof message>[]
) =>
  Stream.fromIterable(messages).pipe(
    Stream.runForEach((m) => handler(context, m))
  );

describe('get-app-details provider resilience', () => {
  test('a failing provider falls through to the next provider', () =>
    run(
      Effect.gen(function* () {
        const { context, responses } = makeContext([
          makeProvider('broken', () => Effect.fail(new Error('socket drop'))),
          makeProvider('good', () => Effect.succeed({ args: { name: 'ok' } })),
        ]);
        yield* handler(context, message('m1'));
        expect(responses).toEqual([{ id: 'm1', data: { name: 'ok' } }]);
      })
    ));

  test('a provider that throws synchronously falls through', () =>
    run(
      Effect.gen(function* () {
        const { context, responses } = makeContext([
          makeProvider('broken', () => {
            throw new Error('boom');
          }),
          makeProvider('good', () => Effect.succeed({ args: { name: 'ok' } })),
        ]);
        yield* handler(context, message('m1'));
        expect(responses).toEqual([{ id: 'm1', data: { name: 'ok' } }]);
      })
    ));

  test('responds with undefined when every provider fails', () =>
    run(
      Effect.gen(function* () {
        const { context, responses } = makeContext([
          makeProvider('broken', () => Effect.fail(new Error('nope'))),
        ]);
        yield* handler(context, message('m1'));
        expect(responses).toEqual([{ id: 'm1', data: undefined }]);
      })
    ));

  test('a provider that never answers is abandoned after the timeout', () =>
    run(
      Effect.gen(function* () {
        const { context, responses } = makeContext([
          makeProvider('stalled', () => Effect.never),
          makeProvider('good', () => Effect.succeed({ args: { name: 'ok' } })),
        ]);
        const fiber = yield* Effect.fork(handler(context, message('m1')));
        yield* TestClock.adjust(
          Duration.sum(GAME_DETAILS_PROVIDER_TIMEOUT, Duration.millis(1))
        );
        yield* fiber.await;
        expect(responses).toEqual([{ id: 'm1', data: { name: 'ok' } }]);
      })
    ));

  test('responds with undefined when the only provider stalls', () =>
    run(
      Effect.gen(function* () {
        const { context, responses } = makeContext([
          makeProvider('stalled', () => Effect.never),
        ]);
        const fiber = yield* Effect.fork(handler(context, message('m1')));
        yield* TestClock.adjust(
          Duration.sum(GAME_DETAILS_PROVIDER_TIMEOUT, Duration.millis(1))
        );
        yield* fiber.await;
        expect(responses).toEqual([{ id: 'm1', data: undefined }]);
      })
    ));

  test('a second request on the same connection is answered after the first fails', () =>
    run(
      Effect.gen(function* () {
        let calls = 0;
        const { context, responses } = makeContext([
          makeProvider('flaky', () =>
            ++calls === 1
              ? Effect.fail(new Error('socket drop'))
              : Effect.succeed({ args: { name: 'second' } })
          ),
        ]);
        yield* runSequentially(context, [message('m1'), message('m2')]);
        expect(responses).toEqual([
          { id: 'm1', data: undefined },
          { id: 'm2', data: { name: 'second' } },
        ]);
      })
    ));
});

describe('search-app-name provider resilience', () => {
  test('a failing provider does not stop results from the next one', () =>
    run(
      Effect.gen(function* () {
        const searchHandler = createClientMessageHandlers()['search-app-name']!;
        const provider = (id: string, librarySearch: () => unknown) => ({
          addonInfo: { id, storefronts: ['*'] },
          eventsAvailable: ['library-search'],
          events: { librarySearch },
        });
        const responses: { id: string; data: unknown }[] = [];
        const context = {
          connection: {
            addonInfo: { id: 'requester' },
            events: {
              response: (id: string, data: unknown) =>
                Effect.sync(() => {
                  responses.push({ id, data });
                }),
            },
          },
          server: {
            getConnections: () =>
              new Map([
                ['a', provider('a', () => Effect.fail(new Error('drop')))],
                [
                  'b',
                  provider('b', () => Effect.succeed({ args: [{ n: 1 }] })),
                ],
              ]),
          },
        } as unknown as HandlerContext;
        yield* searchHandler(context, {
          event: 'search-app-name',
          id: 's1',
          args: { query: 'x', storefront: 'steamrip' },
        } as never);
        expect(responses).toEqual([{ id: 's1', data: [{ n: 1 }] }]);
      })
    ));
});
