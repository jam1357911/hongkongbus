import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Operator = 'kmb' | 'ctb'
type Direction = 'outbound' | 'inbound'

type RouteSearchItem = {
  operator: Operator
  operatorName: string
  route: string
  summary: string
}

type DirectionOption = {
  direction: Direction
  directionCode: 'O' | 'I'
  serviceType: string
  label: string
  stopCount: number
}

type StopItem = {
  stopId: string
  seq: number
  nameTc: string
  nameEn: string
}

type EtaItem = {
  eta: string
  etaSeq: number
  remarkTc: string
  remarkEn: string
  destinationTc: string
  destinationEn: string
}

type SavedFavourite = {
  id: string
  operator: Operator
  operatorName: string
  route: string
  routeSummary: string
  direction: Direction
  directionLabel: string
  serviceType: string
  stopId: string
  stopNameTc: string
  stopNameEn: string
}

type TabItem = {
  id: string
  name: string
  favourites: SavedFavourite[]
}

type EtaState = {
  loading: boolean
  items: EtaItem[]
  error: string | null
  fetchedAt: string | null
}

type StoredState = {
  tabs: TabItem[]
  activeTabId: string
  collapsedByFavourite?: Record<string, boolean>
}

const STORAGE_KEY = 'hk-bus-dashboard-v1'

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const createDefaultTab = (index = 1): TabItem => ({
  id: createId(),
  name: `分頁 ${index}`,
  favourites: [],
})

const createInitialState = (): StoredState => {
  if (typeof window === 'undefined') {
    const tab = createDefaultTab()
    return { tabs: [tab], activeTabId: tab.id, collapsedByFavourite: {} }
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      throw new Error('empty')
    }

    const parsed = JSON.parse(raw) as StoredState

    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) {
      throw new Error('invalid')
    }

    return {
      tabs: parsed.tabs,
      activeTabId: parsed.activeTabId,
      collapsedByFavourite: parsed.collapsedByFavourite ?? {},
    }
  } catch {
    const tab = createDefaultTab()
    return { tabs: [tab], activeTabId: tab.id, collapsedByFavourite: {} }
  }
}

const fetchApi = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url)

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error ?? 'API 請求失敗')
  }

  return (await response.json()) as T
}

const favouriteKey = (favourite: SavedFavourite) =>
  [
    favourite.operator,
    favourite.route,
    favourite.direction,
    favourite.serviceType,
    favourite.stopId,
  ].join(':')

const formatCountdown = (eta: string) => {
  const diff = new Date(eta).getTime() - Date.now()
  const minutes = Math.round(diff / 60000)

  if (minutes <= 0) {
    return '即將到站'
  }

  return `${minutes} 分鐘`
}

function App() {
  const initialState = useMemo(() => createInitialState(), [])
  const [tabs, setTabs] = useState<TabItem[]>(initialState.tabs)
  const [activeTabId, setActiveTabId] = useState(initialState.activeTabId)
  const [routeQuery, setRouteQuery] = useState('')
  const [routeResults, setRouteResults] = useState<RouteSearchItem[]>([])
  const [selectedRoute, setSelectedRoute] = useState<RouteSearchItem | null>(null)
  const [directions, setDirections] = useState<DirectionOption[]>([])
  const [selectedDirection, setSelectedDirection] = useState<DirectionOption | null>(null)
  const [stops, setStops] = useState<StopItem[]>([])
  const [selectedStopId, setSelectedStopId] = useState('')
  const [stopFilter, setStopFilter] = useState('')
  const [searchingRoutes, setSearchingRoutes] = useState(false)
  const [loadingDirections, setLoadingDirections] = useState(false)
  const [loadingStops, setLoadingStops] = useState(false)
  const [builderError, setBuilderError] = useState<string | null>(null)
  const [etaByFavourite, setEtaByFavourite] = useState<Record<string, EtaState>>({})
  const [collapsedByFavourite, setCollapsedByFavourite] = useState<Record<string, boolean>>(
    initialState.collapsedByFavourite ?? {},
  )

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]
  const selectedStop = stops.find((stop) => stop.stopId === selectedStopId) ?? null
  const filteredStops = stops.filter((stop) => {
    const keyword = stopFilter.trim().toLowerCase()
    if (!keyword) {
      return true
    }

    return `${stop.seq} ${stop.nameTc} ${stop.nameEn}`.toLowerCase().includes(keyword)
  })
  const fastestRoutes = useMemo(() => {
    if (!activeTab) {
      return []
    }

    const routeMap = new Map<
      string,
      {
        favouriteId: string
        route: string
        stopNameTc: string
        operatorName: string
        eta: string
      }
    >()

    activeTab.favourites.forEach((favourite) => {
      const etaState = etaByFavourite[favourite.id]
      const firstEta = etaState?.items[0]

      if (!firstEta?.eta) {
        return
      }

      const key = `${favourite.operator}:${favourite.route}`
      const existing = routeMap.get(key)

      if (!existing || new Date(firstEta.eta).getTime() < new Date(existing.eta).getTime()) {
        routeMap.set(key, {
          favouriteId: favourite.id,
          route: favourite.route,
          stopNameTc: favourite.stopNameTc,
          operatorName: favourite.operatorName,
          eta: firstEta.eta,
        })
      }
    })

    const items = Array.from(routeMap.values()).sort(
      (a, b) => new Date(a.eta).getTime() - new Date(b.eta).getTime(),
    )

    return items.length >= 3 ? items.slice(0, 3) : []
  }, [activeTab, etaByFavourite])

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tabs,
        activeTabId,
        collapsedByFavourite,
      }),
    )
  }, [tabs, activeTabId, collapsedByFavourite])

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabs[0]?.id ?? '')
    }
  }, [tabs, activeTabId])

  useEffect(() => {
    const handler = window.setTimeout(async () => {
      setSearchingRoutes(true)

      try {
        const params = new URLSearchParams()

        if (routeQuery.trim()) {
          params.set('query', routeQuery.trim())
        }

        const response = await fetchApi<{ data: RouteSearchItem[] }>(`/api/routes?${params.toString()}`)
        setRouteResults(response.data)
      } catch (error) {
        setBuilderError(error instanceof Error ? error.message : '無法載入路線')
      } finally {
        setSearchingRoutes(false)
      }
    }, 300)

    return () => window.clearTimeout(handler)
  }, [routeQuery])

  useEffect(() => {
    if (!selectedRoute) {
      setDirections([])
      return
    }

    let cancelled = false

    const loadDirections = async () => {
      setLoadingDirections(true)
      setBuilderError(null)
      setSelectedDirection(null)
      setStops([])
      setSelectedStopId('')

      try {
        const params = new URLSearchParams({
          operator: selectedRoute.operator,
          route: selectedRoute.route,
        })
        const response = await fetchApi<{ data: DirectionOption[] }>(`/api/directions?${params.toString()}`)

        if (!cancelled) {
          setDirections(response.data)
        }
      } catch (error) {
        if (!cancelled) {
          setBuilderError(error instanceof Error ? error.message : '無法載入方向')
        }
      } finally {
        if (!cancelled) {
          setLoadingDirections(false)
        }
      }
    }

    loadDirections()

    return () => {
      cancelled = true
    }
  }, [selectedRoute])

  useEffect(() => {
    if (!selectedRoute || !selectedDirection) {
      setStops([])
      return
    }

    let cancelled = false

    const loadStops = async () => {
      setLoadingStops(true)
      setBuilderError(null)
      setSelectedStopId('')

      try {
        const params = new URLSearchParams({
          operator: selectedRoute.operator,
          route: selectedRoute.route,
          direction: selectedDirection.direction,
          serviceType: selectedDirection.serviceType,
        })
        const response = await fetchApi<{ data: StopItem[] }>(`/api/stops?${params.toString()}`)

        if (!cancelled) {
          setStops(response.data)
        }
      } catch (error) {
        if (!cancelled) {
          setBuilderError(error instanceof Error ? error.message : '無法載入站點')
        }
      } finally {
        if (!cancelled) {
          setLoadingStops(false)
        }
      }
    }

    loadStops()

    return () => {
      cancelled = true
    }
  }, [selectedRoute, selectedDirection])

  useEffect(() => {
    if (!activeTab || activeTab.favourites.length === 0) {
      return
    }

    let cancelled = false

    const refreshEtas = async () => {
      setEtaByFavourite((previous) => {
        const loadingState = Object.fromEntries(
          activeTab.favourites.map((favourite) => [
            favourite.id,
            {
              loading: true,
              items: previous[favourite.id]?.items ?? [],
              error: null,
              fetchedAt: previous[favourite.id]?.fetchedAt ?? null,
            } satisfies EtaState,
          ]),
        )

        return { ...previous, ...loadingState }
      })

      const results = await Promise.all(
        activeTab.favourites.map(async (favourite) => {
          const params = new URLSearchParams({
            operator: favourite.operator,
            route: favourite.route,
            direction: favourite.direction,
            serviceType: favourite.serviceType,
            stopId: favourite.stopId,
          })

          try {
            const response = await fetchApi<{ data: EtaItem[]; fetchedAt: string }>(`/api/eta?${params.toString()}`)

            return [
              favourite.id,
              {
                loading: false,
                items: response.data,
                error: null,
                fetchedAt: response.fetchedAt,
              } satisfies EtaState,
            ] as const
          } catch (error) {
            return [
              favourite.id,
              {
                loading: false,
                items: [],
                error: error instanceof Error ? error.message : '無法載入 ETA',
                fetchedAt: null,
              } satisfies EtaState,
            ] as const
          }
        }),
      )

      if (cancelled) {
        return
      }

      setEtaByFavourite((previous) => {
        const next = { ...previous }
        results.forEach(([id, state]) => {
          next[id] = state
        })
        return next
      })
    }

    refreshEtas()
    const timer = window.setInterval(refreshEtas, 30000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeTab])

  const addTab = () => {
    const nextTab = createDefaultTab(tabs.length + 1)
    setTabs((previous) => [...previous, nextTab])
    setActiveTabId(nextTab.id)
  }

  const removeTab = (tabId: string) => {
    if (tabs.length === 1) {
      return
    }

    setTabs((previous) => previous.filter((tab) => tab.id !== tabId))
  }

  const updateActiveTabName = (name: string) => {
    setTabs((previous) =>
      previous.map((tab) =>
        tab.id === activeTab.id
          ? {
              ...tab,
              name,
            }
          : tab,
      ),
    )
  }

  const addFavourite = () => {
    if (!activeTab || !selectedRoute || !selectedDirection || !selectedStop) {
      return
    }

    const nextFavourite: SavedFavourite = {
      id: createId(),
      operator: selectedRoute.operator,
      operatorName: selectedRoute.operatorName,
      route: selectedRoute.route,
      routeSummary: selectedRoute.summary,
      direction: selectedDirection.direction,
      directionLabel: selectedDirection.label,
      serviceType: selectedDirection.serviceType,
      stopId: selectedStop.stopId,
      stopNameTc: selectedStop.nameTc,
      stopNameEn: selectedStop.nameEn,
    }

    setTabs((previous) =>
      previous.map((tab) => {
        if (tab.id !== activeTab.id) {
          return tab
        }

        const existed = tab.favourites.some((item) => favouriteKey(item) === favouriteKey(nextFavourite))

        if (existed) {
          return tab
        }

        return {
          ...tab,
          favourites: [...tab.favourites, nextFavourite],
        }
      }),
    )
  }

  const removeFavourite = (favouriteId: string) => {
    setTabs((previous) =>
      previous.map((tab) =>
        tab.id === activeTab.id
          ? {
              ...tab,
              favourites: tab.favourites.filter((item) => item.id !== favouriteId),
            }
          : tab,
      ),
    )
    setCollapsedByFavourite((previous) => {
      const next = { ...previous }
      delete next[favouriteId]
      return next
    })
  }

  const toggleCollapsed = (favouriteId: string) => {
    setCollapsedByFavourite((previous) => ({
      ...previous,
      [favouriteId]: !previous[favouriteId],
    }))
  }

  return (
    <main className="app-shell">
      <section className="board-panel">
        <div className="tabs-bar">
          <div className="tab-list">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`tab-button ${tab.id === activeTab.id ? 'active' : ''}`}
                onClick={() => setActiveTabId(tab.id)}
              >
                {tab.name}
              </button>
            ))}
          </div>
          <div className="tab-actions">
            <button type="button" className="secondary-button" onClick={addTab}>
              新增分頁
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => removeTab(activeTab.id)}
              disabled={tabs.length === 1}
            >
              刪除分頁
            </button>
          </div>
        </div>

        <div className="tab-meta">
          <label className="field">
            <span>分頁名稱</span>
            <input value={activeTab.name} onChange={(event) => updateActiveTabName(event.target.value)} />
          </label>
          <p className="muted">資料保存在目前瀏覽器，本機不需登入。</p>
        </div>

        {fastestRoutes.length === 3 ? (
          <section className="fastest-panel">
            <div className="fastest-panel-header">
              <h3>最快到站 3 條路線</h3>
              <p>根據這個分頁每個站的首班 ETA 排序</p>
            </div>
            <div className="fastest-grid">
              {fastestRoutes.map((item, index) => (
                <article key={`${item.favouriteId}-${item.route}`} className="fastest-card">
                  <span className="fastest-rank">#{index + 1}</span>
                  <strong>{item.route}</strong>
                  <span>{item.stopNameTc}</span>
                  <small>
                    {item.operatorName} · {formatCountdown(item.eta)} ·{' '}
                    {new Date(item.eta).toLocaleTimeString('zh-HK', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </small>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <div className="favourite-grid">
          {activeTab.favourites.map((favourite) => {
            const etaState = etaByFavourite[favourite.id] ?? {
              loading: true,
              items: [],
              error: null,
              fetchedAt: null,
            }
            const isCollapsed = collapsedByFavourite[favourite.id] ?? false
            const visibleEtaItems = isCollapsed ? etaState.items.slice(0, 1) : etaState.items

            return (
              <article key={favourite.id} className="eta-card">
                <div className="eta-card-header">
                  <div>
                    <div className="badge-row">
                      <span className="route-badge">
                        <span className="route-badge-text">{favourite.route}</span>
                      </span>
                      <span className="operator-badge">{favourite.operatorName}</span>
                    </div>
                    <h3>{favourite.stopNameTc}</h3>
                    <p>{favourite.directionLabel}</p>
                  </div>
                  <div className="eta-card-actions">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => toggleCollapsed(favourite.id)}
                    >
                      {isCollapsed ? '顯示全部' : '只顯示首班'}
                    </button>
                    <button type="button" className="icon-button" onClick={() => removeFavourite(favourite.id)}>
                      移除
                    </button>
                  </div>
                </div>

                <div className="eta-list">
                  {etaState.loading ? <p className="muted">更新 ETA 中...</p> : null}
                  {etaState.error ? <p className="error-text">{etaState.error}</p> : null}
                  {!etaState.loading && !etaState.error && etaState.items.length === 0 ? (
                    <p className="muted">暫時沒有未來班次資料。</p>
                  ) : null}
                  {visibleEtaItems.map((item) => (
                    <div key={`${favourite.id}-${item.etaSeq}`} className="eta-row">
                      <div>
                        <strong>{formatCountdown(item.eta)}</strong>
                        <span>{new Date(item.eta).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div>
                        <span>{item.destinationTc}</span>
                        <small>{item.remarkTc || '正常班次'}</small>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="eta-footer">
                  {favourite.routeSummary}
                  {etaState.fetchedAt ? ` · 更新於 ${new Date(etaState.fetchedAt).toLocaleTimeString('zh-HK')}` : ''}
                </p>
              </article>
            )
          })}

          {activeTab.favourites.length === 0 ? (
            <div className="empty-card">
              <h3>這個分頁還沒有站點</h3>
              <p>在下方加入新站點後，就會顯示在這裡。</p>
            </div>
          ) : null}
        </div>
      </section>

      <aside className="builder-panel">
        <div className="panel-header">
          <h2>加入新站點</h2>
          <p>先選路線，再選方向與站點。</p>
        </div>

        <label className="field">
          <span>搜尋路線</span>
          <input
            value={routeQuery}
            onChange={(event) => setRouteQuery(event.target.value)}
            placeholder="例如 1A、970、機場"
          />
        </label>

        <div className="result-list">
          {searchingRoutes ? <p className="muted">搜尋中...</p> : null}
          {routeResults.map((item) => (
            <button
              key={`${item.operator}-${item.route}`}
              type="button"
              className={`result-card ${
                selectedRoute?.operator === item.operator && selectedRoute.route === item.route
                  ? 'selected'
                  : ''
              }`}
              onClick={() => {
                setSelectedRoute(item)
                setBuilderError(null)
              }}
            >
              <strong>
                {item.operatorName} {item.route}
              </strong>
              <span>{item.summary}</span>
            </button>
          ))}
        </div>

        <div className="section-block">
          <h3>方向</h3>
          {loadingDirections ? <p className="muted">載入方向中...</p> : null}
          <div className="choice-list">
            {directions.map((item) => (
              <button
                key={`${item.direction}-${item.serviceType}`}
                type="button"
                className={`choice-chip ${
                  selectedDirection?.direction === item.direction &&
                  selectedDirection.serviceType === item.serviceType
                    ? 'selected'
                    : ''
                }`}
                onClick={() => setSelectedDirection(item)}
              >
                <strong>{item.label}</strong>
                <span>
                  {item.direction === 'outbound' ? '去程' : '回程'}
                  {item.serviceType !== '1' ? ` · 班次 ${item.serviceType}` : ''}
                  {item.stopCount > 0 ? ` · ${item.stopCount} 站` : ''}
                </span>
              </button>
            ))}
            {!loadingDirections && selectedRoute && directions.length === 0 ? (
              <p className="muted">這條路線目前沒有可用方向資料。</p>
            ) : null}
          </div>
        </div>

        <div className="section-block">
          <div className="section-title">
            <h3>站點</h3>
            <input
              value={stopFilter}
              onChange={(event) => setStopFilter(event.target.value)}
              placeholder="過濾站點名稱"
            />
          </div>
          {loadingStops ? <p className="muted">載入站點中...</p> : null}
          <div className="stop-list">
            {filteredStops.map((item) => (
              <button
                key={item.stopId}
                type="button"
                className={`stop-row ${selectedStopId === item.stopId ? 'selected' : ''}`}
                onClick={() => setSelectedStopId(item.stopId)}
              >
                <span className="stop-seq">{item.seq}</span>
                <span className="stop-name">{item.nameTc}</span>
              </button>
            ))}
          </div>
        </div>

        {builderError ? <p className="error-text">{builderError}</p> : null}

        <button
          type="button"
          className="primary-button"
          onClick={addFavourite}
          disabled={!selectedRoute || !selectedDirection || !selectedStop}
        >
          加入目前分頁
        </button>
      </aside>
    </main>
  )
}

export default App
