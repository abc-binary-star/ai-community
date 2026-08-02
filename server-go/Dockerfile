# 多阶段构建：编译阶段
FROM golang:1.23-alpine AS builder

WORKDIR /app

# 利用缓存：先拷贝 go.mod/go.sum
COPY go.mod go.sum ./
RUN go env -w GOPROXY=https://goproxy.cn,direct && go mod download

# 拷贝源码
COPY . .

# 编译
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server ./cmd/server

# 运行阶段：极小镜像
FROM alpine:3.20

RUN apk --no-cache add ca-certificates tzdata
ENV TZ=Asia/Shanghai

WORKDIR /app
COPY --from=builder /app/server /app/server

EXPOSE 3001

CMD ["/app/server"]
