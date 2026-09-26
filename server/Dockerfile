FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 py3-pip

COPY package*.json ./

RUN npm ci

COPY . .

EXPOSE 5001

CMD ["npm", "start"]