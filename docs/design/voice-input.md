# 语音输入功能技术文档

## 概述

用户在评论框或文章编辑器中点击麦克风按钮，录音后经火山引擎 ASR 转写为文字，可选 AI 润色后插入到对应位置。前端录音使用 AudioContext + ScriptProcessorNode 采集 PCM 数据，后端通过 WebSocket 二进制协议调用火山引擎豆包流式语音识别 API。

## 架构

```
浏览器                        后端 (Go)                    火山引擎
  |                              |                           |
  |-- 1. AudioContext 录 PCM --->|                           |
  |   (16kHz/16bit/mono)        |                           |
  |                              |-- 2. WebSocket 建连 ------>|
  |                              |-- 3. 发 JSON 配置 --------->|
  |                              |-- 4. 分片发音频(seq=2..N) ->|
  |                              |-- 5. 发负包(seq=-N) ------>|
  |                              |<-- 6. 返回识别文本 --------|
  |<-- 7. 返回 {text} -----------|                           |
  |                              |                           |
  |-- 8. 可选: POST /voice-polish (DeepSeek 润色) ----------->|
  |<-- 9. 返回润色结果 <---------------------------------------|
  |                              |                           |
  |-- 10. 插入到评论框/编辑器    |                           |
```

## 环境配置

### 必填

```bash
# 火山引擎语音识别（控制台获取 API Key）
VOLC_ASR_API_KEY=your-api-key
```

### 可选

```bash
# 资源 ID（默认 volc.bigasr.sauc.duration，即豆包流式ASR 1.0 小时版）
VOLC_ASR_RESOURCE_ID=volc.bigasr.sauc.duration
```

未配置 `VOLC_ASR_API_KEY` 时，`stt.Enabled()` 返回 false，后端返回 503，前端 toast 提示"语音识别功能未开启"。

### 服务器部署

在项目根目录 `.env` 中添加配置，`docker-compose.prod.yml` 已注入以下环境变量到 server 容器：

```yaml
- VOLC_ASR_API_KEY=${VOLC_ASR_API_KEY:-}
- VOLC_ASR_RESOURCE_ID=${VOLC_ASR_RESOURCE_ID:-volc.bigasr.sauc.duration}
```

注意：CI/CD 只推 Docker 镜像不推代码，如果 `docker-compose.prod.yml` 有变更，需 SSH 到服务器执行 `git pull` 同步 compose 文件，再执行 `./deploy.sh`。

## 文件清单

### 后端

| 文件 | 职责 |
|------|------|
| `server-go/internal/pkg/stt/client.go` | 火山引擎 ASR WebSocket 客户端，二进制协议封装 |
| `server-go/internal/handler/ai.go` | `Transcribe` handler，multipart 文件接收 |
| `server-go/internal/router/router.go` | 路由注册 `POST /api/ai/transcribe` |
| `server-go/internal/conf/conf.go` | `VolcASRKey` / `VolcASRResID` 配置字段 |
| `server-go/cmd/server/main.go` | `stt.Init()` 初始化调用 |
| `server-go/internal/service/ai.go` | `VoicePolish` 方法（转录文本润色） |
| `server-go/internal/types/types.go` | `VoicePolishReq` 请求体定义 |

### 前端

| 文件 | 职责 |
|------|------|
| `packages/web/lib/use-audio-recorder.ts` | PCM 录音 hook（AudioContext + ScriptProcessorNode） |
| `packages/web/app/community/components/voice-composer.tsx` | 语音输入浮层组件（录音->转写->润色->插入） |
| `packages/web/app/community/components/comment-form.tsx` | 评论表单集成麦克风按钮 |
| `packages/web/components/markdown-editor.tsx` | 文章编辑器工具栏集成语音按钮 |
| `packages/web/lib/api.ts` | `apiFetch` 封装（FormData 自动处理 Content-Type） |

## API 接口

### POST /api/ai/transcribe

语音转文字。需要登录鉴权。

**请求**：`multipart/form-data`

| 字段 | 类型 | 说明 |
|------|------|------|
| `file` | binary | PCM 音频文件（16kHz/16bit/mono），最大 25MB |

**响应**：

```json
{ "text": "识别出的文字内容" }
```

### POST /api/ai/voice-polish

语音转录文本润色。需要登录鉴权。

**请求**：`application/json`

```json
{
  "content": "转录文本",
  "style": "",
  "target": "comment"
}
```

- `style`：可选，`""` 自然 | `"formal"` 正式 | `"casual"` 口语 | `"friendly"` 亲和
- `target`：`"comment"` 精简为评论 | `"paragraph"` 展开为段落

**响应**：

```json
{ "result": "润色后的文本" }
```

## 前端录音格式

| 参数 | 值 | 说明 |
|------|------|------|
| 采样率 | 16000 Hz | 火山引擎 ASR 要求 |
| 位深 | 16-bit | Float32 -> Int16 PCM 转换 |
| 声道 | 1 (mono) | 单声道 |
| 格式 | raw PCM | 无文件头，直接 Int16Array buffer |
| 回声消除 | 开启 | `echoCancellation: true` |
| 降噪 | 开启 | `noiseSuppression: true` |
| Blob type | `audio/pcm` | 上传文件名 `audio.pcm` |

## 火山引擎 WebSocket 协议

### 连接

- URL: `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream`（流式输入模式）
- 请求头: `X-Api-Key` / `X-Api-Resource-Id` / `X-Api-Request-Id` / `X-Api-Connect-Id`

### 二进制消息格式

```
| header (4B) | [sequence (4B)] | payload_size (4B) | payload |
```

**Header 4 字节**：

| 字节 | 高4位 | 低4位 |
|------|-------|-------|
| byte[0] | protocol version (0x1) | header size (0x1, 即 4 字节) |
| byte[1] | message type | flags |
| byte[2] | serialization | compression |
| byte[3] | reserved (0x00) | |

**消息类型**：

| 类型 | 值 | 方向 | 说明 |
|------|------|------|------|
| Full client request | 0x1 | C->S | JSON 配置（音频参数+模型参数） |
| Audio only | 0x2 | C->S | 原始 PCM 音频数据 |
| Full server response | 0x9 | S->C | 识别结果（JSON） |
| Server error | 0xF | S->C | 错误消息 |

**Flags**：

| 值 | 含义 |
|------|------|
| 0x0 | 无 sequence number |
| 0x1 | 有正 sequence number |
| 0x3 | 有负 sequence number（最后一包） |

### 发送流程

1. **Full client request**（flags=0x0, JSON）：音频配置 `format=pcm, rate=16000, bits=16, channel=1, model_name=bigmodel`
2. **Audio only**（flags=0x1, seq=2,3,4...）：每包 6400 字节（约 200ms），序列号从 2 开始（seq=1 被 full client request 占用）
3. **Audio only 负包**（flags=0x3, seq=-N）：空 payload，表示音频发送完毕

### 响应解析

服务端返回多条 `msgType=0x9` 消息，`flags=0x3` 的为最终结果。JSON 格式：

```json
{
  "result": { "text": "识别文本" },
  "definite": true
}
```

## 计费

火山引擎豆包流式语音识别按时长计费：

| 模型 | 资源 ID | 按量价格 |
|------|---------|---------|
| 豆包流式ASR 1.0 | `volc.bigasr.sauc.duration` | 3.5 元/小时（后付费） |
| 豆包流式ASR 2.0 | `volc.seedasr.sauc.duration` | 4.5 元/小时（后付费） |

1 分钟语音约 0.06 元，资源包更便宜（1000 小时 4000 元，合 4 元/小时）。

## 用户流程

1. 点击麦克风按钮 -> 弹出底部浮层
2. 点击录音 -> 浏览器请求麦克风权限
3. 说话 -> 浮层显示录音时长计时
4. 点击停止 -> 上传 PCM 到后端 -> 火山引擎转写
5. 转写文本显示在暂存区 -> 可编辑修正
6. 可选：选择风格（自然/正式/口语/亲和）-> AI 润色
7. 确认插入 -> 文本插入到评论框或编辑器光标位置

## 踩坑记录与经验教训

从"语音输入"需求到最终跑通，经历了多轮方案迭代和调试。以下按时间顺序记录每个问题的现象、根因和解决方案。

### 问题 1：浏览器 Web Speech API 在公网 HTTP 下不可用

**现象**：电脑 Chrome 提示"语音识别出错：not-allowed"，手机 Chrome 提示"当前浏览器不支持语音识别"。

**根因**：
- `not-allowed`：Web Speech API 要求安全上下文（HTTPS 或 localhost），通过公网 IP + HTTP 访问时浏览器拒绝麦克风权限
- 手机不支持：Android Chrome 的 `SpeechRecognition` 支持不完整，很多版本没有此 API
- `ScriptProcessorNode` 的 `typeof` 检查恒为 `undefined`（它不是全局变量），导致所有浏览器都判定不支持

**解决方案**：彻底放弃浏览器端 Web Speech API，改为前端录音 + 后端转写的架构。录音使用 `AudioContext + ScriptProcessorNode` 采集 PCM，所有现代浏览器都支持。

**出处**：`packages/web/lib/use-audio-recorder.ts` supported 检查逻辑（第 34-41 行）

### 问题 2：OpenAI Whisper API 国内不可用

**现象**：后端调用 OpenAI Whisper API 超时或连接失败。

**根因**：OpenAI API 在大陆无法直接访问，服务器在国内公网 IP，网络不通。且需要国外手机号注册 + 绑定信用卡。

**解决方案**：切换为火山引擎豆包流式语音识别 API，国内直连无障碍，中文识别效果好。

**出处**：`server-go/internal/pkg/stt/client.go` 全文重写，配置从 `OPENAI_API_KEY` 改为 `VOLC_ASR_API_KEY`

### 问题 3：FormData 上传时 Content-Type 冲突

**现象**：后端收到音频上传请求但无法解析 multipart 表单，报 "请上传音频文件"。

**根因**：`apiFetch` 封装默认给所有请求设置 `Content-Type: application/json`，导致 FormData 请求的 `multipart/form-data; boundary=...` 被覆盖，后端无法解析 boundary。

**解决方案**：`apiFetch` 中判断 `body instanceof FormData` 时不设置 Content-Type，让浏览器自动处理。

**出处**：`packages/web/lib/api.ts` 第 74-79 行

### 问题 4：录音回声

**现象**：录音时扬声器播放出麦克风采集到的声音。

**根因**：`ScriptProcessorNode` 必须连接到 `audioContext.destination` 才能触发 `onaudioprocess` 回调，但直接连接会把声音播放到扬声器。

**解决方案**：插入一个零增益 GainNode：`source -> processor -> silentGain(0) -> destination`，既保证回调触发又不产生声音。

**出处**：`packages/web/lib/use-audio-recorder.ts` 第 104-110 行

### 问题 5：火山引擎 ASR 序列号不匹配

**现象**：WebSocket 连接成功，但服务端返回错误：`"decode ws request failed: unable to decode V1 protocol message: autoAssignedSequence (2) mismatch sequence in request (1)"`

**根因**：音频数据包的 sequence number 从 1 开始，但服务端期望从 2 开始（full client request 配置包占用了 seq=1）。

**解决方案**：音频分包序列号从 2 开始递增。

**出处**：`server-go/internal/pkg/stt/client.go` 第 159 行 `seq := 2`

### 问题 6：负包格式错误

**现象**：序列号修正后仍报同样的错误。

**根因**：最后一包（负包）使用了 `flagLastNoSeq`（0x2，无 sequence number），但服务端期望使用 `flagSeqNeg`（0x3，带负数 sequence number）。

**解决方案**：负包使用 `flagSeqNeg`（0x3），传入负的序列号 `int32(-seq)`。

**出处**：`server-go/internal/pkg/stt/client.go` 第 175 行

### 问题 7：错误消息解析失败

**现象**：服务端返回错误消息时，后端报 "payload 长度不匹配: payloadLen=45000000, remaining=137"。

**根因**：错误消息（msgType=0xF）的 flags=0，代码认为没有 sequence number，直接从 byte[4] 读 payload size。但错误消息的二进制格式与正常响应不同，byte[4:8] 不是 payload size 而是其他内容，导致读出错误的 payloadLen。

**解决方案**：当 `msgType == msgServerError` 时，直接把 header（4字节）后的全部数据当作错误文本处理，不走常规的 payload size 解析。

**出处**：`server-go/internal/pkg/stt/client.go` 第 211-216 行

### 问题 8：服务器 docker-compose 配置未同步

**现象**：CI/CD 自动部署后，后端日志显示 `VOLC_ASR_API_KEY 未配置`。

**根因**：`docker-compose.prod.yml` 新增了 `VOLC_ASR_*` 环境变量，但服务器上的 compose 文件是旧的（CI/CD 只推镜像不推代码），新环境变量没有注入到容器。

**解决方案**：SSH 到服务器手动更新 `docker-compose.prod.yml`，或执行 `git pull && ./deploy.sh`。

**经验**：`deploy.sh` 原本只拉 Docker 镜像不拉代码，如果 compose 文件有变更需要手动同步服务器代码。

### 方案演进时间线

```
v1: 浏览器 Web Speech API 实时转写
    -> 公网 HTTP not-allowed + 手机不支持 -> 放弃

v2: 前端 MediaRecorder 录音 + 后端 OpenAI Whisper API
    -> 国内无法访问 OpenAI -> 放弃

v3: 前端 AudioContext PCM 录音 + 后端火山引擎 WebSocket ASR
    -> FormData Content-Type 冲突 -> 修复 apiFetch
    -> 录音回声 -> 加零增益 GainNode
    -> 序列号不匹配 -> seq 从 2 开始
    -> 负包格式错误 -> 用 flagSeqNeg + 负序列号
    -> 错误消息解析失败 -> 特殊处理 msgType=0xF
    -> 成功
```
