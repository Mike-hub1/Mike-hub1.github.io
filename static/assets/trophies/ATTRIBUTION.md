# Honor icon provenance

The v300 player-honors view no longer assigns generic “similar-looking” cups to awards. Every rendered asset is mapped by the exact honor name.

## Dongqiudi public data layer

The following local PNG files are archived copies of the `logo` fields returned for Kylian Mbappé by Dongqiudi’s mobile-app public data endpoint:

`https://api.dongqiudi.com/data/v1/detail/person/50226848?app=dqd&lang=zh-cn`

| Local file | Honor |
| --- | --- |
| `world-cup.png` | 世界杯冠军 |
| `fifa-intercontinental-cup.png` | 国际足联洲际杯冠军 |
| `uefa-super-cup.png` | 欧洲超级杯冠军 |
| `european-golden-shoe.png` | 欧洲金靴 |
| `ligue-1-champion.png` | 法国足球顶级联赛冠军 |
| `fifa-world-cup-golden-boot.png` | 世界杯金靴 |
| `coupe-de-la-ligue.png` | 法国联赛杯冠军 |
| `coupe-de-france.png` | 法国杯冠军 |
| `trophee-des-champions.png` | 法国超级杯冠军 |
| `golden-boy.png` | 金童奖 |
| `top-scorer.png` | 最佳射手 |
| `kopa-trophy.png` | 科帕奖 |
| `uefa-nations-league.png` | 欧洲国家联赛冠军 |
| `uefa-u19-euro.png` | U19 欧洲杯冠军 |

The upstream `logo` field incorrectly duplicates the Kopa Trophy for the Gerd Müller Trophy and uses a generic cup for several other honors. Those files are not used for those awards.

## Official-source corrections

| Local file | Use | Official source and treatment |
| --- | --- | --- |
| `gerd-muller-trophy.png` | 盖德-穆勒奖 | Transparent-background trophy cutout reconstructed from the award photograph on the [Bundesliga official site](https://www.bundesliga.com/de/bundesliga/news/fc-bayern-munchen-harry-kane-toptorschutze-gerd-muller-trophae-ballon-dor-2024-29511); photograph credited there to Franck Fife. |
| `unfp-player-of-season.png` | 法甲赛季最佳球员 | Transparent-background trophy cutout reconstructed from [UNFP’s official 2024 winner artwork](https://www.unfp.org/2024/05/5-comme-les-anneaux-olympiques/). |
| `coupe-gambardella.png` | 法国青年杯冠军 | Transparent-background trophy cutout reconstructed from the [FFF official Coupe Gambardella gallery](https://www.fff.fr/diaporama/10185-la-gambardella-en-images.html). |
| `france-football-player-of-year.png` | 法国年度最佳球员 | Transparent-background cutout of the physical France Football award shown in the [official 2022–2023 winner photograph](https://www.lequipe.fr/France-Football/Actualites/Le-palmares-complet-des-joueurs-francais-france-football/1407254). This replaces the former France Football section mark. |

The four transparent cutouts above are UI derivatives of the cited source photographs. Backgrounds, people, and hands were removed; small occluded edges were reconstructed so the trophy can be displayed as a standalone identification icon. They are not represented as separately published official logo downloads.

All competition marks, trophies, photographs, and trademarks remain the property of their respective owners. The archived copies are presented only as identification artwork alongside the corresponding factual honor records.
