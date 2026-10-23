#!/bin/sh
# Vérifie la chaîne Lambda → Home Assistant sans passer par Alexa : demande la découverte avec un
# jeton HA longue durée (HA_TOKEN de .env) et liste ce que HA expose à Alexa.
set -eu
cd "$(dirname "$0")"
. ./.env
export AWS_PROFILE AWS_REGION
: "${HA_TOKEN:?HA_TOKEN manquant dans .env (HA : Profil → Sécurité → Jetons d'accès longue durée)}"

dossier=$(mktemp -d "${TMPDIR:-/tmp}/alexa-ha.XXXXXX")
trap 'rm -rf "$dossier"' EXIT
# Fichier plutôt qu'argument : le jeton n'apparaît pas dans la liste des processus
umask 077
printf '{"directive":{"header":{"namespace":"Alexa.Discovery","name":"Discover","payloadVersion":"3","messageId":"check"},"payload":{"scope":{"type":"BearerToken","token":"%s"}}}}' \
  "$HA_TOKEN" > "$dossier/requete.json"

aws lambda invoke --function-name "$FUNCTION_NAME" --cli-binary-format raw-in-base64-out \
  --payload "file://$dossier/requete.json" "$dossier/reponse.json" >/dev/null

node -e '
const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
if (r.errorMessage) { console.error(`La Lambda a planté : ${r.errorMessage}`); process.exit(1); }
const e = r.event;
if (e?.header?.name === "ErrorResponse") { console.error(`Erreur : ${e.payload.type} — ${e.payload.message}`); process.exit(1); }
const appareils = e?.payload?.endpoints ?? [];
console.log(`${appareils.length} appareil(s) exposé(s) à Alexa :`);
for (const a of appareils) console.log(`  - ${a.friendlyName} (${a.endpointId})`);
' "$dossier/reponse.json"
