FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

# Cloud Run listens on $PORT
ENV PORT=8181
ENV NODE_ENV=production

EXPOSE 8181

CMD ["npm", "start"]


