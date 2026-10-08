# Architecture de KINGDOMS

## Choix technologique
Unity (préconisé) n'était pas installable dans l'environnement de développement (pas d'éditeur ni de licence, `dl.google.com` bloqué). Le jeu est donc construit avec :

- **TypeScript** : toute la logique (données, règles, simulation) est indépendante du rendu, testable en Node, et **partagée à l'identique avec le serveur**.
- **Canvas 2D** : moteur de rendu 2,5D isométrique maison (sprites procéduraux mis en cache, tri en profondeur, particules à pool fixe).
- **Android natif (Java)** : `MainActivity` héberge une WebView accélérée, plein écran immersif, assets servis depuis l'APK sous une origine https, ponts natifs (sauvegarde fichier, vibration, facturation).
- **Node.js** : serveur autoritaire sans dépendance.

## Organisation (`game/src/`)
| Dossier | Rôle |
|---|---|
| `core/` | types, RNG déterministe, état (`state.ts`), avancement du temps (`game.ts`), **registre d'actions partagé** (`actions.ts`) |
| `buildings/` | définitions des 50 bâtiments, construction/amélioration/déplacement |
| `village/` | grille, placement, territoire, requêtes |
| `resources/` | gains plafonnés, production, récolte, marché, accélérations |
| `units/`, `army/` | unités, entraînement, sorts préparés |
| `heroes/` | héros, équipement, apparences |
| `combat/` | simulation déterministe (`sim.ts`), navigation (`nav.ts`), IA d'attaque (`ai.ts`), préparation/résultats (`setup.ts`) |
| `defense/` | défenses hors-ligne du village du joueur |
| `spells/`, `research/` | sorts, laboratoire, arbre technologique |
| `guilds/`, `wars/` | guildes, guerres de guildes |
| `campaign/`, `world/` | 30 niveaux, générateur de bases (7 formations), carte du monde |
| `shop/`, `battlepass/`, `purchases/` | boutique, Royal Pass, achats intégrés |
| `events/`, `progression/` | événements, saisons, XP, missions, succès |
| `save/` | sérialisation, somme de contrôle, migrations, réparation |
| `render/`, `ui/`, `audio/` | rendu, interface tactile, audio procédural |
| `networking/`, `debug/` | client serveur, outils de test |

## Principes clés
- **Une seule source de règles** : `dispatch(state, action, args, now)` est appelé par le client hors-ligne et par le serveur. En ligne, le serveur rejoue chaque action avec son horloge et renvoie l'état faisant foi en cas de désaccord.
- **Combat déterministe** (pas fixe 0,1 s, RNG à graine) : le client n'envoie que la liste de commandes (déploiements, sorts, compétences) ; le résultat est recalculé (`battle` action), donc impossible à falsifier.
- **Navigation** : champs de distance Dijkstra partagés par cible, murs franchissables à coût élevé (l'IA choisit contourner ou percer), cache invalidé à la destruction avec limitation de fréquence → combat CL15 complet en ~150 ms.
- **Progression hors-ligne** segmentée chronologiquement (fins de chantier, production plafonnée à 24 h + bonus).

## Performance
- Sprites de bâtiments pré-rendus (1 `drawImage` par bâtiment), sol mis en cache selon la qualité, culling hors écran.
- Particules sans allocation, plafonnées par qualité (250 / 800 / 1500).
- Simulation à 10 Hz interpolée au rendu ; 60 FPS mesurés en Chromium headless (rendu logiciel).
