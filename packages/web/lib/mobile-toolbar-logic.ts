export interface SafeAreaInput {
  cssVarValue: string
  windowHeight?: number
  viewportHeight?: number
}

export function parseSafeAreaBottom(input: SafeAreaInput): number {
  const raw = input.cssVarValue || ''
  const m = raw.match(/(\d+(?:\.\d+)?)/)
  if (m) return parseFloat(m[1])
  const wh = input.windowHeight ?? 0
  const vh = input.viewportHeight ?? 0
  const diff = wh - vh
  if (diff > 0) return 0
  return 0
}

export interface KeyboardDetectionInput {
  windowHeight: number
  viewportHeight?: number
  lastFocusTs: number
  nowTs: number
  activeElementInContainer: boolean
  safeAreaBottom: number
}

export interface KeyboardDetectionResult {
  keyboardOpen: boolean
  keyboardHeight: number
}

export function detectVirtualKeyboard(input: KeyboardDetectionInput): KeyboardDetectionResult {
  const { windowHeight, viewportHeight, lastFocusTs, nowTs, activeElementInContainer, safeAreaBottom } = input

  if (viewportHeight !== undefined) {
    const diff = windowHeight - viewportHeight
    if (diff > 120) {
      return { keyboardOpen: true, keyboardHeight: diff }
    }
  }

  if (nowTs - lastFocusTs < 500 && activeElementInContainer) {
    return { keyboardOpen: true, keyboardHeight: Math.max(260, safeAreaBottom + 260) }
  }

  return { keyboardOpen: false, keyboardHeight: 0 }
}

export type EditorAction =
  | 'bold' | 'italic' | 'strike' | 'code'
  | 'h2' | 'bullet' | 'ordered' | 'todo' | 'quote' | 'codeblock' | 'link' | 'paragraph'

export interface EditorStateSnapshot {
  activeMarks: Set<string>
  activeNodes: Map<string, Record<string, unknown>>
  canUndo: boolean
  canRedo: boolean
  linkHref?: string
}

export function isActionActive(action: EditorAction, state: EditorStateSnapshot): boolean {
  switch (action) {
    case 'bold':
      return state.activeMarks.has('bold')
    case 'italic':
      return state.activeMarks.has('italic')
    case 'strike':
      return state.activeMarks.has('strike')
    case 'code':
      return state.activeMarks.has('code')
    case 'h2': {
      const heading = state.activeNodes.get('heading')
      return heading?.level === 2
    }
    case 'bullet':
      return state.activeNodes.has('bulletList')
    case 'ordered':
      return state.activeNodes.has('orderedList')
    case 'todo':
      return state.activeNodes.has('taskList')
    case 'quote':
      return state.activeNodes.has('blockquote')
    case 'codeblock':
      return state.activeNodes.has('codeBlock')
    case 'link':
      return state.activeMarks.has('link')
    case 'paragraph':
      return state.activeNodes.has('paragraph') && !state.activeNodes.has('heading')
    default:
      return false
  }
}
