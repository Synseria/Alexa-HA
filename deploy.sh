#!/bin/sh
# Déploie le code et la configuration de la Lambda décrite dans .env (modèle : .env.example).
# La configuration est entièrement réécrite : ce script en est la seule source.
set -eu
cd "$(dirname "$0")"
. ./.env
export AWS_PROFILE AWS_REGION

sh test.sh

dossier=$(mktemp -d "${TMPDIR:-/tmp}/alexa-ha.XXXXXX")
trap 'rm -rf "$dossier"' EXIT
(cd lambda && zip -q "$dossier/lambda.zip" index.mjs)

aws lambda update-function-code --function-name "$FUNCTION_NAME" \
  --zip-file "fileb://$dossier/lambda.zip" --architectures arm64 >/dev/null
aws lambda wait function-updated --function-name "$FUNCTION_NAME"

# Le processeur suit la mémoire : à 128 Mo, le premier appel (TLS vers HA) coûte ~2,5 s de latence
aws lambda update-function-configuration --function-name "$FUNCTION_NAME" \
  --runtime nodejs24.x --handler index.handler --timeout 10 --memory-size 1024 \
  --environment "Variables={HA_URL=$HA_URL}" >/dev/null
aws lambda wait function-updated --function-name "$FUNCTION_NAME"

# Déclencheur Alexa Smart Home : seule la skill SKILL_ID peut appeler la fonction
if ! aws lambda get-policy --function-name "$FUNCTION_NAME" --query Policy --output text 2>/dev/null | grep -q "$SKILL_ID"; then
  aws lambda remove-permission --function-name "$FUNCTION_NAME" --statement-id alexa-smart-home 2>/dev/null || true
  aws lambda add-permission --function-name "$FUNCTION_NAME" --statement-id alexa-smart-home \
    --action lambda:InvokeFunction --principal alexa-connectedhome.amazon.com \
    --event-source-token "$SKILL_ID" >/dev/null
fi

echo "Lambda $FUNCTION_NAME déployée, relais vers $HA_URL"
