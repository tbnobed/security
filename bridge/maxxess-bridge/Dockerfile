FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY index.mjs ./
USER node
CMD ["node", "index.mjs"]
