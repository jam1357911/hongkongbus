var K = 'hk-bus-db-v3'
var CK = 'hk-bus-col-v2'

var uid = (function () {
  var n = 0
  return function (){ return 'id-' + (++n) + '-' + Date.now() + '-' + Math.random().toString(36).slice(2,8) }
})()

function defTab(i) { return { id: uid(), name: '\u5206\u9801 ' + i, favourites: [] } }

function loadSt() {
  try {
    var r = localStorage.getItem(K)
    if (r) { var p = JSON.parse(r); if (p && p.tabs && p.tabs.length) return p }
  } catch (e) {}
  var t = defTab(1)
  return { tabs: [t], activeTabId: t.id }
}

function loadCol() {
  try { var r = localStorage.getItem(CK); if (r) { var p = JSON.parse(r); if (p && typeof p === 'object') return p } } catch (e) {}
  return {}
}

function fmt(eta) {
  if (!eta) return '--'
  var m = Math.round((new Date(eta).getTime() - Date.now()) / 60000)
  return m <= 0 ? '\u5373\u5c07\u5230\u7ad9' : m + '\u5206\u9418'
}

function fk(f) { return f.op + ':' + f.rt + ':' + f.dir + ':' + f.stype + ':' + f.sid }
function dc(d) { return d === 'outbound' ? 'O' : 'I' }
function bt(b) { return b === 'O' ? 'outbound' : 'inbound' }

function fetchOk(u, cb) {
  fetch(u, { headers: { accept: 'application/json' } })
    .then(function (r) { if (!r.ok) throw new Error('ERR' + r.status); return r.json() })
    .then(function (d) { cb(null, d) })
    .catch(function (e) { cb(e, null) })
}

function fetchNull(u, cb) {
  fetch(u, { headers: { accept: 'application/json' } })
    .then(function (r) { if (!r.ok) { cb(null, null); return }; return r.json() })
    .then(function (d) { cb(null, d) })
    .catch(function (e) { cb(null, null) })
}

function loadCtbDir(rt, cb) {
  var dirs = [], p1 = 0, p2 = 0
  function check() {
    if (p1 < 2 || p2 < 4) return
    var out = []
    for (var i = 0; i < dirs.length; i++) { if (dirs[i]) out.push(dirs[i]) }
    cb(out)
  }
  for (var i = 0; i < 2; i++) { loadOne(i === 0 ? 'outbound' : 'inbound') }
  function loadOne(dir) {
    fetchNull('https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/' + encodeURIComponent(rt) + '/' + dir, function (e, cr) {
      p1++
      if (!cr || !cr.data || !cr.data.length) { check(); return }
      fetchNull('https://rt.data.gov.hk/v2/transport/citybus/stop/' + encodeURIComponent(cr.data[0].stop), function (e2, fr) {
        p2++
        fetchNull('https://rt.data.gov.hk/v2/transport/citybus/stop/' + encodeURIComponent(cr.data[cr.data.length - 1].stop), function (e3, lr) {
          p2++
          var fn = fr && fr.data ? fr.data.name_tc : '\u8d77\u9ede'
          var ln = lr && lr.data ? lr.data.name_tc : '\u7d42\u9ede'
          var idx = dir === 'outbound' ? 0 : 1
          dirs[idx] = { direction: dir, directionCode: dir === 'outbound' ? 'O' : 'I', serviceType: '1', label: fn + ' -> ' + ln, stopCount: cr.data.length }
          check()
        })
      })
    })
  }
}

function loadCtbStops(rt, dir, cb) {
  fetchNull('https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/' + encodeURIComponent(rt) + '/' + encodeURIComponent(dir), function (e, cr) {
    if (!cr || !cr.data) { cb([]); return }
    var out = [], cnt = 0, done1 = false, total = cr.data.length
    for (var i = 0; i < cr.data.length; i++) { fetchStop(i) }
    function fetchStop(idx) {
      var stop = cr.data[idx]
      fetchNull('https://rt.data.gov.hk/v2/transport/citybus/stop/' + encodeURIComponent(stop.stop), function (e2, s) {
        cnt++
        var ntc = s && s.data ? s.data.name_tc : '\u7ad9' + stop.stop
        var nen = s && s.data ? s.data.name_en : 'Stop ' + stop.stop
        out[idx] = { stopId: stop.stop, seq: stop.seq, nameTc: ntc, nameEn: nen }
        if (!done1 && cnt >= total) { done1 = true; cb(out) }
      })
    }
  })
}

function App() {
  var init = loadSt()
  var st = init.tabs, ai = init.activeTabId
  var tState = React.useState(st), aState = React.useState(ai)
  var tabs = tState[0], activeId = aState[0], setT = tState[1], setA = aState[1]
  var cState = React.useState(loadCol()), col = cState[0], setCol = cState[1]
  var rqState = React.useState(''), rrState = React.useState([]), srState = React.useState(null)
  var drState = React.useState([]), sdState = React.useState(null), stState2 = React.useState([])
  var siState = React.useState(''), sfState = React.useState(''), buState = React.useState(false)
  var ldState = React.useState(false), lsState = React.useState(false), erState = React.useState(null)
  var emState = React.useState({})
  var rq = rqState[0], setQ = rqState[1], rrs = rrState[0], setRr = rrState[1], srs = srState[0], setSr = srState[1]
  var drs = drState[0], setDr = drState[1], sds = sdState[0], setSd = sdState[1]
  var stops2 = stState2[0], setSt2 = stState2[1], sis = siState[0], setSi = siState[1], sfs = sfState[0], setSf = sfState[1]
  var bus = buState[0], setBu = buState[1], lds = ldState[0], setLd = ldState[1], lss = lsState[0], setLs = lsState[1]
  var ers = erState[0], setEr = erState[1], etaMap = emState[0], setEm = emState[1]
  var at = tabs.find(function (x) { return x.id === activeId }) || tabs[0]
  var ss = stops2.find(function (x) { return x.stopId === sis }) || null
  var fs = stops2.filter(function (x) {
    var k = sfs.trim().toLowerCase()
    return !k || (String(x.seq) + x.nameTc + x.nameEn).toLowerCase().indexOf(k) !== -1
  })

  React.useEffect(function () { try { localStorage.setItem(K, JSON.stringify({ tabs: tabs, activeTabId: activeId })) } catch (e) {} }, [tabs, activeId])
  React.useEffect(function () { try { localStorage.setItem(CK, JSON.stringify(col)) } catch (e) {} }, [col])

  React.useEffect(function () {
    var tm = setTimeout(function () {
      setBu(true); setEr(null)
      var w = rq.trim().toLowerCase()
      var all = [], seen = {}, tab1 = 0, tab2 = 0
      function done() {
        if (tab1 + tab2 < 2) return
        all.sort(function (a, b) { return a.rt.localeCompare(b.rt, 'en', { numeric: true }) })
        setRr(w ? all.filter(function (i) { return i.mt.indexOf(w) !== -1 }) : all.slice(0, 80))
        setBu(false)
      }
      fetchOk('https://data.etabus.gov.hk/v1/transport/kmb/route/', function (e, kmb) {
        tab1 = 1
        if (!e && kmb) {
          kmb.data.forEach(function (r) {
            if (!seen[r.route]) {
              seen[r.route] = 1
              all.push({ op: 'kmb', on: '\u4e5d\u5df4/\u9f8d\u904b', rt: r.route, sm: r.orig_tc + ' -> ' + r.dest_tc, mt: (r.route + r.orig_tc + r.dest_tc + r.orig_en + r.dest_en).toLowerCase() })
            }
          })
        }
        done()
      })
      fetchNull('https://rt.data.gov.hk/v2/transport/citybus/route/CTB', function (e, ctb) {
        tab2 = 1
        if (ctb) {
          ctb.data.forEach(function (r) {
            if (!seen[r.route]) {
              seen[r.route] = 1
              all.push({ op: 'ctb', on: '\u57ce\u5df4', rt: r.route, sm: r.orig_tc + ' -> ' + r.dest_tc, mt: (r.route + r.orig_tc + r.dest_tc + r.orig_en + r.dest_en).toLowerCase() })
            }
          })
        }
        done()
      })
    }, 350)
    return function () { clearTimeout(tm) }
  }, [rq])

  React.useEffect(function () {
    if (!srs) { setDr([]); setSd(null); setSt2([]); setSi(''); return }
    var cancelled = false
    setLd(true); setEr(null); setSd(null); setSt2([]); setSi('')
    if (srs.op === 'kmb') {
      fetchOk('https://data.etabus.gov.hk/v1/transport/kmb/route/', function (e, kmb) {
        if (cancelled) return
        if (e) { setEr(e.message); setLd(false); return }
        var opts = kmb.data.filter(function (x) { return x.route.toLowerCase() === srs.rt.toLowerCase() })
        opts = opts.map(function (x) {
          var label = x.orig_tc + ' -> ' + x.dest_tc
          if (x.service_type !== '1') label = label + '(\u7279' + x.service_type + ')'
          return { direction: bt(x.bound), directionCode: x.bound, serviceType: x.service_type, label: label, stopCount: 0 }
        })
        var seen = {}, out = []
        opts.forEach(function (o) { var k = o.direction + '-' + o.serviceType; if (!seen[k]) { seen[k] = 1; out.push(o) } })
        setDr(out); setLd(false)
      })
    } else {
      loadCtbDir(srs.rt, function (dirs) { if (!cancelled) { setDr(dirs); setLd(false) } })
    }
    return function () { cancelled = true }
  }, [srs ? srs.op : null, srs ? srs.rt : null])

  React.useEffect(function () {
    if (!srs || !sds) { setSt2([]); setSi(''); return }
    var cancelled = false
    setLs(true); setEr(null); setSi('')
    if (srs.op === 'kmb') {
      var url1 = 'https://data.etabus.gov.hk/v1/transport/kmb/route-stop/' + encodeURIComponent(srs.rt) + '/' + encodeURIComponent(sds.direction) + '/' + encodeURIComponent(sds.serviceType)
      fetchOk(url1, function (e1, rs) {
        if (cancelled) return
        if (e1) { setEr(e1.message); setLs(false); return }
        fetchOk('https://data.etabus.gov.hk/v1/transport/kmb/stop', function (e2, as) {
          if (cancelled) return
          if (e2) { setEr(e2.message); setLs(false); return }
          var sm = {}
          as.data.forEach(function (s) { sm[s.stop] = { n: s.name_tc, e: s.name_en } })
          var out = rs.data.map(function (r) {
            var ntc = sm[r.stop] ? sm[r.stop].n : '\u7ad9' + r.stop.slice(0, 6)
            var nen = sm[r.stop] ? sm[r.stop].e : 'Stop ' + r.stop.slice(0, 6)
            return { stopId: r.stop, seq: Number(r.seq), nameTc: ntc, nameEn: nen }
          })
          setSt2(out); setLs(false)
        })
      })
    } else {
      loadCtbStops(srs.rt, sds.direction, function (out) { if (!cancelled) { setSt2(out); setLs(false) } })
    }
    return function () { cancelled = true }
  }, [srs ? srs.rt : null, srs ? srs.op : null, sds ? sds.direction : null, sds ? sds.serviceType : null])

  React.useEffect(function () {
    if (!at || !at.favourites || !at.favourites.length) return
    var cancelled = false
    function loadEtas() {
      setEm(function (p) { var n = {}; for (var k in p) n[k] = p[k]; at.favourites.forEach(function (f) { n[f.id] = { loading: true, items: [], error: null, ts: null } }); return n })
      at.favourites.forEach(function (f) {
        var url, fn
        if (f.op === 'kmb') {
          url = 'https://data.etabus.gov.hk/v1/transport/kmb/eta/' + encodeURIComponent(f.sid) + '/' + encodeURIComponent(f.rt) + '/' + encodeURIComponent(f.stype)
          fn = fetchOk
        } else {
          url = 'https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/' + encodeURIComponent(f.sid) + '/' + encodeURIComponent(f.rt)
          fn = fetchNull
        }
        fn(url, function (err, r) {
          if (cancelled) return
          var data
          if (err) {
            data = { loading: false, items: [], error: err.message, ts: null }
          } else if (!r || !r.data) {
            data = { loading: false, items: [], error: null, ts: new Date().toISOString() }
          } else {
            var items = r.data.filter(function (x) {
              var ok = x.dir === dc(f.dir) && x.eta
              if (f.op === 'kmb') ok = ok && String(x.service_type) === f.stype
              return ok
            }).sort(function (a, b) { return a.eta_seq - b.eta_seq }).slice(0, 3).map(function (x) {
              return { eta: x.eta, seq: x.eta_seq, rt: x.rmk_tc || '', re: x.rmk_en || '', dt: x.dest_tc, de: x.dest_en }
            })
            data = { loading: false, items: items, error: null, ts: new Date().toISOString() }
          }
          setEm(function (p) { var n = {}; for (var k in p) n[k] = p[k]; n[f.id] = data; return n })
        })
      })
    }
    setTimeout(loadEtas, 100)
    loadEtas()
    var timer = setInterval(loadEtas, 30000)
    return function () { cancelled = true; clearInterval(timer) }
  }, [at])

  function addTab() { var t2 = defTab(tabs.length + 1); setT(function (p) { return p.concat([t2]) }); setA(t2.id) }
  function remTab(id) { if (tabs.length < 2) return; setT(function (p) { return p.filter(function (x) { return x.id !== id }) }) }
  function upName(v) { setT(function (p) { return p.map(function (x) { return x.id === at.id ? Object.assign({}, x, { name: v }) : x }) }) }
  function addFav() {
    if (!at || !srs || !sds || !ss) return
    var nf = { id: uid(), op: srs.op, on: srs.on, rt: srs.rt, sm: srs.sm, dir: sds.direction, dl: sds.label, stype: sds.serviceType, sid: ss.stopId, snt: ss.nameTc, sne: ss.nameEn }
    setT(function (p) { return p.map(function (x) { if (x.id !== at.id) return x; if (x.favourites.some(function (z) { return fk(z) === fk(nf) })) return x; return Object.assign({}, x, { favourites: x.favourites.concat([nf]) }) }) })
  }
  function remFav(id) {
    setT(function (p) { return p.map(function (x) { return x.id === at.id ? Object.assign({}, x, { favourites: x.favourites.filter(function (z) { return z.id !== id }) }) : x }) })
    setCol(function (p) { var n = {}; for (var k in p) n[k] = p[k]; delete n[id]; return n })
  }
  function togCol(id) { setCol(function (p) { var n = {}; for (var k in p) n[k] = p[k]; n[id] = !n[id]; return n }) }

  var fast = React.useMemo(function () {
    if (!at || !at.favourites || at.favourites.length < 3) return []
    var br = {}
    at.favourites.forEach(function (f) {
      var s = etaMap[f.id]
      if (!s || s.loading || s.error || !s.items || !s.items.length) return
      var first = s.items[0]
      if (!first || !first.eta) return
      var key = f.rt
      if (!br[key] || new Date(first.eta).getTime() < new Date(br[key].eta).getTime()) br[key] = { fid: f.id, rt: f.rt, snt: f.snt, on: f.on, eta: first.eta }
    })
    var sv = []; for (var k in br) sv.push(br[k])
    sv.sort(function (a, b) { return new Date(a.eta).getTime() - new Date(b.eta).getTime() })
    if (sv.length < 3) return []
    return sv.slice(0, 3)
  }, [at, etaMap])

  var H = React.createElement

  // --- Board Panel ---
  var tabButtons = tabs.map(function (x) {
    var cls = 'tab-button'
    if (x.id === activeId) cls = cls + ' active'
    return H('button', { key: x.id, type: 'button', className: cls, onClick: function () { setA(x.id) } }, x.name)
  })
  var tabList = H('div', { className: 'tab-list' }, tabButtons)

  var addTabBtn = H('button', { type: 'button', className: 'secondary-button', onClick: addTab }, '\u65b0\u589e\u5206\u9801')
  var delTabBtn = H('button', { type: 'button', className: 'secondary-button', onClick: function () { remTab(at.id) }, disabled: tabs.length < 2 }, '\u522a\u9664\u5206\u9801')
  var tabActions = H('div', { className: 'tab-actions' }, addTabBtn, delTabBtn)
  var tabsBar = H('div', { className: 'tabs-bar' }, tabList, tabActions)

  var nameInput = H('input', { value: at.name, onChange: function (e) { upName(e.target.value) } })
  var nameField = H('label', { className: 'field' }, H('span', null, '\u5206\u9801\u540d\u7a31'), nameInput)
  var tabMeta = H('div', { className: 'tab-meta' }, nameField, H('p', { className: 'muted' }, '\u8cc7\u6599\u4fdd\u5b58\u5728\u700f\u89bd\u5668\u672c\u6a5f\u3002'))

  var fastestPanel = null
  if (fast.length === 3) {
    var cards = fast.map(function (item, i) {
      return H('div', { key: item.fid, className: 'fastest-card' },
        H('span', { className: 'fastest-rank' }, '#' + (i + 1)),
        H('strong', null, item.rt),
        H('span', null, item.snt),
        H('small', null, item.on + ' \xb7 ' + fmt(item.eta) + ' \xb7 ' + new Date(item.eta).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' }))
      )
    })
    fastestPanel = H('div', { className: 'fastest-panel' },
      H('div', { className: 'fastest-panel-header' }, H('h3', null, '\u6700\u5feb\u5230\u7ad9 3 \u689d\u8def\u7dda'), H('p', null, '\u6839\u64da\u9019\u500b\u5206\u9801\u6bcf\u500b\u7ad9\u7684\u9996\u73ed ETA \u6392\u5e8f')),
      H('div', { className: 'fastest-grid' }, cards)
    )
  }

  var etaCards = at.favourites.map(function (f) {
    var s = etaMap[f.id] || { loading: true, items: [], error: null, ts: null }
    var c = col[f.id] || false
    var vi = c ? s.items.slice(0, 1) : s.items

    var badgeRow = H('div', { className: 'badge-row' },
      H('span', { className: 'route-badge' }, H('span', { className: 'route-badge-text' }, f.rt)),
      H('span', { className: 'operator-badge' }, f.on)
    )
    var headerLeft = H('div', null, badgeRow, H('h3', null, f.snt), H('p', null, f.dl))
    var togBtn = H('button', { type: 'button', className: 'icon-button', onClick: function () { togCol(f.id) } }, c ? '\u986f\u793a\u5168\u90e8' : '\u53ea\u986f\u793a\u9996\u73ed')
    var remBtn = H('button', { type: 'button', className: 'icon-button', onClick: function () { remFav(f.id) } }, '\u79fb\u9664')
    var headerActions = H('div', { className: 'eta-card-actions' }, togBtn, remBtn)
    var cardHeader = H('div', { className: 'eta-card-header' }, headerLeft, headerActions)

    var etaChildren = []
    if (s.loading) etaChildren.push(H('p', { className: 'muted', key: 'loading' }, '\u66f4\u65b0 ETA \u4e2d...'))
    if (s.error) etaChildren.push(H('p', { className: 'error-text', key: 'error' }, s.error))
    if (!s.loading && !s.error && (!s.items || !s.items.length)) etaChildren.push(H('p', { className: 'muted', key: 'empty' }, '\u66ab\u6642\u6c92\u6709\u672a\u4f86\u73ed\u6b21\u8cc7\u6599\u3002'))
    vi.forEach(function (item) {
      etaChildren.push(H('div', { key: f.id + '-' + item.seq, className: 'eta-row' },
        H('div', null, H('strong', null, fmt(item.eta)), H('span', null, item.eta ? new Date(item.eta).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' }) : '--')),
        H('div', null, H('span', null, item.dt), H('small', null, item.rt || '\u6b63\u5e38\u73ed\u6b21'))
      ))
    })
    var etaList = H('div', { className: 'eta-list' }, etaChildren)

    var footerText = f.sm
    if (s.ts) footerText = footerText + ' \xb7 \u66f4\u65b0\u65bc ' + new Date(s.ts).toLocaleTimeString('zh-HK')
    var cardFooter = H('p', { className: 'eta-footer' }, footerText)

    return H('div', { key: f.id, className: 'eta-card' }, cardHeader, etaList, cardFooter)
  })

  var emptyCard = null
  if (at.favourites.length === 0) {
    emptyCard = H('div', { className: 'empty-card' },
      H('h3', null, '\u9019\u500b\u5206\u9801\u9084\u6c92\u6709\u7ad9\u9ede'),
      H('p', null, '\u5f80\u4e0b\u62c9\u52a0\u5165\u65b0\u7ad9\u9ede\uff0c\u641c\u5c0b\u8def\u7dda\u3001\u9078\u65b9\u5411\u548c\u7ad9\u9ede\uff0c\u7136\u5f8c\u52a0\u5165\u76ee\u524d\u5206\u9801\u5373\u53ef\u3002'))
  }

  var favGrid = H('div', { className: 'favourite-grid' }, etaCards, emptyCard)

  var boardChildren = [tabsBar, tabMeta]
  if (fastestPanel) boardChildren.push(fastestPanel)
  boardChildren.push(favGrid)
  var boardPanel = H('div', { className: 'board-panel' }, boardChildren)

  // --- Builder Panel ---
  var panelHeader = H('div', { className: 'panel-header' }, H('h2', null, '\u52a0\u5165\u65b0\u7ad9\u9ede'), H('p', null, '\u641c\u5c0b\u8def\u7dda\uff0c\u518d\u9078\u65b9\u5411\u8207\u7ad9\u9ede\u3002'))
  var searchInput = H('input', { value: rq, onChange: function (e) { setQ(e.target.value) }, placeholder: '\u4f8b\u5982 1A\u3001970\u3001\u6a5f\u5834' })
  var searchLabel = H('label', { className: 'field' }, H('span', null, '\u641c\u5c0b\u8def\u7dda'), searchInput)

  var resultChildren = []
  if (bus) resultChildren.push(H('p', { className: 'muted', key: 'busy' }, '\u641c\u5c0b\u4e2d...'))
  if (ers) resultChildren.push(H('p', { className: 'error-text', key: 'err' }, ers))
  rrs.forEach(function (item) {
    var cls = 'result-card'
    if (srs && srs.op === item.op && srs.rt === item.rt) cls = cls + ' selected'
    resultChildren.push(H('button', { key: item.op + '-' + item.rt, type: 'button', className: cls, onClick: function () { setSr(item); setEr(null) } },
      H('strong', null, item.on + ' ' + item.rt), H('span', null, item.sm)))
  })
  var resultList = H('div', { className: 'result-list' }, resultChildren)

  var dirBlock = null
  if (srs) {
    var dirChildren = [H('h3', null, '\u65b9\u5411')]
    if (lds) dirChildren.push(H('p', { className: 'muted' }, '\u8f09\u5165\u65b9\u5411\u4e2d...'))
    var chipChildren = drs.map(function (item) {
      var cls = 'choice-chip'
      if (sds && sds.direction === item.direction && sds.serviceType === item.serviceType) cls = cls + ' selected'
      var label = item.direction === 'outbound' ? '\u53bb\u7a0b' : '\u56de\u7a0b'
      if (item.serviceType !== '1') label = label + '\xb7\u73ed\u6b21' + item.serviceType
      if (item.stopCount > 0) label = label + '\xb7' + item.stopCount + '\u7ad9'
      return H('button', { key: item.direction + '-' + item.serviceType, type: 'button', className: cls, onClick: function () { setSd(item) } },
        H('strong', null, item.label), H('span', null, label))
    })
    if (!lds && srs && drs.length === 0) chipChildren.push(H('p', { className: 'muted', key: 'nodir' }, '\u9019\u689d\u8def\u7dda\u76ee\u524d\u6c92\u6709\u65b9\u5411\u8cc7\u6599\u3002'))
    dirChildren.push(H('div', { className: 'choice-list' }, chipChildren))
    dirBlock = H('div', { className: 'section-block' }, dirChildren)
  }

  var stopBlock = null
  if (srs && sds) {
    var stopChildren = [ H('div', { className: 'section-title' }, H('h3', null, '\u7ad9\u9ede'), H('input', { value: sfs, onChange: function (e) { setSf(e.target.value) }, placeholder: '\u904e\u6ffe\u7ad9\u9ede' })) ]
    if (lss) stopChildren.push(H('p', { className: 'muted' }, '\u8f09\u5165\u7ad9\u9ede\u4e2d...'))
    var stopRowChildren = fs.map(function (item) {
      var cls = 'stop-row'
      if (sis === item.stopId) cls = cls + ' selected'
      return H('button', { key: item.stopId, type: 'button', className: cls, onClick: function () { setSi(item.stopId) } },
        H('span', { className: 'stop-seq' }, item.seq), H('span', { className: 'stop-name' }, item.nameTc))
    })
    stopChildren.push(H('div', { className: 'stop-list' }, stopRowChildren))
    stopBlock = H('div', { className: 'section-block' }, stopChildren)
  }

  var errText = ers ? H('p', { className: 'error-text' }, ers) : null
  var addBtn = H('button', { type: 'button', className: 'primary-button', onClick: addFav, disabled: !srs || !sds || !ss }, '\u52a0\u5165\u76ee\u524d\u5206\u9801')

  var builderChildren = [panelHeader, searchLabel, resultList]
  if (dirBlock) builderChildren.push(dirBlock)
  if (stopBlock) builderChildren.push(stopBlock)
  builderChildren.push(errText, addBtn)
  var builderPanel = H('div', { className: 'builder-panel' }, builderChildren)

  var rootEl = H('div', { style: { display: 'contents' } }, boardPanel, builderPanel)
  ReactDOM.createRoot(document.getElementById('root')).render(rootEl)
}

App()
