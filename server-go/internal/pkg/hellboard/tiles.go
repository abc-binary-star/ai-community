package hellboard

// Tiles 百格地图静态定义（活动期内不变，运营可改文案与效果参数）。
//
// 内容来自活动官方《100格棋盘格子表》：前进格 20、后退格 20、双子互换格 20（10 对）、
// 特殊功能格 21（含第 100 格终点格）、空白格 19。
// 双子配对：5&12、18&20、22&29、25&28、27&33、48&55、52&62、63&69、75&77、83&88。
var Tiles = []TileDef{
	{Index: 1, Kind: TileForward, Param: 1},
	{Index: 2, Kind: TileSpecial, Effect: EffectRollDouble},
	{Index: 3, Kind: TileBackward, Param: 1},
	{Index: 4, Kind: TileBlank},
	{Index: 5, Kind: TileSwap, Twin: 12},
	{Index: 6, Kind: TileForward, Param: 2},
	{Index: 7, Kind: TileBackward, Param: 2},
	{Index: 8, Kind: TileSpecial, Effect: EffectColorOrphan},
	{Index: 9, Kind: TileSpecial, Effect: EffectPointDouble},
	{Index: 10, Kind: TileBlank},
	{Index: 11, Kind: TileForward, Param: 3},
	{Index: 12, Kind: TileSwap, Twin: 5},
	{Index: 13, Kind: TileBackward, Param: 1},
	{Index: 14, Kind: TileBlank},
	{Index: 15, Kind: TileSpecial, Effect: EffectPointFlat},
	{Index: 16, Kind: TileForward, Param: 1},
	{Index: 17, Kind: TileBlank},
	{Index: 18, Kind: TileSwap, Twin: 20},
	{Index: 19, Kind: TileBackward, Param: 1},
	{Index: 20, Kind: TileSwap, Twin: 18},
	{Index: 21, Kind: TileForward, Param: 2},
	{Index: 22, Kind: TileSwap, Twin: 29},
	{Index: 23, Kind: TileBlank},
	{Index: 24, Kind: TileBackward, Param: 1},
	{Index: 25, Kind: TileSwap, Twin: 28},
	{Index: 26, Kind: TileForward, Param: 3},
	{Index: 27, Kind: TileSwap, Twin: 33},
	{Index: 28, Kind: TileSwap, Twin: 25},
	{Index: 29, Kind: TileSwap, Twin: 22},
	{Index: 30, Kind: TileBackward, Param: 2},
	{Index: 31, Kind: TileForward, Param: 1},
	{Index: 32, Kind: TileBlank},
	{Index: 33, Kind: TileSwap, Twin: 27},
	{Index: 34, Kind: TileBlank},
	{Index: 35, Kind: TileSpecial, Effect: EffectPointMinus2},
	{Index: 36, Kind: TileForward, Param: 2},
	{Index: 37, Kind: TileBackward, Param: 1},
	{Index: 38, Kind: TileBlank},
	{Index: 39, Kind: TileSpecial, Effect: EffectBottomQuota},
	{Index: 40, Kind: TileBackward, Param: 2},
	{Index: 41, Kind: TileForward, Param: 3},
	{Index: 42, Kind: TileSpecial, Effect: EffectDropDice},
	{Index: 43, Kind: TileSpecial, Effect: EffectRainbowStall},
	{Index: 44, Kind: TileSpecial, Effect: EffectImmunity},
	{Index: 45, Kind: TileBlank},
	{Index: 46, Kind: TileForward, Param: 1},
	{Index: 47, Kind: TileBlank},
	{Index: 48, Kind: TileSwap, Twin: 55},
	{Index: 49, Kind: TileBackward, Param: 2},
	{Index: 50, Kind: TileSpecial, Effect: EffectGuaranteedAdvance},
	{Index: 51, Kind: TileForward, Param: 2},
	{Index: 52, Kind: TileSwap, Twin: 62},
	{Index: 53, Kind: TileSpecial, Effect: EffectTeamAccel},
	{Index: 54, Kind: TileBackward, Param: 1},
	{Index: 55, Kind: TileSwap, Twin: 48},
	{Index: 56, Kind: TileForward, Param: 3},
	{Index: 57, Kind: TileSpecial, Effect: EffectRollHalve},
	{Index: 58, Kind: TileBackward, Param: 1},
	{Index: 59, Kind: TileSpecial, Effect: EffectRainbowBonus},
	{Index: 60, Kind: TileBlank},
	{Index: 61, Kind: TileForward, Param: 1},
	{Index: 62, Kind: TileSwap, Twin: 52},
	{Index: 63, Kind: TileSwap, Twin: 69},
	{Index: 64, Kind: TileBackward, Param: 2},
	{Index: 65, Kind: TileSpecial, Effect: EffectStall},
	{Index: 66, Kind: TileForward, Param: 2},
	{Index: 67, Kind: TileBackward, Param: 2},
	{Index: 68, Kind: TileBlank},
	{Index: 69, Kind: TileSwap, Twin: 63},
	{Index: 70, Kind: TileSpecial, Effect: EffectUnyieldingBack},
	{Index: 71, Kind: TileForward, Param: 3},
	{Index: 72, Kind: TileBlank},
	{Index: 73, Kind: TileBackward, Param: 1},
	{Index: 74, Kind: TileBlank},
	{Index: 75, Kind: TileSwap, Twin: 77},
	{Index: 76, Kind: TileForward, Param: 1},
	{Index: 77, Kind: TileSwap, Twin: 75},
	{Index: 78, Kind: TileBackward, Param: 1},
	{Index: 79, Kind: TileBlank},
	{Index: 80, Kind: TileBackward, Param: 3},
	{Index: 81, Kind: TileForward, Param: 2},
	{Index: 82, Kind: TileBlank},
	{Index: 83, Kind: TileSwap, Twin: 88},
	{Index: 84, Kind: TileSpecial, Effect: EffectFateBackward},
	{Index: 85, Kind: TileBackward, Param: 2},
	{Index: 86, Kind: TileForward, Param: 3},
	{Index: 87, Kind: TileSpecial, Effect: EffectSealDice},
	{Index: 88, Kind: TileSwap, Twin: 83},
	{Index: 89, Kind: TileSpecial, Effect: EffectLuckyChoose},
	{Index: 90, Kind: TileBlank},
	{Index: 91, Kind: TileForward, Param: 1},
	{Index: 92, Kind: TileSpecial, Effect: EffectImmunityBuff},
	{Index: 93, Kind: TileBackward, Param: 3},
	{Index: 94, Kind: TileSpecial, Effect: EffectEndDecel},
	{Index: 95, Kind: TileBackward, Param: 3},
	{Index: 96, Kind: TileForward, Param: 2},
	{Index: 97, Kind: TileBlank},
	{Index: 98, Kind: TileBlank},
	{Index: 99, Kind: TileBackward, Param: 1},
	{Index: 100, Kind: TileSpecial, Title: "终点格"},
}

// TilesByIndex 格号 → 格子定义，速查用
func TilesByIndex() map[int]*TileDef {
	m := make(map[int]*TileDef, len(Tiles))
	for i := range Tiles {
		t := Tiles[i]
		m[t.Index] = &t
	}
	return m
}

// TileAt 按格号取格子定义；越界或不存在返回 nil
func TileAt(index int) *TileDef {
	if index < 1 || index > TileCount {
		return nil
	}
	for i := range Tiles {
		if Tiles[i].Index == index {
			return &Tiles[i]
		}
	}
	return nil
}

// RandStep 随机前进/后退格数（Param=0 时引擎使用），1–3
func RandStep() int {
	return RollDiceN(3)
}

// RandLucky 幸运三选一随机源，0–2
func RandLucky() int {
	return RollDiceN(3) - 1
}
