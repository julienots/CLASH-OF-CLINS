# KINGDOMS — Document de game design (généré depuis le code)

> Ce document est produit par `tools/gen-design-doc.ts` à partir des fichiers de données : il reflète exactement le jeu.

## Boucle de jeu
CONSTRUIRE → PRODUIRE → AMÉLIORER → ENTRAÎNER → ATTAQUER → GAGNER → AMÉLIORER → DÉFENDRE → RECOMMENCER

## Citadelle : 15 niveaux
| Niveau | Coût | Débloque |
|---|---|---|
| 1 | — | Village de départ |
| 2 | 1 000 or + 1 000 bois | +1 Mine d'or · +1 Scierie · Nouveau : Ferme · Caserne niveau 2 · Nouveau : Tour de guet · Nouveau : Muraille · Décoration : Lanterne · Nouvelle zone : territoire 27×27 · Unité : Archère |
| 3 | 2 100 or + 2 100 bois | Nouveau : Portail de Guilde · +1 Mine d'or · +1 Scierie · +1 Coffre d'or · +1 Entrepôt de bois · Nouveau : Marché · Caserne niveau 3 · +1 Camp d'entraînement · Nouveau : Laboratoire · +1 Canon · +1 Tour de guet · Nouveau : Mortier · +25 Muraille · Nouveau : Bombe · Décoration : Bannière royale · Nouvelle zone : territoire 28×28 · Unité : Éclaireur |
| 4 | 4 200 or + 4 200 bois | +1 Mine d'or · +1 Scierie · Nouveau : Carrière de cristal · Nouveau : Reliquaire de cristal · +1 Caserne · Caserne niveau 4 · +1 Tour de guet · Nouveau : Lanceur céleste · +25 Muraille · Nouveau : Piège à ressort · Décoration : Fontaine · Nouvelle zone : territoire 29×29 · Unité : Brute |
| 5 | 8 300 or + 8 300 bois | Nouveau : Temple des Héros · +1 Ferme · Caserne niveau 5 · Nouveau : Académie des Arcanes · +1 Canon · +1 Tour de guet · +25 Muraille · +2 Bombe · Nouveau : Piège aérien · Nouvelle zone : territoire 30×30 · Unité : Ingénieur · Sort : Foudre · Héros : Arkon |
| 6 | 17 000 or + 17 000 bois | Nouveau : Forge Runique · +1 Mine d'or · +1 Scierie · Nouveau : Générateur d'énergie · +1 Coffre d'or · +1 Entrepôt de bois · Nouveau : Cellule d'énergie · Caserne niveau 6 · +1 Camp d'entraînement · Académie des Arcanes niveau 2 · +1 Mortier · +1 Lanceur céleste · Nouveau : Flèche arcanique · +25 Muraille · +2 Piège à ressort · Nouveau : Grande mine · Décoration : Statue du Fondateur · Nouvelle zone : territoire 31×31 · Unité : Aéronef · Sort : Soin |
| 7 | 33 000 or + 33 000 bois | Temple des Héros niveau 2 · Nouveau : Observatoire · Caserne niveau 7 · +1 Canon · +1 Tour de guet · +50 Muraille · +2 Bombe · Nouveau : Piège de givre · +2 Piège aérien · Nouvelle zone : territoire 32×32 · Unité : Mage · Héros : Lyra |
| 8 | 67 000 or + 67 000 bois + 2 000 énergie | +1 Mine d'or · +1 Scierie · +1 Générateur d'énergie · Caserne niveau 8 · Académie des Arcanes niveau 3 · Nouveau : Atelier de siège · +1 Mortier · +1 Lanceur céleste · +1 Flèche arcanique · Nouveau : Baliste · +25 Muraille · +1 Grande mine · Nouvelle zone : territoire 33×33 · Unité : Prêtresse · Sort : Rage · Engin : Bélier de fer |
| 9 | 130 000 or + 130 000 bois + 3 200 énergie | Temple des Héros niveau 3 · +1 Ferme · +1 Coffre d'or · +1 Entrepôt de bois · Caserne niveau 9 · +1 Camp d'entraînement · Académie des Arcanes niveau 4 · +1 Canon · +1 Tour de guet · +25 Muraille · +2 Piège à ressort · Nouveau : Piège runique · Nouvelle zone : territoire 34×34 · Unité : Wyverne · Sort : Gel · Héros : Bronn |
| 10 | 270 000 or + 270 000 bois + 5 100 énergie | +1 Mine d'or · +1 Scierie · +1 Carrière de cristal · +1 Cellule d'énergie · Caserne niveau 10 · +1 Flèche arcanique · +1 Baliste · Nouveau : Brasier · +25 Muraille · +2 Bombe · +1 Piège de givre · +2 Piège aérien · Nouvelle zone : territoire 35×35 · Unité : Assassin |
| 11 | 530 000 or + 530 000 bois + 8 200 énergie | Temple des Héros niveau 4 · +1 Générateur d'énergie · Caserne niveau 11 · Académie des Arcanes niveau 5 · Atelier de siège niveau 2 · +1 Tour de guet · +1 Mortier · +1 Lanceur céleste · +2 Grande mine · Nouvelle zone : territoire 36×36 · Unité : Golem · Sort : Bouclier · Héros : Nyx · Engin : Trébuchet |
| 12 | 1.1 M or + 1.1 M bois + 13 000 énergie | Caserne niveau 12 · Académie des Arcanes niveau 6 · +1 Canon · +1 Flèche arcanique · +1 Brasier · Nouveau : Tour Tempête · +25 Muraille · +1 Piège runique · Nouvelle zone : territoire 37×37 · Unité : Chevaucheur · Sort : Météore |
| 13 | 2.1 M or + 2.1 M bois + 21 000 énergie | +1 Tour de guet · +1 Baliste · +1 Piège de givre · Décoration : Statue héroïque · Nouvelle zone : territoire 38×38 · La Citadelle riposte : Couronne de garde (éclairs en chaîne) |
| 14 | 4.3 M or + 4.3 M bois + 34 000 énergie | Académie des Arcanes niveau 7 · Atelier de siège niveau 3 · +1 Tour Tempête · +25 Muraille · Nouvelle zone : territoire 39×39 · Sort : Téléportation |
| 15 | 8.5 M or + 8.5 M bois + 54 000 énergie | +1 Brasier · +1 Tour Tempête · Décoration : Monument du Roi · Nouvelle zone : territoire 40×40 · Titre de Souverain légendaire · Couronne de garde niveau max |

## Bâtiments
### Spécial
| Bâtiment | Taille | Niveaux | Débloqué | Description |
|---|---|---|---|---|
| Citadelle | 4×4 | 15 | Citadelle 1 | Cœur du royaume. Son niveau détermine tout ce que vous pouvez construire. |
| Atelier d'ouvrier | 2×2 | 1 | Citadelle 1 | Chaque atelier abrite un ouvrier : un chantier simultané de plus. |
| Portail de Guilde | 3×3 | 6 | Citadelle 3 | Relie votre village à votre guilde : dons, renforts et guerres. |
| Temple des Héros | 4×4 | 4 | Citadelle 5 | Invoque et abrite les héros. Chaque niveau éveille un héros. |
| Forge Runique | 3×3 | 5 | Citadelle 6 | Forge l'équipement des héros. |
| Observatoire | 3×3 | 4 | Citadelle 7 | Révèle les régions du monde, prévoit les événements et détecte des pièges ennemis. |

### Économie
| Bâtiment | Taille | Niveaux | Débloqué | Description |
|---|---|---|---|---|
| Mine d'or | 3×3 | 13 | Citadelle 1 | Extrait de l'or en continu. Touchez-la pour récolter. |
| Scierie | 3×3 | 13 | Citadelle 1 | Débite du bois sans relâche. |
| Ferme | 3×3 | 10 | Citadelle 2 | Ses récoltes se vendent en or et nourrissent les bûcherons : produit or ET bois. |
| Carrière de cristal | 3×3 | 6 | Citadelle 4 | Taille lentement des cristaux bruts. Rare et précieux. |
| Générateur d'énergie | 3×3 | 9 | Citadelle 6 | Canalise l'énergie des lignes telluriques, ressource des technologies avancées. |
| Coffre d'or | 3×3 | 13 | Citadelle 1 | Stocke l'or du royaume. |
| Entrepôt de bois | 3×3 | 13 | Citadelle 1 | Stocke le bois. |
| Cellule d'énergie | 3×3 | 8 | Citadelle 6 | Stocke l'énergie. |
| Reliquaire de cristal | 2×2 | 5 | Citadelle 4 | Augmente la capacité des carrières et met les cristaux à l'abri des pillards. |
| Marché | 3×3 | 5 | Citadelle 3 | Échangez or et bois. Les améliorations réduisent la commission. |

### Militaire
| Bâtiment | Taille | Niveaux | Débloqué | Description |
|---|---|---|---|---|
| Caserne | 3×3 | 12 | Citadelle 1 | Entraîne les troupes. Chaque niveau débloque une nouvelle unité. |
| Camp d'entraînement | 4×4 | 5 | Citadelle 1 | Abrite votre armée. Capacité 50 → 75 → 100 → 125 → 150. |
| Laboratoire | 3×3 | 10 | Citadelle 3 | Recherche les améliorations d'unités, de sorts et l'arbre technologique. |
| Académie des Arcanes | 3×3 | 7 | Citadelle 5 | Prépare les sorts de combat. Chaque niveau débloque un sort et de la capacité. |
| Atelier de siège | 4×4 | 3 | Citadelle 8 | Construit des engins de siège. |

### Défense
| Bâtiment | Taille | Niveaux | Débloqué | Description |
|---|---|---|---|---|
| Canon | 3×3 | 15 | Citadelle 1 | Défense terrestre fiable à cadence rapide. |
| Tour de guet | 3×3 | 15 | Citadelle 2 | Des archers postés en hauteur touchent cibles terrestres et aériennes. |
| Mortier | 3×3 | 12 | Citadelle 3 | Pilonne les groupes terrestres à longue portée. Zone morte au pied. |
| Lanceur céleste | 3×3 | 11 | Citadelle 4 | Batterie de roquettes dévastatrice contre les unités volantes. |
| Flèche arcanique | 2×2 | 10 | Citadelle 6 | Défense magique dont les éclairs rebondissent d'ennemi en ennemi. |
| Baliste | 3×3 | 8 | Citadelle 8 | Carreaux perforants qui traversent les rangs ennemis. |
| Brasier | 2×2 | 6 | Citadelle 10 | Un rayon de feu qui s'intensifie tant qu'il reste sur la même cible. |
| Tour Tempête | 3×3 | 4 | Citadelle 12 | Frappe plusieurs ennemis à la fois avec la foudre. |

### Murs
| Bâtiment | Taille | Niveaux | Débloqué | Description |
|---|---|---|---|---|
| Muraille | 1×1 | 12 | Citadelle 2 | Bloque, ralentit et canalise les ennemis. Glissez pour construire rapidement. |

### Pièges
| Bâtiment | Taille | Niveaux | Débloqué | Description |
|---|---|---|---|---|
| Bombe | 1×1 | 9 | Citadelle 3 | Explose au passage des troupes terrestres. |
| Piège à ressort | 1×1 | 5 | Citadelle 4 | Éjecte les troupes terrestres hors de la carte. |
| Grande mine | 2×2 | 7 | Citadelle 6 | Une charge colossale cachée sous les pavés. |
| Piège de givre | 1×1 | 5 | Citadelle 7 | Gèle les ennemis proches pendant quelques secondes. |
| Piège runique | 2×2 | 5 | Citadelle 9 | Cercle magique qui ralentit et consume les intrus. |
| Piège aérien | 1×1 | 7 | Citadelle 5 | Une volée de dards caché qui frappe une unité volante. |

### Décorations
| Bâtiment | Taille | Niveaux | Débloqué | Description |
|---|---|---|---|---|
| Pin | 1×1 | 1 | Citadelle 1 | Décoration (cosmétique uniquement). |
| Chêne | 2×2 | 1 | Citadelle 1 | Décoration (cosmétique uniquement). |
| Massif fleuri | 1×1 | 1 | Citadelle 1 | Décoration (cosmétique uniquement). |
| Lanterne | 1×1 | 1 | Citadelle 2 | Décoration (cosmétique uniquement). |
| Bannière royale | 1×1 | 1 | Citadelle 3 | Décoration (cosmétique uniquement). |
| Fontaine | 2×2 | 1 | Citadelle 4 | Décoration (cosmétique uniquement). |
| Statue du Fondateur | 2×2 | 1 | Citadelle 6 | Décoration (cosmétique uniquement). |
| Obélisque de cristal | 2×2 | 1 | Citadelle 1 | Décoration premium (cosmétique uniquement). |
| Crâne de dragon | 2×2 | 1 | Citadelle 1 | Décoration premium (cosmétique uniquement). |
| Lanterne-citrouille | 1×1 | 1 | Citadelle 1 | Décoration premium (cosmétique uniquement). |
| Bonhomme de neige | 1×1 | 1 | Citadelle 1 | Décoration premium (cosmétique uniquement). |
| Trône de saison | 2×2 | 1 | Citadelle 1 | Décoration (cosmétique uniquement). |
| Statue héroïque | 2×2 | 1 | Citadelle 13 | Décoration (cosmétique uniquement). |
| Monument du Roi | 3×3 | 1 | Citadelle 15 | Décoration (cosmétique uniquement). |

### Statistiques des défenses (niveau 1 → max)
| Défense | Portée | Dégâts | Cadence | Cibles | Spécial |
|---|---|---|---|---|---|
| Canon | 9 | 9 → 150 | 0.8s | sol |  |
| Tour de guet | 10 | 11 → 180 | 1s | sol+air |  |
| Mortier | 4–11 | 20 → 180 | 5s | sol | zone 1.5 |
| Lanceur céleste | 10 | 80 → 580 | 1s | air | zone 0.8 |
| Flèche arcanique | 7 | 30 → 180 | 1.4s | sol+air | rebonds ×3 |
| Baliste | 12 | 120 → 480 | 2.2s | sol | zone 0.6, strongest |
| Brasier | 9 | 18 → 49 | 0.25s | sol+air | montée ×12, heroes |
| Tour Tempête | 9 | 70 → 130 | 1.6s | sol+air | 4 cibles |

## Unités (15)
| Unité | Rôle | Place | PV | DPS | Vitesse | Portée | Cible | Coût | Débloquée |
|---|---|---|---|---|---|---|---|---|---|
| Soldat | Équilibré | 1 | 60 | 12 | 1.6 | 0.7 | any | 25 bois | Caserne 1 |
| Archère | Distance | 1 | 26 | 9 | 1.8 | 3.5 | any | 50 bois | Caserne 2 |
| Éclaireur | Rapide · Pillard | 1 | 38 | 12 | 2.7 | 0.6 | resource | 40 bois | Caserne 3 |
| Brute | Tank | 5 | 420 | 14 | 1.1 | 0.9 | defense | 250 bois | Caserne 4 |
| Ingénieur | Brise-murs | 2 | 24 | 16 | 2.1 | 0.6 | wall | 600 bois | Caserne 5 |
| Aéronef | Bombardier aérien | 5 | 170 | 60 | 0.9 | 0.6 | defense | 1 800 bois | Caserne 6 |
| Mage | Dégâts de zone | 4 | 80 | 45 | 1.4 | 3 | any | 1 500 bois | Caserne 7 |
| Prêtresse | Soigneuse volante | 14 | 500 | 0 | 1.8 | 4 | any | 5 000 bois | Caserne 8 |
| Wyverne | Dragon aérien | 20 | 1700 | 150 | 1.6 | 2.5 | any | 20 000 bois + 200 énergie | Caserne 9 |
| Assassin | Frappe éclair | 4 | 130 | 70 | 3.1 | 0.6 | defense | 4 000 bois + 40 énergie | Caserne 10 |
| Golem | Colosse | 25 | 4200 | 34 | 0.75 | 1 | defense | 30 000 bois + 300 énergie | Caserne 11 |
| Chevaucheur | Saute-murs | 5 | 380 | 48 | 2.4 | 0.8 | defense | 3 500 bois + 30 énergie | Caserne 12 |
| Bélier de fer | Siège | 30 | 4500 | 300 | 0.9 | 1 | citadel | 100 000 or + 500 énergie | Atelier 1 |
| Trébuchet | Siège longue portée | 30 | 1600 | 220 | 0.6 | 9 | defense | 150 000 or + 800 énergie | Atelier 2 |
| Spectre des Brumes | Événement · Volant | 3 | 140 | 30 | 2.2 | 1.5 | resource | 700 bois | Saison 1 |

## Héros
### Arkon — Seigneur de guerre
Guerrier implacable, il charge au cœur des lignes ennemies.  
PV 1400 · DPS 95 · Temple 1 / Citadelle 5  
**Compétence** Cri de guerre : Soigne Arkon de 35 % et enrage les troupes proches pendant 8 s.  
**Ultime** Fendeur de terre : Frappe le sol : dégâts massifs en zone et étourdit les défenses 3 s.  
**Apparences** : Armure de bronze, Jarl du Givre, Tyran des braises

### Lyra — Archère mystique
Ses flèches lunaires traversent la pierre comme la brume.  
PV 650 · DPS 120 · Temple 2 / Citadelle 7  
**Compétence** Voile lunaire : Devient invisible 4 s et soigne 25 % de ses PV.  
**Ultime** Pluie d'étoiles : Une volée de 12 flèches stellaires s'abat sur la zone ciblée.  
**Apparences** : Sylve nocturne, Héraut solaire

### Bronn — Rempart vivant
Forgeron-colosse, il protège ses alliés derrière son pavois de fer.  
PV 3200 · DPS 60 · Temple 3 / Citadelle 9  
**Compétence** Rempart : Accorde un bouclier de 30 % de ses PV aux troupes proches.  
**Ultime** Enclume céleste : Provocation : attire le feu des défenses et réduit les dégâts subis de 70 % pendant 6 s.  
**Apparences** : Fer noir, Bastion doré

### Nyx — Lame d'ombre
Insaisissable, elle se fond dans l'ombre pour frapper les défenses clés.  
PV 900 · DPS 210 · Temple 4 / Citadelle 11  
**Compétence** Pas de l'ombre : Se téléporte sur la défense la plus puissante et frappe ×5.  
**Ultime** Éclipse : Toutes les défenses dans un large rayon sont aveuglées 4 s.  
**Apparences** : Voile d'améthyste, Lune de sang

### Équipement (Forge Runique)
| Objet | Héros | Effet | Forge |
|---|---|---|---|
| 🗡️ Lame runique | Tous | +15 % dégâts | 1 |
| 🛡️ Égide de chêne | Tous | +18 % PV | 1 |
| 🚩 Étendard de guerre | Arkon | +10 % PV, +10 % dégâts | 2 |
| 🏹 Carquois lunaire | Lyra | +25 % dégâts | 2 |
| 🧱 Pavois de fer | Bronn | +30 % PV | 3 |
| 🧥 Cape d'ombre | Nyx | +20 % dégâts, +10 % PV | 4 |
| 🪶 Plume de phénix | Tous | +20 % PV, +20 % dégâts | 5 |

## Sorts
| Sort | Effet | Place | Recharge | Académie |
|---|---|---|---|---|
| ⚡ Foudre | 3 éclairs foudroyants sur la zone. | 1 | 2s | 1 |
| ✚ Soin | Soigne les troupes dans la zone pendant 10 s. | 1 | 3s | 2 |
| 🔥 Rage | +40 % vitesse et +80 % dégâts pendant 12 s. | 1 | 3s | 3 |
| ❄️ Gel | Fige défenses et ennemis pendant 4 s. | 1 | 4s | 4 |
| 🛡️ Bouclier | Les troupes de la zone absorbent 300 dégâts. | 1 | 4s | 5 |
| ☄️ Météore | Un météore s'écrase : énormes dégâts et détruit les murs. | 2 | 6s | 6 |
| 🌀 Téléportation | Rappelle jusqu'à 8 de vos troupes les plus éloignées vers la zone. | 2 | 6s | 7 |

## Arbre technologique
### ⚔️ Militaire
- **Exercices militaires** (palier 1, labo 2) : Entraînement des troupes +15 % plus rapide.
- **Acier trempé** (palier 2, labo 4) : +8 % dégâts pour toutes les unités. — requiert mil_drill
- **Cottes de mailles** (palier 2, labo 4) : +8 % PV pour toutes les unités. — requiert mil_drill
- **Marche forcée** (palier 3, labo 6) : +8 % vitesse de déplacement. — requiert mil_steel
- **Logistique** (palier 3, labo 6) : +10 % capacité d'armée. — requiert mil_mail
- **Légendes vivantes** (palier 4, labo 8) : +12 % dégâts des héros. — requiert mil_march, mil_camps

### 🏰 Défense
- **Maçonnerie** (palier 1, labo 2) : +15 % PV des murailles.
- **Poudre noire** (palier 2, labo 4) : +8 % dégâts des défenses. — requiert def_masonry
- **Contreforts** (palier 2, labo 4) : +10 % PV des bâtiments défensifs. — requiert def_masonry
- **Lunettes de visée** (palier 3, labo 6) : +0,5 case de portée des défenses. — requiert def_gunpowder
- **Pièges sournois** (palier 3, labo 6) : +20 % dégâts des pièges. — requiert def_buttress
- **Bastion royal** (palier 4, labo 8) : +10 % dégâts des défenses. — requiert def_optics, def_traps

### 🪙 Économie
- **Outils affûtés** (palier 1, labo 2) : +10 % de production.
- **Coffres renforcés** (palier 2, labo 4) : +10 % de capacité de stockage. — requiert eco_tools
- **Guildes marchandes** (palier 2, labo 4) : -10 % de commission au marché. — requiert eco_tools
- **Logistique de chantier** (palier 3, labo 6) : -8 % coût des constructions. — requiert eco_vaults
- **Art du pillage** (palier 3, labo 6) : +15 % de butin. — requiert eco_guilds
- **Âge d'or** (palier 4, labo 8) : +15 % de production. — requiert eco_logistics, eco_plunder

### ✨ Magie
- **Concentration** (palier 1, labo 2) : -15 % temps de recharge des sorts.
- **Runes amplifiées** (palier 2, labo 4) : +10 % puissance des sorts. — requiert mag_focus
- **Besace arcanique** (palier 2, labo 4) : +1 capacité de sorts. — requiert mag_focus
- **Éveil héroïque** (palier 3, labo 6) : Les compétences de héros sont 20 % plus puissantes. — requiert mag_runes
- **Grimoire étendu** (palier 3, labo 6) : +1 capacité de sorts. — requiert mag_satchel
- **Archimagie** (palier 4, labo 8) : +15 % puissance des sorts. — requiert mag_heroic, mag_satchel2

### ⚙️ Technologie
- **Échafaudages** (palier 1, labo 2) : Constructions 10 % plus rapides.
- **Lentilles** (palier 2, labo 4) : Recherches 10 % plus rapides. — requiert tec_scaffold
- **Registres** (palier 2, labo 4) : Production hors-ligne prolongée (+12 h). — requiert tec_scaffold
- **Longue-vue** (palier 3, labo 6) : Détecte +15 % de pièges en éclaireur. — requiert tec_lenses
- **Grues** (palier 3, labo 6) : Constructions 15 % plus rapides. — requiert tec_ledger
- **Automates** (palier 4, labo 8) : Recherches 15 % plus rapides. — requiert tec_spyglass, tec_cranes

## Campagne (30 niveaux)
| # | Région | Niveau | Mécanique introduite | Formation |
|---|---|---|---|---|
| 1 | Vallée Verte | Avant-poste des Gobelours | Déployez vos soldats hors des zones rouges. | Éparpillée (Citadelle 1) |
| 2 | Vallée Verte | Les Moulins Brisés | Les éclaireurs pillent les ressources deux fois plus vite. | Éparpillée (Citadelle 1) |
| 3 | Vallée Verte | Premier Rempart | Les murailles bloquent : les troupes les percent ou les contournent. | Anneau (Citadelle 2) |
| 4 | Vallée Verte | La Tour Solitaire | Les tours de guet touchent aussi les volants. | Noyau fortifié (Citadelle 2) |
| 5 | Vallée Verte | Le Fort des Marais 👑 | Détruisez la Citadelle pour une étoile garantie. | Anneau (Citadelle 3) |
| 6 | Marais Sombres | Pluie de Pierres | Le mortier a une zone morte : approchez-vous ! | Noyau fortifié (Citadelle 3) |
| 7 | Marais Sombres | Sentiers Piégés | Des bombes cachées guettent les groupes serrés. | Compartiments (Citadelle 4) |
| 8 | Marais Sombres | Le Ciel Gardé | Le lanceur céleste abat les unités volantes. | Îlots (Citadelle 4) |
| 9 | Marais Sombres | Ressorts et Ruses | Les pièges à ressort éjectent vos troupes. | Labyrinthe (Citadelle 5) |
| 10 | Marais Sombres | La Citadelle Rouge 👑 | Les héros défendent leur temple. | Forteresse (Citadelle 5) |
| 11 | Monts de Givre | Brume Arcanique | La flèche arcanique enchaîne ses éclairs. | Noyau fortifié (Citadelle 6) |
| 12 | Monts de Givre | Mines Profondes | Les grandes mines dévastent les tanks. | Compartiments (Citadelle 6) |
| 13 | Monts de Givre | Le Givre Éternel | Les pièges de givre figent vos troupes. | Îlots (Citadelle 7) |
| 14 | Monts de Givre | Les Six Bastions | Divisez pour régner : attaquez par deux flancs. | Labyrinthe (Citadelle 7) |
| 15 | Monts de Givre | Le Trône de Fer 👑 | Une forteresse complète : utilisez vos sorts. | Forteresse (Citadelle 8) |
| 16 | Désert d'Ambre | Carreaux Perçants | La baliste vise les unités les plus robustes. | Anneau (Citadelle 8) |
| 17 | Désert d'Ambre | Le Siège | Les engins de siège brisent les remparts. | Compartiments (Citadelle 9) |
| 18 | Désert d'Ambre | Runes Oubliées | Les pièges runiques ralentissent et consument. | Noyau fortifié (Citadelle 9) |
| 19 | Désert d'Ambre | Le Col des Vents | Base éparpillée : ne laissez rien derrière vous. | Éparpillée (Citadelle 10) |
| 20 | Désert d'Ambre | Forteresse Écarlate 👑 | Le brasier s'intensifie sur une même cible. | Forteresse (Citadelle 10) |
| 21 | Terres de Braise | Le Labyrinthe Vert | Les chevaucheurs sautent les murs. | Labyrinthe (Citadelle 11) |
| 22 | Terres de Braise | Les Îles Suspendues | Une attaque aérienne s'impose. | Îlots (Citadelle 11) |
| 23 | Terres de Braise | Bastion du Crépuscule | Les défenses gelées ne tirent plus. | Compartiments (Citadelle 12) |
| 24 | Terres de Braise | La Tour Tempête | La tempête frappe plusieurs cibles à la fois. | Noyau fortifié (Citadelle 12) |
| 25 | Terres de Braise | Le Gardien des Âges 👑 | Combinez héros et sorts pour vaincre. | Forteresse (Citadelle 13) |
| 26 | Couronne Céleste | Cité de Verre | Une base dense : la foudre est votre alliée. | Anneau (Citadelle 13) |
| 27 | Couronne Céleste | Les Remparts Jumeaux | Deux anneaux de murs : préparez vos ingénieurs. | Labyrinthe (Citadelle 14) |
| 28 | Couronne Céleste | Le Nid du Dragon | Les défenses aériennes sont légion. | Îlots (Citadelle 14) |
| 29 | Couronne Céleste | Veille des Rois | Ultime répétition avant le trône. | Compartiments (Citadelle 15) |
| 30 | Couronne Céleste | Le Dernier Royaume 👑 | Conquérez le royaume le plus puissant. | Forteresse (Citadelle 15) |

## Événements
- 🎉 **Festival des Moissons** : Bonus économiques : production +50 %, constructions -15 %.
- ⛈️ **Tempête des Ombres** : Les bâtiments produisent différemment : or -30 %, énergie ×2, bois +20 %.
- 👹 **Invasion Sauvage** : Des hordes de monstres attaquent les villages ! Repoussez-les pour des récompenses.
- 🗿 **Guerre Ancienne** : La carte des Ruines Anciennes s'ouvre : bases légendaires et butin +25 %.

## Royal Pass (30 paliers)
| Palier | Gratuit | Premium |
|---|---|---|
| 1 | gold ×120·CL² | Effet de déploiement : Étincelles |
| 2 | wood ×120·CL² | energy ×15·CL² |
| 3 | 💎 10 | gold ×300·CL² |
| 4 | wood ×120·CL² | 💎 40 |
| 5 | gold ×120·CL² | Emote « Couronne » |
| 6 | 💎 10 | energy ×15·CL² |
| 7 | gold ×120·CL² | gold ×300·CL² |
| 8 | Emote « Hourra ! » | 💎 40 |
| 9 | 💎 10 | gold ×300·CL² |
| 10 | wood ×120·CL² | Citadelle de jade |
| 11 | gold ×120·CL² | gold ×300·CL² |
| 12 | 💎 10 | Emote « Ha ha ! » |
| 13 | gold ×120·CL² | gold ×300·CL² |
| 14 | wood ×120·CL² | energy ×15·CL² |
| 15 | 💎 10 | Thème : Automne doré |
| 16 | Lanterne-citrouille | 💎 40 |
| 17 | gold ×120·CL² | gold ×300·CL² |
| 18 | 💎 10 | Lyra – Héraut solaire |
| 19 | gold ×120·CL² | gold ×300·CL² |
| 20 | wood ×120·CL² | Effet de déploiement : Braises |
| 21 | 💎 10 | gold ×300·CL² |
| 22 | wood ×120·CL² | Effet de déploiement : Givre |
| 23 | gold ×120·CL² | gold ×300·CL² |
| 24 | Bonhomme de neige | 💎 40 |
| 25 | gold ×120·CL² | Arkon – Jarl du Givre |
| 26 | wood ×120·CL² | energy ×15·CL² |
| 27 | 💎 10 | gold ×300·CL² |
| 28 | wood ×120·CL² | Thème : Hiver éternel |
| 29 | gold ×120·CL² | gold ×300·CL² |
| 30 | Trône de saison | Citadelle d'obsidienne |

## Achats intégrés
| ID produit | Nom | Contenu | Prix indicatif | Type |
|---|---|---|---|---|
| `crystals_small` | Bourse de cristaux | 120 cristaux | 0,99 € | consommable |
| `crystals_medium` | Coffret de cristaux | 650 cristaux (+8 %) | 4,99 € | consommable |
| `crystals_large` | Trésor de cristaux | 1 400 cristaux (+17 %) | 9,99 € | consommable |
| `starter_pack` | Pack de démarrage | 500 cristaux, 3e ouvrier, apparence de Citadelle de jade | 2,99 € | non consommable |
| `season_pass` | Royal Pass Premium | Débloque la piste premium de la saison | 4,99 € | non consommable |
| `special_bundle` | Pack du Héros | 1 000 cristaux, Arkon « Tyran des braises », Citadelle d'obsidienne | 14,99 € | non consommable |
