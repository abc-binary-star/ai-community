import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'
import typography from '@tailwindcss/typography'

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '0.5rem',
      screens: { '2xl': '1600px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))' },
        warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))' },
        info: { DEFAULT: 'hsl(var(--info))', foreground: 'hsl(var(--info-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        /* 频道色：低饱和同色系序列 */
        channel: {
          general: 'hsl(var(--ch-general))',
          tech: 'hsl(var(--ch-tech))',
          design: 'hsl(var(--ch-design))',
          gaming: 'hsl(var(--ch-gaming))',
          life: 'hsl(var(--ch-life))',
        },
      },
      borderRadius: {
        '2xl': 'calc(var(--radius) + 6px)',
        xl: 'calc(var(--radius) + 2px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 6px)',
      },
      fontFamily: {
        // 正文与界面：Plus Jakarta Sans，几何人文无衬线，清爽现代
        sans: ['var(--font-sans)', 'PingFang SC', 'Hiragino Sans GB', 'system-ui', 'sans-serif'],
        // 展示/品牌标题：Sora 几何科技无衬线（AI 产品气质）
        display: ['var(--font-display)', 'var(--font-sans)', 'PingFang SC', 'Hiragino Sans GB', 'sans-serif'],
        // 衬线：思源宋体，用于引文/摘录的编辑气质
        serifcn: ['var(--font-noto-serif)', 'Noto Serif SC', 'serif'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'pop-in': { '0%': { opacity: '0', transform: 'scale(0.98)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        // AI 处理态：极缓呼吸，仅用于 AI 语义元素
        'ai-pulse': { '0%, 100%': { opacity: '0.5' }, '50%': { opacity: '1' } },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
        'pop-in': 'pop-in 0.2s ease-out',
        'ai-pulse': 'ai-pulse 2s ease-in-out infinite',
      },
      boxShadow: {
        // 中性化阴影：靠明度与克制投影拉层次，不再用暖色光
        card: '0 1px 2px 0 rgb(20 22 28 / 0.04), 0 1px 3px 0 rgb(20 22 28 / 0.06)',
        'card-hover': '0 4px 12px -2px rgb(20 22 28 / 0.08), 0 2px 6px -2px rgb(20 22 28 / 0.06)',
        pop: '0 12px 28px -8px rgb(20 22 28 / 0.16), 0 4px 10px -4px rgb(20 22 28 / 0.08)',
      },
    },
  },
  plugins: [animate, typography],
}
export default config
