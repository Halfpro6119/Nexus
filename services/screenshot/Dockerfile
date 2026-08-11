FROM mcr.microsoft.com/playwright:v1.54.0-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
ENV PORT=8080
CMD ["npm","start"]
