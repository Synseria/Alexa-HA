// Relais Alexa Smart Home → Home Assistant : chaque directive est transmise telle quelle à
// /api/alexa/smart_home avec le jeton que la liaison de compte a obtenu de HA. Toute la logique
// (entités exposées, noms, états) reste dans HA.

// Sous le timeout de la Lambda (10 s, fixé par deploy.sh) pour répondre une erreur propre à Alexa
const TIMEOUT_MS = 8000;

export async function handler(event) {
  const directive = event?.directive;
  const token = bearerToken(directive);
  if (!token) {
    return errorResponse(directive, 'INVALID_AUTHORIZATION_CREDENTIAL', 'jeton absent de la directive');
  }

  let response;
  try {
    response = await fetch(new URL('/api/alexa/smart_home', process.env.HA_URL), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    return errorResponse(directive, 'BRIDGE_UNREACHABLE', `Home Assistant injoignable : ${error.message}`);
  }
  if (response.status === 401 || response.status === 403) {
    return errorResponse(directive, 'INVALID_AUTHORIZATION_CREDENTIAL', `Home Assistant a refusé le jeton (${response.status})`);
  }
  if (!response.ok) {
    return errorResponse(directive, 'INTERNAL_ERROR', `Home Assistant a répondu ${response.status}`);
  }
  return response.json();
}

// Alexa place le jeton sur l'appareil visé (commande, état), dans grantee (AcceptGrant, à la liaison
// du compte) ou dans payload.scope (découverte)
export function bearerToken(directive) {
  const scope = directive?.endpoint?.scope ?? directive?.payload?.grantee ?? directive?.payload?.scope;
  return scope?.type === 'BearerToken' ? scope.token : undefined;
}

function errorResponse(directive, type, message) {
  console.error(type, message);
  const correlationToken = directive?.header?.correlationToken;
  const endpointId = directive?.endpoint?.endpointId;
  return {
    event: {
      header: {
        namespace: 'Alexa',
        name: 'ErrorResponse',
        payloadVersion: '3',
        messageId: crypto.randomUUID(),
        ...(correlationToken && { correlationToken }),
      },
      ...(endpointId && { endpoint: { endpointId } }),
      payload: { type, message },
    },
  };
}
