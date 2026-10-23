import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handler, bearerToken } from './index.mjs';

process.env.HA_URL = 'https://ha.example.org';

let calls;
function haReplies(reply) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return reply();
  };
}

const turnOn = () => ({
  directive: {
    header: { namespace: 'Alexa.PowerController', name: 'TurnOn', payloadVersion: '3', messageId: 'm1', correlationToken: 'corr' },
    endpoint: { endpointId: 'light#salon', scope: { type: 'BearerToken', token: 'jeton' } },
    payload: {},
  },
});

beforeEach(() => {
  console.error = () => {};
});

test('le jeton est lu là où Alexa le place selon la directive', () => {
  assert.equal(bearerToken({ endpoint: { scope: { type: 'BearerToken', token: 'a' } } }), 'a');
  assert.equal(bearerToken({ payload: { grantee: { type: 'BearerToken', token: 'b' } } }), 'b');
  assert.equal(bearerToken({ payload: { scope: { type: 'BearerToken', token: 'c' } } }), 'c');
  assert.equal(bearerToken({ payload: { scope: { type: 'Autre', token: 'd' } } }), undefined);
});

test('la directive part telle quelle vers HA avec le jeton, la réponse de HA revient telle quelle', async () => {
  const reponseHA = { event: { header: { name: 'Response' } } };
  haReplies(() => Response.json(reponseHA));
  const event = turnOn();

  assert.deepEqual(await handler(event), reponseHA);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://ha.example.org/api/alexa/smart_home');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer jeton');
  assert.deepEqual(JSON.parse(calls[0].init.body), event);
});

test('sans jeton, rien ne part vers HA', async () => {
  haReplies(() => Response.json({}));
  const event = turnOn();
  delete event.directive.endpoint.scope;

  const { event: erreur } = await handler(event);
  assert.equal(calls.length, 0);
  assert.equal(erreur.payload.type, 'INVALID_AUTHORIZATION_CREDENTIAL');
});

test('un jeton refusé par HA devient INVALID_AUTHORIZATION_CREDENTIAL, rattaché à la directive', async () => {
  haReplies(() => new Response('', { status: 401 }));

  const { event: erreur } = await handler(turnOn());
  assert.equal(erreur.header.name, 'ErrorResponse');
  assert.equal(erreur.header.correlationToken, 'corr');
  assert.equal(erreur.endpoint.endpointId, 'light#salon');
  assert.equal(erreur.payload.type, 'INVALID_AUTHORIZATION_CREDENTIAL');
});

test('une erreur de HA devient INTERNAL_ERROR', async () => {
  haReplies(() => new Response('', { status: 500 }));
  assert.equal((await handler(turnOn())).event.payload.type, 'INTERNAL_ERROR');
});

test('HA injoignable devient BRIDGE_UNREACHABLE', async () => {
  haReplies(() => {
    throw new TypeError('fetch failed');
  });
  assert.equal((await handler(turnOn())).event.payload.type, 'BRIDGE_UNREACHABLE');
});
