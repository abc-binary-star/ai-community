package handler

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/hex"
	"errors"
	"image"
	"log"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/middleware"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/remoteimage"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/storage"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/disintegration/imaging"
	"gorm.io/gorm"
)

// 单次请求最多转存的图片数，避免一次粘贴触发过多外部请求
const maxRemoteBatch = 10

type fetchRemoteReq struct {
	URLs []string `json:"urls"`
}

type remoteItem struct {
	SourceURL string `json:"sourceUrl"`
	URL       string `json:"url,omitempty"`
	Width     int    `json:"width,omitempty"`
	Height    int    `json:"height,omitempty"`
	Error     string `json:"error,omitempty"`
}

// FetchRemoteImages 把外站图片转存到本站存储
// POST /api/upload/remote-images  body: { urls: string[] }
//
// 用途：B站/贴吧等图床有 Referer 防盗链，前端直接引用其地址会 403。
// 由服务端拉取（不带 Referer）后转存到本站，即可正常展示。
// 逐个处理，失败项不影响其余图片，结果按输入顺序返回。
func FetchRemoteImages(ctx context.Context, c *app.RequestContext) {
	var req fetchRemoteReq
	if err := c.BindJSON(&req); err != nil {
		response.BadRequest(c, "请求格式不合法")
		return
	}
	if len(req.URLs) == 0 {
		response.BadRequest(c, "请提供图片地址")
		return
	}
	if len(req.URLs) > maxRemoteBatch {
		response.BadRequest(c, "一次最多转存 10 张图片")
		return
	}

	userID := middleware.GetCurrentUserID(c)
	items := make([]remoteItem, 0, len(req.URLs))

	for _, src := range req.URLs {
		item := remoteItem{SourceURL: src}

		fetched, err := remoteimage.Fetch(ctx, src)
		if err != nil {
			item.Error = err.Error()
			items = append(items, item)
			continue
		}

		// 只信任 magic number，不信任对方给的 Content-Type
		mime := detectMimeType(fetched.Data)
		if mime == "" || !allowedImageTypes[mime] {
			item.Error = "不支持的图片格式"
			items = append(items, item)
			continue
		}

		saved, err := saveImageBytes(ctx, fetched.Data, mime, userID)
		if err != nil {
			log.Printf("[UploadRemote] 转存失败 %s: %v", src, err)
			item.Error = "图片保存失败"
			items = append(items, item)
			continue
		}

		item.URL = saved.url
		item.Width = saved.width
		item.Height = saved.height
		items = append(items, item)
	}

	response.JSON(c, map[string]interface{}{"items": items})
}

type savedImage struct {
	url    string
	width  int
	height int
}

// saveImageBytes 落盘图片字节：取尺寸、剥离 JPEG EXIF、内容寻址去重、写元数据。
// 与 UploadImage 的处理保持一致，供远程转存复用。
func saveImageBytes(ctx context.Context, data []byte, mime string, userID string) (*savedImage, error) {
	width, height := 0, 0
	if cfg, _, err := image.DecodeConfig(bytes.NewReader(data)); err == nil {
		width = cfg.Width
		height = cfg.Height
	}

	saveBuf := data
	ext := "jpg"
	if mime == "image/jpeg" {
		// 重新编码以剥离 EXIF（GPS、相机信息等隐私数据）
		if decoded, err := imaging.Decode(bytes.NewReader(data)); err == nil {
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

	hash := md5.Sum(saveBuf)
	key := storage.ContentKey("post", ext, hex.EncodeToString(hash[:]))
	exists, err := storage.Get().Exists(ctx, key)
	if err != nil {
		return nil, err
	}
	var url string
	if exists {
		url = storage.Get().URLOf(key)
	} else {
		url, err = storage.Get().SaveFile(ctx, bytes.NewReader(saveBuf), key)
		if err != nil {
			return nil, err
		}
	}

	imgRecord := &model.Image{
		UserID:   userID,
		URL:      url,
		Width:    width,
		Height:   height,
		Size:     int64(len(saveBuf)),
		MimeType: mime,
		Purpose:  "post",
	}
	if err := dal.DB.Where("url = ?", url).First(&model.Image{}).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		if err := dal.DB.Create(imgRecord).Error; err != nil {
			log.Printf("[UploadRemote] 记录图片元数据失败: %v", err)
		}
	}

	return &savedImage{url: url, width: width, height: height}, nil
}
