FROM node:22-alpine

WORKDIR /app

# Copy package files and install deps
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy app source
COPY . .

EXPOSE 3000

CMD ["node", "app.js"]
