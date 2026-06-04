# 多階段 build:
#   stage 1 (build):用 node 把 React 編譯成靜態檔
#   stage 2 (serve):用輕量 nginx 提供 dist/,正式環境不需要 node
FROM node:22-alpine AS build
WORKDIR /app

# 先複製套件清單安裝相依,讓 layer cache 生效
COPY package.json package-lock.json* ./
RUN npm install

# 複製原始碼並建置
COPY . .
RUN npm run build

# ---- serve ----
FROM nginx:1.27-alpine AS serve
# 自訂 nginx 設定(SPA fallback)
COPY nginx.conf /etc/nginx/conf.d/default.conf
# 把建置產物放到 nginx 的網站根目錄
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
