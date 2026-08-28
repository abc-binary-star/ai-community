package hellboard

import (
	"crypto/rand"
	"math/big"
)

// RollDiceN 生成 1–n 的随机整数。用 crypto/rand 而非 math/rand，
// 避免可预测序列被用来卡点掷骰（防篡改）。
func RollDiceN(n int) int {
	if n <= 1 {
		return 1
	}
	v, err := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if err != nil {
		// crypto/rand 失败属于系统级异常，退化为中间值而非 panic，
		// 保证活动不因熵源问题中断
		return n/2 + 1
	}
	return int(v.Int64()) + 1
}

// RollDice 六面骰：1–6
func RollDice() int {
	return RollDiceN(DiceFaces)
}
