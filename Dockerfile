FROM node:20-slim
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node dist/ ./dist/
COPY --chown=node:node src/public/ ./dist/public/
USER node
EXPOSE 9876
CMD ["node", "dist/cli/index.js"]
