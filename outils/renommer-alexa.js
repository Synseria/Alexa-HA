// Renomme les appareils Amazon (Echo, Fire TV), que HA ne nomme pas, selon la convention « Pièce - Objet ».
// API web non officielle d'Alexa : à coller dans la console du navigateur, sur https://alexa.amazon.fr/api/bootstrap
// (README, étape 8), après avoir adapté `noms` (nom actuel → nouveau). Sans argument, simule seulement.

async function renommer(noms, { simulation = true } = {}) {
  await fetch('/api/language', { credentials: 'include' });
  const csrf = document.cookie.match(/(?:^|; )csrf=([^;]+)/)?.[1];
  if (!csrf) throw new Error('Pas de jeton csrf : connecte-toi sur amazon.fr puis recharge la page');
  const { devices } = await fetch('/api/devices-v2/device?cached=false', { credentials: 'include' }).then(r => r.json());

  const cibles = devices.filter(d => noms[d.accountName]);
  console.table(cibles.map(d => ({ actuel: d.accountName, nouveau: noms[d.accountName], famille: d.deviceFamily })));
  const absents = Object.keys(noms).filter(n => !devices.some(d => d.accountName === n));
  if (absents.length) console.warn('Introuvables :', absents);
  if (simulation) return console.log('Pour renommer : await renommer(noms, { simulation: false })');

  for (const d of cibles) {
    const corps = {
      accountName: noms[d.accountName], serialNumber: d.serialNumber, deviceAccountId: d.deviceAccountId,
      deviceType: d.deviceType, deviceOwnerCustomerId: d.deviceOwnerCustomerId,
    };
    const r = await fetch(`/api/devices-v2/device/${d.serialNumber}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json', csrf }, body: JSON.stringify(corps),
    });
    console.log(r.ok ? '✔' : `✖ ${r.status}`, d.accountName, '→', corps.accountName);
  }
}
var noms = {
  'Salon Echo Dot': 'Salon - Echo Dot',
  'Fire TV': 'Salon - Fire TV',
};
await renommer(noms);
