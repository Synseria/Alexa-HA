# Alexa-HA

Piloter Home Assistant avec Alexa (« Alexa, éteins la lumière du salon ») **sans abonnement Nabu
Casa** : une skill Alexa Smart Home privée, et une petite fonction AWS Lambda qui relaie les
commandes à votre Home Assistant. HA reste la seule source de vérité : c'est lui qui décide quelles
entités Alexa voit, sous quel nom, et dans quel état elles sont.

```
« Alexa, allume le salon »
   → Echo → cloud Alexa → Lambda (ce dépôt, AWS Irlande) → https://votre-ha/api/alexa/smart_home
```

Ce que contient le dépôt :

| Fichier | Rôle |
|---|---|
| `lambda/index.mjs` | Le relais (Node, sans dépendance) : transmet chaque commande à HA avec le jeton de la liaison de compte |
| `deploy.sh` | Envoie le code et la configuration sur la Lambda |
| `check.sh` | Vérifie la chaîne Lambda → HA et liste les appareils que HA exposera |
| `test.sh` | Tests du relais |
| `.env.example` | Modèle de configuration locale (`.env`, jamais versionné) |

## Avant de commencer

- **Home Assistant joignable depuis Internet en HTTPS sur le port 443**, avec un certificat valide
  (Let's Encrypt…). Pas de certificat auto-signé, pas d'autre port.
- Il doit accepter les requêtes venant **d'Irlande** (la Lambda) et **des serveurs d'Amazon** (la
  liaison de compte). Un blocage par pays, un pare-feu ou une authentification devant HA (Authelia…)
  doivent laisser passer au moins `/api/alexa/smart_home` et `/auth/token`.
- Le **compte Amazon de vos Echo** : la skill reste « en développement », donc visible uniquement de
  ce compte.
- Une **carte bancaire** : AWS l'exige à l'ouverture du compte, même si l'usage reste gratuit
  (la Lambda tient très largement dans le gratuit permanent : 1 million d'appels par mois).
- Sur votre ordinateur : `node` (24 ou plus), `aws` (`brew install awscli`), `zip`.

Comptez une heure la première fois. Gardez un bloc-notes ouvert : plusieurs valeurs sont à recopier
d'une étape à l'autre.

## 1. Compte AWS

1. [aws.amazon.com](https://aws.amazon.com) → **Créer un compte**. Choisissez le **Paid plan** : le
   « Free plan » ferme le compte au bout de 6 mois, et la Lambda avec. Carte bancaire, puis
   vérification par SMS.
2. **MFA** : menu de votre nom (en haut à droite) → *Security credentials* → *Assign MFA device* →
   application d'authentification.
3. **Alerte de dépense** : cherchez *Budgets* → *Create budget* → modèle **Zero spend budget** → votre
   e-mail. AWS ne sait pas couper net une dépense : cette alerte, le MFA et le fait que seule votre
   skill puisse appeler la Lambda sont les garde-fous.

## 2. La skill Alexa

1. [developer.amazon.com](https://developer.amazon.com) → connectez-vous **avec le compte Amazon de
   vos Echo** → *Alexa Skills Kit* → **Create Skill**.
2. Nom : ce que vous voulez (« Maison »). Langue : **French (FR)**. Type : **Smart Home**.
   Hébergement : **Provision your own**. Créez.
3. Notez le **Skill ID** (`amzn1.ask.skill.…`), affiché en haut de l'onglet *Smart Home*.

## 3. La Lambda

1. Console AWS → **changez la région en haut à droite : Europe (Irlande) eu-west-1**. Obligatoire
   pour une skill en français ; Paris ou Francfort ne fonctionnent pas.
2. Cherchez **Lambda** → *Create function* → *Author from scratch* :
   - nom : `Home-Assistant` ;
   - runtime : **Node.js** (la version la plus récente) ;
   - architecture : **arm64** ;
   - laissez AWS créer le rôle d'exécution → *Create function*.
3. Notez l'**ARN** de la fonction, en haut à droite (`arn:aws:lambda:eu-west-1:<compte>:function:Home-Assistant`).

Le code, la configuration et le déclencheur Alexa (qui réserve la fonction à votre seule skill) ne
sont pas à faire dans la console : `deploy.sh` s'en charge à l'étape 5.

## 4. Un accès limité pour `deploy.sh`

Le script ne doit pas utiliser votre compte principal : on crée un utilisateur qui n'a le droit de
toucher qu'à cette fonction.

1. Console AWS → **IAM** → *Utilisateurs* → **Créer un utilisateur** → nom `alexa-deploy`, **sans**
   accès à la console → *Créer*.
2. Ouvrez-le → *Ajouter des autorisations* → **Créer une politique en ligne** → onglet **JSON** →
   collez la politique ci-dessous en remplaçant `<COMPTE>` par votre numéro de compte AWS (12 chiffres,
   visible dans l'ARN) → nom `alexa-deploy-lambda` → *Créer*.

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "lambda:GetFunction", "lambda:GetFunctionConfiguration",
           "lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration",
           "lambda:GetPolicy", "lambda:AddPermission", "lambda:RemovePermission",
           "lambda:InvokeFunction"
         ],
         "Resource": "arn:aws:lambda:eu-west-1:<COMPTE>:function:Home-Assistant"
       },
       {
         "Effect": "Allow",
         "Action": ["logs:FilterLogEvents", "logs:GetLogEvents", "logs:DescribeLogStreams", "logs:StartLiveTail"],
         "Resource": [
           "arn:aws:logs:eu-west-1:<COMPTE>:log-group:/aws/lambda/Home-Assistant",
           "arn:aws:logs:eu-west-1:<COMPTE>:log-group:/aws/lambda/Home-Assistant:*"
         ]
       }
     ]
   }
   ```

3. Onglet *Informations d'identification de sécurité* → **Créer une clé d'accès** → cas d'usage
   « Interface de ligne de commande (CLI) » → cochez la confirmation → *Créer*.
4. Dans un terminal : `aws configure --profile alexa`, puis collez la clé, le secret, la région
   `eu-west-1` et le format `json`. Le secret ne se partage nulle part ailleurs.
5. Vérifiez : `aws sts get-caller-identity --profile alexa` doit afficher `user/alexa-deploy`.

## 5. Déployer le relais

```sh
git clone <ce dépôt> && cd Alexa-HA
cp .env.example .env   # puis renseignez SKILL_ID et HA_URL (et FUNCTION_NAME si autre nom)
sh deploy.sh
```

`deploy.sh` lance les tests, envoie le code, fixe la configuration (Node 24, arm64, 10 s, adresse de
HA) et pose le déclencheur Alexa Smart Home. À relancer après chaque mise à jour du dépôt (`git pull && sh deploy.sh`).

## 6. Relier la skill à la Lambda et à HA

Retour sur [developer.amazon.com](https://developer.amazon.com), dans votre skill :

1. Onglet **Smart Home** : *Default endpoint* = l'ARN de la Lambda ; cochez **Europe, India** et
   collez-y le même ARN → *Save*.
2. Onglet **Account Linking** (remplacez `home.example.org` par l'adresse de votre HA) :

   | Champ | Valeur |
   |---|---|
   | Your Web Authorization URI | `https://home.example.org/auth/authorize` |
   | Access Token URI | `https://home.example.org/auth/token` |
   | Your Client ID | `https://layla.amazon.com/` (avec le `/` final) |
   | Your Secret | n'importe quoi, HA l'ignore |
   | Your Authentication Scheme | *Credentials in request body* |
   | Scope | `smart_home` |

   → *Save*.
3. Onglet **Permissions** : activez **Send Alexa Events**. Notez l'**Alexa Client Id** et l'**Alexa
   Client Secret** qui apparaissent : ils permettent à HA de prévenir Alexa d'un changement d'état
   (une lampe allumée à la main apparaît aussitôt allumée dans l'app Alexa).

## 7. Côté Home Assistant

Dans `configuration.yaml` (ou un package), puis redémarrez HA :

```yaml
alexa:
  smart_home:
    locale: fr-FR
    endpoint: https://api.eu.amazonalexa.com/v3/events
    client_id: !secret alexa_client_id
    client_secret: !secret alexa_client_secret
    filter:
      include_entities:
        - light.salon
        - cover.volet_chambre
        - script.mode_cinema
```

- **Seules les entités listées dans `filter` sont envoyées à Alexa.** Sans filtre, HA expose tout ce
  qui n'est ni masqué ni technique. La page *Assistants vocaux → Exposer* de l'interface ne
  s'applique pas ici : elle ne sert qu'à Assist et à Nabu Casa.
- Alexa utilise le **nom de l'entité dans HA** : renommez dans HA, jamais dans l'app Alexa.
- Les scripts et scènes deviennent des scènes Alexa (« Alexa, active mode cinéma ») : la logique
  reste dans HA, pas dans des routines Alexa.
- `client_id` et `client_secret` doivent être en place **avant** la liaison (étape 8) : HA reçoit au
  moment de la liaison l'autorisation d'envoyer ses événements.

Vérifiez la chaîne sans passer par Alexa : créez un jeton dans HA (*Profil → Sécurité → Jetons
d'accès longue durée*), mettez-le dans `HA_TOKEN` du `.env`, puis :

```sh
sh check.sh   # liste les appareils que HA exposera à Alexa
```

Supprimez le jeton de HA et du `.env` une fois la vérification faite.

## 8. Dans l'app Alexa

1. *Facultatif, recommandé* : faites le ménage. *Appareils → Tous les appareils → crayon →* tout
   sélectionner → *Supprimer*. Désactivez les skills qui feraient doublon avec HA (Hue, Tuya…).
2. *Plus → Skills et jeux → Vos skills → onglet* **Développeur** → votre skill → **Activer**.
3. La page de connexion de HA s'ouvre : connectez-vous, idéalement avec un **utilisateur HA dédié**
   (« alexa », non administrateur).
4. **Découvrir les appareils.**
5. Créez un **groupe par pièce** (Salon…) contenant l'Echo de la pièce et ses appareils : « Alexa,
   éteins la lumière » vise alors la pièce où vous parlez. Les pièces de HA ne remontent pas dans
   Alexa, c'est la seule chose à faire de ce côté.

## En cas de problème

| Symptôme | Piste |
|---|---|
| La liaison de compte échoue | HA injoignable depuis les serveurs d'Amazon (blocage par pays, pare-feu), certificat invalide, ou Client ID sans le `/` final |
| `check.sh` : `BRIDGE_UNREACHABLE` | HA injoignable depuis l'Irlande : même piste |
| `check.sh` : `INVALID_AUTHORIZATION_CREDENTIAL` | Jeton HA expiré ou faux |
| « Le périphérique ne répond pas » | Journaux de la Lambda : `aws logs tail /aws/lambda/Home-Assistant --profile alexa --region eu-west-1 --follow`, puis ceux de HA |
| Appareils en double | Une autre skill (Hue, fabricant…) expose le même appareil : la désactiver |
| Un appareil manque | Est-il dans `filter` ? HA redémarré ? Redécouvrir dans l'app Alexa |
