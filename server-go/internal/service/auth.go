package service

import (
	"context"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/jwt"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/notification"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// AuthService 认证服务
type AuthService struct{}

// Register 注册
func (s *AuthService) Register(ctx context.Context, req types.RegisterReq) (*types.AuthResponse, error) {
	normalizedEmail := strings.ToLower(req.Email)

	// 检查是否已存在
	var existing model.User
	result := dal.DB.WithContext(ctx).Where("email = ? OR username = ?", normalizedEmail, req.Username).First(&existing)
	if result.Error == nil {
		return nil, ErrUserExists
	}
	if result.Error != gorm.ErrRecordNotFound {
		return nil, result.Error
	}

	// bcrypt 哈希
	hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		return nil, err
	}

	user := &model.User{
		Username: req.Username,
		Email:    normalizedEmail,
		Password: string(hashed),
	}
	if err := dal.DB.WithContext(ctx).Create(user).Error; err != nil {
		if notification.IsUniqueConstraintError(err) {
			return nil, ErrUserExists
		}
		return nil, err
	}

	return s.buildAuthResponse(user)
}

// Login 登录
func (s *AuthService) Login(ctx context.Context, req types.LoginReq) (*types.AuthResponse, error) {
	normalizedEmail := strings.ToLower(req.Email)

	var user model.User
	if err := dal.DB.WithContext(ctx).Where("email = ?", normalizedEmail).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			// 执行一次 dummy compare 防邮箱枚举
			bcrypt.CompareHashAndPassword([]byte(dummyHash), []byte(req.Password))
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	return s.buildAuthResponse(&user)
}

// RefreshToken 刷新 token
func (s *AuthService) RefreshToken(ctx context.Context, refreshToken string) (string, string, error) {
	claims := jwt.VerifyRefreshToken(refreshToken)
	if claims == nil {
		return "", "", ErrInvalidRefreshToken
	}

	var user model.User
	if err := dal.DB.WithContext(ctx).Select("id", "username").First(&user, "id = ?", claims.UserID).Error; err != nil {
		return "", "", ErrUserNotFound
	}

	token, err := jwt.SignToken(user.ID, user.Username)
	if err != nil {
		return "", "", err
	}
	newRefresh, err := jwt.SignRefreshToken(user.ID, user.Username)
	if err != nil {
		return "", "", err
	}
	return token, newRefresh, nil
}

// GetCurrentUser 获取当前登录用户
func (s *AuthService) GetCurrentUser(ctx context.Context, userID string) (*model.User, error) {
	var user model.User
	if err := dal.DB.WithContext(ctx).First(&user, "id = ?", userID).Error; err != nil {
		return nil, ErrUserNotFound
	}
	return &user, nil
}

func (s *AuthService) buildAuthResponse(user *model.User) (*types.AuthResponse, error) {
	token, err := jwt.SignToken(user.ID, user.Username)
	if err != nil {
		return nil, err
	}
	refreshToken, err := jwt.SignRefreshToken(user.ID, user.Username)
	if err != nil {
		return nil, err
	}
	return &types.AuthResponse{
		User: types.User{
			ID:          user.ID,
			Username:    user.Username,
			Email:       user.Email,
			Avatar:      user.Avatar,
			Bio:         user.Bio,
			DisplayName: user.DisplayName,
			// Role 必须下发：前端据此决定是否展示管理员入口（如活动终审台）
			Role:      user.Role,
			CreatedAt: user.CreatedAt.Format(time.RFC3339),
			UpdatedAt: user.UpdatedAt.Format(time.RFC3339),
		},
		Token:        token,
		RefreshToken: refreshToken,
	}, nil
}

// 登录时序侧信道防御的固定 dummy hash
const dummyHash = "$2a$12$yi8g72mJ6IFwFohHyRY6..G3f1g.0g//x0qTfwxBrwTs912HKv86y"

// 认证错误
var (
	ErrUserExists          = &AuthError{Msg: "用户名或邮箱已被注册", Code: 409}
	ErrInvalidCredentials  = &AuthError{Msg: "邮箱或密码错误", Code: 401}
	ErrInvalidRefreshToken = &AuthError{Msg: "refreshToken 无效或已过期", Code: 401}
	ErrUserNotFound        = &AuthError{Msg: "用户不存在", Code: 404}
)

type AuthError struct {
	Msg  string
	Code int
}

func (e *AuthError) Error() string { return e.Msg }
