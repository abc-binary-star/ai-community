'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  Bookmark,
  ChevronRight,
  Code2,
  Compass,
  FileText,
  Gamepad2,
  Hash,
  Leaf,
  Megaphone,
  type LucideIcon,
  MessageCircle,
  Palette,
  Search,
  Sparkles,
  UserCircle,
  X,
} from 'lucide-react'
import { useChannelTree } from '@/lib/use-channel-tree'
import { useCollapsedState } from '@/lib/use-collapsed-state'
import { useAnnouncementUnread } from '@/lib/use-announcements'
import { channelColor } from '@/lib/channel-colors'
import { CHANNELS, CHANNEL_LABELS } from 'shared'
import { cn } from '@/lib/utils'

// ---- 图标映射：将数据库中的图标名称字符串映射为 lucide 组件 ----

const ICON_MAP: Record<string, LucideIcon> = {
  'message-circle': MessageCircle,
  'code': Code2,
  'palette': Palette,
  'gamepad-2': Gamepad2,
  'leaf': Leaf,
  'compass': Compass,
  'sparkles': Sparkles,
  'file-text': FileText,
  'bookmark': Bookmark,
  'megaphone': Megaphone,
  'hash': Hash,
}

// fallback 频道的默认图标映射
const FALLBACK_ICONS: Record<string, LucideIcon> = {
  general: MessageCircle,
  tech: Code2,
  design: Palette,
  gaming: Gamepad2,
  life: Leaf,
}

function getIcon(iconName: string | undefined, fallbackName?: string): LucideIcon {
  if (iconName && ICON_MAP[iconName]) return ICON_MAP[iconName]
  if (fallbackName && FALLBACK_ICONS[fallbackName]) return FALLBACK_ICONS[fallbackName]
  return Hash
}

// ---- 移动端抽屉 ----

function MobileSidebar({
  open,
  onClose,
  activeChannel,
  isDiscover,
}: {
  open: boolean
  onClose: () => void
  activeChannel: string
  isDiscover: boolean
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="社区导航">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      {/* 抽屉面板 */}
      <div className="absolute inset-y-0 left-0 w-[min(19rem,calc(100vw-3rem))] animate-[slide-up_0.2s_ease-out] border-r border-border bg-background shadow-2xl">
        <SidebarContent
          activeChannel={activeChannel}
          isDiscover={isDiscover}
          onNavigate={onClose}
          showCloseButton
          onClose={onClose}
        />
      </div>
    </div>
  )
}

// ---- 折叠分组 ----

function CollapsibleSection({
  label,
  icon,
  children,
}: {
  label: string
  icon?: string
  children: React.ReactNode
}) {
  const { collapsed, toggle } = useCollapsedState(label)
  const Icon = getIcon(icon)

  return (
    <div className="mb-1.5">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={cn(
            'size-3 transition-transform duration-200',
            !collapsed && 'rotate-90',
          )}
        />
        <Icon className="size-3.5" />
        <span>{label}</span>
      </button>
      {!collapsed && <div className="mt-0.5">{children}</div>}
    </div>
  )
}

// ---- 频道项 ----

function ChannelItem({
  label,
  icon,
  iconFallback,
  href,
  active,
  badge,
  colorKey,
  onNavigate,
}: {
  label: string
  icon?: string
  iconFallback?: string
  href: string
  active: boolean
  badge?: number
  colorKey?: string
  onNavigate?: () => void
}) {
  const Icon = getIcon(icon, iconFallback)
  const color = channelColor(colorKey)

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'group relative flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 md:min-h-0',
        active
          ? 'font-medium text-primary'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
    >
      {/* 选中态左侧主色细指示线（线条式，不填色块） */}
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" aria-hidden />
      )}
      {colorKey ? (
        <span className={cn('size-2 shrink-0 rounded-full transition-transform duration-150 group-hover:scale-125', color.dot)} />
      ) : (
        <Icon className="size-4 shrink-0" />
      )}
      <span className="truncate">{label}</span>
      {typeof badge === 'number' && badge > 0 && (
        <span className="ml-auto flex size-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  )
}

// ---- 侧边栏内容（桌面和移动端共用） ----

function SidebarContent({
  activeChannel,
  isDiscover,
  onNavigate,
  showCloseButton,
  onClose,
}: {
  activeChannel: string
  isDiscover: boolean
  onNavigate?: () => void
  showCloseButton?: boolean
  onClose?: () => void
}) {
  const { data: tree } = useChannelTree()
  const { data: announcementUnread } = useAnnouncementUnread()
  const [searchQuery, setSearchQuery] = useState('')

  // 构建频道树，API 不可用时使用 fallback
  const { categories, uncategorized } = useMemo(() => {
    if (tree) {
      return { categories: tree.categories, uncategorized: tree.uncategorized }
    }
    // Fallback：将默认频道放入一个未分组列表
    const fallbackChannels = CHANNELS.map((name) => ({
      id: name,
      name,
      label: CHANNEL_LABELS[name] || name,
      description: '',
      icon: '',
      categoryId: null,
      sortOrder: 0,
      createdBy: '',
      createdAt: '',
      updatedAt: '',
    }))
    return { categories: [], uncategorized: fallbackChannels }
  }, [tree])

  // 搜索过滤
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories
    const q = searchQuery.toLowerCase()
    return categories
      .map((cat) => ({
        ...cat,
        channels: cat.channels.filter(
          (ch) =>
            ch.label.toLowerCase().includes(q) || ch.name.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.channels.length > 0)
  }, [categories, searchQuery])

  const filteredUncategorized = useMemo(() => {
    if (!searchQuery.trim()) return uncategorized
    const q = searchQuery.toLowerCase()
    return uncategorized.filter(
      (ch) => ch.label.toLowerCase().includes(q) || ch.name.toLowerCase().includes(q),
    )
  }, [uncategorized, searchQuery])

  return (
    <div className="flex h-full flex-col bg-transparent">
      {/* 顶部：搜索栏 + 关闭按钮 */}
      <div className="flex items-center gap-2 p-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索频道..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-transparent bg-muted/60 pl-9 pr-3 text-sm transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary/40 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* 频道列表（可滚动） */}
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2.5 pb-4">
        {/* 固定项：发现 */}
        <ChannelItem
          label="发现"
          icon="compass"
          href="/community/discover"
          active={isDiscover}
          colorKey="general"
          onNavigate={onNavigate}
        />

        {/* 分组频道 */}
        {filteredCategories.map((cat) => (
          <div key={cat.id} className="mt-2">
            <CollapsibleSection label={cat.label} icon={cat.icon}>
              <div className="space-y-0.5">
                {cat.channels.map((ch) => (
                  <ChannelItem
                    key={ch.id}
                    label={ch.label}
                    icon={ch.icon}
                    iconFallback={ch.name}
                    href={`/community?channel=${encodeURIComponent(ch.name)}`}
                    active={!isDiscover && activeChannel === ch.name}
                    colorKey={ch.name}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </CollapsibleSection>
          </div>
        ))}

        {/* 未分组频道 */}
        {filteredUncategorized.length > 0 && (
          <div className="mt-3 space-y-0.5">
            {filteredUncategorized.map((ch) => (
              <ChannelItem
                key={ch.id}
                label={ch.label}
                icon={ch.icon}
                iconFallback={ch.name}
                href={`/community?channel=${encodeURIComponent(ch.name)}`}
                active={!isDiscover && activeChannel === ch.name}
                colorKey={ch.name}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}

        {/* 搜索无结果 */}
        {searchQuery.trim() &&
          filteredCategories.length === 0 &&
          filteredUncategorized.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              没有找到匹配的频道
            </p>
          )}
      </nav>

      {/* 底部：个人入口 */}
      <div className="border-t border-border/70 p-2.5">
        <p className="flex items-center gap-1.5 px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          <UserCircle className="size-3.5" />
          我的空间
        </p>
        <ChannelItem
          label="我的草稿"
          icon="file-text"
          href="/community/drafts"
          active={false}
          onNavigate={onNavigate}
        />
        <ChannelItem
          label="我的收藏"
          icon="bookmark"
          href="/bookmarks"
          active={false}
          onNavigate={onNavigate}
        />
        <ChannelItem
          label="公告中心"
          icon="megaphone"
          href="/community/announcements"
          active={false}
          badge={announcementUnread?.count ?? 0}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  )
}

// ---- 主导出组件 ----

export function Sidebar({
  mobileOpen,
  onMobileClose,
}: {
  mobileOpen: boolean
  onMobileClose: () => void
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeChannel = searchParams.get('channel') || 'general'
  const isDiscover = pathname === '/community/discover'

  return (
    <>
      {/* 桌面端固定侧边栏 */}
      <aside className="hidden w-64 shrink-0 md:block">
        <SidebarContent activeChannel={activeChannel} isDiscover={isDiscover} />
      </aside>

      {/* 移动端抽屉 */}
      <MobileSidebar
        open={mobileOpen}
        onClose={onMobileClose}
        activeChannel={activeChannel}
        isDiscover={isDiscover}
      />
    </>
  )
}
