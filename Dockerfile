FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
COPY src/public/ ./dist/public/
EXPOSE 9876
CMD ["node", "dist/cli/index.js"]
