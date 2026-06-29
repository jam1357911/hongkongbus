# 香港巴士 ETA 看板

這是一個可部署到 Google Cloud Run 的單容器網站，提供：

- 前端可搜尋香港巴士路線
- 用戶可選擇特定路線、方向與站點
- 可加入多個分頁，每個分頁保存自己的收藏站點
- 每個收藏站點顯示未來 3 班車的到站時間
- 資料由後端代理香港公開巴士 API 取得

目前支援：

- `KMB / 龍運`
- `城巴`

## 技術架構

- 前端：`React + TypeScript + Vite`
- 後端：`Express + TypeScript`
- 部署：`Docker + Google Cloud Run`
- 儲存方式：瀏覽器 `localStorage`

## 本機開發

先安裝依賴：

```bash
npm install
npm --prefix frontend install
```

啟動前後端開發模式：

```bash
npm run dev
```

啟動後：

- 前端：`http://localhost:5173`
- 後端：`http://localhost:8080`

## 正式建置

```bash
npm run build
npm start
```

正式模式預設使用 `PORT=8080`。

## Docker 建置

```bash
docker build -t hk-bus-board .
docker run -p 8080:8080 hk-bus-board
```

## 部署到 Google Cloud Run

先登入並選擇專案：

```bash
gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID
```

建議先啟用 API：

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

直接從原始碼部署：

```bash
gcloud run deploy hk-bus-board ^
  --source . ^
  --region asia-east1 ^
  --allow-unauthenticated
```

如果你偏好先建 Docker image，也可以：

```bash
gcloud builds submit --tag gcr.io/YOUR_GCP_PROJECT_ID/hk-bus-board
gcloud run deploy hk-bus-board ^
  --image gcr.io/YOUR_GCP_PROJECT_ID/hk-bus-board ^
  --region asia-east1 ^
  --allow-unauthenticated
```

## API 端點

- `GET /api/routes?query=1A`
- `GET /api/directions?operator=kmb&route=1A`
- `GET /api/stops?operator=kmb&route=1A&direction=outbound&serviceType=1`
- `GET /api/eta?operator=kmb&route=1A&direction=outbound&serviceType=1&stopId=A3ADFCDF8487ADB9`
- `GET /api/health`

## 注意事項

- 分頁與收藏站點目前只保存在使用者本機瀏覽器。
- 後端會快取路線與站點資料，減少對上游公開 API 的重複請求。
- ETA 仍然會由前端定時重新整理。
