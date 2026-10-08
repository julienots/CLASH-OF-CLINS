# Serveur autoritaire
`npm run server` (port `PORT`, défaut 8787 ; `KINGDOMS_SECRET`, `KINGDOMS_DATA`, `NODE_ENV=production`).
Client connecté : `KINGDOMS_SERVER_URL=https://... npm run build`.

| Route | Rôle |
|---|---|
| `GET /health` | état |
| `POST /auth/guest` | compte invité par appareil → jeton HMAC + état |
| `GET /state` | état faisant foi (avance le temps, défenses hors-ligne) |
| `POST /action` | rejoue l'action avec les règles partagées ; refus → état faisant foi |
| `POST /matchmaking/raid` | graine d'adversaire à usage unique (obligatoire pour les raids) |
| `POST /iap/verify` | validation d'achat (jetons de test en dev, API Google en prod), anti-rejeu |
| `GET /leaderboard?scope=global\|region\|guild\|season` | classements |
| `GET/POST /guilds…` | guildes réelles : liste, création, adhésion, chat, dons |

Anti-triche : résultats de combat recalculés à partir des commandes, graines émises par le serveur, entrées validées (fuzzing), limitation de débit, corps limités à 512 Ko. Stockage : fichiers JSON atomiques (interface `Store` remplaçable par une base de données).
