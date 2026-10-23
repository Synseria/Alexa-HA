// Supprime d'un coup les appareils maison de l'app Alexa (qui n'offre que la suppression un par un).
// API web non officielle d'Alexa : à coller dans la console du navigateur, sur https://alexa.amazon.fr/api/bootstrap
// une fois connecté à amazon.fr (mode d'emploi : README, étape 8). Sans argument, simule seulement.
// Garde par défaut les Echo, Sonos et ce que la skill HA expose : le ménage peut se relancer sans casser la skill.
// `cibles` (expression sur le nom) ne supprime que ces appareils, quelle que soit leur origine : une entité retirée
// de la liste de HA reste dans Alexa, la skill manuelle n'envoyant pas de suppression.

async function menage({ simulation = true, garder = /sonos|amazon|echo|home assistant/i, cibles } = {}) {
  await fetch('/api/language', { credentials: 'include' });
  const csrf = document.cookie.match(/(?:^|; )csrf=([^;]+)/)?.[1];
  if (!csrf) throw new Error('Pas de jeton csrf : connecte-toi sur amazon.fr puis recharge la page');
  const headers = { 'Content-Type': 'application/json', csrf };

  const reponse = await fetch('/nexus/v1/graphql', {
    method: 'POST', credentials: 'include', headers,
    body: JSON.stringify({ query: `query { endpoints(endpointsQueryParams: { paginationParams: { disablePagination: true } }) {
      items { friendlyName legacyAppliance { applianceId manufacturerName friendlyDescription connectedVia } } } }` }),
  }).then(r => r.json());
  if (reponse.errors) throw new Error(JSON.stringify(reponse.errors));

  const appareils = reponse.data.endpoints.items
    .filter(i => i.legacyAppliance)
    .map(i => ({ nom: i.friendlyName, ...i.legacyAppliance }));
  const aSupprimer = appareils.filter(a => cibles
    ? cibles.test(a.nom)
    : !garder.test(`${a.manufacturerName} ${a.friendlyDescription}`));
  console.table(appareils.map(a => ({
    nom: a.nom, fabricant: a.manufacturerName, via: a.connectedVia,
    action: aSupprimer.includes(a) ? 'SUPPRIMER' : 'garder',
  })));
  if (simulation) {
    return console.log(`${aSupprimer.length}/${appareils.length} à supprimer. Pour le faire : await menage({ simulation: false })`);
  }

  for (const a of aSupprimer) {
    const r = await fetch(`/api/phoenix/appliance/${encodeURIComponent(a.applianceId)}`,
      { method: 'DELETE', credentials: 'include', headers });
    console.log(r.ok ? '✔' : `✖ ${r.status}`, a.nom);
    await new Promise(ok => setTimeout(ok, 300));
  }
}
await menage();
