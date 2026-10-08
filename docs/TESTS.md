# Tests
| Commande | Contenu | Résultat |
|---|---|---|
| `npm run typecheck` | TypeScript strict | ✅ |
| `npm test` | 47 tests : création village, construction, déplacement multi-sélection, murs, production/stockage, entraînement, recherche, héros/équipement, combat déterministe, déploiement, ciblage sol/air, 7 sorts, pièges, campagne 30 niveaux, raids/trophées, invasions, défenses hors-ligne, guildes, guerre complète, sauvegarde/corruption/migration, boutique, pass, missions, achats (validation, déjà possédé, annulation, falsification, attente, restauration), serveur (auth, anti-triche, replay, IAP, guildes, classements) | ✅ 47/47 |
| `npm run test:long` | 600 combats CL1–15 × 7 formations, 300 combats mémoire, 6 × 3000 actions aléatoires sur 60 jours, 2000 sauvegardes corrompues | ✅ 0 crash, 0 NaN, 0 unité bloquée / 44 723, combat max 153 ms, pas de fuite |
| `npm run test:e2e` | Chromium 915×412 : construire → récolter → améliorer → entraîner → campagne (3★) → invasion → panneaux → rechargement → achat test → ponts Android simulés | ✅ |

Bugs trouvés et corrigés grâce aux tests : générateur de bases sans défenses (manque de place), caserne absente du village initial, économie de départ trop lente, tutoriel masquant les boutons, paliers de pass/quantités non entières acceptés, fiche de guilde fournie par le client (exploit), ultime se rechargeant sur ses propres dégâts, invasions trop dures en milieu de partie.
