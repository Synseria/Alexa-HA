// Crée un groupe Alexa par pièce et y range chaque appareil d'après son nom : « Pièce - Objet » (convention des
// noms HA, appliquée aussi aux Echo et aux pièces de l'app Sonos), précédé ou non du « [Sonos] » de la skill Sonos. Le groupe reçoit exactement ces appareils : relancer
// après un renommage ou un déménagement suffit. API web non officielle d'Alexa : à coller dans la console du
// navigateur, sur https://alexa.amazon.fr/api/bootstrap (README, étape 8). Sans argument, simule seulement.

async function groupes({ simulation = true } = {}) {
  await fetch('/api/language', { credentials: 'include' });
  const csrf = document.cookie.match(/(?:^|; )csrf=([^;]+)/)?.[1];
  if (!csrf) throw new Error('Pas de jeton csrf : connecte-toi sur amazon.fr puis recharge la page');
  const headers = { 'Content-Type': 'application/json', csrf };

  const reponse = await fetch('/nexus/v1/graphql', {
    method: 'POST', credentials: 'include', headers,
    body: JSON.stringify({ query: `query { endpoints(endpointsQueryParams: { paginationParams: { disablePagination: true } }) {
      items { friendlyName legacyAppliance { applianceId } } } }` }),
  }).then(r => r.json());
  if (reponse.errors) throw new Error(JSON.stringify(reponse.errors));

  const pieces = new Map();
  const sansPiece = [];
  for (const { friendlyName: nom, legacyAppliance } of reponse.data.endpoints.items) {
    if (!legacyAppliance) continue;
    // La skill Sonos préfixe le nom de la pièce Sonos : « [Sonos] Salon - Sonos », ou « [Sonos] Salon »
    const sansPrefixe = nom.replace(/^\[Sonos\] /, '');
    const piece = sansPrefixe.match(/^(.+?) - /)?.[1] ?? (sansPrefixe !== nom ? sansPrefixe : undefined);
    if (!piece) { sansPiece.push(nom); continue; }
    if (!pieces.has(piece)) pieces.set(piece, []);
    pieces.get(piece).push({ nom, id: legacyAppliance.applianceId });
  }

  const existants = await fetch('/api/phoenix/group', { credentials: 'include' }).then(r => r.json());
  const liste = existants.applianceGroups ?? existants.groups ?? (Array.isArray(existants) ? existants : []);
  const parNom = new Map(liste.map(g => [String(g.name).toLowerCase(), g]));

  console.table([...pieces].map(([piece, appareils]) => ({
    groupe: piece, action: parNom.has(piece.toLowerCase()) ? 'mettre à jour' : 'créer',
    appareils: appareils.map(a => a.nom).join(', '),
  })));
  if (sansPiece.length) console.warn('Sans pièce dans le nom (laissés hors groupe) :', sansPiece);
  if (simulation) return console.log('Pour appliquer : await groupes({ simulation: false })');

  for (const [piece, appareils] of pieces) {
    const existant = parNom.get(piece.toLowerCase());
    const corps = { name: piece, applianceIds: appareils.map(a => a.id) };
    const id = existant && (existant.groupId ?? existant.id);
    const r = await fetch(existant ? `/api/phoenix/group/${encodeURIComponent(id)}` : '/api/phoenix/group', {
      method: existant ? 'PUT' : 'POST', credentials: 'include', headers,
      body: JSON.stringify(existant ? corps : { ...corps, type: 'SPACE' }),
    });
    console.log(r.ok ? '✔' : `✖ ${r.status} ${await r.text()}`, piece, `(${appareils.length} appareils)`);
    await new Promise(ok => setTimeout(ok, 300));
  }
}
await groupes();
