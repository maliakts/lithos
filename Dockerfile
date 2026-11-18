FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
RUN mkdir -p data && chown -R node:node /app
USER node
ENV PORT=3000
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "src/server.js"]
