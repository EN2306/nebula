FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 RAILSYNC_DB=/app/data/railsync.sqlite
COPY --chown=node:node railsync-app/ ./railsync-app/
COPY --chown=node:node problem-statement/PS1/01_data/ ./problem-statement/PS1/01_data/
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3001
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "railsync-app/server.mjs"]
