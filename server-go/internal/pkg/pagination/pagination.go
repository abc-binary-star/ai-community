package pagination

import (
	"math"
	"strconv"

	"github.com/cloudwego/hertz/pkg/app"
)

// Parse 从 query 参数解析分页，page 默认 1，pageSize 默认 20，上限 50
func Parse(c *app.RequestContext) (page, pageSize int) {
	page = 1
	pageSize = 20

	if v := c.Query("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			page = n
		}
	}
	if v := c.Query("pageSize"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			pageSize = n
		}
	}
	if pageSize > 50 {
		pageSize = 50
	}
	return
}

// TotalPages 计算总页数
func TotalPages(total, pageSize int) int {
	return int(math.Ceil(float64(total) / float64(pageSize)))
}
