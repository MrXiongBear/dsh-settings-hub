/**
 * dsh-settings-hub — Client half.
 *
 * Goal: the Settings dialog should not grow one navigation row per installed
 * plugin. This bundle adds a single "插件设置 / Plugins" section that lists
 * every settings page contributed by third-party plugins, and folds those
 * pages out of the settings navigation.
 *
 * How the folding works
 * ---------------------
 * The Settings shell (`@deepseek-ai/dsh-client-ui-settings-general`) builds its
 * navigation from the raw slot registry:
 *
 *   ctx.slots.entries("settings.section")
 *
 * Slot registrations cannot be removed or hidden by another plugin, but the
 * service object that exposes `entries()` is an ordinary object, so this bundle
 * wraps `entries` for the `settings.section` key only: rows whose id is folded
 * into the hub are filtered out of the shell's navigation, while everything
 * else (including this bundle's own row) is returned unchanged. The original
 * method is restored when the plugin unloads.
 *
 * How a folded page is opened
 * ---------------------------
 * Slot components may only render slots that their own registration declared
 * (`boundRenderSlot` enforces this), and `settings.section` is already declared
 * by the Settings shell, so it cannot be rendered from here. Instead this
 * bundle declares a child slot `plugin-settings.detail` and re-registers each
 * folded page's *component* into it, reusing the page's own `locale`, `store`
 * and `inject` options (those options are plain data on the original entry).
 * Re-registering a component under the very same store handle is supported by
 * the renderer: `resolveStore()` keys instances by handle + root scope, so the
 * copy receives the same props as the original entry did.
 *
 * Pages that declare children of their own cannot be copied safely; for those
 * the hub row falls back to `actions.openSection(id)`, i.e. it navigates the
 * real Settings shell to the original page.
 */

window.__ModuleLoader__.load({
  id: 'dsh-settings-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace of this bundle. */
    const NS = 'settings-hub'
    /** Navigation id of the hub section (cell key inside `settings.section`). */
    const SECTION_ID = 'plugin-settings'
    /** Slot that owns the settings pages. */
    const SECTION_SLOT = 'settings.section'
    /** Child slot of the hub: one folded page per id. */
    const DETAIL_SLOT = 'plugin-settings.detail'
    /** Sits right after "General" and before "Models". */
    const SECTION_ORDER = 5
    /**
     * Shipped sections stay where they are: they are part of the product's own
     * information architecture, not plugin clutter. Everything else is folded.
     */
    const CORE_SECTIONS = new Set([
      'account',
      'general',
      'models',
      'plugins',
      'agent-presets',
      'archived-sessions',
      'session-log',
    ])

    const EN = {
      sectionLabel: 'Plugins',
      title: 'Plugin settings',
      description: 'Settings pages contributed by installed plugins are grouped here instead of taking one row each in the sidebar.',
      search: 'Search plugin settings',
      count: '{count} pages',
      empty: 'No plugin has added a settings page yet.',
      noMatch: 'No plugin settings match “{query}”.',
      back: 'Back',
      openInPlace: 'Open as its own page',
      filterWarning: 'The plugin pages could not be hidden from this navigation: they are still listed on the left as well.',
    }

    const ZH = {
      sectionLabel: '插件设置',
      title: '插件设置',
      description: '已安装插件提供的设置页统一收在这里，不再在侧边栏里各占一行。',
      search: '搜索插件设置',
      count: '共 {count} 个页面',
      empty: '目前还没有插件提供设置页。',
      noMatch: '没有匹配「{query}」的插件设置页。',
      back: '返回',
      openInPlace: '在设置中单独打开',
      filterWarning: '未能从左侧导航隐藏插件设置入口，这些页面仍会同时出现。',
    }

    const CSS = `
.dshsh-root { display: flex; flex-direction: column; gap: 12px; min-width: 0; padding-top: 4px; }
.dshsh-title { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; color: var(--dsw-alias-label-primary); }
.dshsh-desc { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dshsh-tools { display: flex; align-items: center; gap: 10px; min-width: 0; }
.dshsh-search { box-sizing: border-box; flex: 1; min-width: 0; height: 32px; padding: 0 10px; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md, 8px); outline: none; }
.dshsh-search::placeholder { color: var(--dsw-alias-label-tertiary); }
.dshsh-search:focus { border-color: var(--dsw-alias-border-l3); }
.dshsh-count { flex: none; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dshsh-list { list-style: none; margin: 0 -8px; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.dshsh-row { box-sizing: border-box; display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 12px; border: 0; border-radius: var(--dsw-radius-md, 8px); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; line-height: 22px; text-align: left; cursor: pointer; }
.dshsh-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dshsh-row:focus-visible { outline: 2px solid var(--dsw-alias-border-l3); outline-offset: -2px; }
.dshsh-rowIcon, .dshsh-rowArrow { flex: none; display: inline-flex; align-items: center; color: var(--dsw-alias-label-tertiary); }
.dshsh-rowText { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.dshsh-rowLabel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshsh-rowHint { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dshsh-empty { padding: 24px 12px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md, 8px); color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; text-align: center; }
.dshsh-toolbar { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 0 0 12px; }
.dshsh-back { flex: none; display: inline-flex; align-items: center; gap: 2px; height: 28px; padding: 0 8px 0 2px; border: 0; border-radius: var(--dsw-radius-sm, 6px); background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; cursor: pointer; }
.dshsh-back:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dshsh-toolbarTitle { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dshsh-link { flex: none; padding: 0; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; line-height: 18px; text-decoration: underline; cursor: pointer; }
.dshsh-link:hover { color: var(--dsw-alias-label-primary); }
.dshsh-detail { display: flex; flex-direction: column; min-width: 0; }
.dshsh-warning { margin: 0; padding: 8px 10px; border: 1px solid var(--dsw-alias-state-warn-primary, #d8a13a); border-radius: var(--dsw-radius-md, 8px); color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
`

    /** Plugin context captured by `apply`, used by hooks and helpers. */
    let pluginCtx = null
    /** Raw `slots` service instance (`ctx.get('slots')`) — reads and patching. */
    let slots = null
    /**
     * Caller-bound `slots` view (`ctx.slots`). Cordis binds service methods to
     * the caller's fiber, which is what routes registration disposal into this
     * plugin — so every registration must go through this object.
     */
    let calls = null
    /** Unfiltered registry reader: `(key) => readonly StoredEntry[]`. */
    let rawEntries = null
    /** True when the navigation filter could not be installed (surfaced in the hub). */
    let navigationFilterFailed = false
    /** Self-check snapshot reported to the Host half on every (re)install. */
    const diagnostics = {
      filter: 'unknown',
      visibleSections: 0,
      hiddenSections: 0,
      sectionIds: [],
      hiddenIds: [],
      copies: [],
      hub: 'pending',
    }
    /** id -> dispose() of the inline copy registered in DETAIL_SLOT. */
    const copiedPages = new Map()

    // ------------------------------------------------------------------ utils

    function format(template, vars) {
      return String(template).replace(/\{(\w+)\}/g, (match, key) => {
        const value = vars === undefined ? undefined : vars[key]
        return value === undefined ? match : String(value)
      })
    }

    function optionsOf(entry) {
      if (entry === null || entry === undefined) return {}
      const options = entry.options
      return (typeof options === 'object' && options !== null) ? options : {}
    }

    function isCoreSection(id) {
      if (typeof id !== 'string' || id === '') return true
      return CORE_SECTIONS.has(id) || id === SECTION_ID
    }

    function resolveLabel(label, fallback) {
      try {
        const value = typeof label === 'function' ? label() : label
        if (typeof value === 'string' && value.trim() !== '') return value
      } catch (error) {
        console.warn('[settings-hub] a settings label thunk failed', error)
      }
      return fallback
    }

    /** Raw registry view — deliberately bypasses the navigation filter. */
    function readRawEntries(key) {
      if (slots === null || slots === undefined) return []
      try {
        const list = typeof rawEntries === 'function'
          ? rawEntries(key)
          : slots.entries(key)
        return Array.isArray(list) ? list : []
      } catch (error) {
        console.warn('[settings-hub] cannot read slot entries:', key, error)
        return []
      }
    }

    /** Shadowing winners — what outlets would actually render. */
    function readEffectiveEntries(key) {
      if (slots === null || slots === undefined) return []
      try {
        const winners = typeof slots.entriesOfSlot === 'function' ? slots.entriesOfSlot(key) : undefined
        if (Array.isArray(winners) && winners.length > 0) return winners
      } catch (error) {
        console.warn('[settings-hub] cannot read effective slot entries:', key, error)
      }
      return readRawEntries(key)
    }

    /** Folded pages, in their registered order. */
    function foldedPageItems() {
      const items = []
      const seen = new Set()
      for (const entry of readEffectiveEntries(SECTION_SLOT)) {
        const options = optionsOf(entry)
        const id = options.id
        if (isCoreSection(id) || seen.has(id)) continue
        seen.add(id)
        items.push({
          id,
          label: resolveLabel(options.label, id),
          order: typeof options.order === 'number' ? options.order : 0,
          copyable: copiedPages.has(id),
        })
      }
      items.sort((left, right) => (left.order - right.order) || left.id.localeCompare(right.id))
      return items
    }

    // ------------------------------------------------------------- navigation

    /**
     * Wrap `slots.entries` so the Settings shell stops listing folded pages.
     * Returns a restore function (a no-op when the wrap could not be installed).
     */
    function installNavigationFilter() {
      if (slots === null || slots === undefined) return () => {}
      // A previous load may have left its own `entries` behind on the instance.
      const staleOwn = Object.getOwnPropertyDescriptor(slots, 'entries')
      if (staleOwn !== undefined) {
        try {
          delete slots.entries
        } catch (error) {
          console.warn('[settings-hub] cannot drop a stale entries patch', error)
        }
      }
      let owner = slots
      let descriptor
      for (let depth = 0; depth < 8 && owner !== null && owner !== undefined; depth += 1) {
        descriptor = Object.getOwnPropertyDescriptor(owner, 'entries')
        if (descriptor !== undefined) break
        owner = Object.getPrototypeOf(owner)
      }
      if (owner === null || owner === undefined || descriptor === undefined || typeof descriptor.value !== 'function') {
        console.warn('[settings-hub] cannot locate the slots entries method')
        navigationFilterFailed = true
        diagnostics.filter = 'failed'
        return () => {}
      }
      const previous = descriptor.value
      const read = (key) => previous.call(slots, key)
      rawEntries = read
      const patched = function entries(key) {
        const list = read(key)
        if (key !== SECTION_SLOT || !Array.isArray(list)) return list
        return list.filter((entry) => !isFoldedPageId(optionsOf(entry).id))
      }
      try {
        owner.entries = patched
      } catch (error) {
        console.warn('[settings-hub] cannot patch the slots entries method', error)
        navigationFilterFailed = true
        diagnostics.filter = 'failed'
        rawEntries = null
        return () => {}
      }
      const installed = (() => {
        try {
          const current = Object.getOwnPropertyDescriptor(owner, 'entries')
          return current !== undefined && current.value === patched
        } catch (error) {
          return false
        }
      })()
      if (!installed) {
        console.warn('[settings-hub] the navigation filter was not installed; folded pages stay listed')
        navigationFilterFailed = true
        diagnostics.filter = 'failed'
        rawEntries = null
        return () => {}
      }
      // Functional self-check: callers reaching the registry through the service
      // accessor must no longer see folded pages.
      navigationFilterFailed = false
      diagnostics.filter = 'installed'
      try {
        const raw = read(SECTION_SLOT)
        const effective = (calls === null || calls === undefined || typeof calls.entries !== 'function')
          ? undefined
          : calls.entries(SECTION_SLOT)
        if (Array.isArray(raw)) {
          diagnostics.sectionIds = raw.map((entry) => String(optionsOf(entry).id ?? ''))
          diagnostics.hiddenIds = diagnostics.sectionIds.filter((id) => isFoldedPageId(id))
          diagnostics.hiddenSections = diagnostics.hiddenIds.length
        }
        if (Array.isArray(effective)) diagnostics.visibleSections = effective.length
        if (Array.isArray(raw) && Array.isArray(effective) && effective.length >= raw.length) {
          navigationFilterFailed = true
          diagnostics.filter = 'no-effect'
          console.warn('[settings-hub] the navigation filter has no visible effect')
        }
      } catch (error) {
        console.warn('[settings-hub] cannot verify the navigation filter', error)
      }
      return () => {
        try {
          const current = Object.getOwnPropertyDescriptor(owner, 'entries')
          if (current !== undefined && current.value === patched) owner.entries = previous
        } catch (error) {
          console.warn('[settings-hub] cannot restore the navigation filter', error)
        }
        rawEntries = null
      }
    }

    function isFoldedPageId(id) {
      return !isCoreSection(id)
    }

    // ------------------------------------------------------------ page copies

    /**
     * Mirror every copyable folded page into DETAIL_SLOT. Components are shared,
     * so a page keeps its own state machine, locale and injected props.
     */
    function syncPageCopies() {
      if (calls === null || calls === undefined || typeof calls.register !== 'function') return

      const desired = new Map()
      for (const entry of readEffectiveEntries(SECTION_SLOT)) {
        const options = optionsOf(entry)
        const id = options.id
        if (isCoreSection(id)) continue
        // A page that declares children cannot be re-mounted elsewhere safely.
        if (entry.children !== undefined) continue
        if (typeof entry.component !== 'function') continue
        desired.set(id, entry)
      }

      for (const [id, dispose] of Array.from(copiedPages)) {
        if (desired.has(id)) continue
        copiedPages.delete(id)
        try {
          dispose()
        } catch (error) {
          console.warn('[settings-hub] cannot dispose the copy of', id, error)
        }
      }

      for (const [id, entry] of desired) {
        if (copiedPages.has(id)) continue
        // Entry identity lives on the entry itself, not on `options`.
        const definition = { name: DETAIL_SLOT, id }
        if (entry.locale !== undefined) definition.locale = entry.locale
        if (entry.store !== undefined) definition.store = entry.store
        if (entry.inject !== undefined) definition.inject = entry.inject
        try {
          const dispose = calls.register(definition, entry.component)
          if (typeof dispose === 'function') copiedPages.set(id, dispose)
        } catch (error) {
          console.warn('[settings-hub] cannot embed the settings page of', id, error)
        }
      }
    }

    // -------------------------------------------------------------- hub setup

    /**
     * Register the hub section. Returns a dispose function.
     */
    function installHub() {
      const ctx = pluginCtx
      const t = ctx.locale.bind(NS)

      let service = null
      try {
        if (typeof ctx.get === 'function') service = ctx.get('slots')
      } catch (error) {
        service = null
      }
      slots = (service === null || service === undefined) ? ctx.slots : service
      calls = ctx.slots
      if (slots === null || slots === undefined) {
        console.warn('[settings-hub] the slots service is not available')
        return () => {}
      }
      if (calls === null || calls === undefined) calls = slots

      // Reuse the Settings shell's own store so the hub can drive navigation.
      const storeHandle = findShellStoreHandle()
      const definition = {
        name: SECTION_SLOT,
        id: SECTION_ID,
        order: SECTION_ORDER,
        label: () => t('sectionLabel'),
        locale: NS,
        children: { [DETAIL_SLOT]: { kind: 'list', scope: 'root' } },
      }
      if (storeHandle !== undefined) definition.store = storeHandle

      let disposeHub = () => {}
      try {
        const dispose = calls.register(definition, HubSection)
        if (typeof dispose === 'function') disposeHub = dispose
      } catch (error) {
        console.warn('[settings-hub] cannot register the plugin settings section', error)
        return () => {}
      }

      let syncing = false
      const sync = () => {
        if (syncing) return
        syncing = true
        try {
          syncPageCopies()
        } catch (error) {
          console.warn('[settings-hub] cannot sync plugin settings pages', error)
        } finally {
          syncing = false
        }
        publishDiagnostics()
      }

      // Copies first, then hide the originals: the hub must be usable before
      // the navigation rows disappear.
      sync()
      const restoreNavigation = installNavigationFilter()
      diagnostics.hub = 'registered'
      publishDiagnostics()

      // The slot renderer turns a crashing entry into an empty anchor, so a page
      // that cannot be embedded fails silently. Forward those crashes to the
      // Host half as well, until the embedded pages prove themselves.
      const originalConsoleError = console.error
      let reportingCrash = false
      const tapConsoleError = function () {
        try {
          if (!reportingCrash) {
            const text = Array.prototype.map.call(arguments, (value) => (
              value instanceof Error ? `${value.name}: ${value.message}` : String(value)
            )).join(' ')
            if (text.includes('slot entry crashed') && text.includes(SECTION_ID)) {
              reportingCrash = true
              diagnostics.crashes = (Array.isArray(diagnostics.crashes) ? diagnostics.crashes : []).concat(text).slice(-4)
              publishDiagnostics()
              reportingCrash = false
            }
          }
        } catch (error) {
          /* diagnostics must never break rendering */
        }
        originalConsoleError.apply(console, arguments)
      }
      console.error = tapConsoleError

      let unsubscribe = () => {}
      try {
        const off = calls.subscribe(SECTION_SLOT, sync)
        if (typeof off === 'function') unsubscribe = off
      } catch (error) {
        console.warn('[settings-hub] cannot watch the settings section slot', error)
      }

      return () => {
        if (console.error === tapConsoleError) console.error = originalConsoleError
        try {
          unsubscribe()
        } catch (error) {
          console.warn('[settings-hub] cannot unwatch the settings section slot', error)
        }
        for (const [id, dispose] of Array.from(copiedPages)) {
          copiedPages.delete(id)
          try {
            dispose()
          } catch (error) {
            console.warn('[settings-hub] cannot dispose the copy of', id, error)
          }
        }
        try {
          restoreNavigation()
        } catch (error) {
          console.warn('[settings-hub] cannot restore the navigation filter', error)
        }
        try {
          disposeHub()
        } catch (error) {
          console.warn('[settings-hub] cannot dispose the plugin settings section', error)
        }
        slots = null
        calls = null
        rawEntries = null
      }
    }

    /** The store handle owned by the Settings shell (needed for `useStore`). */
    function findShellStoreHandle() {
      for (const entry of readRawEntries('sidebar.settings')) {
        const handle = entry === null || entry === undefined ? undefined : entry.store
        if (handle !== undefined) return handle
      }
      return undefined
    }

    /**
     * Hand the self-check to the Host half (POST /api/settings-hub/status), which
     * stores it next to the bundle. Browser-only state is otherwise impossible to
     * inspect from outside the page.
     */
    function publishDiagnostics() {
      diagnostics.copies = Array.from(copiedPages.keys())
      diagnostics.filterFailed = navigationFilterFailed
      if (typeof fetch !== 'function') return
      const body = JSON.stringify({
        ...diagnostics,
        at: new Date().toISOString(),
        href: typeof location === 'undefined' ? '' : String(location.href),
      })
      try {
        const request = fetch('api/settings-hub/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        })
        if (request !== null && request !== undefined && typeof request.catch === 'function') {
          request.catch(() => {})
        }
      } catch (error) {
        console.warn('[settings-hub] cannot report diagnostics', error)
      }
    }

    // ---------------------------------------------------------------- styling

    function installStyles() {
      if (typeof document === 'undefined' || document === null) return () => {}
      const element = document.createElement('style')
      element.setAttribute('data-dsh-settings-hub', '')
      element.textContent = CSS
      const target = document.head || document.documentElement
      if (target === null || target === undefined) return () => {}
      target.appendChild(element)
      return () => {
        element.remove()
      }
    }

    // ------------------------------------------------------------------ icons

    function svgIcon(children) {
      return h('svg', {
        width: 14,
        height: 14,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
        focusable: 'false',
      }, children)
    }

    function ChevronIcon() {
      return svgIcon(h('path', {
        d: 'M6 3.5 10.5 8 6 12.5',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }))
    }

    function BackIcon() {
      return svgIcon(h('path', {
        d: 'M10 3.5 5.5 8 10 12.5',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }))
    }

    function ExternalIcon() {
      return svgIcon([
        h('path', {
          key: 'arrow',
          d: 'M6.5 3H13v6.5M13 3 6.8 9.2',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('path', {
          key: 'frame',
          d: 'M11 12.5H3.5V5',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      ])
    }

    function PluginIcon() {
      return svgIcon([
        h('rect', { key: 'a', x: 2, y: 2, width: 5, height: 5, rx: 1.4, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('rect', { key: 'b', x: 9, y: 2, width: 5, height: 5, rx: 1.4, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('rect', { key: 'c', x: 2, y: 9, width: 5, height: 5, rx: 1.4, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('rect', { key: 'd', x: 9, y: 9, width: 5, height: 5, rx: 1.4, stroke: 'currentColor', strokeWidth: 1.3 }),
      ])
    }

    // ------------------------------------------------------------------ hooks

    function useTranslate() {
      const [, bump] = React.useState(0)
      React.useEffect(() => {
        let dispose = () => {}
        try {
          const off = pluginCtx === null ? undefined : pluginCtx.locale.subscribe(() => bump((value) => value + 1))
          if (typeof off === 'function') dispose = off
        } catch (error) {
          console.warn('[settings-hub] cannot watch the locale', error)
        }
        return () => {
          try {
            dispose()
          } catch (error) {
            /* ignore */
          }
        }
      }, [])
      return React.useCallback((key, vars) => {
        let text = key
        try {
          text = pluginCtx.locale.bind(NS)(key)
        } catch (error) {
          text = key
        }
        return vars === undefined ? text : format(text, vars)
      }, [])
    }

    function useSlotRevision(key) {
      const [, bump] = React.useState(0)
      React.useEffect(() => {
        let dispose = () => {}
        try {
          const view = (calls === null || calls === undefined) ? slots : calls
          const off = (view === null || view === undefined) ? undefined : view.subscribe(key, () => bump((value) => value + 1))
          if (typeof off === 'function') dispose = off
        } catch (error) {
          console.warn('[settings-hub] cannot watch slot:', key, error)
        }
        return () => {
          try {
            dispose()
          } catch (error) {
            /* ignore */
          }
        }
      }, [key])
    }

    const NOOP_STORE_HOOK = () => undefined

    // ------------------------------------------------------------- components

    function HubSection(props) {
      const t = useTranslate()
      useSlotRevision(SECTION_SLOT)

      const close = props.close
      const renderSlot = props.renderSlot
      const actions = props.actions
      const useStore = (typeof props.useStore === 'function') ? props.useStore : NOOP_STORE_HOOK

      const activeId = useStore((state) => (state === undefined || state === null ? undefined : state.activeId))
      const [query, setQuery] = React.useState('')
      const [detailId, setDetailId] = React.useState(undefined)

      const items = foldedPageItems()

      const openItem = React.useCallback((item) => {
        if (item.copyable) {
          setDetailId(item.id)
          return
        }
        if (actions !== undefined && actions !== null && typeof actions.openSection === 'function') {
          actions.openSection(item.id)
          return
        }
        console.warn('[settings-hub] cannot open the settings page of', item.id)
      }, [actions])

      if (detailId !== undefined) {
        const current = items.find((item) => item.id === detailId)
        return h('div', { className: 'dshsh-root', 'data-settings-hub-detail': detailId },
          h('div', { className: 'dshsh-toolbar' },
            h('button', {
              type: 'button',
              className: 'dshsh-back',
              onClick: () => setDetailId(undefined),
            }, BackIcon(), h('span', null, t('back'))),
            h('span', { className: 'dshsh-toolbarTitle' }, current === undefined ? detailId : current.label),
            (current !== undefined && !current.copyable && actions !== undefined && typeof actions.openSection === 'function')
              ? h('button', {
                type: 'button',
                className: 'dshsh-link',
                onClick: () => actions.openSection(current.id),
              }, t('openInPlace'))
              : null
          ),
          h('div', { className: 'dshsh-detail' },
            typeof renderSlot === 'function'
              ? renderSlot(DETAIL_SLOT, { close }, { only: detailId })
              : null
          )
        )
      }

      const needle = query.trim().toLocaleLowerCase()
      const visible = needle === ''
        ? items
        : items.filter((item) => item.label.toLocaleLowerCase().includes(needle) || item.id.toLocaleLowerCase().includes(needle))

      return h('div', { className: 'dshsh-root', 'data-settings-hub': '' },
        h('h2', { className: 'dshsh-title' }, t('title')),
        h('p', { className: 'dshsh-desc' }, t('description')),
        navigationFilterFailed
          ? h('p', { className: 'dshsh-warning', role: 'status' }, t('filterWarning'))
          : null,
        items.length === 0
          ? h('div', { className: 'dshsh-empty' }, t('empty'))
          : h('div', { className: 'dshsh-tools' },
            h('input', {
              className: 'dshsh-search',
              type: 'search',
              value: query,
              placeholder: t('search'),
              'aria-label': t('search'),
              onChange: (event) => setQuery(event.target.value),
            }),
            h('span', { className: 'dshsh-count' }, t('count', { count: items.length }))
          ),
        items.length === 0
          ? null
          : h('ul', { className: 'dshsh-list' }, visible.map((item) => h('li', { key: item.id },
            h('button', {
              type: 'button',
              className: 'dshsh-row',
              'data-settings-hub-item': item.id,
              'data-active': activeId === item.id ? 'true' : 'false',
              title: item.copyable ? item.label : t('openInPlace'),
              onClick: () => openItem(item),
            },
              h('span', { className: 'dshsh-rowIcon' }, PluginIcon()),
              h('span', { className: 'dshsh-rowText' },
                h('span', { className: 'dshsh-rowLabel' }, item.label),
                h('span', { className: 'dshsh-rowHint' }, item.id)
              ),
              h('span', { className: 'dshsh-rowArrow' }, item.copyable ? ChevronIcon() : ExternalIcon())
            )
          ))),
        items.length > 0 && visible.length === 0
          ? h('div', { className: 'dshsh-empty' }, t('noMatch', { query: query.trim() }))
          : null
      )
    }

    // --------------------------------------------------------------- lifecycle

    function apply(ctx) {
      pluginCtx = ctx
      ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'settings-hub: dictionary')
      ctx.effect(installStyles, 'settings-hub: styles')
      ctx.slots.inject(SECTION_SLOT, () => installHub())
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
