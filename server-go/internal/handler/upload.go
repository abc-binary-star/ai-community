package handler

import (
	"bytes"
	"context"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"log"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/middleware"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/storage"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
	"github.com/disintegration/imaging"
)

// 最大头像文件 5MB
const maxAvatarSize = 5 << 20

// 最大帖子图片 5MB
const maxImageSize = 5 << 20

// 允许的图片 MIME 类型
var allowedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
	"image/gif":  true,
}

// detectMimeType 通过文件头（magic number）检测图片类型
func detectMimeType(data []byte) string {
	if len(data) >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
		return "image/jpeg"
	}
	if len(data) >= 4 && string(data[0:4]) == "\x89PNG" {
		return "image/png"
	}
	if len(data) >= 4 && string(data[0:4]) == "RIFF" && len(data) >= 12 && string(data[8:12]) == "WEBP" {
		return "image/webp"
	}
	if len(data) >= 3 && string(data[0:3]) == "GIF" {
		return "image/gif"
	}
	return ""
}

// UploadAvatar 头像上传
// POST /api/upload/avatar (multipart: file=图片文件)
func UploadAvatar(ctx context.Context, c *app.RequestContext) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		response.BadRequest(c, "请上传图片文件")
		return
	}

	if fileHeader.Size > maxAvatarSize {
		response.BadRequest(c, "图片文件太大，最多 5MB")
		return
	}

	// 读取文件内容
	file, err := fileHeader.Open()
	if err != nil {
		response.BadRequest(c, "读取文件失败")
		return
	}
	defer file.Close()

	buf := make([]byte, fileHeader.Size)
	if _, err := file.Read(buf); err != nil {
		response.BadRequest(c, "读取文件失败")
		return
	}

	// Magic Number 校验
	mime := detectMimeType(buf)
	if mime == "" || !allowedImageTypes[mime] {
		response.BadRequest(c, "不支持的图片格式，仅支持 JPEG/PNG/WebP/GIF")
		return
	}

	// 根据 MIME 类型确定扩展名
	ext := "jpg"
	switch mime {
	case "image/png":
		ext = "png"
	case "image/webp":
		ext = "webp"
	case "image/gif":
		ext = "gif"
	}

	// 生成存储 key
	key := storage.GenerateKey("avatar", ext)

	// 直接上传到存储（前端已裁剪，无需后端再处理）
	url, err := storage.Get().SaveFile(ctx, bytes.NewReader(buf), key)
	if err != nil {
		log.Printf("[Upload] 保存文件失败: %v", err)
		response.Error(c, consts.StatusInternalServerError, "文件保存失败")
		return
	}

	// 记录图片元数据
	userID := middleware.GetCurrentUserID(c)
	imgRecord := &model.Image{
		UserID:   userID,
		URL:      url,
		Size:     fileHeader.Size,
		MimeType: mime,
		Purpose:  "avatar",
	}
	if err := dal.DB.Create(imgRecord).Error; err != nil {
		log.Printf("[Upload] 记录图片元数据失败: %v", err)
	}

	// 更新用户头像
	if err := dal.DB.Model(&model.User{}).Where("id = ?", userID).Update("avatar", url).Error; err != nil {
		log.Printf("[Upload] 更新用户头像失败: %v", err)
		response.Error(c, consts.StatusInternalServerError, "更新头像失败")
		return
	}

	response.JSON(c, map[string]interface{}{
		"url": url,
	})
}

// UploadImage 通用图片上传（帖子封面/帖内插图）
// POST /api/upload/image (multipart: file=图片文件)
func UploadImage(ctx context.Context, c *app.RequestContext) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		response.BadRequest(c, "请上传图片文件")
		return
	}

	if fileHeader.Size > maxImageSize {
		response.BadRequest(c, "图片文件太大，最多 5MB")
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		response.BadRequest(c, "读取文件失败")
		return
	}
	defer file.Close()

	buf := make([]byte, fileHeader.Size)
	if _, err := file.Read(buf); err != nil {
		response.BadRequest(c, "读取文件失败")
		return
	}

	mime := detectMimeType(buf)
	if mime == "" || !allowedImageTypes[mime] {
		response.BadRequest(c, "不支持的图片格式，仅支持 JPEG/PNG/WebP/GIF")
		return
	}

	// 获取图片尺寸
	config, _, err := image.DecodeConfig(bytes.NewReader(buf))
	width, height := 0, 0
	if err == nil {
		width = config.Width
		height = config.Height
	}

	// 对 JPEG 重新编码以剥离 EXIF（GPS、相机信息等隐私数据）
	// PNG/GIF/WebP 通常不携带 EXIF，直接保存原文件
	saveBuf := buf
	ext := "jpg"
	if mime == "image/jpeg" {
		if decoded, err := imaging.Decode(bytes.NewReader(buf)); err == nil {
			var reencoded bytes.Buffer
			if err := imaging.Encode(&reencoded, decoded, imaging.JPEG, imaging.JPEGQuality(85)); err == nil {
				saveBuf = reencoded.Bytes()
			}
		}
	} else {
		switch mime {
		case "image/png":
			ext = "png"
		case "image/webp":
			ext = "webp"
		case "image/gif":
			ext = "gif"
		}
	}

	key := storage.GenerateKey("post", ext)
	url, err := storage.Get().SaveFile(ctx, bytes.NewReader(saveBuf), key)
	if err != nil {
		log.Printf("[Upload] 保存图片失败: %v", err)
		response.Error(c, consts.StatusInternalServerError, "文件保存失败")
		return
	}

	// 记录图片元数据
	userID := middleware.GetCurrentUserID(c)
	imgRecord := &model.Image{
		UserID:   userID,
		URL:      url,
		Width:    width,
		Height:   height,
		Size:     int64(len(saveBuf)),
		MimeType: mime,
		Purpose:  "post",
	}
	if err := dal.DB.Create(imgRecord).Error; err != nil {
		log.Printf("[Upload] 记录图片元数据失败: %v", err)
	}

	response.JSON(c, map[string]interface{}{
		"url":    url,
		"width":  width,
		"height": height,
	})
}
