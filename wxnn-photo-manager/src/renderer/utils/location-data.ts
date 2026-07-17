/**
 * 游戏地点层级数据
 *
 * 数据来源：上游 nikki_albums 项目 rust/src/nuan5_params/structs/world.rs
 * 层级：Dimension（维度）→ Nation（国家）→ Region（区域）→ Area（地区）→ Subarea（子区域）
 * 上游 location_parser.rs 中坐标→地点映射为 // todo 空壳，此数据用于：
 * 1. 提供完整地名分类供手动坐标映射
 * 2. 配合 location-map.ts 的自动收集机制
 */

export interface WorldSubarea {
  name: string
  nameZh: string
}

export interface WorldArea {
  name: string
  nameZh: string
  subareas: WorldSubarea[]
}

export interface WorldRegion {
  name: string
  nameZh: string
  areas: WorldArea[]
}

export interface WorldNation {
  name: string
  nameZh: string
  regions: WorldRegion[]
}

export interface WorldDimension {
  name: string
  nameZh: string
  nations?: WorldNation[]
  subareas?: WorldSubarea[]
}

export const WORLD_LOCATIONS: WorldDimension[] = [
  {
    name: 'Miraland',
    nameZh: '奇迹大陆',
    nations: [
      {
        name: 'HeartcraftKingdom',
        nameZh: '筑心王国',
        regions: [
          {
            name: 'Wishfield',
            nameZh: '心愿原野',
            areas: [
              {
                name: 'MemorialMountains',
                nameZh: '纪念山地',
                subareas: [
                  { name: 'OldFlorawishMemorial', nameZh: '古花愿镇纪念公园' },
                  { name: 'StylistGuildMemorial', nameZh: '搭配师协会纪念旧址' },
                ],
              },
              {
                name: 'Florawish',
                nameZh: '花愿镇',
                subareas: [
                  { name: 'DreamwovenRuins', nameZh: '栖愿遗迹' },
                  { name: 'FortuneFalls', nameZh: '福鸣瀑布' },
                  { name: 'GreatWishtreeSquare', nameZh: '大许愿树广场' },
                  { name: 'LakesideDistrict', nameZh: '湖畔街区' },
                  { name: 'OutskirtsForest', nameZh: '镇郊林区' },
                ],
              },
              {
                name: 'BreezyMeadow',
                nameZh: '微风绿野',
                subareas: [
                  { name: 'AbandonedFanaticWisherCamp', nameZh: '废弃疯愿之子营地' },
                  { name: 'BreezyMeadowActivityArea', nameZh: '绿野活动区' },
                  { name: 'BugSongHills', nameZh: '虫鸣花坡' },
                  { name: 'CiciaHighlands', nameZh: '花树高地' },
                  { name: 'HeartcraftKingdomOutpost', nameZh: '筑心王国边境哨所' },
                  { name: 'LakesideHill', nameZh: '河畔山地' },
                  { name: 'MeadowWharf', nameZh: '绿野货运码头' },
                  { name: 'QueenPalaceRuins', nameZh: '女王行宫遗迹' },
                  { name: 'RelicHill', nameZh: '遗迹山坡' },
                  { name: 'SleepyFishHills', nameZh: '悠悠草坡' },
                  { name: 'SwanGazebo', nameZh: '天鹅羽亭' },
                ],
              },
              {
                name: 'Stoneville',
                nameZh: '小石树田村',
                subareas: [
                  { name: 'DyeWorkshop', nameZh: '染织工坊' },
                  { name: 'FlowerFieldsResidence', nameZh: '花田民居' },
                  { name: 'RockfallValley', nameZh: '落石谷' },
                  { name: 'StonevilleMarket', nameZh: '村口集市' },
                ],
              },
              {
                name: 'AbandonedDistrict',
                nameZh: '石树田无人区',
                subareas: [
                  { name: 'ChooChooStation', nameZh: '呜呜车站' },
                  { name: 'GoldenFields', nameZh: '麦浪农场' },
                  { name: 'MarketOfMirth', nameZh: '欢乐市集' },
                  { name: 'Prosperville', nameZh: '丰饶古村' },
                  { name: 'RippleEstate', nameZh: '涟漪庄园' },
                  { name: 'StellarFishingGround', nameZh: '星空钓场' },
                  { name: 'Stonecrown', nameZh: '石之冠' },
                  { name: 'WindriderMill', nameZh: '乘风磨坊' },
                ],
              },
              {
                name: 'WishingWoods',
                nameZh: '祈愿树林',
                subareas: [
                  { name: 'BrookwoodForest', nameZh: '溪声林地' },
                  { name: 'CavernOfWishes', nameZh: '心愿洞窟' },
                  { name: 'FallenWishHighlands', nameZh: '殒愿山岭' },
                  { name: 'GrandTreeValley', nameZh: '大树谷' },
                  { name: 'SacredMountains', nameZh: '圣山' },
                  { name: 'ValleyOfBlossoms', nameZh: '圣地花谷' },
                ],
              },
              {
                name: 'FireworkIsles',
                nameZh: '花焰群岛',
                subareas: [
                  { name: 'ClearheartLake', nameZh: '澄净湖' },
                  { name: 'CrescentMoonRuins', nameZh: '月角遗迹区' },
                  { name: 'FlamingForest', nameZh: '焰光森林' },
                  { name: 'RelicIsles', nameZh: '遗迹群岛' },
                  { name: 'SongbreezeHighland', nameZh: '聆风高地' },
                  { name: 'SparkheartIsland', nameZh: '焰心岛' },
                ],
              },
              {
                name: 'SerenityIsland',
                nameZh: '无忧岛',
                subareas: [
                  { name: 'OldRuins', nameZh: '古老的废墟' },
                  { name: 'Soakville', nameZh: '布露村' },
                  { name: 'SoakvilleOutskirts', nameZh: '布露村郊外' },
                  { name: 'Steamville', nameZh: '蒸汽维尔' },
                ],
              },
              {
                name: 'DanqingIsland',
                nameZh: '丹青屿',
                subareas: [
                  { name: 'BackMountain', nameZh: '后山' },
                  { name: 'BambooGrove', nameZh: '竹林' },
                  { name: 'Inkville', nameZh: '墨缘乡' },
                  { name: 'InkwashStream', nameZh: '洗墨涧' },
                  { name: 'LoongPagoda', nameZh: '奉龙塔' },
                  { name: 'LoongPeak', nameZh: '栖龙峰' },
                  { name: 'ReedblossomShore', nameZh: '芦花水畔' },
                ],
              },
              {
                name: 'DanqingRealm',
                nameZh: '丹青之境',
                subareas: [
                  { name: 'GreenBambooGrove', nameZh: '青竹林地' },
                  { name: 'InkPool', nameZh: '墨池' },
                  { name: 'InkshorePlain', nameZh: '临墨坪' },
                  { name: 'Inkville', nameZh: '墨缘乡' },
                  { name: 'WildfieldWaterside', nameZh: '野郊水畔' },
                ],
              },
            ],
          },
        ],
      },
      {
        name: 'TerraAlliance',
        nameZh: '大地联盟',
        regions: [
          {
            name: 'Itzaland',
            nameZh: '伊赞之土',
            areas: [
              {
                name: 'ItzalandCanyon',
                nameZh: '伊地峡谷',
                subareas: [],
              },
              {
                name: 'ElderwoodForest',
                nameZh: '巨木之森',
                subareas: [
                  { name: 'BehemothObservationSite', nameZh: '巨兽观测点' },
                  { name: 'Coliseum', nameZh: '巨兽堡垒' },
                  { name: 'ElderwoodShade', nameZh: '古木荫地' },
                  { name: 'ElderwoodWharf', nameZh: '巨森码头' },
                  { name: 'ForestOfSlumber', nameZh: '安眠之林' },
                  { name: 'ForgottenStreet', nameZh: '遗忘旧街' },
                  { name: 'GiantVineForest', nameZh: '巨藤之林' },
                  { name: 'LeafRiver', nameZh: '叶子河' },
                  { name: 'MothershroomWoods', nameZh: '母菇林地' },
                  { name: 'ParkyaCraterLake', nameZh: '帕克亚火山湖' },
                  { name: 'Pottsville', nameZh: '陶罐村' },
                  { name: 'RockvilleRuins', nameZh: '岩村遗址' },
                  { name: 'ShellIsland', nameZh: '壳壳岛' },
                  { name: 'Shroomville', nameZh: '菇菇聚落' },
                  { name: 'SnailRanch', nameZh: '蜗牛农场' },
                  { name: 'SpiraWaterfall', nameZh: '蜗牛城瀑布' },
                  { name: 'TitanGraveyard', nameZh: '大拉姆居落' },
                  { name: 'TitansOutpostRuins', nameZh: '巨兽前哨废墟' },
                ],
              },
              {
                name: 'Spira',
                nameZh: '蜗牛城',
                subareas: [
                  { name: 'Spira1F', nameZh: '蜗牛城一层' },
                  { name: 'Spira2F', nameZh: '蜗牛城二层' },
                  { name: 'Spira3F', nameZh: '蜗牛城三层' },
                  { name: 'SpiraShelldome', nameZh: '蜗牛城壳顶' },
                ],
              },
              {
                name: 'Boneyard',
                nameZh: '埋骨地',
                subareas: [
                  { name: 'BluePools', nameZh: '蓝池' },
                  { name: 'Cultivarium', nameZh: '修习所' },
                  { name: 'DragonRuins', nameZh: '龙埙遗所' },
                  { name: 'DragonrestFlowerfield', nameZh: '龙息花田' },
                  { name: 'GlimmeringLake', nameZh: '微光湖' },
                  { name: 'GreatLumieville', nameZh: '大卢米维尔' },
                  { name: 'HealingGround', nameZh: '疗愈地' },
                  { name: 'HollowbreathPassage', nameZh: '幽息廊道' },
                  { name: 'LonestoneShore', nameZh: '孤石滩' },
                  { name: 'SoulSpring', nameZh: '甜泉' },
                ],
              },
              {
                name: 'WanxiangRealm',
                nameZh: '万相境',
                subareas: [
                  { name: 'BackMountain', nameZh: '后山' },
                  { name: 'CaiYeMarket', nameZh: '彩靥城集市' },
                  { name: 'CaiYeOutskirts', nameZh: '彩靥城近郊' },
                  { name: 'DazzlebloomMeadow', nameZh: '迷花甸' },
                  { name: 'DeepValleySpring', nameZh: '深谷幽泉' },
                  { name: 'JiuhuaPavilion', nameZh: '九华阙' },
                  { name: 'JiuhuaPenitentiary', nameZh: '九华监' },
                  { name: 'ValleyPath', nameZh: '峡谷山径' },
                  { name: 'WhereWoodEchoes', nameZh: '悲木空鸣地' },
                ],
              },
            ],
          },
        ],
      },
      {
        name: 'EmpireOfLight',
        nameZh: '光芒帝国',
        regions: [],
      },
      {
        name: 'StarhailFederation',
        nameZh: '慕星联邦',
        regions: [],
      },
      {
        name: 'LinlangEmpire',
        nameZh: '琳琅帝国',
        regions: [],
      },
      {
        name: 'TwinmoonKingdom',
        nameZh: '双月王国',
        regions: [],
      },
      {
        name: 'WhalePort',
        nameZh: '孤鲸港',
        regions: [],
      },
      {
        name: 'Umbraso',
        nameZh: '影谷议会国',
        regions: [],
      },
    ],
  },
  {
    name: 'SeaOfStars',
    nameZh: '星海',
    subareas: [
      { name: 'Crystalvale', nameZh: '晶簇之谷' },
      { name: 'DreamStarIsles', nameZh: '梦幻星岛' },
      { name: 'Starshore', nameZh: '繁星之滨' },
      { name: 'UnboundWharf', nameZh: '无界码头' },
    ],
  },
  {
    name: 'Home',
    nameZh: '家园',
    subareas: [
      { name: 'DockArea', nameZh: '码头区域' },
    ],
  },
]

/** 扁平化所有地点名（中文名），供搜索使用 */
export function getAllLocationNames(): string[] {
  const names: string[] = []
  for (const dim of WORLD_LOCATIONS) {
    names.push(dim.nameZh)
    if (dim.nations) {
      for (const nation of dim.nations) {
        names.push(nation.nameZh)
        for (const region of nation.regions) {
          names.push(region.nameZh)
          for (const area of region.areas) {
            names.push(area.nameZh)
            for (const sub of area.subareas) {
              names.push(sub.nameZh)
            }
          }
        }
      }
    }
    if (dim.subareas) {
      for (const sub of dim.subareas) {
        names.push(sub.nameZh)
      }
    }
  }
  return names
}

/** 根据中文地点名查找完整路径（如 "奇迹大陆 > 筑心王国 > 心愿原野 > 花愿镇 > 栖愿遗迹"） */
export function findLocationPath(nameZh: string): string | null {
  for (const dim of WORLD_LOCATIONS) {
    if (dim.nameZh === nameZh) return dim.nameZh
    if (dim.nations) {
      for (const nation of dim.nations) {
        if (nation.nameZh === nameZh) return `${dim.nameZh} > ${nation.nameZh}`
        for (const region of nation.regions) {
          if (region.nameZh === nameZh) return `${dim.nameZh} > ${nation.nameZh} > ${region.nameZh}`
          for (const area of region.areas) {
            if (area.nameZh === nameZh) return `${dim.nameZh} > ${nation.nameZh} > ${region.nameZh} > ${area.nameZh}`
            for (const sub of area.subareas) {
              if (sub.nameZh === nameZh) return `${dim.nameZh} > ${nation.nameZh} > ${region.nameZh} > ${area.nameZh} > ${sub.nameZh}`
            }
          }
        }
      }
    }
    if (dim.subareas) {
      for (const sub of dim.subareas) {
        if (sub.nameZh === nameZh) return `${dim.nameZh} > ${sub.nameZh}`
      }
    }
  }
  return null
}
