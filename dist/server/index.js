"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const app = (0, express_1.default)();
const port = Number(process.env.PORT ?? 8080);
const cacheTtlMs = 6 * 60 * 60 * 1000;
const routeSearchCache = new Map();
const stopCache = new Map();
const citybusStopDetailCache = new Map();
const kmbRouteCache = new Map();
app.use(express_1.default.json());
function getCached(cache, key) {
    const existing = cache.get(key);
    if (!existing || existing.expiresAt < Date.now()) {
        return null;
    }
    return existing.value;
}
function setCached(cache, key, value) {
    cache.set(key, {
        value,
        expiresAt: Date.now() + cacheTtlMs,
    });
}
async function fetchJson(url) {
    const response = await fetch(url, {
        headers: {
            accept: 'application/json',
        },
    });
    if (!response.ok) {
        throw new Error(`上游 API 錯誤: ${response.status} ${response.statusText}`);
    }
    return (await response.json());
}
async function fetchOptionalJson(url) {
    const response = await fetch(url, {
        headers: {
            accept: 'application/json',
        },
    });
    if (response.status === 404 || response.status === 422) {
        return null;
    }
    if (!response.ok) {
        throw new Error(`上游 API 錯誤: ${response.status} ${response.statusText}`);
    }
    return (await response.json());
}
function operatorName(operator) {
    return operator === 'kmb' ? '九巴 / 龍運' : '城巴';
}
function directionCode(direction) {
    return direction === 'outbound' ? 'O' : 'I';
}
function requireQueryValue(value, fieldName) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`缺少必要欄位: ${fieldName}`);
    }
    return value.trim();
}
function sortByRoute(a, b) {
    return a.route.localeCompare(b.route, 'en', { numeric: true, sensitivity: 'base' });
}
async function loadKmbRoutes() {
    const cached = getCached(kmbRouteCache, 'all');
    if (cached) {
        return cached;
    }
    const response = await fetchJson('https://data.etabus.gov.hk/v1/transport/kmb/route/');
    const routes = response.data;
    setCached(kmbRouteCache, 'all', routes);
    return routes;
}
async function loadRouteSearch(operator) {
    const cached = getCached(routeSearchCache, operator);
    if (cached) {
        return cached;
    }
    let items;
    if (operator === 'kmb') {
        const routes = await loadKmbRoutes();
        const byRoute = new Map();
        routes.forEach((record) => {
            if (byRoute.has(record.route)) {
                return;
            }
            const summary = `${record.orig_tc} -> ${record.dest_tc}`;
            byRoute.set(record.route, {
                operator,
                operatorName: operatorName(operator),
                route: record.route,
                summary,
                matchText: `${record.route} ${record.orig_tc} ${record.dest_tc} ${record.orig_en} ${record.dest_en}`.toLowerCase(),
            });
        });
        items = Array.from(byRoute.values()).sort(sortByRoute);
    }
    else {
        const response = await fetchJson('https://rt.data.gov.hk/v2/transport/citybus/route/CTB');
        const byRoute = new Map();
        response.data.forEach((record) => {
            if (byRoute.has(record.route)) {
                return;
            }
            const summary = `${record.orig_tc} -> ${record.dest_tc}`;
            byRoute.set(record.route, {
                operator,
                operatorName: operatorName(operator),
                route: record.route,
                summary,
                matchText: `${record.route} ${record.orig_tc} ${record.dest_tc} ${record.orig_en} ${record.dest_en}`.toLowerCase(),
            });
        });
        items = Array.from(byRoute.values()).sort(sortByRoute);
    }
    setCached(routeSearchCache, operator, items);
    return items;
}
async function loadStops(operator) {
    const cached = getCached(stopCache, operator);
    if (cached) {
        return cached;
    }
    let stopMap = new Map();
    if (operator === 'kmb') {
        const response = await fetchJson('https://data.etabus.gov.hk/v1/transport/kmb/stop');
        response.data.forEach((record) => {
            stopMap.set(record.stop, {
                stopId: record.stop,
                seq: 0,
                nameTc: record.name_tc,
                nameEn: record.name_en,
            });
        });
    }
    setCached(stopCache, operator, stopMap);
    return stopMap;
}
async function getCitybusStop(stopId) {
    const cached = getCached(citybusStopDetailCache, stopId);
    if (cached) {
        return cached;
    }
    const response = await fetchJson(`https://rt.data.gov.hk/v2/transport/citybus/stop/${encodeURIComponent(stopId)}`);
    const stop = {
        stopId,
        seq: 0,
        nameTc: response.data.name_tc,
        nameEn: response.data.name_en,
    };
    setCached(citybusStopDetailCache, stopId, stop);
    return stop;
}
async function getDirectionOptions(operator, route) {
    if (operator === 'kmb') {
        const routes = await loadKmbRoutes();
        const options = routes
            .filter((record) => record.route.toLowerCase() === route.toLowerCase())
            .map((record) => ({
            direction: (record.bound === 'O' ? 'outbound' : 'inbound'),
            directionCode: record.bound,
            serviceType: record.service_type,
            label: record.service_type === '1'
                ? `${record.orig_tc} -> ${record.dest_tc}`
                : `${record.orig_tc} -> ${record.dest_tc} (特別班次 ${record.service_type})`,
            stopCount: 0,
        }));
        const deduped = new Map();
        options.forEach((option) => {
            deduped.set(`${option.direction}-${option.serviceType}`, option);
        });
        return Array.from(deduped.values());
    }
    const possibleDirections = ['outbound', 'inbound'];
    const results = await Promise.all(possibleDirections.map(async (direction) => {
        const response = await fetchOptionalJson(`https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/${encodeURIComponent(route)}/${direction}`);
        if (!response || response.data.length === 0) {
            return null;
        }
        const [firstStop, lastStop] = await Promise.all([
            getCitybusStop(response.data[0].stop),
            getCitybusStop(response.data[response.data.length - 1].stop),
        ]);
        return {
            direction,
            directionCode: directionCode(direction),
            serviceType: '1',
            label: `${firstStop?.nameTc ?? '起點'} -> ${lastStop?.nameTc ?? '終點'}`,
            stopCount: response.data.length,
        };
    }));
    return results.filter((item) => item !== null);
}
async function getStopsForSelection(operator, route, direction, serviceType) {
    const stopMap = await loadStops(operator);
    if (operator === 'kmb') {
        const response = await fetchJson(`https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${encodeURIComponent(route)}/${direction}/${encodeURIComponent(serviceType)}`);
        return response.data.map((record) => {
            const stop = stopMap.get(record.stop);
            return {
                stopId: record.stop,
                seq: Number(record.seq),
                nameTc: stop?.nameTc ?? `站點 ${record.stop}`,
                nameEn: stop?.nameEn ?? `Stop ${record.stop}`,
            };
        });
    }
    const response = await fetchJson(`https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/${encodeURIComponent(route)}/${direction}`);
    return Promise.all(response.data.map(async (record) => {
        const stop = await getCitybusStop(record.stop);
        return {
            stopId: record.stop,
            seq: record.seq,
            nameTc: stop.nameTc,
            nameEn: stop.nameEn,
        };
    }));
}
async function getEtaForSelection(operator, route, direction, serviceType, stopId) {
    if (operator === 'kmb') {
        const response = await fetchJson(`https://data.etabus.gov.hk/v1/transport/kmb/eta/${encodeURIComponent(stopId)}/${encodeURIComponent(route)}/${encodeURIComponent(serviceType)}`);
        return response.data
            .filter((record) => record.route.toLowerCase() === route.toLowerCase() &&
            record.dir === directionCode(direction) &&
            String(record.service_type) === serviceType &&
            Boolean(record.eta))
            .sort((a, b) => a.eta_seq - b.eta_seq)
            .slice(0, 3)
            .map((record) => ({
            eta: record.eta ?? '',
            etaSeq: record.eta_seq,
            remarkTc: record.rmk_tc ?? '',
            remarkEn: record.rmk_en ?? '',
            destinationTc: record.dest_tc,
            destinationEn: record.dest_en,
        }));
    }
    const response = await fetchJson(`https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${encodeURIComponent(stopId)}/${encodeURIComponent(route)}`);
    return response.data
        .filter((record) => record.dir === directionCode(direction) && Boolean(record.eta))
        .sort((a, b) => a.eta_seq - b.eta_seq)
        .slice(0, 3)
        .map((record) => ({
        eta: record.eta ?? '',
        etaSeq: record.eta_seq,
        remarkTc: record.rmk_tc ?? '',
        remarkEn: record.rmk_en ?? '',
        destinationTc: record.dest_tc,
        destinationEn: record.dest_en,
    }));
}
app.get('/api/health', (_request, response) => {
    response.json({ ok: true });
});
app.get('/api/routes', async (request, response) => {
    try {
        const query = String(request.query.query ?? '').trim().toLowerCase();
        const [kmbRoutes, citybusRoutes] = await Promise.all([loadRouteSearch('kmb'), loadRouteSearch('ctb')]);
        const allRoutes = [...kmbRoutes, ...citybusRoutes];
        const filtered = query
            ? allRoutes.filter((item) => item.matchText.includes(query))
            : allRoutes;
        response.json({
            data: filtered.slice(0, 50),
        });
    }
    catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : '無法取得路線資料',
        });
    }
});
app.get('/api/directions', async (request, response) => {
    try {
        const operator = requireQueryValue(request.query.operator, 'operator');
        const route = requireQueryValue(request.query.route, 'route');
        const data = await getDirectionOptions(operator, route);
        response.json({ data });
    }
    catch (error) {
        response.status(400).json({
            error: error instanceof Error ? error.message : '無法取得方向資料',
        });
    }
});
app.get('/api/stops', async (request, response) => {
    try {
        const operator = requireQueryValue(request.query.operator, 'operator');
        const route = requireQueryValue(request.query.route, 'route');
        const direction = requireQueryValue(request.query.direction, 'direction');
        const serviceType = String(request.query.serviceType ?? '1');
        const data = await getStopsForSelection(operator, route, direction, serviceType);
        response.json({ data });
    }
    catch (error) {
        response.status(400).json({
            error: error instanceof Error ? error.message : '無法取得站點資料',
        });
    }
});
app.get('/api/eta', async (request, response) => {
    try {
        const operator = requireQueryValue(request.query.operator, 'operator');
        const route = requireQueryValue(request.query.route, 'route');
        const direction = requireQueryValue(request.query.direction, 'direction');
        const serviceType = String(request.query.serviceType ?? '1');
        const stopId = requireQueryValue(request.query.stopId, 'stopId');
        const data = await getEtaForSelection(operator, route, direction, serviceType, stopId);
        response.json({
            data,
            fetchedAt: new Date().toISOString(),
        });
    }
    catch (error) {
        response.status(400).json({
            error: error instanceof Error ? error.message : '無法取得到站資料',
        });
    }
});
const frontendDistPath = node_path_1.default.resolve(__dirname, '..', '..', 'frontend', 'dist');
if (node_fs_1.default.existsSync(frontendDistPath)) {
    app.use(express_1.default.static(frontendDistPath));
    app.get(/^(?!\/api).*/, (_request, response) => {
        response.sendFile(node_path_1.default.join(frontendDistPath, 'index.html'));
    });
}
app.listen(port, () => {
    console.log(`Bus app server listening on http://localhost:${port}`);
});
