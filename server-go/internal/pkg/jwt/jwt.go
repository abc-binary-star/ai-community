package jwt

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims JWT 载荷
type Claims struct {
	UserID   string `json:"userId"`
	Username string `json:"username"`
	Type     string `json:"type,omitempty"` // "refresh" 表示 refresh token
	jwt.RegisteredClaims
}

var secret []byte

// Init 设置 JWT 密钥
func Init(s string) {
	secret = []byte(s)
}

// SignToken 签发 access token（15 分钟）
func SignToken(userID, username string) (string, error) {
	claims := Claims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
}

// SignRefreshToken 签发 refresh token（7 天）
func SignRefreshToken(userID, username string) (string, error) {
	claims := Claims{
		UserID:   userID,
		Username: username,
		Type:     "refresh",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
}

// VerifyToken 验证 access token，失败返回 nil
func VerifyToken(tokenString string) *Claims {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		return secret, nil
	})
	if err != nil || !token.Valid {
		return nil
	}
	// refresh token 不能当作 access token 使用
	if claims.Type == "refresh" {
		return nil
	}
	return claims
}

// VerifyRefreshToken 验证 refresh token，失败返回 nil
func VerifyRefreshToken(tokenString string) *Claims {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		return secret, nil
	})
	if err != nil || !token.Valid {
		return nil
	}
	if claims.Type != "refresh" {
		return nil
	}
	return claims
}
