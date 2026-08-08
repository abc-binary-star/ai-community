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
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        /* 频道色彩系统：综合讨论 / 技术前沿 / 设计美学 / 游戏天地 / 生活方式 */
        channel: {
          general: 'hsl(var(--ch-general))',
          tech: 'hsl(var(--ch-tech))',
          design: 'hsl(var(--ch-design))',
          gaming: 'hsl(var(--ch-gaming))',
          life: 'hsl(var(--ch-life))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 6px)',
      },
      fontFamily: {
        // Plus Jakarta Sans：几何人文无衬线，清爽现代有亲和力
        sans: ['var(--font-sans)', 'PingFang SC', 'Hiragino Sans GB', 'system-ui', 'sans-serif'],
        // 站酷快乐体：品牌与标题的俏皮展示字体（已自托管于根布局）
        display: ['var(--font-zcool)', 'PingFang SC', 'Hiragino Sans GB', 'sans-serif'],
        // 得意黑（Smiley Sans）：趣味点缀
        smiley: ['var(--font-smiley)', 'PingFang SC', 'sans-serif'],
        // 思源宋体：正文引用的衬线点缀
        serifcn: ['var(--font-noto-serif)', 'Noto Serif SC', 'serif'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'pop-in': { '0%': { opacity: '0', transform: 'scale(0.96)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
        'pop-in': 'pop-in 0.25s ease-out',
        float: 'float 5s ease-in-out infinite',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(120 100 60 / 0.05), 0 2px 6px -1px rgb(120 100 60 / 0.05)',
        'card-hover': '0 10px 24px -6px rgb(120 90 40 / 0.14), 0 4px 10px -4px rgb(120 90 40 / 0.08)',
        'pop': '0 14px 34px -8px rgb(120 90 40 / 0.18), 0 6px 14px -6px rgb(120 90 40 / 0.1)',
      },
    },
  },
  plugins: [animate, typography],
}
export default config
